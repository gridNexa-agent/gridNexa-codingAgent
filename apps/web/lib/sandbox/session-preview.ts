import { Sandbox } from "@vercel/sandbox";

import { previewConfig } from "@/config/preview.config";
import { readCommandResult, readCommandText } from "@/lib/sandbox/command-output";
import { eveVercelSandboxName } from "@/lib/sandbox/eve-session-name";

const WORKSPACE_ROOT = "/workspace";

function authParams() {
  if (
    process.env.VERCEL_TOKEN &&
    process.env.VERCEL_TEAM_ID &&
    process.env.VERCEL_PROJECT_ID
  ) {
    return {
      teamId: process.env.VERCEL_TEAM_ID,
      projectId: process.env.VERCEL_PROJECT_ID,
      token: process.env.VERCEL_TOKEN,
    };
  }
  return {};
}

export type SessionPreviewHandle = {
  sandbox: Sandbox;
  sandboxId: string;
  url: string;
  appRoot: string;
};

function previewViteConfigSource(): string {
  return `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: ${previewConfig.vitePort},
    strictPort: true,
    allowedHosts: true,
    hmr: { clientPort: 443, protocol: 'wss' },
  },
})
`;
}

async function run(
  sandbox: Sandbox,
  command: string,
  cwd: string = WORKSPACE_ROOT,
): Promise<{ stdout: string; stderr: string; success: boolean; exitCode: number }> {
  const result = await sandbox.runCommand({
    cmd: "sh",
    args: ["-c", command],
    cwd,
  });
  return readCommandResult(result);
}

export async function connectEveSessionSandbox(sessionId: string): Promise<{
  sandbox: Sandbox;
  sandboxId: string;
  url: string;
}> {
  const sandboxId = eveVercelSandboxName(sessionId);
  try {
    const sandbox = await Sandbox.get({
      name: sandboxId,
      resume: true,
      ...authParams(),
    });
    return {
      sandbox,
      sandboxId,
      url: sandbox.domain(previewConfig.vitePort),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Session sandbox not open yet (${sandboxId}). Send a coding message so the agent creates files in the Eve workspace first. ${message}`,
    );
  }
}

async function resolveAppRoot(sandbox: Sandbox): Promise<string> {
  const probe = await run(
    sandbox,
    [
      `if [ -f ${WORKSPACE_ROOT}/package.json ] || [ -f ${WORKSPACE_ROOT}/src/App.jsx ] || [ -f ${WORKSPACE_ROOT}/src/App.tsx ] || [ -f ${WORKSPACE_ROOT}/index.html ]; then`,
      `  echo ${WORKSPACE_ROOT}`,
      `  exit 0`,
      `fi`,
      `for dir in ${WORKSPACE_ROOT}/*/; do`,
      `  [ -d "$dir" ] || continue`,
      `  if [ -f "$dir/package.json" ] || [ -f "$dir/src/App.jsx" ] || [ -f "$dir/src/App.tsx" ] || [ -f "$dir/index.html" ]; then`,
      `    printf '%s\\n' "\${dir%/}"`,
      `    exit 0`,
      `  fi`,
      `done`,
      `echo ${WORKSPACE_ROOT}`,
    ].join("\n"),
    "/",
  );
  const root = probe.stdout.trim().split("\n").filter(Boolean).at(-1) ?? WORKSPACE_ROOT;
  return root.startsWith("/") ? root : WORKSPACE_ROOT;
}

async function ensureViteProject(sandbox: Sandbox, appRoot: string): Promise<void> {
  const hasPackage = await run(sandbox, `[ -f package.json ] && echo yes || echo no`, appRoot);
  if (!hasPackage.stdout.includes("yes")) {
    const packageJson = {
      name: "session-preview-app",
      version: "1.0.0",
      type: "module",
      scripts: {
        dev: "vite --host",
        build: "vite build",
        preview: "vite preview",
      },
      dependencies: {
        react: "^18.2.0",
        "react-dom": "^18.2.0",
      },
      devDependencies: {
        "@vitejs/plugin-react": "^4.3.4",
        vite: "^6.0.0",
      },
    };
    await sandbox.writeFiles([
      {
        path: `${appRoot}/package.json`,
        content: Buffer.from(JSON.stringify(packageJson, null, 2), "utf-8"),
      },
    ]);
  }

  const hasIndex = await run(sandbox, `[ -f index.html ] && echo yes || echo no`, appRoot);
  if (!hasIndex.stdout.includes("yes")) {
    await sandbox.writeFiles([
      {
        path: `${appRoot}/index.html`,
        content: Buffer.from(
          `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Preview</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
`,
          "utf-8",
        ),
      },
    ]);
  }

  const hasMain = await run(
    sandbox,
    `{ [ -f src/main.jsx ] || [ -f src/main.tsx ]; } && echo yes || echo no`,
    appRoot,
  );
  if (!hasMain.stdout.includes("yes")) {
    await run(sandbox, `mkdir -p src`, appRoot);
    await sandbox.writeFiles([
      {
        path: `${appRoot}/src/main.jsx`,
        content: Buffer.from(
          `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
`,
          "utf-8",
        ),
      },
      {
        path: `${appRoot}/src/index.css`,
        content: Buffer.from(`body { margin: 0; font-family: system-ui, sans-serif; }\n`, "utf-8"),
      },
    ]);
  }

  await sandbox.writeFiles([
    {
      path: `${appRoot}/vite.config.js`,
      content: Buffer.from(previewViteConfigSource(), "utf-8"),
    },
  ]);
}

async function ensureDependencies(sandbox: Sandbox, appRoot: string): Promise<void> {
  const installed = await run(sandbox, `[ -d node_modules/vite ] && echo yes || echo no`, appRoot);
  if (installed.stdout.includes("yes")) return;

  const install = await sandbox.runCommand({
    cmd: "npm",
    args: ["install"],
    cwd: appRoot,
  });
  const parsed = await readCommandResult(install);
  if (!parsed.success) {
    throw new Error(`npm install failed in ${appRoot}: ${parsed.stderr || parsed.stdout}`);
  }
}

async function restartVite(sandbox: Sandbox, appRoot: string): Promise<void> {
  await run(sandbox, "pkill -f vite || true", "/");
  await new Promise((resolve) => setTimeout(resolve, 800));
  await sandbox.runCommand({
    cmd: "npm",
    args: ["run", "dev"],
    cwd: appRoot,
    detached: true,
  });
}

async function waitForViteReady(sandbox: Sandbox, timeoutMs = 45_000): Promise<void> {
  const started = Date.now();
  let lastLog = "";
  while (Date.now() - started < timeoutMs) {
    const probe = await run(
      sandbox,
      `curl -fsS http://127.0.0.1:${previewConfig.vitePort}/ >/dev/null 2>&1 && echo READY || true`,
      "/",
    );
    if (probe.stdout.includes("READY")) return;
    lastLog = probe.stdout.trim();

    const processProbe = await run(sandbox, "pgrep -af vite || true", "/");
    if (processProbe.stdout.includes("vite") && Date.now() - started > 8_000) {
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_500));
  }
  throw new Error(
    `Vite did not become ready on port ${previewConfig.vitePort}. ${lastLog.slice(0, 500)}`,
  );
}

export async function startSessionPreview(sessionId: string): Promise<SessionPreviewHandle> {
  const connected = await connectEveSessionSandbox(sessionId);
  const appRoot = await resolveAppRoot(connected.sandbox);
  await ensureViteProject(connected.sandbox, appRoot);
  await ensureDependencies(connected.sandbox, appRoot);
  await restartVite(connected.sandbox, appRoot);
  await waitForViteReady(connected.sandbox);

  return {
    sandbox: connected.sandbox,
    sandboxId: connected.sandboxId,
    url: connected.url,
    appRoot,
  };
}

export async function stopSessionVite(sessionId: string): Promise<void> {
  try {
    const connected = await connectEveSessionSandbox(sessionId);
    await run(connected.sandbox, "pkill -f vite || true", "/");
  } catch {
    // Sandbox may already be gone; preview UI just clears local state.
  }
}

export async function restartSessionVite(sessionId: string): Promise<SessionPreviewHandle> {
  const connected = await connectEveSessionSandbox(sessionId);
  const appRoot = await resolveAppRoot(connected.sandbox);
  await ensureViteProject(connected.sandbox, appRoot);
  await restartVite(connected.sandbox, appRoot);
  await waitForViteReady(connected.sandbox);
  return {
    sandbox: connected.sandbox,
    sandboxId: connected.sandboxId,
    url: connected.url,
    appRoot,
  };
}

export async function readSessionPreviewStatus(sessionId: string): Promise<{
  active: boolean;
  sandboxId: string | null;
  url: string | null;
  appRoot?: string;
}> {
  try {
    const connected = await connectEveSessionSandbox(sessionId);
    const probe = await run(
      connected.sandbox,
      `curl -fsS http://127.0.0.1:${previewConfig.vitePort}/ >/dev/null 2>&1 && echo READY || true`,
      "/",
    );
    const viteUp = probe.stdout.includes("READY");
    const appRoot = await resolveAppRoot(connected.sandbox);
    return {
      active: viteUp,
      sandboxId: connected.sandboxId,
      url: connected.url,
      appRoot,
    };
  } catch {
    return { active: false, sandboxId: null, url: null };
  }
}

export async function listSessionPreviewFiles(
  sessionId: string,
): Promise<{ appRoot: string; files: string[] }> {
  const connected = await connectEveSessionSandbox(sessionId);
  const appRoot = await resolveAppRoot(connected.sandbox);
  const listed = await connected.sandbox.runCommand({
    cmd: "sh",
    args: [
      "-c",
      `find ${appRoot} -type f \\( -name '*.jsx' -o -name '*.js' -o -name '*.tsx' -o -name '*.ts' -o -name '*.css' -o -name '*.json' -o -name '*.html' -o -name '*.md' \\) -not -path '*/node_modules/*' -not -path '*/.git/*' | sed "s|^${appRoot}/||"`,
    ],
    cwd: "/",
  });
  const parsed = await readCommandResult(listed);
  if (!parsed.success) {
    throw new Error(parsed.stderr || "Failed to list session sandbox files");
  }
  return {
    appRoot,
    files: parsed.stdout.split("\n").filter((line) => line.trim() !== ""),
  };
}

export async function readSessionPreviewFile(
  sessionId: string,
  relativePath: string,
): Promise<string> {
  if (!relativePath || relativePath.includes("..") || relativePath.startsWith("/")) {
    throw new Error("Invalid path");
  }
  const connected = await connectEveSessionSandbox(sessionId);
  const appRoot = await resolveAppRoot(connected.sandbox);
  const fullPath = `${appRoot}/${relativePath}`;
  const result = await connected.sandbox.runCommand({
    cmd: "cat",
    args: [fullPath],
  });
  const stdout = await readCommandText(result, "stdout");
  const parsed = await readCommandResult(result);
  if (!parsed.success) {
    throw new Error(parsed.stderr || `Failed to read ${relativePath}`);
  }
  return stdout;
}

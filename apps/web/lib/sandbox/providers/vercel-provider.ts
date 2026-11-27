import { Sandbox } from "@vercel/sandbox";

import { previewConfig } from "@/config/preview.config";
import { readCommandResult, readCommandText } from "@/lib/sandbox/command-output";
import {
  SandboxProvider,
  type CommandResult,
  type SandboxInfo,
} from "@/lib/sandbox/types";

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

export class VercelProvider extends SandboxProvider {
  private existingFiles = new Set<string>();
  private vercelSandbox: Sandbox | null = null;

  async createSandbox(): Promise<SandboxInfo> {
    if (this.vercelSandbox) {
      try {
        await this.vercelSandbox.stop();
      } catch (error) {
        console.error("[VercelProvider] stop existing failed:", error);
      }
      this.vercelSandbox = null;
    }
    this.existingFiles.clear();

    this.vercelSandbox = await Sandbox.create({
      timeout: previewConfig.timeoutMs,
      image: previewConfig.image,
      ports: [previewConfig.vitePort],
      ...authParams(),
    });
    this.sandbox = this.vercelSandbox;

    const url = this.vercelSandbox.domain(previewConfig.vitePort);
    this.sandboxInfo = {
      sandboxId: this.vercelSandbox.name,
      url,
      provider: "vercel",
      createdAt: new Date(),
    };
    return this.sandboxInfo;
  }

  async reconnect(sandboxId: string): Promise<SandboxInfo> {
    this.vercelSandbox = await Sandbox.get({
      name: sandboxId,
      resume: true,
      ...authParams(),
    });
    this.sandbox = this.vercelSandbox;
    const url = this.vercelSandbox.domain(previewConfig.vitePort);
    this.sandboxInfo = {
      sandboxId: this.vercelSandbox.name,
      url,
      provider: "vercel",
      createdAt: new Date(),
    };
    return this.sandboxInfo;
  }

  private requireSandbox(): Sandbox {
    if (!this.vercelSandbox) throw new Error("No active sandbox");
    return this.vercelSandbox;
  }

  async runCommand(command: string): Promise<CommandResult> {
    const sandbox = this.requireSandbox();
    const [cmd, ...args] = command.split(" ").filter(Boolean);
    try {
      const result = await sandbox.runCommand({
        cmd,
        args,
        cwd: previewConfig.workingDirectory,
      });
      return await readCommandResult(result);
    } catch (error) {
      return {
        stdout: "",
        stderr: error instanceof Error ? error.message : "Command failed",
        exitCode: 1,
        success: false,
      };
    }
  }

  private toSandboxPath(path: string): string {
    if (path.startsWith("/")) return path;
    return `${previewConfig.workingDirectory}/${path}`;
  }

  async writeFile(path: string, content: string): Promise<void> {
    await this.writeFiles([{ path, content }]);
  }

  async writeFiles(files: Array<{ path: string; content: string }>): Promise<void> {
    const sandbox = this.requireSandbox();
    if (files.length === 0) return;

    const payload = files.map((file) => ({
      // Relative paths resolve from sandbox cwd (/vercel/sandbox).
      path: file.path.startsWith("/") ? file.path : file.path,
      content: Buffer.from(file.content, "utf-8"),
    }));

    try {
      await sandbox.writeFiles(payload);
      for (const file of files) this.existingFiles.add(file.path);
      return;
    } catch (error) {
      console.warn("[VercelProvider] relative writeFiles failed, trying absolute:", error);
    }

    try {
      await sandbox.writeFiles(
        files.map((file) => ({
          path: this.toSandboxPath(file.path),
          content: Buffer.from(file.content, "utf-8"),
        })),
      );
      for (const file of files) this.existingFiles.add(file.path);
      return;
    } catch (error) {
      console.warn("[VercelProvider] absolute writeFiles failed, shell fallback:", error);
    }

    for (const file of files) {
      const fullPath = this.toSandboxPath(file.path);
      const encoded = Buffer.from(file.content, "utf-8").toString("base64");
      const result = await sandbox.runCommand({
        cmd: "sh",
        args: [
          "-c",
          'mkdir -p "$(dirname "$1")" && printf %s "$2" | base64 -d > "$1"',
          "write",
          fullPath,
          encoded,
        ],
      });
      const parsed = await readCommandResult(result);
      if (!parsed.success) {
        throw new Error(`Failed to write ${fullPath}: ${parsed.stderr}`);
      }
      this.existingFiles.add(file.path);
    }
  }

  async readFile(path: string): Promise<string> {
    const sandbox = this.requireSandbox();
    const fullPath = path.startsWith("/")
      ? path
      : `${previewConfig.workingDirectory}/${path}`;
    const result = await sandbox.runCommand({ cmd: "cat", args: [fullPath] });
    const parsed = await readCommandResult(result);
    if (!parsed.success) {
      throw new Error(`Failed to read file: ${parsed.stderr}`);
    }
    return parsed.stdout;
  }

  async listFiles(
    directory: string = previewConfig.workingDirectory,
  ): Promise<string[]> {
    const sandbox = this.requireSandbox();
    const result = await sandbox.runCommand({
      cmd: "sh",
      args: [
        "-c",
        `find ${directory} -type f \\( -name '*.jsx' -o -name '*.js' -o -name '*.tsx' -o -name '*.ts' -o -name '*.css' -o -name '*.json' -o -name '*.html' -o -name '*.md' \\) -not -path '*/node_modules/*' -not -path '*/.git/*' | sed "s|^${directory}/||"`,
      ],
      cwd: "/",
    });
    const parsed = await readCommandResult(result);
    if (!parsed.success) {
      throw new Error(parsed.stderr || "Failed to list sandbox files");
    }
    return parsed.stdout.split("\n").filter((line) => line.trim() !== "");
  }

  async installPackages(packages: string[]): Promise<CommandResult> {
    const sandbox = this.requireSandbox();
    const result = await sandbox.runCommand({
      cmd: "npm",
      args: ["install", ...packages],
      cwd: previewConfig.workingDirectory,
    });
    const parsed = await readCommandResult(result);
    if (parsed.success && process.env.AUTO_RESTART_VITE === "true") {
      await this.restartViteServer();
    }
    return parsed;
  }

  async setupViteApp(): Promise<void> {
    const sandbox = this.requireSandbox();
    await sandbox.runCommand({
      cmd: "mkdir",
      args: ["-p", `${previewConfig.workingDirectory}/src`],
    });

    const packageJson = {
      name: "sandbox-app",
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
        // Vite 5.1+ required for server.allowedHosts; 6.x is what blocks sb-*.vercel.run without it.
        vite: "^6.0.0",
        tailwindcss: "^3.3.0",
        postcss: "^8.4.31",
        autoprefixer: "^10.4.16",
      },
    };

    const files: Array<[string, string]> = [
      ["package.json", JSON.stringify(packageJson, null, 2)],
      ["vite.config.js", this.previewViteConfigSource()],
      [
        "tailwind.config.js",
        `export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: { extend: {} },
  plugins: [],
}
`,
      ],
      [
        "postcss.config.js",
        `export default { plugins: { tailwindcss: {}, autoprefixer: {} } }
`,
      ],
      [
        "index.html",
        `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Sandbox Preview</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
`,
      ],
      [
        "src/main.jsx",
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
      ],
      [
        "src/App.jsx",
        `export default function App() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-6">
      <div className="max-w-xl text-center space-y-3">
        <p className="text-sm uppercase tracking-[0.2em] text-zinc-500">GridNexa Preview</p>
        <h1 className="text-3xl font-semibold tracking-tight">Vite sandbox is ready</h1>
        <p className="text-zinc-400">
          Edit files in this sandbox and refresh the iframe to see updates.
        </p>
      </div>
    </div>
  )
}
`,
      ],
      [
        "src/index.css",
        `@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  margin: 0;
  font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif;
  background: #09090b;
}
`,
      ],
    ];

    for (const [path, content] of files) {
      await this.writeFile(path, content);
    }

    const install = await sandbox.runCommand({
      cmd: "npm",
      args: ["install"],
      cwd: previewConfig.workingDirectory,
    });
    const installResult = await readCommandResult(install);
    if (!installResult.success) {
      console.warn("[VercelProvider] npm install issues:", installResult.stderr);
      throw new Error(`npm install failed: ${installResult.stderr || installResult.stdout}`);
    }

    await this.restartViteServer();
    await this.waitForViteReady();
  }

  /** Known-good Vite config for Vercel Sandbox public URLs (dynamic sb-*.vercel.run). */
  previewViteConfigSource(): string {
    const allowedHosts = JSON.stringify([...previewConfig.viteAllowedHosts]);
    return `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: ${previewConfig.vitePort},
    strictPort: true,
    // Dynamic sandbox hostnames (sb-xxxx.vercel.run) change every create.
    allowedHosts: ${allowedHosts},
    hmr: { clientPort: 443, protocol: 'wss' },
  },
})
`;
  }

  /**
   * Agent-generated vite.config.js often omits allowedHosts and breaks preview.
   * Always re-assert the sandbox vite config after applying generated files.
   */
  async ensurePreviewViteConfig(): Promise<void> {
    await this.writeFile("vite.config.js", this.previewViteConfigSource());
  }

  async restartViteServer(): Promise<void> {
    const sandbox = this.requireSandbox();

    await sandbox.runCommand({
      cmd: "sh",
      args: ["-c", "pkill -f vite || true"],
      cwd: "/",
    });
    await new Promise((resolve) => setTimeout(resolve, 800));

    // SDK v5: background servers must be detached or they die when the command ends.
    await sandbox.runCommand({
      cmd: "npm",
      args: ["run", "dev"],
      cwd: previewConfig.workingDirectory,
      detached: true,
      env: {
        __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS: previewConfig.viteAllowedHosts.join(","),
      },
    });
  }

  async waitForViteReady(timeoutMs = 45_000): Promise<void> {
    const sandbox = this.requireSandbox();
    const started = Date.now();
    let lastLog = "";

    while (Date.now() - started < timeoutMs) {
      const probe = await sandbox.runCommand({
        cmd: "sh",
        args: [
          "-c",
          `curl -fsS http://127.0.0.1:${previewConfig.vitePort}/ >/dev/null 2>&1 && echo READY || (tail -n 40 /tmp/vite.log 2>/dev/null || true)`,
        ],
        cwd: "/",
      });
      const text = (await readCommandText(probe, "stdout")).trim();
      if (text.includes("READY")) return;
      lastLog = text;

      // If curl isn't available, fall back to process check.
      const processProbe = await sandbox.runCommand({
        cmd: "sh",
        args: ["-c", "pgrep -af vite || true"],
        cwd: "/",
      });
      const processes = (await readCommandText(processProbe, "stdout")).trim();
      if (processes.includes("vite") && Date.now() - started > 8_000) {
        // Process is up; give Vite a bit more time then accept.
        await new Promise((resolve) => setTimeout(resolve, 2_000));
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 1_500));
    }

    throw new Error(
      `Vite did not become ready on port ${previewConfig.vitePort}. ${lastLog.slice(0, 500)}`,
    );
  }

  getSandboxUrl(): string | null {
    return this.sandboxInfo?.url ?? null;
  }

  getSandboxInfo(): SandboxInfo | null {
    return this.sandboxInfo;
  }

  async terminate(): Promise<void> {
    if (!this.vercelSandbox) return;
    try {
      await this.vercelSandbox.stop();
    } catch (error) {
      console.error("[VercelProvider] terminate failed:", error);
    }
    this.vercelSandbox = null;
    this.sandbox = null;
    this.sandboxInfo = null;
  }

  isAlive(): boolean {
    return this.vercelSandbox !== null;
  }
}

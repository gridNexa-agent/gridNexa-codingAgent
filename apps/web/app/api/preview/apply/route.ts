import { NextResponse } from "next/server";

import { SandboxFactory } from "@/lib/sandbox/factory";
import { readPreviewSandbox, savePreviewSandbox } from "@/lib/sandbox/preview-store";
import { sandboxManager } from "@/lib/sandbox/sandbox-manager";
import { toPreviewSandboxPaths } from "@/lib/workspace/preview-paths";
import "@/types/sandbox";

export const runtime = "nodejs";
export const maxDuration = 120;

type ApplyFile = { path: string; content: string };

function isViteConfigPath(path: string): boolean {
  const base = path.split("/").pop() ?? path;
  return /^vite\.config\.(js|ts|mjs|cjs)$/.test(base);
}

async function resolveProvider() {
  let provider = sandboxManager.getActiveProvider() ?? globalThis.activeSandboxProvider;
  if (provider?.isAlive()) return provider;

  const stored = await readPreviewSandbox();
  if (!stored?.sandboxId) return null;
  provider = SandboxFactory.create("vercel");
  const info = await provider.reconnect(stored.sandboxId);
  sandboxManager.registerSandbox(info.sandboxId, provider);
  globalThis.activeSandboxProvider = provider;
  globalThis.sandboxData = { sandboxId: info.sandboxId, url: info.url };
  return provider;
}

export async function POST(request: Request) {
  const body = (await request.json()) as { files?: ApplyFile[] };
  const files = toPreviewSandboxPaths(
    (body.files ?? []).filter(
      (file) =>
        typeof file?.path === "string" &&
        !file.path.includes("..") &&
        !file.path.startsWith("/") &&
        typeof file.content === "string",
    ),
  );

  if (files.length === 0) {
    return NextResponse.json({ error: "No files to apply" }, { status: 400 });
  }

  const provider = await resolveProvider();
  if (!provider) {
    return NextResponse.json(
      { error: "No active preview sandbox. Start preview first." },
      { status: 404 },
    );
  }

  try {
    const appFiles = files.filter((file) => !isViteConfigPath(file.path));
    const touchedViteConfig = files.some((file) => isViteConfigPath(file.path));
    if (appFiles.length > 0) {
      await provider.writeFiles(appFiles);
    }
    // Never let agent vite.config strip allowedHosts — re-assert after every apply.
    await provider.ensurePreviewViteConfig();
    if (touchedViteConfig) {
      await provider.restartViteServer();
      await provider.waitForViteReady();
    }

    // Prove the Vite root actually changed — default placeholder contains this marker.
    let appHead: string | undefined;
    let stillDefaultTemplate = false;
    try {
      const app = await provider.readFile("src/App.jsx");
      appHead = app.slice(0, 240);
      stillDefaultTemplate = app.includes("Vite sandbox is ready");
    } catch {
      appHead = undefined;
    }

    const cacheFiles = { ...(globalThis.sandboxState?.fileCache?.files ?? {}) };
    const now = Date.now();
    for (const file of files) {
      cacheFiles[file.path] = { content: file.content, lastModified: now };
    }
    const info = provider.getSandboxInfo();
    globalThis.sandboxState = {
      fileCache: {
        files: cacheFiles,
        lastSync: now,
        sandboxId: info?.sandboxId ?? globalThis.sandboxData?.sandboxId ?? "unknown",
      },
      sandbox: provider,
      sandboxData: info
        ? { sandboxId: info.sandboxId, url: info.url }
        : (globalThis.sandboxData ?? null),
    };
    if (info) {
      await savePreviewSandbox({ sandboxId: info.sandboxId, url: info.url });
    }

    if (stillDefaultTemplate && files.some((file) => file.path === "src/App.jsx" || file.path.endsWith("/App.jsx"))) {
      return NextResponse.json(
        {
          error:
            "Wrote files but src/App.jsx still looks like the default Vite template. Check apply paths.",
          written: files.map((file) => file.path),
          appHead,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      written: appFiles.map((file) => file.path),
      appHead,
      url: provider.getSandboxUrl(),
      refresh: false,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to apply files to sandbox",
      },
      { status: 500 },
    );
  }
}

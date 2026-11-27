import { NextResponse } from "next/server";

import { SandboxFactory } from "@/lib/sandbox/factory";
import { savePreviewSandbox } from "@/lib/sandbox/preview-store";
import { sandboxManager } from "@/lib/sandbox/sandbox-manager";
import { toPreviewSandboxPaths } from "@/lib/workspace/preview-paths";
import "@/types/sandbox";

export const runtime = "nodejs";
export const maxDuration = 300;

type CreateFile = { path: string; content: string };

function isViteConfigPath(path: string): boolean {
  const base = path.split("/").pop() ?? path;
  return /^vite\.config\.(js|ts|mjs|cjs)$/.test(base);
}

function sanitizeFiles(raw: CreateFile[] | undefined): CreateFile[] {
  return toPreviewSandboxPaths(
    (raw ?? []).filter(
      (file) =>
        typeof file?.path === "string" &&
        !file.path.includes("..") &&
        !file.path.startsWith("/") &&
        typeof file.content === "string" &&
        file.content.length > 0,
    ),
  );
}

export async function POST(request: Request) {
  try {
    if (!SandboxFactory.isProviderAvailable("vercel")) {
      return NextResponse.json(
        {
          error:
            "Vercel Sandbox credentials missing. Set VERCEL_OIDC_TOKEN or VERCEL_TOKEN + VERCEL_TEAM_ID + VERCEL_PROJECT_ID.",
        },
        { status: 400 },
      );
    }

    let body: { files?: CreateFile[] } = {};
    try {
      body = (await request.json()) as { files?: CreateFile[] };
    } catch {
      body = {};
    }
    const files = sanitizeFiles(body.files);

    await sandboxManager.terminateAll();
    if (globalThis.activeSandboxProvider) {
      try {
        await globalThis.activeSandboxProvider.terminate();
      } catch {
        // ignore
      }
      globalThis.activeSandboxProvider = undefined;
    }
    globalThis.existingFiles = new Set();

    const provider = SandboxFactory.create("vercel");
    const sandboxInfo = await provider.createSandbox();
    await provider.setupViteApp();

    // Apply generated files BEFORE returning the URL so the public domain never
    // serves only the default "Vite sandbox is ready" placeholder.
    // Drop agent vite.config.js — it usually lacks allowedHosts: true and blocks
    // sb-*.vercel.run; we keep the sandbox preview config instead.
    const written: string[] = [];
    const appFiles = files.filter((file) => !isViteConfigPath(file.path));
    if (appFiles.length > 0) {
      await provider.writeFiles(appFiles);
      written.push(...appFiles.map((file) => file.path));
    }
    await provider.ensurePreviewViteConfig();
    // vite.config change needs a process restart; HMR alone is not enough.
    await provider.restartViteServer();
    await provider.waitForViteReady();

    let appHead: string | undefined;
    try {
      appHead = (await provider.readFile("src/App.jsx")).slice(0, 240);
    } catch {
      appHead = undefined;
    }

    sandboxManager.registerSandbox(sandboxInfo.sandboxId, provider);
    globalThis.activeSandboxProvider = provider;
    globalThis.sandboxData = {
      sandboxId: sandboxInfo.sandboxId,
      url: sandboxInfo.url,
    };
    const cacheFiles: Record<string, { content: string; lastModified: number }> = {};
    const now = Date.now();
    for (const file of files) {
      cacheFiles[file.path] = { content: file.content, lastModified: now };
    }
    globalThis.sandboxState = {
      fileCache: {
        files: cacheFiles,
        lastSync: now,
        sandboxId: sandboxInfo.sandboxId,
      },
      sandbox: provider,
      sandboxData: {
        sandboxId: sandboxInfo.sandboxId,
        url: sandboxInfo.url,
      },
    };
    await savePreviewSandbox({
      sandboxId: sandboxInfo.sandboxId,
      url: sandboxInfo.url,
    });

    return NextResponse.json({
      success: true,
      sandboxId: sandboxInfo.sandboxId,
      url: sandboxInfo.url,
      provider: sandboxInfo.provider,
      written,
      appHead,
      message:
        written.length > 0
          ? `Preview sandbox created; applied ${written.length} generated files`
          : "Preview sandbox created and Vite React app started",
    });
  } catch (error) {
    await sandboxManager.terminateAll();
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to create preview sandbox",
        details: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 },
    );
  }
}

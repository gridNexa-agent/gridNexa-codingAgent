import { NextResponse } from "next/server";

import { SandboxFactory } from "@/lib/sandbox/factory";
import { readPreviewSandbox } from "@/lib/sandbox/preview-store";
import { sandboxManager } from "@/lib/sandbox/sandbox-manager";
import "@/types/sandbox";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 400_000;

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

export async function GET(request: Request) {
  const path = new URL(request.url).searchParams.get("path")?.trim();
  if (!path) {
    return NextResponse.json({ error: "Missing path" }, { status: 400 });
  }
  if (path.includes("..") || path.startsWith("/") || path.includes("\0")) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  try {
    const cached = globalThis.sandboxState?.fileCache?.files?.[path]?.content;
    if (typeof cached === "string") {
      return NextResponse.json({
        success: true,
        path,
        content: cached,
        source: "cache",
      });
    }

    const provider = await resolveProvider();
    if (!provider) {
      return NextResponse.json({ error: "No active preview sandbox" }, { status: 404 });
    }

    const content = await provider.readFile(path);
    if (content.length > MAX_FILE_BYTES) {
      return NextResponse.json({
        path,
        truncated: true,
        content: content.slice(0, MAX_FILE_BYTES),
        source: "sandbox",
      });
    }
    return NextResponse.json({ success: true, path, content, source: "sandbox" });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to read sandbox file",
      },
      { status: 500 },
    );
  }
}

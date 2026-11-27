import { NextResponse } from "next/server";

import { SandboxFactory } from "@/lib/sandbox/factory";
import { readPreviewSandbox } from "@/lib/sandbox/preview-store";
import { sandboxManager } from "@/lib/sandbox/sandbox-manager";
import "@/types/sandbox";

export const runtime = "nodejs";

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

export async function GET() {
  try {
    const provider = await resolveProvider();
    if (!provider) {
      return NextResponse.json({ error: "No active preview sandbox" }, { status: 404 });
    }

    // Prefer in-memory cache seeded at create / apply time (open-lovable style).
    const cached = globalThis.sandboxState?.fileCache?.files;
    if (cached && Object.keys(cached).length > 0) {
      const files = Object.keys(cached).sort((a, b) => a.localeCompare(b));
      return NextResponse.json({
        success: true,
        source: "cache",
        files,
        count: files.length,
      });
    }

    const files = (await provider.listFiles()).sort((a, b) => a.localeCompare(b));
    return NextResponse.json({
      success: true,
      source: "sandbox",
      files,
      count: files.length,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to list sandbox files",
      },
      { status: 500 },
    );
  }
}

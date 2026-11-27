import { NextResponse } from "next/server";

import { SandboxFactory } from "@/lib/sandbox/factory";
import { readPreviewSandbox, savePreviewSandbox } from "@/lib/sandbox/preview-store";
import { sandboxManager } from "@/lib/sandbox/sandbox-manager";
import { VercelProvider } from "@/lib/sandbox/providers/vercel-provider";
import "@/types/sandbox";

export const runtime = "nodejs";
export const maxDuration = 120;

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

export async function POST() {
  const provider = await resolveProvider();
  if (!provider) {
    return NextResponse.json({ error: "No active preview sandbox" }, { status: 404 });
  }

  try {
    await provider.restartViteServer();
    if (provider instanceof VercelProvider) {
      await provider.waitForViteReady();
    }
    const url = provider.getSandboxUrl();
    const info = provider.getSandboxInfo();
    if (info && url) {
      await savePreviewSandbox({ sandboxId: info.sandboxId, url });
    }
    return NextResponse.json({
      success: true,
      url,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to restart Vite",
      },
      { status: 500 },
    );
  }
}

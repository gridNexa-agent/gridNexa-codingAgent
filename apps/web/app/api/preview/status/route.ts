import { NextResponse } from "next/server";

import { SandboxFactory } from "@/lib/sandbox/factory";
import { readPreviewSandbox } from "@/lib/sandbox/preview-store";
import { sandboxManager } from "@/lib/sandbox/sandbox-manager";
import "@/types/sandbox";

export const runtime = "nodejs";

async function ensureProvider() {
  let provider = sandboxManager.getActiveProvider() ?? globalThis.activeSandboxProvider;
  if (provider?.isAlive()) return provider;

  const stored = await readPreviewSandbox();
  if (!stored?.sandboxId) return null;

  try {
    provider = SandboxFactory.create("vercel");
    const info = await provider.reconnect(stored.sandboxId);
    sandboxManager.registerSandbox(info.sandboxId, provider);
    globalThis.activeSandboxProvider = provider;
    globalThis.sandboxData = {
      sandboxId: info.sandboxId,
      url: info.url,
    };
    return provider;
  } catch (error) {
    console.warn("[preview/status] reconnect failed:", error);
    return null;
  }
}

export async function GET() {
  const provider = await ensureProvider();
  const info = provider?.getSandboxInfo() ?? null;
  const data = globalThis.sandboxData;
  const stored = await readPreviewSandbox();

  return NextResponse.json({
    active: Boolean(provider?.isAlive()),
    sandboxId: info?.sandboxId ?? data?.sandboxId ?? stored?.sandboxId ?? null,
    url: info?.url ?? data?.url ?? stored?.url ?? null,
    provider: info?.provider ?? stored?.provider ?? null,
  });
}

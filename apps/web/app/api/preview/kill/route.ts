import { NextResponse } from "next/server";

import { clearPreviewSandbox } from "@/lib/sandbox/preview-store";
import { sandboxManager } from "@/lib/sandbox/sandbox-manager";
import "@/types/sandbox";

export const runtime = "nodejs";

export async function POST() {
  await sandboxManager.terminateAll();
  if (globalThis.activeSandboxProvider) {
    try {
      await globalThis.activeSandboxProvider.terminate();
    } catch {
      // ignore
    }
  }
  globalThis.activeSandboxProvider = undefined;
  globalThis.sandboxData = undefined;
  globalThis.sandboxState = undefined;
  globalThis.existingFiles = undefined;
  await clearPreviewSandbox();

  return NextResponse.json({ success: true });
}

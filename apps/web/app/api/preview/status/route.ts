import { NextResponse } from "next/server";

import { readSessionPreviewStatus } from "@/lib/sandbox/session-preview";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const sessionId = new URL(request.url).searchParams.get("sessionId")?.trim();
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  const live = await readSessionPreviewStatus(sessionId);
  return NextResponse.json({
    active: live.active,
    sandboxId: live.sandboxId,
    url: live.url,
    appRoot: live.appRoot ?? null,
    sessionId,
    provider: "vercel",
  });
}

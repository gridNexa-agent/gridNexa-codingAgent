import { NextResponse } from "next/server";

import { restartSessionVite } from "@/lib/sandbox/session-preview";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  let sessionId: string | undefined;
  try {
    const body = (await request.json()) as { sessionId?: string };
    sessionId = body.sessionId?.trim();
  } catch {
    sessionId = undefined;
  }

  if (!sessionId) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  try {
    const preview = await restartSessionVite(sessionId);
    return NextResponse.json({
      success: true,
      url: preview.url,
      sandboxId: preview.sandboxId,
      appRoot: preview.appRoot,
      sessionId,
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

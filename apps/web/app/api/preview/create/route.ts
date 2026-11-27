import { NextResponse } from "next/server";

import { startSessionPreview } from "@/lib/sandbox/session-preview";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    let body: { sessionId?: string } = {};
    try {
      body = (await request.json()) as { sessionId?: string };
    } catch {
      body = {};
    }

    const sessionId = body.sessionId?.trim();
    if (!sessionId) {
      return NextResponse.json(
        { error: "sessionId is required to start preview on the Eve session sandbox." },
        { status: 400 },
      );
    }

    const preview = await startSessionPreview(sessionId);

    return NextResponse.json({
      success: true,
      sandboxId: preview.sandboxId,
      url: preview.url,
      sessionId,
      appRoot: preview.appRoot,
      provider: "vercel",
      message: `Preview attached to Eve session sandbox at ${preview.appRoot}`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to start session preview",
      },
      { status: 500 },
    );
  }
}

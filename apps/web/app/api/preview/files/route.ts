import { NextResponse } from "next/server";

import { listSessionPreviewFiles } from "@/lib/sandbox/session-preview";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const sessionId = new URL(request.url).searchParams.get("sessionId")?.trim();
    if (!sessionId) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }

    const listed = await listSessionPreviewFiles(sessionId);
    const files = listed.files.sort((a, b) => a.localeCompare(b));
    return NextResponse.json({
      success: true,
      source: "session-sandbox",
      appRoot: listed.appRoot,
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

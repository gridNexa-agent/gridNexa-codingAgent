import { NextResponse } from "next/server";

import { readSessionPreviewFile } from "@/lib/sandbox/session-preview";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 400_000;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const path = url.searchParams.get("path")?.trim();
  const sessionId = url.searchParams.get("sessionId")?.trim();

  if (!path) {
    return NextResponse.json({ error: "Missing path" }, { status: 400 });
  }
  if (path.includes("..") || path.startsWith("/") || path.includes("\0")) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  try {
    const content = await readSessionPreviewFile(sessionId, path);
    if (content.length > MAX_FILE_BYTES) {
      return NextResponse.json({
        path,
        truncated: true,
        content: content.slice(0, MAX_FILE_BYTES),
        source: "session-sandbox",
      });
    }
    return NextResponse.json({
      success: true,
      path,
      content,
      source: "session-sandbox",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to read sandbox file",
      },
      { status: 500 },
    );
  }
}

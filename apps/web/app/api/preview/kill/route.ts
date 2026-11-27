import { NextResponse } from "next/server";

import { stopSessionVite } from "@/lib/sandbox/session-preview";

export const runtime = "nodejs";

/**
 * Stops only the Vite preview process. Never deletes the Eve session sandbox —
 * that would wipe the agent's workspace.
 */
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

  await stopSessionVite(sessionId);
  return NextResponse.json({ success: true, stoppedViteOnly: true, sessionId });
}

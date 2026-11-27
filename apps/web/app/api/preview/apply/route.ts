import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Preview now runs inside the Eve session sandbox. File tools already mutate
 * that filesystem, so a separate apply/copy step is no longer used.
 */
export async function POST() {
  return NextResponse.json(
    {
      success: true,
      noop: true,
      message:
        "Preview uses the Eve session sandbox directly. write_file / edit_file already update it; no apply needed.",
    },
    { status: 200 },
  );
}

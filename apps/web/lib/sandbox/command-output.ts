/**
 * Normalize @vercel/sandbox v5 command results.
 * stdout/stderr are methods that fetch logs; calling them incorrectly throws
 * "Cannot read properties of undefined (reading 'output')".
 */
export async function readCommandText(
  result: {
    stdout?: unknown;
    stderr?: unknown;
    output?: unknown;
    exitCode?: number | null;
  },
  stream: "stdout" | "stderr" = "stdout",
): Promise<string> {
  try {
    const direct = result[stream];
    if (typeof direct === "function") {
      return String(await (direct as () => Promise<string>)());
    }
    if (typeof direct === "string") {
      return direct;
    }
  } catch {
    // fall through to output()
  }

  try {
    if (typeof result.output === "function") {
      return String(
        await (result.output as (stream: "stdout" | "stderr") => Promise<string>)(
          stream,
        ),
      );
    }
  } catch {
    // ignore
  }

  return "";
}

export async function readCommandResult(result: {
  stdout?: unknown;
  stderr?: unknown;
  output?: unknown;
  exitCode?: number | null;
}) {
  const [stdout, stderr] = await Promise.all([
    readCommandText(result, "stdout"),
    readCommandText(result, "stderr"),
  ]);
  const exitCode = result.exitCode ?? 0;
  return {
    stdout,
    stderr,
    exitCode,
    success: exitCode === 0,
  };
}

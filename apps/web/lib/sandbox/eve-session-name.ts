import { createHash } from "node:crypto";

/**
 * Mirrors eve's Vercel session sandbox naming:
 * `eve-sbx-vercel-${sha256(serialize({ sessionId, version: 2 })).slice(0, 32)}`
 * (see eve `execution/sandbox/bindings/vercel.js` → `vercelSessionName`).
 */
function serialize(value: unknown, seen: WeakSet<object>): string {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (value === undefined) return "undefined";
  if (typeof value === "function") return `function:${value.toString()}`;
  if (Array.isArray(value)) {
    return `[${value.map((entry) => serialize(entry, seen)).join(",")}]`;
  }
  if (typeof value !== "object") {
    throw new Error(`Unsupported sandbox provider identity value: ${typeof value}`);
  }
  if (seen.has(value)) {
    throw new Error("Sandbox provider identity values cannot be circular.");
  }
  seen.add(value);
  const body = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${serialize(entry, seen)}`)
    .join(",");
  seen.delete(value);
  return `{${body}}`;
}

export function eveVercelSandboxName(sessionId: string): string {
  const digest = createHash("sha256")
    .update(serialize({ sessionId, version: 2 }, new WeakSet()))
    .digest("hex");
  return `eve-sbx-vercel-${digest.slice(0, 32)}`;
}

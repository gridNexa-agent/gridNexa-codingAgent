import { calls, type SessionView } from "eve/events";

import { toPreviewSandboxPaths } from "@/lib/workspace/preview-paths";
import type { GenerationFile } from "@/lib/workspace/types";

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function normalizePath(raw: string): string {
  let path = raw.trim().replace(/\\/g, "/");
  if (path.startsWith("/workspace/")) path = path.slice("/workspace/".length);
  if (path.startsWith("/vercel/sandbox/")) path = path.slice("/vercel/sandbox/".length);
  if (path.startsWith("./")) path = path.slice(2);
  path = path.replace(/^\/+/, "");
  // Map bare React entry files into the Vite template layout so Preview HMR works.
  if (path === "App.jsx" || path === "App.tsx") path = `src/${path}`;
  if (path === "main.jsx" || path === "main.tsx") path = `src/${path}`;
  if (path === "index.css" || path === "App.css") path = `src/${path}`;
  return path;
}

function isWriteFileTool(name: string): boolean {
  return name === "write_file" || name.endsWith("/write_file") || name.includes("write_file");
}

/**
 * Code panel data source (open-lovable style):
 * AI/tool outputs → frontend state files, NOT live sandbox find/cat.
 *
 * For eve we derive files from write_file tool inputs observed in the session view.
 */
export function extractGenerationFiles(view: SessionView | undefined): GenerationFile[] {
  if (!view) return [];

  const byPath = new Map<string, GenerationFile>();

  for (const observed of calls(view)) {
    if (!isWriteFileTool(observed.name)) continue;

    const input = asRecord(observed.input);
    if (!input) continue;

    const filePath =
      typeof input.filePath === "string"
        ? input.filePath
        : typeof input.path === "string"
          ? input.path
          : undefined;
    const content = typeof input.content === "string" ? input.content : undefined;
    if (!filePath || content === undefined) continue;

    const path = normalizePath(filePath);
    if (!path) continue;

    const completed = observed.state === "completed";

    byPath.set(path, {
      path,
      content,
      completed,
    });
  }

  return toPreviewSandboxPaths(
    [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path)),
  );
}

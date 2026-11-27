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

function toolBaseName(name: string): string {
  return name.split(/[.:/]/u).at(-1) ?? name;
}

function isWriteFileTool(name: string): boolean {
  return toolBaseName(name) === "write_file";
}

function isEditFileTool(name: string): boolean {
  return toolBaseName(name) === "edit_file";
}

type TextEdit = { oldText: string; newText: string };

function parseEdits(input: Record<string, unknown>): TextEdit[] {
  const edits: TextEdit[] = [];
  if (Array.isArray(input.edits)) {
    for (const entry of input.edits) {
      const record = asRecord(entry);
      if (!record) continue;
      if (typeof record.oldText === "string" && typeof record.newText === "string") {
        edits.push({ oldText: record.oldText, newText: record.newText });
      }
    }
  }
  if (typeof input.oldText === "string" && typeof input.newText === "string") {
    edits.push({ oldText: input.oldText, newText: input.newText });
  }
  return edits;
}

function applyTextEdits(content: string, edits: TextEdit[]): string | undefined {
  let next = content;
  for (const edit of edits) {
    if (!edit.oldText) return undefined;
    const index = next.indexOf(edit.oldText);
    if (index === -1) return undefined;
    if (next.indexOf(edit.oldText, index + edit.oldText.length) !== -1) return undefined;
    next = `${next.slice(0, index)}${edit.newText}${next.slice(index + edit.oldText.length)}`;
  }
  return next;
}

/**
 * Code panel data source:
 * AI/tool outputs → frontend state files.
 *
 * Starts from write_file full contents, then overlays later edit_file patches so
 * second-turn edits show up without a separate preview sandbox copy.
 */
export function extractGenerationFiles(view: SessionView | undefined): GenerationFile[] {
  if (!view) return [];

  const byPath = new Map<string, GenerationFile>();
  const ordered = [...calls(view)].sort((left, right) => {
    const leftAt = left.startedAt ?? "";
    const rightAt = right.startedAt ?? "";
    if (leftAt !== rightAt) return leftAt.localeCompare(rightAt);
    return left.callId.localeCompare(right.callId);
  });

  for (const observed of ordered) {
    const input = asRecord(observed.input);
    if (!input) continue;

    if (isWriteFileTool(observed.name)) {
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

      byPath.set(path, {
        path,
        content,
        completed: observed.state === "completed",
      });
      continue;
    }

    if (!isEditFileTool(observed.name)) continue;

    const filePath = typeof input.path === "string" ? input.path : undefined;
    if (!filePath) continue;
    const path = normalizePath(filePath);
    if (!path) continue;

    const existing = byPath.get(path);
    if (!existing) continue;

    const edits = parseEdits(input);
    if (edits.length === 0) continue;

    const patched = applyTextEdits(existing.content, edits);
    if (patched === undefined) continue;

    byPath.set(path, {
      path,
      content: patched,
      completed: observed.state === "completed" ? true : existing.completed,
    });
  }

  return toPreviewSandboxPaths(
    [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path)),
  );
}

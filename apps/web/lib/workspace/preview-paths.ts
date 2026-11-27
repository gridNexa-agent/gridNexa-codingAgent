/** Roots that belong to a Vite/React app — do not strip these. */
const RESERVED_ROOTS = new Set([
  "src",
  "public",
  "app",
  "apps",
  "lib",
  "components",
  "pages",
  "styles",
  "assets",
  "static",
  "dist",
  "build",
  "node_modules",
]);

/**
 * Agent often nests a project folder (snake-game/src/App.jsx). Vite serves from
 * /vercel/sandbox root, so strip a shared non-reserved wrapper before apply.
 */
export function toPreviewSandboxPaths<T extends { path: string }>(files: T[]): T[] {
  if (files.length === 0) return files;

  const roots = files.map((file) => file.path.split("/")[0] ?? "");
  const root = roots[0];
  if (!root || RESERVED_ROOTS.has(root)) return files;
  if (!roots.every((value) => value === root)) return files;
  if (!files.every((file) => file.path.startsWith(`${root}/`))) return files;

  return files.map((file) => ({
    ...file,
    path: file.path.slice(root.length + 1),
  }));
}

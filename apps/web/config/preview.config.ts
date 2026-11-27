/** Preview settings for Vite running inside the Eve session sandbox. */
export const previewConfig = {
  vitePort: 5173,
  /** Wait after starting `npm run dev` before treating preview as ready. */
  viteStartupDelayMs: 8_000,
  /** Vercel Sandbox wall-clock timeout for legacy/reconnect paths. */
  timeoutMs: 3 * 60 * 60 * 1000,
  /** Eve session workspace root (shared by write_file / edit_file / Preview). */
  workingDirectory: "/workspace",
  /** Managed image for legacy standalone create path only. */
  image: "vercel/sandbox/node:22" as const,
  /**
   * Vite DNS-rebinding allowlist for public sandbox URLs (sb-*.vercel.run).
   * Leading-dot form allows the apex and every subdomain.
   * Also passed as `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS` so agent-written
   * vite.config without allowedHosts still works after preview start.
   */
  viteAllowedHosts: [".vercel.run"] as const,
};

/** Preview sandbox settings (ported from open-lovable v2 Vite-on-sandbox flow). */
export const previewConfig = {
  vitePort: 5173,
  /** Wait after starting `npm run dev` before treating preview as ready. */
  viteStartupDelayMs: 8_000,
  /** Vercel Sandbox idle timeout. */
  timeoutMs: 15 * 60 * 1000,
  /** Working directory inside the Vercel Sandbox image. */
  workingDirectory: "/vercel/sandbox",
  /** Managed image for @vercel/sandbox v5. */
  image: "vercel/sandbox/node:22" as const,
};

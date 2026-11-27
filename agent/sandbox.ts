import { defineSandbox } from "eve/sandbox";
import { VercelSandbox } from "eve/sandbox/vercel";
import { installCodeTooling } from "eve/extensions/code/sandbox";

/** Keep session sandboxes warm long enough for multi-turn coding + Preview HMR. */
const SANDBOX_TIMEOUT_MS = 3 * 60 * 60 * 1000; // 3 hours (Vercel Sandbox wall clock)
const IDLE_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours after session goes idle

// Credentials: linked project vercel-sandbox-default-project via .vercel + .env.local.
// Default eve image (not eve-git): the pinned git image returned 404 on this account.
export const environment = VercelSandbox.environment({
  idleTimeoutMs: IDLE_TIMEOUT_MS,
  prepare: async (sandbox) => {
    await installCodeTooling(sandbox, { vercel: true });
  },
});

// Expose Vite port so apps/web Preview can iframe the same Eve session sandbox.
export default defineSandbox(() =>
  environment.open({
    ports: [5173],
    timeout: SANDBOX_TIMEOUT_MS,
  }),
);

import { defineSandbox } from "eve/sandbox";
import { VercelSandbox } from "eve/sandbox/vercel";
import { installCodeTooling } from "eve/extensions/code/sandbox";

// Credentials: linked project vercel-sandbox-default-project via .vercel + .env.local.
// Default eve image (not eve-git): the pinned git image returned 404 on this account.
export const environment = VercelSandbox.environment({
  prepare: async (sandbox) => {
    await installCodeTooling(sandbox, { vercel: true });
  },
});

// Expose Vite preview port for future bridge with apps/web preview panel.
export default defineSandbox(() =>
  environment.open({
    ports: [5173],
  }),
);

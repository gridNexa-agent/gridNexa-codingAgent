import type { NextConfig } from "next";
import { withEve } from "eve/next";
import { fileURLToPath } from "node:url";

const nextConfig: NextConfig = {
  experimental: {
    agentUpgrade: "security",
  },
};

const eveRoot = fileURLToPath(new URL("../..", import.meta.url));

// Local `next dev` needs withEve so /eve/v1/* is served by Next.
// On Vercel, vercel.ts already mounts the agent as a separate service —
// wrapping again would conflict, so keep a plain Next config there.
export default process.env.VERCEL
  ? nextConfig
  : withEve(nextConfig, { eveRoot });

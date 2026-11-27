import type { NextConfig } from "next";
import { withEve } from "eve/next";
import { fileURLToPath } from "node:url";

const nextConfig: NextConfig = {
  // Local browsers often open http://127.0.0.1:3000 while next reports
  // localhost; without this, Next blocks /_next/* and the chat form falls
  // back to a native GET submit (?message=...) with no agent call.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
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

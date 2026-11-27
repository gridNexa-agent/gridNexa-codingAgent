import { VercelProvider } from "./providers/vercel-provider";
import type { SandboxProvider, SandboxProviderConfig } from "./types";

/**
 * Factory for preview sandboxes (open-lovable style).
 * This project defaults to Vercel Sandbox; E2B can be added later behind the same interface.
 */
export class SandboxFactory {
  static create(provider?: string, config?: SandboxProviderConfig): SandboxProvider {
    const selected = (provider || process.env.SANDBOX_PROVIDER || "vercel").toLowerCase();
    switch (selected) {
      case "vercel":
        return new VercelProvider(config || {});
      default:
        throw new Error(
          `Unknown sandbox provider: ${selected}. Supported: vercel`,
        );
    }
  }

  static getAvailableProviders(): string[] {
    return ["vercel"];
  }

  static isProviderAvailable(provider: string): boolean {
    if (provider.toLowerCase() !== "vercel") return false;
    // Local: pulled OIDC token (`vercel env pull` / `eve link`).
    if (process.env.VERCEL_OIDC_TOKEN) return true;
    // Explicit API token path.
    if (
      process.env.VERCEL_TOKEN &&
      process.env.VERCEL_TEAM_ID &&
      process.env.VERCEL_PROJECT_ID
    ) {
      return true;
    }
    // On Vercel, @vercel/sandbox resolves OIDC via getVercelOidcToken() —
    // VERCEL_OIDC_TOKEN is not a persistent project env var.
    if (process.env.VERCEL && process.env.VERCEL_PROJECT_ID) return true;
    return false;
  }
}

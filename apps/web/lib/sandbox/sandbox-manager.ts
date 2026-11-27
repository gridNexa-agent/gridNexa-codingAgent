import { SandboxFactory } from "./factory";
import type { SandboxProvider } from "./types";

type ManagedSandbox = {
  sandboxId: string;
  provider: SandboxProvider;
  createdAt: Date;
  lastAccessed: Date;
};

class SandboxManager {
  private sandboxes = new Map<string, ManagedSandbox>();
  private activeSandboxId: string | null = null;

  async getOrCreateProvider(sandboxId: string): Promise<SandboxProvider> {
    const existing = this.sandboxes.get(sandboxId);
    if (existing) {
      existing.lastAccessed = new Date();
      return existing.provider;
    }
    return SandboxFactory.create();
  }

  registerSandbox(sandboxId: string, provider: SandboxProvider): void {
    this.sandboxes.set(sandboxId, {
      sandboxId,
      provider,
      createdAt: new Date(),
      lastAccessed: new Date(),
    });
    this.activeSandboxId = sandboxId;
  }

  getActiveProvider(): SandboxProvider | null {
    if (!this.activeSandboxId) return null;
    const sandbox = this.sandboxes.get(this.activeSandboxId);
    if (sandbox) sandbox.lastAccessed = new Date();
    return sandbox?.provider ?? null;
  }

  getProvider(sandboxId: string): SandboxProvider | null {
    const sandbox = this.sandboxes.get(sandboxId);
    if (sandbox) sandbox.lastAccessed = new Date();
    return sandbox?.provider ?? null;
  }

  setActiveSandbox(sandboxId: string): boolean {
    if (!this.sandboxes.has(sandboxId)) return false;
    this.activeSandboxId = sandboxId;
    return true;
  }

  async terminateSandbox(sandboxId: string): Promise<void> {
    const sandbox = this.sandboxes.get(sandboxId);
    if (!sandbox) return;
    try {
      await sandbox.provider.terminate();
    } catch (error) {
      console.error(`[SandboxManager] terminate ${sandboxId}:`, error);
    }
    this.sandboxes.delete(sandboxId);
    if (this.activeSandboxId === sandboxId) this.activeSandboxId = null;
  }

  async terminateAll(): Promise<void> {
    await Promise.all(
      [...this.sandboxes.values()].map((sandbox) =>
        sandbox.provider.terminate().catch((err) =>
          console.error(`[SandboxManager] terminate ${sandbox.sandboxId}:`, err),
        ),
      ),
    );
    this.sandboxes.clear();
    this.activeSandboxId = null;
  }
}

export const sandboxManager = new SandboxManager();

declare global {
  // eslint-disable-next-line no-var
  var sandboxManager: SandboxManager;
}

globalThis.sandboxManager = sandboxManager;

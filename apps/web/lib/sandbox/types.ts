export type SandboxFile = {
  path: string;
  content: string;
  lastModified?: number;
};

export type SandboxInfo = {
  sandboxId: string;
  url: string;
  provider: "vercel";
  createdAt: Date;
};

export type CommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  success: boolean;
};

export type SandboxProviderConfig = {
  vercel?: {
    teamId?: string;
    projectId?: string;
    token?: string;
  };
};

export abstract class SandboxProvider {
  protected config: SandboxProviderConfig;
  protected sandbox: unknown = null;
  protected sandboxInfo: SandboxInfo | null = null;

  constructor(config: SandboxProviderConfig) {
    this.config = config;
  }

  abstract createSandbox(): Promise<SandboxInfo>;
  abstract runCommand(command: string): Promise<CommandResult>;
  abstract writeFile(path: string, content: string): Promise<void>;
  /** Batch write; prefer this over many writeFile calls. */
  async writeFiles(files: Array<{ path: string; content: string }>): Promise<void> {
    for (const file of files) {
      await this.writeFile(file.path, file.content);
    }
  }
  abstract readFile(path: string): Promise<string>;
  abstract listFiles(directory?: string): Promise<string[]>;
  abstract installPackages(packages: string[]): Promise<CommandResult>;
  abstract getSandboxUrl(): string | null;
  abstract getSandboxInfo(): SandboxInfo | null;
  abstract terminate(): Promise<void>;
  abstract isAlive(): boolean;

  /** Reattach to an existing remote sandbox after process/HMR loss. */
  async reconnect(_sandboxId: string): Promise<SandboxInfo> {
    throw new Error("reconnect not implemented for this provider");
  }

  async setupViteApp(): Promise<void> {
    throw new Error("setupViteApp not implemented for this provider");
  }

  async ensurePreviewViteConfig(): Promise<void> {
    throw new Error("ensurePreviewViteConfig not implemented for this provider");
  }

  async restartViteServer(): Promise<void> {
    throw new Error("restartViteServer not implemented for this provider");
  }

  async waitForViteReady(_timeoutMs?: number): Promise<void> {
    throw new Error("waitForViteReady not implemented for this provider");
  }
}

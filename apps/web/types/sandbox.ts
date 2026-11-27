import type { SandboxProvider } from "@/lib/sandbox/types";

export type SandboxFileCache = {
  files: Record<string, { content: string; lastModified: number }>;
  lastSync: number;
  sandboxId: string;
};

export type SandboxState = {
  fileCache: SandboxFileCache | null;
  sandbox: SandboxProvider | null;
  sandboxData: { sandboxId: string; url: string } | null;
};

declare global {
  // eslint-disable-next-line no-var
  var activeSandboxProvider: SandboxProvider | undefined;
  // eslint-disable-next-line no-var
  var sandboxData: { sandboxId: string; url: string } | undefined;
  // eslint-disable-next-line no-var
  var existingFiles: Set<string> | undefined;
  // eslint-disable-next-line no-var
  var sandboxState: SandboxState | undefined;
}

export {};

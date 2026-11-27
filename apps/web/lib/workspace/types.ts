export type GenerationFile = {
  path: string;
  content: string;
  completed: boolean;
};

export type SandboxData = {
  sandboxId: string;
  url: string;
};

export type WorkspaceTab = "generation" | "preview";

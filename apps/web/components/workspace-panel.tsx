"use client";

import type { BundledLanguage } from "shiki";
import {
  Code2Icon,
  ExternalLinkIcon,
  EyeIcon,
  FileCodeIcon,
  FileIcon,
  FolderIcon,
  LoaderCircleIcon,
  RefreshCwIcon,
  SquareIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CodeBlock } from "@/components/ai-elements/code-block";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { GenerationFile, SandboxData, WorkspaceTab } from "@/lib/workspace/types";

function languageForPath(path: string): BundledLanguage {
  const ext = path.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "ts":
    case "tsx":
      return "tsx";
    case "js":
    case "jsx":
      return "jsx";
    case "json":
      return "json";
    case "css":
      return "css";
    case "html":
      return "html";
    case "md":
    case "mdx":
      return "markdown";
    default:
      return "tsx";
  }
}

function fileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "jsx" || ext === "tsx" || ext === "js" || ext === "ts") {
    return <FileCodeIcon className="size-3.5 shrink-0 text-sky-500" />;
  }
  return <FileIcon className="size-3.5 shrink-0 text-muted-foreground" />;
}

function buildFileTree(files: GenerationFile[]) {
  const directories = new Map<string, GenerationFile[]>();
  for (const file of files) {
    const parts = file.path.split("/");
    const dir = parts.length > 1 ? parts.slice(0, -1).join("/") : "";
    const list = directories.get(dir) ?? [];
    list.push(file);
    directories.set(dir, list);
  }
  return [...directories.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dir, dirFiles]) => ({
      dir,
      files: dirFiles.sort((a, b) => a.path.localeCompare(b.path)),
    }));
}

function IconButton({
  label,
  disabled,
  onClick,
  href,
  children,
}: {
  readonly label: string;
  readonly disabled?: boolean;
  readonly onClick?: () => void;
  readonly href?: string;
  readonly children: React.ReactNode;
}) {
  const button = href ? (
    <Button asChild disabled={disabled} size="icon-sm" variant="ghost">
      <a href={href} rel="noreferrer" target="_blank">
        {children}
      </a>
    </Button>
  ) : (
    <Button disabled={disabled} onClick={onClick} size="icon-sm" type="button" variant="ghost">
      {children}
    </Button>
  );
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

export function WorkspacePanel({
  className,
  files,
  sandboxData,
  onSandboxData,
  sessionId,
}: {
  readonly className?: string;
  readonly files: readonly GenerationFile[];
  readonly sandboxData: SandboxData | null;
  readonly onSandboxData: (data: SandboxData | null) => void;
  readonly sessionId?: string;
}) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("preview");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(() => new Set([""]));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [iframeKey, setIframeKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const previousFilesSignatureRef = useRef<string>("");

  const tree = useMemo(() => buildFileTree([...files]), [files]);
  const selected = files.find((file) => file.path === selectedFile);

  // Soft-reload iframe when generated/edited files change so HMR misses still show up.
  useEffect(() => {
    const signature = files
      .filter((file) => file.completed)
      .map((file) => `${file.path}:${file.content.length}`)
      .join("|");
    if (!sandboxData?.url || !signature || signature === previousFilesSignatureRef.current) {
      previousFilesSignatureRef.current = signature;
      return;
    }
    if (previousFilesSignatureRef.current) {
      setIframeKey((key) => key + 1);
    }
    previousFilesSignatureRef.current = signature;
  }, [files, sandboxData?.url]);

  useEffect(() => {
    if (files.length === 0) {
      setSelectedFile(null);
      return;
    }
    setSelectedFile((current) => {
      if (current && files.some((file) => file.path === current)) return current;
      return (
        files.find((file) => file.path.endsWith("App.jsx") || file.path.endsWith("App.tsx"))?.path ??
        files[0]?.path ??
        null
      );
    });
    setExpandedDirs(
      new Set(["", ...files.map((file) => file.path.split("/").slice(0, -1).join("/")).filter(Boolean)]),
    );
    // When AI starts producing files, prefer Code tab like open-lovable generation view.
    if (files.some((file) => !file.completed)) {
      setActiveTab("generation");
    }
  }, [files]);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(
          `/api/preview/status?sessionId=${encodeURIComponent(sessionId)}`,
        );
        const payload = (await response.json()) as {
          active?: boolean;
          sandboxId?: string | null;
          url?: string | null;
        };
        if (cancelled || !payload.active || !payload.sandboxId || !payload.url) return;
        onSandboxData({ sandboxId: payload.sandboxId, url: payload.url });
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [onSandboxData, sessionId]);

  const createPreview = useCallback(async () => {
    if (!sessionId) {
      setError("Send a message first so a chat session exists, then start preview.");
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const response = await fetch("/api/preview/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const payload = (await response.json()) as {
        sandboxId?: string;
        url?: string;
        error?: string;
      };
      if (!response.ok || !payload.sandboxId || !payload.url) {
        throw new Error(payload.error || "Failed to start session preview");
      }
      onSandboxData({ sandboxId: payload.sandboxId, url: payload.url });
      setActiveTab("preview");
      setIframeKey((key) => key + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Preview create failed");
    } finally {
      setBusy(false);
    }
  }, [onSandboxData, sessionId]);

  const killPreview = useCallback(async () => {
    setBusy(true);
    setError(undefined);
    try {
      await fetch("/api/preview/kill", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      onSandboxData(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kill failed");
    } finally {
      setBusy(false);
    }
  }, [onSandboxData, sessionId]);

  const refreshIframe = useCallback(() => {
    // Manual reload only — normal code apply relies on Vite HMR like open-lovable.
    // Bust cache with ?t= so the iframe fully reloads the sandbox URL.
    if (!sandboxData?.url) return;
    setIframeKey((key) => key + 1);
  }, [sandboxData?.url]);

  const iframeSrc = useMemo(() => {
    if (!sandboxData?.url) return undefined;
    const url = new URL(sandboxData.url);
    url.searchParams.set("t", String(iframeKey || Date.now()));
    return url.toString();
  }, [sandboxData?.url, iframeKey]);

  const renderMainContent = () => {
    if (activeTab === "generation") {
      if (files.length === 0) {
        return (
          <div className="flex h-full flex-col items-center justify-center gap-2 bg-muted/20 px-6 text-center">
            <Code2Icon className="size-6 text-muted-foreground" />
            <p className="text-sm font-medium">Code</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Shows write_file / edit_file outputs from this chat. Preview runs Vite in the same Eve
              session sandbox those tools already write to.
            </p>
          </div>
        );
      }

      return (
        <div className="absolute inset-0 flex overflow-hidden">
          <aside className="flex w-[250px] shrink-0 flex-col border-r border-border bg-background">
            <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-2 text-xs font-medium">
              <FolderIcon className="size-3.5" />
              Explorer
              <span className="ml-auto text-muted-foreground tabular-nums">{files.length}</span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2 text-xs">
              {tree.map(({ dir, files: dirFiles }) => {
                const open = expandedDirs.has(dir);
                return (
                  <div key={dir || "__root"} className="mb-1">
                    {dir ? (
                      <button
                        className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-muted-foreground hover:bg-muted"
                        onClick={() =>
                          setExpandedDirs((current) => {
                            const next = new Set(current);
                            if (next.has(dir)) next.delete(dir);
                            else next.add(dir);
                            return next;
                          })
                        }
                        type="button"
                      >
                        <FolderIcon className="size-3.5 shrink-0 text-amber-600" />
                        <span className="truncate">{dir.split("/").pop()}</span>
                      </button>
                    ) : null}
                    {(open || !dir) &&
                      dirFiles.map((file) => {
                        const name = file.path.split("/").pop() ?? file.path;
                        return (
                          <button
                            className={cn(
                              "flex w-full items-center gap-1.5 rounded px-2 py-1 text-left hover:bg-muted",
                              dir && "pl-5",
                              selectedFile === file.path && "bg-primary/10 font-medium",
                            )}
                            key={file.path}
                            onClick={() => setSelectedFile(file.path)}
                            type="button"
                          >
                            {fileIcon(name)}
                            <span className="truncate font-mono">{name}</span>
                            {!file.completed ? (
                              <span className="ml-auto size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            ) : null}
                          </button>
                        );
                      })}
                  </div>
                );
              })}
            </div>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col bg-[#f6f8fa]">
            <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-xs text-muted-foreground">
              {selected ? fileIcon(selected.path) : <FileIcon className="size-3.5" />}
              <span className="truncate font-mono">{selected?.path ?? "Select a file"}</span>
              {selected && !selected.completed ? (
                <span className="ml-auto text-[10px] uppercase tracking-wide text-emerald-600">
                  streaming
                </span>
              ) : null}
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              {selected ? (
                <CodeBlock
                  className="min-h-full rounded-none border-0 bg-transparent"
                  code={selected.content || "// Generating…"}
                  language={languageForPath(selected.path)}
                  showLineNumbers
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Select a file
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    // Preview tab — the only iframe, pointing at sandbox public URL (open-lovable model).
    return (
      <div className="absolute inset-0 overflow-hidden bg-zinc-950">
        {busy && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-zinc-950/70">
            <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm">
              <LoaderCircleIcon className="size-4 animate-spin" />
              Starting Vite in session sandbox…
            </div>
          </div>
        )}
        {iframeSrc ? (
          <iframe
            className="size-full border-0 bg-white"
            key={iframeKey}
            ref={iframeRef}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
            src={iframeSrc}
            title="Sandbox preview"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <EyeIcon className="size-6 text-muted-foreground" />
            <p className="text-sm font-medium">Preview</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Starts Vite inside the Eve session sandbox (same FS as write_file / edit_file). After
              the agent has written app files, start preview and HMR will pick up later edits.
            </p>
            <Button
              disabled={busy || !sessionId}
              onClick={() => void createPreview()}
              type="button"
              variant="outline"
            >
              {busy ? "Starting…" : "Start preview"}
            </Button>
          </div>
        )}
      </div>
    );
  };

  return (
    <TooltipProvider>
      <section
        className={cn(
          "flex h-full min-h-0 flex-col overflow-hidden border-l border-border bg-background",
          className,
        )}
      >
        <header className="relative z-10 flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border px-3">
          <div className="inline-flex shrink-0 rounded-md border border-border bg-muted p-0.5">
            <button
              className={cn(
                "inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-all",
                activeTab === "generation"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setActiveTab("generation")}
              type="button"
            >
              <Code2Icon className="size-3.5" />
              Code
            </button>
            <button
              className={cn(
                "inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-all",
                activeTab === "preview"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setActiveTab("preview")}
              type="button"
            >
              <EyeIcon className="size-3.5" />
              View
            </button>
          </div>

          <div className="flex min-w-0 shrink-0 items-center gap-1">
            {activeTab === "generation" && files.length > 0 ? (
              <span className="mr-1 hidden text-xs text-muted-foreground tabular-nums 2xl:inline">
                {files.length} files
              </span>
            ) : null}
            {sandboxData ? (
              <span
                aria-label="Sandbox active"
                className="mr-1 inline-flex size-2 shrink-0 rounded-full bg-emerald-500"
                title="Sandbox active"
              />
            ) : null}
            {sandboxData ? (
              <>
                <IconButton label="Refresh preview" onClick={refreshIframe}>
                  <RefreshCwIcon className="size-3.5" />
                </IconButton>
                <IconButton href={sandboxData.url} label="Open in new tab">
                  <ExternalLinkIcon className="size-3.5" />
                </IconButton>
                <IconButton disabled={busy} label="Stop sandbox" onClick={() => void killPreview()}>
                  <SquareIcon className="size-3.5" />
                </IconButton>
              </>
            ) : (
              <Button
                disabled={busy || !sessionId}
                onClick={() => void createPreview()}
                size="sm"
                type="button"
                variant="outline"
              >
                Start preview
              </Button>
            )}
          </div>
        </header>

        {error ? (
          <div className="border-b border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        ) : null}

        <div className="relative min-h-0 flex-1 overflow-hidden">{renderMainContent()}</div>
      </section>
    </TooltipProvider>
  );
}

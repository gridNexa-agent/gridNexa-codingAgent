"use client";

import type { BundledLanguage } from "shiki";
import {
  Code2Icon,
  ExternalLinkIcon,
  EyeIcon,
  FileIcon,
  FolderIcon,
  LoaderCircleIcon,
  PlayIcon,
  RefreshCwIcon,
  SquareIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { CodeBlock } from "@/components/ai-elements/code-block";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type PreviewState = {
  sandboxId: string;
  url: string;
};

type PanelTab = "code" | "preview";

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
    case "svg":
      return "xml";
    default:
      return "tsx";
  }
}

function buildFileTree(files: string[]) {
  const directories = new Map<string, string[]>();
  for (const file of files) {
    const parts = file.split("/");
    const dir = parts.length > 1 ? parts.slice(0, -1).join("/") : "";
    const name = parts.at(-1) ?? file;
    const list = directories.get(dir) ?? [];
    list.push(name);
    directories.set(dir, list);
  }
  return [...directories.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dir, names]) => ({
      dir,
      files: names.sort((a, b) => a.localeCompare(b)).map((name) => ({
        name,
        path: dir ? `${dir}/${name}` : name,
      })),
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
    <Button
      disabled={disabled}
      onClick={onClick}
      size="icon-sm"
      type="button"
      variant="ghost"
    >
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

export function SandboxPreviewPanel({
  className,
}: {
  readonly className?: string;
}) {
  const [tab, setTab] = useState<PanelTab>("preview");
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [iframeKey, setIframeKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [files, setFiles] = useState<string[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>("");
  const [fileLoading, setFileLoading] = useState(false);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(() => new Set([""]));

  const tree = useMemo(() => buildFileTree(files), [files]);

  const loadFiles = useCallback(async () => {
    setFilesLoading(true);
    try {
      const response = await fetch("/api/preview/files");
      const payload = (await response.json()) as {
        files?: string[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || "Failed to list files");
      }
      const nextFiles = payload.files ?? [];
      setFiles(nextFiles);
      setExpandedDirs(new Set(["", ...nextFiles.map((file) => file.split("/").slice(0, -1).join("/")).filter(Boolean)]));
      if (nextFiles.length > 0) {
        setSelectedFile((current) => current ?? nextFiles.find((file) => file.endsWith("App.jsx") || file.endsWith("App.tsx")) ?? nextFiles[0] ?? null);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to list files");
    } finally {
      setFilesLoading(false);
    }
  }, []);

  const loadFile = useCallback(async (path: string) => {
    setSelectedFile(path);
    setFileLoading(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/preview/file?path=${encodeURIComponent(path)}`);
      const payload = (await response.json()) as {
        content?: string;
        error?: string;
      };
      if (!response.ok || payload.content === undefined) {
        throw new Error(payload.error || "Failed to read file");
      }
      setFileContent(payload.content);
    } catch (cause) {
      setFileContent("");
      setError(cause instanceof Error ? cause.message : "Failed to read file");
    } finally {
      setFileLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/preview/status");
        const payload = (await response.json()) as {
          active?: boolean;
          sandboxId?: string | null;
          url?: string | null;
        };
        if (cancelled || !payload.active || !payload.sandboxId || !payload.url) return;
        setPreview({ sandboxId: payload.sandboxId, url: payload.url });
      } catch {
        // ignore restore failures
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!preview || tab !== "code") return;
    void loadFiles();
  }, [preview, tab, loadFiles]);

  useEffect(() => {
    if (!selectedFile || tab !== "code") return;
    void loadFile(selectedFile);
  }, [selectedFile, tab, loadFile]);

  const createPreview = useCallback(async () => {
    setBusy(true);
    setError(undefined);
    try {
      const response = await fetch("/api/preview/create", { method: "POST" });
      const payload = (await response.json()) as {
        success?: boolean;
        sandboxId?: string;
        url?: string;
        error?: string;
        files?: string[];
      };
      if (!response.ok || !payload.url || !payload.sandboxId) {
        throw new Error(payload.error || "Failed to create preview sandbox");
      }
      setPreview({ sandboxId: payload.sandboxId, url: payload.url });
      setIframeKey((key) => key + 1);
      setTab("preview");
      setFiles(payload.files ?? []);
      setSelectedFile(
        payload.files?.find((file) => file.endsWith("App.jsx") || file.endsWith("App.tsx")) ??
          payload.files?.[0] ??
          null,
      );
      setFileContent("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Preview create failed");
    } finally {
      setBusy(false);
    }
  }, []);

  const refreshPreview = useCallback(() => {
    setIframeKey((key) => key + 1);
  }, []);

  const restartVite = useCallback(async () => {
    setBusy(true);
    setError(undefined);
    try {
      const response = await fetch("/api/preview/restart", { method: "POST" });
      const payload = (await response.json()) as { error?: string; url?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Failed to restart Vite");
      }
      if (payload.url && preview) {
        setPreview({ ...preview, url: payload.url });
      }
      setIframeKey((key) => key + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Restart failed");
    } finally {
      setBusy(false);
    }
  }, [preview]);

  const killPreview = useCallback(async () => {
    setBusy(true);
    setError(undefined);
    try {
      await fetch("/api/preview/kill", { method: "POST" });
      setPreview(null);
      setFiles([]);
      setSelectedFile(null);
      setFileContent("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kill failed");
    } finally {
      setBusy(false);
    }
  }, []);

  const toggleDir = (dir: string) => {
    setExpandedDirs((current) => {
      const next = new Set(current);
      if (next.has(dir)) next.delete(dir);
      else next.add(dir);
      return next;
    });
  };

  return (
    <TooltipProvider>
      <section
        className={cn(
          "flex h-full min-h-0 flex-col overflow-hidden border-l border-border bg-background",
          className,
        )}
      >
        <header className="flex items-center gap-2 border-b border-border px-3 py-2">
          <div className="inline-flex rounded-md border border-border bg-muted/50 p-0.5">
            <button
              className={cn(
                "inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors",
                tab === "code"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setTab("code")}
              type="button"
            >
              <Code2Icon className="size-3.5" />
              Code
            </button>
            <button
              className={cn(
                "inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors",
                tab === "preview"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setTab("preview")}
              type="button"
            >
              <EyeIcon className="size-3.5" />
              View
            </button>
          </div>

          <div className="min-w-0 flex-1">
            {preview ? (
              <p className="truncate font-mono text-[11px] text-muted-foreground" title={preview.url}>
                {preview.url.replace(/^https?:\/\//, "")}
              </p>
            ) : (
              <p className="truncate text-xs text-muted-foreground">No active sandbox</p>
            )}
          </div>

          <div className="flex items-center gap-0.5">
            {preview ? (
              <>
                {tab === "preview" ? (
                  <>
                    <IconButton disabled={busy} label="Refresh preview" onClick={refreshPreview}>
                      <RefreshCwIcon className="size-3.5" />
                    </IconButton>
                    <IconButton disabled={busy} label="Restart Vite" onClick={() => void restartVite()}>
                      <PlayIcon className="size-3.5" />
                    </IconButton>
                  </>
                ) : (
                  <IconButton disabled={busy || filesLoading} label="Refresh files" onClick={() => void loadFiles()}>
                    <RefreshCwIcon className={cn("size-3.5", filesLoading && "animate-spin")} />
                  </IconButton>
                )}
                <IconButton href={preview.url} label="Open in new tab">
                  <ExternalLinkIcon className="size-3.5" />
                </IconButton>
                <IconButton disabled={busy} label="Stop sandbox" onClick={() => void killPreview()}>
                  <SquareIcon className="size-3.5" />
                </IconButton>
              </>
            ) : (
              <Button
                disabled={busy}
                onClick={() => void createPreview()}
                size="sm"
                type="button"
                variant="outline"
              >
                {busy ? <LoaderCircleIcon className="size-3.5 animate-spin" /> : null}
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

        <div className="relative min-h-0 flex-1">
          {tab === "preview" ? (
            preview ? (
              <iframe
                className="size-full border-0 bg-white"
                key={iframeKey}
                sandbox="allow-forms allow-modals allow-popups allow-scripts allow-same-origin"
                src={`${preview.url}?t=${iframeKey}`}
                title="Sandbox preview"
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 bg-muted/20 px-6 text-center">
                <div className="rounded-full border border-border bg-background p-3">
                  <EyeIcon className="size-5 text-muted-foreground" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium">Preview is off</p>
                  <p className="max-w-sm text-xs text-muted-foreground">
                    Only start a preview sandbox when you are building or iterating on an app. Casual
                    questions do not need one.
                  </p>
                </div>
                <Button disabled={busy} onClick={() => void createPreview()} type="button" variant="outline">
                  {busy ? "Creating…" : "Start preview sandbox"}
                </Button>
              </div>
            )
          ) : !preview ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 bg-muted/20 px-6 text-center">
              <div className="rounded-full border border-border bg-background p-3">
                <Code2Icon className="size-5 text-muted-foreground" />
              </div>
              <p className="max-w-sm text-sm text-muted-foreground">
                No preview sandbox yet. Start one only when you need to inspect generated app files.
              </p>
              <Button disabled={busy} onClick={() => void createPreview()} type="button" variant="outline">
                {busy ? "Creating…" : "Start preview sandbox"}
              </Button>
            </div>
          ) : (
            <div className="flex h-full min-h-0">
              <aside className="flex w-48 shrink-0 flex-col border-r border-border bg-muted/20">
                <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground">
                  <FolderIcon className="size-3.5" />
                  Explorer
                  <span className="ml-auto tabular-nums">{files.length}</span>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-1.5 text-xs">
                  {filesLoading && files.length === 0 ? (
                    <div className="flex items-center gap-2 px-2 py-3 text-muted-foreground">
                      <LoaderCircleIcon className="size-3.5 animate-spin" />
                      Loading files…
                    </div>
                  ) : files.length === 0 ? (
                    <p className="px-2 py-3 text-muted-foreground">No files yet</p>
                  ) : (
                    tree.map(({ dir, files: dirFiles }) => {
                      const open = expandedDirs.has(dir);
                      return (
                        <div key={dir || "__root"} className="mb-1">
                          {dir ? (
                            <button
                              className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-muted-foreground hover:bg-muted"
                              onClick={() => toggleDir(dir)}
                              type="button"
                            >
                              <FolderIcon className="size-3.5 shrink-0 text-amber-600" />
                              <span className="truncate">{dir.split("/").pop()}</span>
                            </button>
                          ) : null}
                          {(open || !dir) &&
                            dirFiles.map((file) => (
                              <button
                                className={cn(
                                  "flex w-full items-center gap-1.5 rounded px-2 py-1 text-left hover:bg-muted",
                                  dir && "pl-5",
                                  selectedFile === file.path && "bg-primary/10 text-foreground",
                                )}
                                key={file.path}
                                onClick={() => setSelectedFile(file.path)}
                                type="button"
                              >
                                <FileIcon className="size-3.5 shrink-0 text-muted-foreground" />
                                <span className="truncate font-mono">{file.name}</span>
                              </button>
                            ))}
                        </div>
                      );
                    })
                  )}
                </div>
              </aside>

              <div className="flex min-w-0 flex-1 flex-col bg-[#0d1117]">
                <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2 text-xs text-zinc-300">
                  <FileIcon className="size-3.5 shrink-0" />
                  <span className="truncate font-mono">{selectedFile ?? "Select a file"}</span>
                  {fileLoading ? <LoaderCircleIcon className="ml-auto size-3.5 animate-spin" /> : null}
                </div>
                <div className="min-h-0 flex-1 overflow-auto">
                  {selectedFile && fileContent ? (
                    <CodeBlock
                      className="min-h-full rounded-none border-0 bg-transparent"
                      code={fileContent}
                      language={languageForPath(selectedFile)}
                      showLineNumbers
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-zinc-500">
                      {fileLoading ? "Loading file…" : "Select a file from the explorer"}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </TooltipProvider>
  );
}

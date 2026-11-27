import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export type StoredPreviewSandbox = {
  sandboxId: string;
  url: string;
  provider: "vercel";
  updatedAt: string;
};

function storePath() {
  // Vercel/Lambda ships a read-only filesystem under /var/task; only /tmp is writable.
  // Locally keep the store under the app's .eve directory.
  const base =
    process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME
      ? join(tmpdir(), "gridnexa-codingagent")
      : join(process.cwd(), ".eve");
  return join(base, "preview-sandbox.json");
}

export async function savePreviewSandbox(
  data: Omit<StoredPreviewSandbox, "updatedAt" | "provider"> & {
    provider?: "vercel";
  },
): Promise<void> {
  const path = storePath();
  await mkdir(dirname(path), { recursive: true });
  const payload: StoredPreviewSandbox = {
    sandboxId: data.sandboxId,
    url: data.url,
    provider: data.provider ?? "vercel",
    updatedAt: new Date().toISOString(),
  };
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

export async function readPreviewSandbox(): Promise<StoredPreviewSandbox | null> {
  try {
    const raw = await readFile(storePath(), "utf8");
    const parsed = JSON.parse(raw) as StoredPreviewSandbox;
    if (!parsed?.sandboxId || !parsed?.url) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function clearPreviewSandbox(): Promise<void> {
  try {
    await writeFile(storePath(), "", "utf8");
  } catch {
    // ignore
  }
}

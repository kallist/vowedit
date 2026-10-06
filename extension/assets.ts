import type { makeClient } from "./client";
import { isUUID } from "./client";
export class BlobAssets {
  private entries = new Map<string, Promise<{ blob: Blob; url: string }>>();
  private ready = new Map<string, string>();
  private abort = new AbortController();
  private disposed = false;
  constructor(
    private client: ReturnType<typeof makeClient>,
    private changed: () => void,
  ) {}
  get(id: string, recipe?: "normalized-raw") {
    if (!isUUID(id) || this.disposed) throw new Error("INVALID_ASSET");
    const key = recipe
      ? `/prepared-candidates/${id}/normalized-raw`
      : `/assets/${id}`;
    if (!this.entries.has(key)) {
      const task = this.client.blob(key, this.abort.signal).then((blob) => {
        if (this.disposed) throw new Error("ASSET_DISPOSED");
        const url = URL.createObjectURL(blob);
        this.ready.set(key, url);
        this.changed();
        return { blob, url };
      });
      this.entries.set(key, task);
      void task.catch(() => {}); // No unauthenticated URL fallback or repeated poll downloads.
    }
    return this.ready.get(key);
  }
  async blob(id: string) {
    this.get(id);
    return (await this.entries.get(`/assets/${id}`)!).blob;
  }
  dispose() {
    this.disposed = true;
    this.abort.abort();
    for (const url of this.ready.values()) URL.revokeObjectURL(url);
    this.entries.clear();
    this.ready.clear();
  }
}
export async function copyPNG(blob: Blob) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("COPY_TIMEOUT")), 5000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
export function downloadPNG(blob: Blob, id: string) {
  if (!isUUID(id)) throw new Error("INVALID_ASSET");
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `vowedit-final-${id}.png`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

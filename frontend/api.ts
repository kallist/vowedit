import type { Asset } from "./types";
import { safeErrorText } from "./i18n/errors";
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string = "UNKNOWN_ERROR",
  ) {
    super(message);
  }
}
let browserSession: Promise<{ csrf: string }> | undefined;
async function session() {
  browserSession ||= fetch('/api/browser-session', { method: 'POST', cache: 'no-store' })
    .then(async response => {
      if (!response.ok) throw new ApiError('Reload VowEdit.', response.status, 'UNAUTHORIZED');
      return response.json() as Promise<{ csrf: string }>;
    }).catch(error => { browserSession = undefined; throw error; });
  return browserSession;
}
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const { csrf } = await session();
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: { ...Object.fromEntries(new Headers(init?.headers)), 'X-Vowedit-CSRF': csrf },
    cache: "no-store",
  }).catch(() => {
    throw new ApiError(
      safeErrorText("CONNECTION_FAILED"),
      0,
      "CONNECTION_FAILED",
    );
  });
  const data = await response.json().catch(() => null);
  if (response.status === 401) browserSession = undefined;
  if (!response.ok)
    throw new ApiError(
      safeErrorText(data?.error?.code),
      response.status,
      typeof data?.error?.code === "string" ? data.error.code : "UNKNOWN_ERROR",
    );
  return data as T;
}
export const jsonPost = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
export async function upload(
  file: File | Blob,
  kind: "original" | "mask" | "candidate",
  name = "mask.png",
) {
  const form = new FormData();
  form.append("file", file, file instanceof File ? file.name : name);
  return api<Asset>(`/assets?kind=${kind}`, { method: "POST", body: form });
}

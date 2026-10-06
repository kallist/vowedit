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
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    cache: "no-store",
  }).catch(() => {
    throw new ApiError(
      safeErrorText("CONNECTION_FAILED"),
      0,
      "CONNECTION_FAILED",
    );
  });
  const data = await response.json().catch(() => null);
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

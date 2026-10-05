import type { Asset } from "./types";
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, { ...init, cache: "no-store" });
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new ApiError(
      data?.error?.message ||
        "The local service could not be reached. Try again.",
      response.status,
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

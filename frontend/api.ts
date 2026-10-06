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
export type Api = <T>(path: string, init?: RequestInit) => Promise<T>;
export function createApiClient(
  base = "/api",
  auth: () => Record<string, string> = () => ({}),
  transport: typeof fetch = (input, init) => fetch(input, init),
) {
  async function request<T>(
    path: string,
    init: RequestInit | undefined,
    read: (response: Response) => Promise<T>,
  ) {
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), 12000);
    try {
      const response = await transport(`${base}${path}`, {
        ...init,
        cache: "no-store",
        credentials: "omit",
        redirect: "error",
        signal: init?.signal
          ? AbortSignal.any([init.signal, timeout.signal])
          : timeout.signal,
        headers: {
          ...Object.fromEntries(new Headers(init?.headers)),
          ...auth(),
        },
      });
      return await read(response);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(
        safeErrorText("CONNECTION_FAILED"),
        0,
        "CONNECTION_FAILED",
      );
    } finally {
      clearTimeout(timer);
    }
  }
  const api: Api = async <T>(path: string, init?: RequestInit): Promise<T> => {
    return request(path, init, async (response) => {
      const data = await response.json();
      if (!response.ok)
        throw new ApiError(
          safeErrorText(data?.error?.code),
          response.status,
          typeof data?.error?.code === "string"
            ? data.error.code
            : "UNKNOWN_ERROR",
        );
      return data as T;
    });
  };
  const upload = async (
    file: File | Blob,
    kind: "original" | "mask" | "candidate",
    name = "mask.png",
  ) => {
    const form = new FormData();
    form.append("file", file, file instanceof File ? file.name : name);
    return api<Asset>(`/assets?kind=${kind}`, { method: "POST", body: form });
  };
  const blob = async (path: string, signal?: AbortSignal) => {
    return request(path, { signal }, async (response) => {
      if (
        !response.ok ||
        response.headers.get("content-type")?.split(";")[0] !== "image/png"
      )
        throw new ApiError(
          safeErrorText("ASSET_NOT_FOUND"),
          response.status,
          "ASSET_NOT_FOUND",
        );
      return response.blob();
    });
  };
  return { api, upload, blob };
}
export const { api, upload } = createApiClient();
export const jsonPost = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

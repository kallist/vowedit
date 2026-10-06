import { createApiClient } from "../frontend/api";
import type { Credential } from "./storage";
export const uuidPattern =
  "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
export const isUUID = (value: string) =>
  value.length === 36 && new RegExp(`^${uuidPattern}$`).test(value);
export function extensionOrigin(id: string) {
  if (id.length !== 32 || !/^[a-p]{32}$/.test(id))
    throw new Error("INVALID_EXTENSION_ID");
  return `chrome-extension://${id}`;
}
export function apiBase(port: number) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error("INVALID_PORT");
  return `http://127.0.0.1:${port}/api`;
}
export function validCredential(value: unknown): value is Credential {
  if (!value || typeof value !== "object") return false;
  const credential = value as Credential;
  return (
    typeof credential.id === "string" &&
    isUUID(credential.id) &&
    typeof credential.origin === "string" &&
    credential.origin.length === 51 &&
    /^chrome-extension:\/\/[a-p]{32}$/.test(credential.origin) &&
    typeof credential.token === "string" &&
    credential.token.length === 64 &&
    /^[0-9a-f]{64}$/.test(credential.token) &&
    Number.isFinite(credential.expires_at) &&
    credential.expires_at > 0
  );
}
export function allowedPath(path: string) {
  if (/[\r\n]/.test(path)) return false;
  const u = uuidPattern;
  return new RegExp(
    `^/(?:capabilities|config|browser-pairing/(?:exchange|current)|candidate-plans|assets(?:/${u}|\\?kind=(?:original|mask|candidate))?|runs(?:/${u}(?:/(?:report|receipt|selection|continuations|retry-generation|retry-evaluation)|/candidates/${u}/review)?)?|imported-runs|prepared-candidates(?:/${u}/normalized-raw)?|drafts/${u}|editing-drafts(?:/${u})?)$`,
  ).test(path);
}
export function makeClient(
  port: number,
  credential?: Credential,
  transport: typeof fetch = fetch,
) {
  const base = apiBase(port);
  if (credential && !validCredential(credential))
    throw new Error("INVALID_CREDENTIAL");
  const client = createApiClient(
    base,
    (): Record<string, string> =>
      credential
        ? {
            Authorization: `Bearer ${credential.token}`,
            "X-VowEdit-Extension-Origin": credential.origin,
          }
        : {},
    transport,
  );
  const check = (path: string) => {
    if (!allowedPath(path)) throw new Error("INVALID_LOCAL_ROUTE");
  };
  return {
    api: async <T>(path: string, init?: RequestInit) => {
      check(path);
      return client.api<T>(path, init);
    },
    upload: client.upload,
    blob: async (path: string, signal?: AbortSignal) => {
      check(path);
      return client.blob(path, signal);
    },
  };
}
const required = [
  "editing-drafts-v1",
  "candidate-plans-v1",
  "browser-pairing-v1",
  "report-v2",
  "continuations-v1",
];
export function compatible(value: unknown): boolean {
  const data = value as { api_version?: string; features?: unknown } | null;
  return (
    data?.api_version === "side-panel-v1" &&
    Array.isArray(data.features) &&
    required.every((feature) => (data.features as unknown[]).includes(feature))
  );
}
export function fullURL(route: string) {
  const u = uuidPattern;
  if (
    /[\r\n]/.test(route) ||
    !new RegExp(
      `^/(?:edit/${u}(?:#report)?|edit/new(?:\\?(?:editing_draft|draft)=${u})?|history|settings/browser(?:\\?extension_id=[a-p]{32})?)$`,
    ).test(route)
  )
    throw new Error("INVALID_LOCAL_ROUTE");
  return `http://127.0.0.1:3000${route}`;
}

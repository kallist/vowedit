import type { LocaleStorage } from "../frontend/i18n/LocaleProvider";
import type { CommandStorage } from "../frontend/Bridge";
import { validCredential } from "./client";
export type Credential = {
  id: string;
  origin: string;
  token: string;
  expires_at: number;
};
export type Pointer = { draft?: string; run?: string };
let initialized: Promise<void> | undefined;
export function initializeStorage() {
  return (initialized ||= Promise.all([
    chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" }),
    chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" }),
  ]).then(() => {}));
}
export async function preferences() {
  await initializeStorage();
  const values = await chrome.storage.local.get([
    "port",
    "credential",
    "pointer",
  ]);
  return values as {
    port?: number;
    credential?: Credential;
    pointer?: Pointer;
  };
}
export async function saveCredential(credential: Credential) {
  await initializeStorage();
  if (!validCredential(credential)) throw new Error("INVALID_CREDENTIAL");
  await chrome.storage.local.set({ credential });
}
export async function clearCredential() {
  await initializeStorage();
  const values = await chrome.storage.local.get(null);
  await chrome.storage.local.remove(
    Object.keys(values).filter(
      (key) =>
        key === "credential" || key === "pointer" || key.startsWith("vowedit."),
    ),
  );
  await chrome.storage.session.clear();
}
export async function setPort(port: number) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error("INVALID_PORT");
  await clearCredential(); // No credential ever crosses endpoints.
  await chrome.storage.local.set({ port });
}
export async function savePointer(pointer: Pointer) {
  await initializeStorage();
  await chrome.storage.local.set({ pointer });
}
export const localeStorage: LocaleStorage = {
  get: async () => {
    await initializeStorage();
    const value = (await chrome.storage.local.get("locale")).locale;
    return typeof value === "string" ? value : null;
  },
  set: async (locale) => {
    await initializeStorage();
    await chrome.storage.local.set({ locale });
  },
};
export const commandStorage: CommandStorage = {
  get: async (key) => {
    await initializeStorage();
    const value = (await chrome.storage.local.get(key))[key];
    return typeof value === "string" ? value : null;
  },
  set: async (key, value) => {
    await initializeStorage();
    if (
      !/^vowedit\.(submit|retry|continuation|create):/.test(key) ||
      value.length > 1024
    )
      throw new Error("INVALID_COMMAND_POINTER");
    await chrome.storage.local.set({ [key]: value });
  },
  remove: async (key) => {
    await initializeStorage();
    await chrome.storage.local.remove(key);
  },
};

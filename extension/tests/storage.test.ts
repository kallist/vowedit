import { expect, it, vi } from "vitest";
it("fails closed if trusted-context initialization fails before storing a credential", async () => {
  vi.resetModules();
  const write = vi.fn();
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        setAccessLevel: vi.fn(async () => {
          throw new Error("fixture");
        }),
        set: write,
      },
      session: { setAccessLevel: vi.fn(async () => {}) },
    },
  });
  const { saveCredential } = await import("../storage");
  await expect(
    saveCredential({
      id: "id",
      token: "synthetic",
      origin: "origin",
      expires_at: 0,
    }),
  ).rejects.toThrow();
  expect(write).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});
it("clears credentials before assigning another numeric endpoint", async () => {
  vi.resetModules();
  const calls: string[] = [];
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        setAccessLevel: async () => {
          calls.push("local-trusted");
        },
        get: async () => ({
          credential: "synthetic",
          pointer: {},
          locale: "en",
          port: 8000,
        }),
        remove: async (keys: string[]) => {
          expect(keys).toEqual(["credential", "pointer"]);
          calls.push("clear");
        },
        set: async () => {
          calls.push("new-port");
        },
      },
      session: {
        setAccessLevel: async () => {
          calls.push("session-trusted");
        },
        clear: async () => {
          calls.push("clear-session");
        },
      },
    },
  });
  const { setPort } = await import("../storage");
  await setPort(8001);
  expect(calls).toEqual([
    "local-trusted",
    "session-trusted",
    "clear",
    "clear-session",
    "new-port",
  ]);
  vi.unstubAllGlobals();
});

import { describe, expect, it, vi } from "vitest";
import {
  allowedPath,
  apiBase,
  compatible,
  extensionOrigin,
  fullURL,
  makeClient,
  validCredential,
} from "../client";
import { ApiError } from "../../frontend/api";
import { BlobAssets, copyPNG } from "../assets";
const id = "c1da6e4a-4c25-4d37-a90e-2ad5ba1b8802";
const origin = "chrome-extension://" + "a".repeat(32);
describe("closed loopback client", () => {
  it("rejects malformed persisted credentials before emitting a private header", () => {
    const credential = {
      id,
      origin,
      token: "d".repeat(64),
      expires_at: 9999999999,
    };
    expect(validCredential(credential)).toBe(true);
    for (const patch of [
      { id: "bad" },
      { token: "bad" },
      { token: "d".repeat(64) + "\n" },
      { expires_at: NaN },
      { origin: "https://remote.example" },
    ]) {
      expect(validCredential({ ...credential, ...patch })).toBe(false);
      expect(() => makeClient(8000, { ...credential, ...patch })).toThrow(
        "INVALID_CREDENTIAL",
      );
    }
  });
  it("requires API and all flags independently of informational product version", () => {
    const value = {
      api_version: "side-panel-v1",
      features: [
        "editing-drafts-v1",
        "candidate-plans-v1",
        "browser-pairing-v1",
        "report-v2",
        "continuations-v1",
      ],
    };
    expect(compatible(value)).toBe(true);
    expect(compatible({ ...value, product_version: "old" })).toBe(true);
    expect(
      compatible({
        ...value,
        product_version: "new",
        features: [...value.features, "extra"],
      }),
    ).toBe(true);
    expect(
      compatible({ ...value, api_version: "old", product_version: "0.2.1" }),
    ).toBe(false);
    for (const feature of value.features)
      expect(
        compatible({
          ...value,
          features: value.features.filter((f) => f !== feature),
          product_version: "0.2.1",
        }),
      ).toBe(false);
    expect(compatible(null)).toBe(false);
  });
  it("rejects remote names, traversal, credentials, arbitrary query and invalid IDs", () => {
    expect(apiBase(8001)).toBe("http://127.0.0.1:8001/api");
    for (const port of [0, 80, 65536, NaN, 8000.5])
      expect(() => apiBase(port)).toThrow();
    expect(extensionOrigin("a".repeat(32))).toBe(origin);
    expect(() => extensionOrigin("z".repeat(32))).toThrow();
    for (const route of [
      "https://remote.example",
      "//remote",
      "/assets/../config",
      "/assets/%2e%2e",
      "/config?token=secret",
      "/browser-pairings",
      "/proxy",
      "/runs/not-a-uuid",
    ])
      expect(allowedPath(route)).toBe(false);
    expect(allowedPath(`/assets/${id}`)).toBe(true);
    expect(fullURL(`/edit/new?editing_draft=${id}`)).toContain(id);
    expect(
      fullURL(`/settings/browser?extension_id=${"a".repeat(32)}`),
    ).toContain("extension_id");
    for (const route of [
      "/edit/new?editing_draft=bad",
      `/edit/new?editing_draft=${id}&token=secret`,
      "/settings/browser?extension_id=" + "z".repeat(32),
      "/report/" + id,
      "/settings/browser?code=secret",
    ])
      expect(() => fullURL(route)).toThrow();
  });
  it("sends secrets only in private headers, with bounded redirects and credentials omitted", async () => {
    const token = "d".repeat(64);
    const transport = vi.fn(async () => Response.json({ providers: ["mock"] }));
    const client = makeClient(
      8001,
      { id, origin, token, expires_at: 9999999999 },
      transport,
    );
    await client.api("/config");
    const [url, init] = transport.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).not.toContain(token);
    expect(init).toMatchObject({
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-VowEdit-Extension-Origin": origin,
      },
    });
    await expect(client.api("/config?token=private")).rejects.toThrow(
      "INVALID_LOCAL_ROUTE",
    );
    expect(transport).toHaveBeenCalledTimes(1);
    const failure = makeClient(8000, undefined, async () => {
      throw new Error("synthetic-secret");
    });
    await expect(failure.api("/capabilities")).rejects.toBeInstanceOf(ApiError);
    await expect(failure.api("/capabilities")).rejects.not.toThrow(
      "synthetic-secret",
    );
  });
  it("aborts a bounded offline request", async () => {
    vi.useFakeTimers();
    const client = makeClient(
      8000,
      undefined,
      async (_url, init) =>
        new Promise((_resolve, reject) =>
          init?.signal?.addEventListener("abort", () =>
            reject(new Error("fixture")),
          ),
        ),
    );
    const request = client.api("/capabilities");
    const assertion = expect(request).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(12001);
    await assertion;
    vi.useRealTimers();
  });
  it("keeps the deadline active while an authenticated PNG body stalls after headers", async () => {
    vi.useFakeTimers();
    const client = makeClient(
      8000,
      undefined,
      async (_url, init) =>
        new Response(
          new ReadableStream({
            start(controller) {
              init?.signal?.addEventListener(
                "abort",
                () => controller.error(new Error("fixture")),
                { once: true },
              );
            },
          }),
          { headers: { "Content-Type": "image/png" } },
        ),
    );
    const pending = client.blob(`/assets/${id}`);
    const assertion = expect(pending).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(12001);
    await assertion;
    vi.useRealTimers();
  });
});
describe("authenticated PNG lifecycle", () => {
  it("deduplicates stable assets and revokes on disposal", async () => {
    const client = makeClient(8000);
    client.blob = vi.fn(
      async () => new Blob(["fixture"], { type: "image/png" }),
    );
    const changed = vi.fn();
    const assets = new BlobAssets(client, changed);
    assets.get(id);
    assets.get(id);
    const blob = await assets.blob(id);
    expect(blob.type).toBe("image/png");
    expect(client.blob).toHaveBeenCalledTimes(1);
    expect(assets.get(id)).toMatch(/^blob:/);
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    assets.dispose();
    expect(revoke).toHaveBeenCalledTimes(1);
    expect(() => assets.get(id)).toThrow();
    revoke.mockRestore();
  });
  it("propagates clipboard failures", async () => {
    vi.stubGlobal("navigator", {
      clipboard: {
        write: async () => {
          throw new Error("denied");
        },
      },
    });
    vi.stubGlobal(
      "ClipboardItem",
      class {
        constructor() {}
      },
    );
    await expect(copyPNG(new Blob())).rejects.toThrow("denied");
    vi.unstubAllGlobals();
  });
});

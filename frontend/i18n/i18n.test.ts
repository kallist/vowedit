import { describe, expect, it, vi, afterEach } from "vitest";
import { en, type MessageKey } from "./en";
import { zhCN } from "./zh-CN";
import { formatMetric, sourceText, stateText, strategyText } from "./format";
import { api, ApiError } from "../api";
const zh = (key: MessageKey) => zhCN[key];
afterEach(() => vi.unstubAllGlobals());
describe("locale affects presentation and safe errors", () => {
  it("covers both catalogs and distinguishes unavailable metrics from 100", () => {
    expect(Object.keys(zhCN).sort()).toEqual(Object.keys(en).sort());
    expect(formatMetric(null, zh, "zh-CN")).toBe("未定义");
    expect(formatMetric(99.999, zh, "zh-CN")).toBe("100.0");
    expect(strategyText("safe", zh)).toBe("克制修改");
    expect(stateText("partial", zh)).toBe("部分完成");
    expect(
      sourceText(
        { provider: "imported", source_label: "User supplied 原始来源" },
        zh,
      ),
    ).toContain("User supplied 原始来源");
  });
  it("preserves status and typed code without echoing provider exception content", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (path: string) => path === "/api/browser-session" ? { ok: true, status: 200, json: async () => ({ csrf: "fixture" }) } : ({
        ok: false,
        status: 409,
        json: async () => ({
          error: {
            code: "SELECTION_CONFLICT",
            message: "SECRET private/path",
          },
        }),
      })),
    );
    const error = await api("/runs/fixture/selection").catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    if (!(error instanceof ApiError))
      throw new Error("Expected structured API error");
    expect(error.status).toBe(409);
    expect(error.code).toBe("SELECTION_CONFLICT");
    expect(error.message).toBe("Selection changed. Refresh this edit.");
  });
  it("uses a generic safe error for unknown server codes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (path: string) => path === "/api/browser-session" ? { ok: true, status: 200, json: async () => ({ csrf: "fixture" }) } : ({
        ok: false,
        status: 503,
        json: async () => ({
          error: { code: "NEW_SDK_ERROR", message: "signed.example/secret" },
        }),
      })),
    );
    await expect(api("/config")).rejects.toThrow(
      "The local service could not complete this request.",
    );
  });
});

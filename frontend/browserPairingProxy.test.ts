import { expect, it, vi } from "vitest";
import { GET } from "../app/api/browser-pairings/route";

it("rejects declared extension authority before forwarding local pairing administration", async () => {
  const transport = vi.fn();
  vi.stubGlobal("fetch", transport);
  try {
    const declarations: Record<string, string>[] = [
      { Authorization: "" },
      { "X-VowEdit-Extension-Origin": "chrome-extension://" + "a".repeat(32) },
    ];
    for (const declaration of declarations) {
      const response = await GET(
        new Request("http://127.0.0.1:3000/api/browser-pairings", {
          headers: {
            "Sec-Fetch-Site": "same-origin",
            "X-VowEdit-Local": "1",
            "Content-Type": "application/json",
            ...declaration,
          },
        }),
      );
      expect(response.status).toBe(403);
    }
    expect(transport).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
  }
});

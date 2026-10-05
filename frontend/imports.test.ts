import { expect, it } from "vitest";
import { importReady, submissionPath } from "./imports";
import { sourceBadge } from "./types";

const asset = { id: "a", width: 64, height: 64, url: "/api/assets/a" };
it("requires three uploaded candidates and a bounded descriptive label", () => {
  expect(importReady([asset, asset, null], "GPT Image via Codex")).toBe(false);
  expect(importReady([asset, asset, asset], " ")).toBe(false);
  expect(importReady([asset, asset, asset], "a".repeat(81))).toBe(false);
  expect(importReady([asset, asset, asset], "GPT Image via Codex")).toBe(true);
});
it("recovers each submission through its original source path", () => {
  expect(submissionPath({ provider: "mock" })).toBe("/runs");
  expect(submissionPath({ candidate_images: ["a", "b", "c"] })).toBe(
    "/imported-runs",
  );
});
it("attributes imported results without suggesting direct generation", () => {
  expect(
    sourceBadge({ provider: "imported", source_label: "GPT Image via Codex" }),
  ).toBe("IMPORTED · GPT Image via Codex");
  expect(sourceBadge({ provider: "mock" })).toBe("MOCK · pixel simulation");
  expect(sourceBadge({ provider: "runninghub" })).toBe("runninghub");
});

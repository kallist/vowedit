import { describe, expect, it } from "vitest";
import { maskStats, pointInImage } from "./masks";
import { metric, terminal } from "./types";
describe("image-space painting", () => {
  it("maps responsive display coordinates to source pixels", () => {
    expect(
      pointInImage(
        150,
        100,
        { left: 50, top: 50, width: 200, height: 100 },
        800,
        400,
      ),
    ).toEqual({ x: 400, y: 200 });
  });
  it("clamps a captured pointer outside the image", () => {
    expect(
      pointInImage(
        -10,
        600,
        { left: 0, top: 0, width: 200, height: 100 },
        800,
        400,
      ),
    ).toEqual({ x: 0, y: 400 });
  });
  it("detects overlap with the same threshold used for binary export", () => {
    const change = new Uint8ClampedArray([
      255, 255, 255, 128, 255, 255, 255, 127,
    ]);
    const keep = new Uint8ClampedArray([
      255, 255, 255, 255, 255, 255, 255, 255,
    ]);
    expect(maskStats(change, keep)).toEqual({
      changePixels: 1,
      keepPixels: 2,
      overlap: 1,
    });
  });
  it("distinguishes absent scores from perfect zero values", () => {
    expect(metric(null)).toBe("Not defined");
    expect(metric(0)).toBe("0.0");
  });
  it("polls active jobs and stops for all terminal failure domains", () => {
    for (const s of ["queued", "generating", "evaluating"])
      expect(terminal(s)).toBe(false);
    for (const s of [
      "completed",
      "partial",
      "failed_generation",
      "failed_evaluation",
    ])
      expect(terminal(s)).toBe(true);
  });
});

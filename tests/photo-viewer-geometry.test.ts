import { describe, expect, it } from "vitest";
import { clampPhotoTransform } from "../src/lib/photo-viewer-geometry";

describe("full-screen photo bounds", () => {
  it("centers a fitted photo even after a pinch returns from a panned state", () => {
    expect(
      clampPhotoTransform(
        { scale: 0.5, x: 200, y: -80 },
        { width: 390, height: 700 },
        { width: 720, height: 1080 },
      ),
    ).toEqual({ scale: 1, x: 0, y: 0 });
  });
  it("clamps portrait panning to the visible image edges", () => {
    expect(
      clampPhotoTransform(
        { scale: 2, x: 1000, y: -1000 },
        { width: 390, height: 700 },
        { width: 720, height: 1080 },
      ),
    ).toEqual({ scale: 2, x: 195, y: -235 });
  });
  it("does not allow empty vertical panning on a wide image", () => {
    expect(
      clampPhotoTransform(
        { scale: 2, x: -1000, y: 1000 },
        { width: 390, height: 700 },
        { width: 1600, height: 800 },
      ),
    ).toEqual({ scale: 2, x: -195, y: 0 });
  });
  it("limits pinch magnification", () => {
    expect(
      clampPhotoTransform(
        { scale: 12, x: 0, y: 0 },
        { width: 390, height: 700 },
        { width: 800, height: 800 },
      ).scale,
    ).toBe(4);
  });
});

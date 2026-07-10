import { describe, expect, it } from "vitest";
import { isFontAvailable } from "./fontDetect";

/** A fake CanvasRenderingContext2D whose measureText width depends only on
 * the requested `font` string — lets us simulate "font X is installed"
 * (renders at a distinct width) vs. "font X isn't" (renders identically to
 * its generic fallback) without needing real canvas font rendering, which
 * jsdom doesn't implement. */
function fakeContext(installedFonts: string[]): CanvasRenderingContext2D {
  let currentFont = "";
  return {
    set font(value: string) {
      currentFont = value;
    },
    get font() {
      return currentFont;
    },
    measureText: (text: string) => {
      // Simulate: requesting a quoted font name that's "installed" renders
      // at a width distinct from any generic-family-only request.
      const requestsInstalledFont = installedFonts.some((name) =>
        currentFont.includes(`"${name}"`),
      );
      return { width: requestsInstalledFont ? 999 : text.length * 10 } as TextMetrics;
    },
  } as unknown as CanvasRenderingContext2D;
}

describe("isFontAvailable", () => {
  it("returns true for a font present in the simulated environment", () => {
    const ctx = fakeContext(["Arial"]);
    expect(isFontAvailable("Arial", ctx)).toBe(true);
  });

  it("returns false for a font absent from the simulated environment", () => {
    const ctx = fakeContext(["Arial"]);
    expect(isFontAvailable("SomeFontThatDoesNotExist", ctx)).toBe(false);
  });

  it("returns false when no canvas context is available", () => {
    expect(isFontAvailable("Arial", null)).toBe(false);
  });
});

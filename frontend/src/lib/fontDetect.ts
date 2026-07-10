/** Cross-browser installed-font detection via canvas text measurement,
 * instead of Chromium's Local Font Access API (`window.queryLocalFonts`),
 * which Firefox and Safari don't implement at all — no browser exposes a
 * true "list every installed font" API outside Chromium, since that's a
 * meaningful fingerprinting surface. This technique works everywhere: render
 * a wide test string with the candidate font (falling back to a generic
 * family if absent) and compare its measured width against that same
 * generic family requested alone — if they differ, the candidate font must
 * have actually been used. It can only confirm/deny fonts you already know
 * to test, not enumerate arbitrary ones, so `COMMON_FONT_CANDIDATES` is a
 * curated list of common system/creative font names across Windows/macOS/
 * Linux rather than a real enumeration. */

const BASELINE_FAMILIES = ["monospace", "sans-serif", "serif"];
const TEST_STRING = "mmmmmmmmmmlli";
const TEST_SIZE = "72px";

/** True if `fontName` is actually installed and renders differently from
 * every generic fallback family. */
export function isFontAvailable(
  fontName: string,
  ctx: CanvasRenderingContext2D | null = getMeasureContext(),
): boolean {
  if (!ctx) return false;

  return BASELINE_FAMILIES.some((base) => {
    ctx.font = `${TEST_SIZE} ${base}`;
    const baselineWidth = ctx.measureText(TEST_STRING).width;
    ctx.font = `${TEST_SIZE} "${fontName}", ${base}`;
    const width = ctx.measureText(TEST_STRING).width;
    return width !== baselineWidth;
  });
}

let sharedContext: CanvasRenderingContext2D | null | undefined;

function getMeasureContext(): CanvasRenderingContext2D | null {
  if (sharedContext !== undefined) return sharedContext;
  if (typeof document === "undefined") {
    sharedContext = null;
    return sharedContext;
  }
  const canvas = document.createElement("canvas");
  sharedContext = canvas.getContext("2d");
  return sharedContext;
}

/** Common system/creative font names across Windows, macOS, and Linux —
 * the actual candidate set `detectAvailableFonts` can confirm, since there's
 * no way to enumerate arbitrary installed fonts outside the Chromium-only
 * Local Font Access API. */
export const COMMON_FONT_CANDIDATES = [
  "Arial",
  "Helvetica",
  "Helvetica Neue",
  "Verdana",
  "Tahoma",
  "Trebuchet MS",
  "Segoe UI",
  "Calibri",
  "Cambria",
  "Georgia",
  "Times New Roman",
  "Garamond",
  "Courier New",
  "Consolas",
  "Lucida Console",
  "Menlo",
  "Monaco",
  "Comic Sans MS",
  "Impact",
  "Palatino Linotype",
  "Book Antiqua",
  "Century Gothic",
  "Franklin Gothic Medium",
  "Gill Sans",
  "Lucida Sans Unicode",
  "Symbol",
  "Webdings",
  "Wingdings",
  "Avenir",
  "Avenir Next",
  "Futura",
  "Optima",
  "Baskerville",
  "Didot",
  "American Typewriter",
  "Andale Mono",
  "Copperplate",
  "Papyrus",
  "Noto Sans",
  "Noto Serif",
  "Roboto",
  "Open Sans",
  "Ubuntu",
  "Cantarell",
  "DejaVu Sans",
  "DejaVu Serif",
  "Liberation Sans",
  "Liberation Serif",
  "Droid Sans",
  "Fira Sans",
  "Inter",
  "Source Sans Pro",
  "PT Sans",
];

/** Filters `candidates` down to the ones actually installed, alphabetized. */
export function detectAvailableFonts(
  candidates: string[] = COMMON_FONT_CANDIDATES,
): string[] {
  const ctx = getMeasureContext();
  if (!ctx) return [];
  return candidates
    .filter((name) => isFontAvailable(name, ctx))
    .sort((a, b) => a.localeCompare(b));
}

import { describe, expect, it } from "vitest";
import { addIdsToHeaders } from "./contentHeadings";

describe("addIdsToHeaders", () => {
  it("injects an id derived from the heading's slugified text", () => {
    expect(addIdsToHeaders("<h2>Software Slicer</h2>")).toBe(
      '<h2 id="software-slicer">Software Slicer</h2>',
    );
  });

  it("preserves existing attributes on the heading tag", () => {
    expect(addIdsToHeaders('<h2 class="foo">Software Slicer</h2>')).toBe(
      '<h2 id="software-slicer" class="foo">Software Slicer</h2>',
    );
  });

  it("strips inline markup when computing the id but keeps the inner HTML as-is", () => {
    const input = "<h3>Cum <strong>se</strong> face</h3>";
    expect(addIdsToHeaders(input)).toBe(
      '<h3 id="cum-se-face">Cum <strong>se</strong> face</h3>',
    );
  });

  it("handles multiple headings of different levels independently", () => {
    const input = "<h1>Ghid</h1><p>text</p><h2>Detalii</h2>";
    expect(addIdsToHeaders(input)).toBe(
      '<h1 id="ghid">Ghid</h1><p>text</p><h2 id="detalii">Detalii</h2>',
    );
  });

  it("leaves non-heading content completely untouched", () => {
    const input = "<p>A paragraph</p><div>A div</div>";
    expect(addIdsToHeaders(input)).toBe(input);
  });

  it("applies Romanian diacritic-stripping slugification consistent with slugifyHeading", () => {
    expect(addIdsToHeaders("<h2>Cum se folosește slicerul</h2>")).toBe(
      '<h2 id="cum-se-foloseste-slicerul">Cum se folosește slicerul</h2>',
    );
  });

  it("ignores h5/h6 (not in the h1-h4 range)", () => {
    const input = "<h5>Too deep</h5>";
    expect(addIdsToHeaders(input)).toBe(input);
  });
});

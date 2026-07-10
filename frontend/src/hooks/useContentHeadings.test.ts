import { describe, expect, it } from "vitest";
import { extractHeadings, slugifyHeading } from "./useContentHeadings";

describe("slugifyHeading", () => {
  it("lowercases and hyphenates plain text", () => {
    expect(slugifyHeading("Software Slicer")).toBe("software-slicer");
  });

  it("strips Romanian diacritics (this is the exact function class that broke deep-linking earlier)", () => {
    expect(slugifyHeading("Cum se folosește slicerul")).toBe(
      "cum-se-foloseste-slicerul",
    );
    expect(slugifyHeading("Ștergere fișier")).toBe("stergere-fisier");
    expect(slugifyHeading("Îngrijire & Întreținere")).toBe(
      "ingrijire-intretinere",
    );
  });

  it("collapses whitespace/underscore runs into a single hyphen", () => {
    expect(slugifyHeading("Multiple   Spaces_and   more")).toBe(
      "multiple-spaces-and-more",
    );
  });

  it("removes punctuation that isn't a word character/space/hyphen", () => {
    expect(slugifyHeading("What if...?")).toBe("what-if");
    expect(slugifyHeading("Cum se face nivelarea manuală (bed leveling)")).toBe(
      "cum-se-face-nivelarea-manuala-bed-leveling",
    );
  });

  it("trims leading/trailing hyphens", () => {
    expect(slugifyHeading("---leading and trailing---")).toBe(
      "leading-and-trailing",
    );
  });

  it("returns an empty string for input that slugifies to nothing", () => {
    expect(slugifyHeading("   ")).toBe("");
    expect(slugifyHeading("???")).toBe("");
  });
});

describe("extractHeadings", () => {
  it("extracts a single heading with its level and text", () => {
    const html = "<h2>Software Slicer</h2>";
    expect(extractHeadings(html)).toEqual([
      { id: "software-slicer", text: "Software Slicer", level: 2 },
    ]);
  });

  it("extracts multiple headings of different levels, in document order", () => {
    const html = `
      <h1>Ghid</h1>
      <p>Some paragraph.</p>
      <h2>Software Slicer</h2>
      <h3>Profil imprimantă OrcaSlicer</h3>
      <h4>Detaliu</h4>
    `;
    expect(extractHeadings(html)).toEqual([
      { id: "ghid", text: "Ghid", level: 1 },
      { id: "software-slicer", text: "Software Slicer", level: 2 },
      {
        id: "profil-imprimanta-orcaslicer",
        text: "Profil imprimantă OrcaSlicer",
        level: 3,
      },
      { id: "detaliu", text: "Detaliu", level: 4 },
    ]);
  });

  it("strips inline markup from the heading text/id but still detects the heading", () => {
    const html = "<h2>Cum <strong>se</strong> folosește <em>slicerul</em></h2>";
    const result = extractHeadings(html);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: "cum-se-foloseste-slicerul",
      text: "Cum se folosește slicerul",
      level: 2,
    });
  });

  it("ignores h5/h6 and non-heading tags", () => {
    const html = "<h5>Too deep</h5><h6>Also too deep</h6><p>Not a heading</p>";
    expect(extractHeadings(html)).toEqual([]);
  });

  it("skips a heading whose text is empty after stripping markup", () => {
    const html = "<h2><br/></h2><h2>Real Heading</h2>";
    expect(extractHeadings(html)).toEqual([
      { id: "real-heading", text: "Real Heading", level: 2 },
    ]);
  });

  it("returns an empty array for content with no headings", () => {
    expect(extractHeadings("<p>Just a paragraph.</p>")).toEqual([]);
  });

  it("preserves existing attributes on the heading tag without breaking extraction", () => {
    const html = '<h2 class="foo" data-x="1">Attributed Heading</h2>';
    expect(extractHeadings(html)).toEqual([
      { id: "attributed-heading", text: "Attributed Heading", level: 2 },
    ]);
  });
});

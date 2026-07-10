import { describe, expect, it } from "vitest";
import {
  FOOTER_ICON_PRESETS,
  PRESET_ICON_PREFIX,
  footerPresetIconFor,
} from "./footerIcons";

describe("footerPresetIconFor", () => {
  it("resolves a known preset key to its component", () => {
    expect(footerPresetIconFor(`${PRESET_ICON_PREFIX}github`)).toBe(
      FOOTER_ICON_PRESETS.github,
    );
    expect(footerPresetIconFor(`${PRESET_ICON_PREFIX}mail`)).toBe(
      FOOTER_ICON_PRESETS.mail,
    );
  });

  it("returns null for a valid prefix but unknown key", () => {
    expect(footerPresetIconFor(`${PRESET_ICON_PREFIX}not-a-real-icon`)).toBeNull();
  });

  it("returns null for a value with no preset prefix at all", () => {
    expect(footerPresetIconFor("https://example.com/uploaded-icon.png")).toBeNull();
    expect(footerPresetIconFor("")).toBeNull();
  });

  it("returns null for an empty preset key (bare prefix, nothing after it)", () => {
    expect(footerPresetIconFor(PRESET_ICON_PREFIX)).toBeNull();
  });

  it("is case-sensitive on the preset key (no accidental fuzzy matching)", () => {
    expect(footerPresetIconFor(`${PRESET_ICON_PREFIX}GitHub`)).toBeNull();
  });
});

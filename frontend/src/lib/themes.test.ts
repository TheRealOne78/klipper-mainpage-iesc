import { describe, expect, it } from "vitest";
import {
  DEFAULT_DARK_THEME,
  DEFAULT_LIGHT_THEME,
  THEMES,
  getThemeDefinition,
  resolveThemeMode,
  resolveThemeSelection,
} from "./themes";

describe("THEMES", () => {
  it("has no duplicate ids", () => {
    const ids = THEMES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("includes both default themes with the expected modes", () => {
    expect(getThemeDefinition(DEFAULT_DARK_THEME)?.mode).toBe("dark");
    expect(getThemeDefinition(DEFAULT_LIGHT_THEME)?.mode).toBe("light");
  });
});

describe("resolveThemeSelection", () => {
  it("passes through a known concrete theme id unchanged", () => {
    expect(resolveThemeSelection("dracula", true)).toBe("dracula");
    expect(resolveThemeSelection("nord", false)).toBe("nord");
  });

  it("migrates legacy light/dark values to the UT theme ids", () => {
    expect(resolveThemeSelection("light", false)).toBe(DEFAULT_LIGHT_THEME);
    expect(resolveThemeSelection("dark", true)).toBe(DEFAULT_DARK_THEME);
  });

  it("resolves auto (or missing/unknown) selections from the system preference", () => {
    expect(resolveThemeSelection("auto", true)).toBe(DEFAULT_LIGHT_THEME);
    expect(resolveThemeSelection("auto", false)).toBe(DEFAULT_DARK_THEME);
    expect(resolveThemeSelection(null, true)).toBe(DEFAULT_LIGHT_THEME);
    expect(resolveThemeSelection(undefined, false)).toBe(DEFAULT_DARK_THEME);
    expect(resolveThemeSelection("not-a-real-theme", true)).toBe(DEFAULT_LIGHT_THEME);
  });
});

describe("resolveThemeMode", () => {
  it("returns the registered mode for a known theme", () => {
    expect(resolveThemeMode("ariimeow78-light")).toBe("light");
    expect(resolveThemeMode("monokai")).toBe("dark");
  });

  it("falls back to dark for an unknown id", () => {
    expect(resolveThemeMode("not-a-real-theme")).toBe("dark");
  });
});

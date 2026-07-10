import { describe, expect, it } from "vitest";
import { asText, formatTime, pick } from "./AdminAudit";

describe("asText", () => {
  it("returns the string form of primitives", () => {
    expect(asText("hello")).toBe("hello");
    expect(asText(42)).toBe("42");
    expect(asText(true)).toBe("true");
  });

  it("JSON-stringifies objects/arrays", () => {
    expect(asText({ a: 1 })).toBe('{"a":1}');
    expect(asText([1, 2])).toBe("[1,2]");
  });

  it("returns \"-\" for null, undefined, or an empty string", () => {
    expect(asText(null)).toBe("-");
    expect(asText(undefined)).toBe("-");
    expect(asText("")).toBe("-");
  });

  it("does not treat 0 or false as empty", () => {
    expect(asText(0)).toBe("0");
    expect(asText(false)).toBe("false");
  });
});

describe("pick", () => {
  it("returns the value of the first key present with a non-empty value", () => {
    const details = { filename: "a.gcode", email: "fallback@example.com" };
    expect(pick(details, ["filename", "email"])).toBe("a.gcode");
  });

  it("skips keys that are undefined, null, or an empty string", () => {
    const details = { filename: "", email: undefined, macro: "LOAD_FILAMENT" };
    expect(pick(details, ["filename", "email", "macro"])).toBe("LOAD_FILAMENT");
  });

  it("returns undefined when none of the keys are present", () => {
    const details = { filename: "a.gcode" };
    expect(pick(details, ["email", "macro"])).toBeUndefined();
  });

  it("keeps falsy-but-meaningful values like 0/false rather than skipping them", () => {
    const details = { bytes: 0 };
    expect(pick(details, ["bytes"])).toBe(0);
  });
});

describe("formatTime", () => {
  it("returns \"-\" for a non-string or blank value", () => {
    expect(formatTime(undefined)).toBe("-");
    expect(formatTime(null)).toBe("-");
    expect(formatTime(12345)).toBe("-");
    expect(formatTime("   ")).toBe("-");
  });

  it("formats a valid ISO date string via toLocaleString", () => {
    const iso = "2024-01-15T10:30:00.000Z";
    const result = formatTime(iso);
    expect(result).not.toBe(iso);
    expect(result).toContain("2024");
  });

  it("returns the original string unchanged when it doesn't parse as a date", () => {
    expect(formatTime("not-a-date")).toBe("not-a-date");
  });
});

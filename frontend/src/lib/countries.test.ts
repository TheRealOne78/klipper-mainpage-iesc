import { describe, expect, it } from "vitest";
import { COUNTRIES, countryName, flagEmoji } from "./countries";

describe("flagEmoji", () => {
  it("converts a country code to its regional-indicator flag emoji", () => {
    expect(flagEmoji("RO")).toBe("🇷🇴");
    expect(flagEmoji("US")).toBe("🇺🇸");
  });

  it("is case-insensitive", () => {
    expect(flagEmoji("ro")).toBe(flagEmoji("RO"));
  });

  it("falls back to the raw input for anything that isn't two letters", () => {
    expect(flagEmoji("ROU")).toBe("ROU");
    expect(flagEmoji("1")).toBe("1");
    expect(flagEmoji("")).toBe("");
  });
});

describe("countryName", () => {
  it("resolves a known code to its name", () => {
    expect(countryName("RO")).toBe("Romania");
  });

  it("is case-insensitive", () => {
    expect(countryName("ro")).toBe("Romania");
  });

  it("falls back to the raw code for an unknown one", () => {
    expect(countryName("ZZ")).toBe("ZZ");
  });
});

describe("COUNTRIES", () => {
  it("has no duplicate codes", () => {
    const codes = COUNTRIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("every code is exactly two uppercase letters", () => {
    for (const country of COUNTRIES) {
      expect(country.code).toMatch(/^[A-Z]{2}$/);
    }
  });
});

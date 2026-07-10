import { describe, expect, it } from "vitest";
import { COUNTRIES } from "./countries";
import { citiesForCountry } from "./cities";

// Countries GeoNames' cities500 dataset (population >= 500) has no entries
// for — all genuinely uninhabited (Antarctica, Bouvet Island, Heard &
// McDonald Islands, US Minor Outlying Islands).
const KNOWN_EMPTY = new Set(["AQ", "BV", "HM", "UM"]);

describe("citiesForCountry", () => {
  it("returns the configured city list for a known country", async () => {
    const cities = await citiesForCountry("RO");
    expect(cities).toContain("Bucharest");
    expect(cities).toContain("Brașov");
  });

  it("is case-insensitive", async () => {
    expect(await citiesForCountry("ro")).toEqual(await citiesForCountry("RO"));
  });

  it("returns an empty array for a country with no dataset file", async () => {
    expect(await citiesForCountry("ZZ")).toEqual([]);
  });

  it("caches the result of repeated lookups", async () => {
    const first = await citiesForCountry("DE");
    const second = await citiesForCountry("DE");
    expect(second).toBe(first);
  });

  it("uses the comma-below diacritics for Romanian city names, not the legacy cedilla forms", async () => {
    const cities = await citiesForCountry("RO");
    expect(cities.some((c) => c.includes("ş") || c.includes("ţ"))).toBe(false);
    expect(cities).toContain("Iași");
    expect(cities).toContain("Constanța");
  });
});

describe("cities-data coverage", () => {
  it("has at least one city for every country in the picker's list, except known-uninhabited ones", async () => {
    const missing: string[] = [];
    for (const country of COUNTRIES) {
      if (KNOWN_EMPTY.has(country.code)) continue;
      const cities = await citiesForCountry(country.code);
      if (cities.length === 0) missing.push(country.code);
    }
    expect(missing).toEqual([]);
  });

  it("has no empty city name entries", async () => {
    for (const country of COUNTRIES) {
      const cities = await citiesForCountry(country.code);
      for (const city of cities) {
        expect(city.trim().length).toBeGreaterThan(0);
      }
    }
  });
});

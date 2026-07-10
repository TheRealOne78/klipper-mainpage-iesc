/** Cities-per-country lookup for the geo-restriction region picker's city
 * step (`features/admin/GeoRegionPicker.tsx`), backed by GeoNames' `cities500`
 * dataset (all populated places with population >= 500 — as close to "every
 * city on Earth" as a practically shippable dataset gets; the only more
 * complete GeoNames tier is the full ~4M-row world dump, which isn't
 * reasonable to ship or hold in memory client-side). Data is public domain /
 * CC BY 4.0 from geonames.org.
 *
 * Each country's list lives in its own `cities-data/<ISO-CODE>.json` file
 * (~250 files, ~3.4MB total) and is code-split by Vite via `import.meta.glob`
 * — picking a country only downloads that one country's cities, not the
 * whole dataset. A handful of ISO codes (Antarctica, Bouvet Island, Heard &
 * McDonald Islands, US Minor Outlying Islands) have no populated places at
 * this threshold and simply resolve to an empty list. */

const cityModules = import.meta.glob<{ default: string[] }>("./cities-data/*.json");

const cache = new Map<string, string[]>();
const inFlight = new Map<string, Promise<string[]>>();

/** Loads (and caches) the city list for `countryCode`. Resolves to `[]` for
 * a code with no matching dataset file rather than rejecting, since "no
 * cities known" is a normal, expected outcome the picker already renders a
 * hint for. */
export const citiesForCountry = (countryCode: string): Promise<string[]> => {
  const code = countryCode.toUpperCase();

  const cached = cache.get(code);
  if (cached) return Promise.resolve(cached);

  const pending = inFlight.get(code);
  if (pending) return pending;

  const loader = cityModules[`./cities-data/${code}.json`];
  const promise = (loader ? loader() : Promise.resolve({ default: [] }))
    .then((mod) => {
      cache.set(code, mod.default);
      inFlight.delete(code);
      return mod.default;
    })
    .catch(() => {
      inFlight.delete(code);
      return [];
    });

  inFlight.set(code, promise);
  return promise;
};

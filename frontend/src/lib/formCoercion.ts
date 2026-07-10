/** Generic `unknown`-coercion helpers for binding loosely-typed JSON (e.g. a
 * config draft edited as a bag of `Record<string, unknown>` sections) to form
 * fields. Not specific to any one page — kept here so they're reusable and
 * independently testable instead of living inside a single page component. */

export const readRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export const asText = (value: unknown): string =>
  value === null || value === undefined ? "" : String(value);

/** Accepts either an array (stringified/filtered) or a comma/newline
 * separated string (split/trimmed/filtered) and normalizes both to a clean
 * string array. */
export const asStringList = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/[,\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
};

export const asNumber = (value: unknown): number =>
  typeof value === "number" ? value : Number(value) || 0;

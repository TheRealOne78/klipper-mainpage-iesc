/** Translates a raw Moonraker print-history status (e.g. "klippy_shutdown")
 * into the matching `hist*` locale key (e.g. "histKlippy_shutdown"), falling
 * back to the raw status if no translation exists. Shared by HistoryPage and
 * the Dashboard status card's history tab so both render the same text. */
export const statusLabel = (t: Record<string, unknown>, status?: string): string => {
  const s = status ?? "unknown";
  const key = `hist${s.charAt(0).toUpperCase()}${s.slice(1)}`;
  const val = t[key];
  return typeof val === "string" ? val : s;
};

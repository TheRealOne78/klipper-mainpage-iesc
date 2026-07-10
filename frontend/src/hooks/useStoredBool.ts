import { useState, type Dispatch, type SetStateAction } from "react";

/** `useState<boolean>` seeded from `localStorage[key]` on first render —
 * collapses the ~25 near-identical `useState(() => localStorage.getItem(key)
 * === "true")` initializers scattered across the dashboard's per-card
 * collapsed/visible toggles. Does NOT persist writes itself (callers already
 * have their own toggle helpers that write back to localStorage alongside
 * other state, e.g. `renderCollapseButton`) — it only dedupes the read. */
export function useStoredBool(
  key: string,
  defaultValue: boolean,
): [boolean, Dispatch<SetStateAction<boolean>>] {
  return useState<boolean>(() => {
    const stored = localStorage.getItem(key);
    if (stored === null) return defaultValue;
    return defaultValue ? stored !== "false" : stored === "true";
  });
}

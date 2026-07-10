import { useCallback, useEffect, useState } from "react";

const API_BASE = "/api";

export interface PendingUpload {
  id: string;
  filename: string;
  uploaded_at: string;
  uploaded_by: string | null;
}

/** Polls the OctoPrint-compat upload queue (`GET /api/pending-uploads`) so
 * the UI can prompt whoever's looking at the page to confirm or discard a
 * file a slicer just uploaded — see `handlers/octoprint_compat.rs`'s doc
 * comment for why a slicer upload never starts a print on its own. Kept
 * intentionally unauthenticated-tolerant: the list endpoint is reachable
 * even before login (gated on `view_status`, not a stricter permission),
 * since the whole point is surfacing a pending file *before* someone has
 * logged in, not after. */
export function usePendingUploads(pollIntervalMs = 6000) {
  const [items, setItems] = useState<PendingUpload[]>([]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/pending-uploads`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) return;
      setItems((await res.json()) as PendingUpload[]);
    } catch {
      // Network hiccup — keep showing the last known list rather than
      // flashing it empty.
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => void refresh(), pollIntervalMs);
    return () => clearInterval(interval);
  }, [refresh, pollIntervalMs]);

  const cancel = useCallback(
    async (id: string) => {
      await fetch(`${API_BASE}/pending-uploads/${id}/cancel`, { method: "POST" });
      await refresh();
    },
    [refresh],
  );

  return { pendingUploads: items, refreshPendingUploads: refresh, cancelPendingUpload: cancel };
}

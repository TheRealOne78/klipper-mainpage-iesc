import { useState } from "react";
import type { Translations } from "../translations";
import { getGcodeBasename } from "../lib/gcodeThumbnails";

/**
 * Shared "print again?" confirmation flow (Mainsail-style reprint). Extracted
 * from Dashboard.tsx so every reprint-capable page (Files, History,
 * Dashboard) shows the identical modal instead of re-implementing it.
 */
export function useReprintConfirm(
  t: Translations,
  onStartPrint: (filename: string) => Promise<unknown> | void,
) {
  const [target, setTarget] = useState<string | null>(null);

  const requestReprint = (filename: string) => setTarget(filename);

  const modal = target !== null && (
    <div
      className="modal-overlay"
      onClick={() => setTarget(null)}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2000,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        className="dashboard-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 380,
          width: "90%",
          padding: "1.25rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
        }}
      >
        <h4 style={{ fontWeight: "bold" }}>{t.reprintTitle}</h4>
        <p style={{ fontSize: "0.9rem", opacity: 0.85, margin: 0 }}>
          {t.reprintConfirm}
        </p>
        <p
          style={{
            fontSize: "0.85rem",
            fontWeight: 600,
            wordBreak: "break-all",
            margin: 0,
          }}
        >
          {getGcodeBasename(target)}
        </p>
        <div
          style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}
        >
          <button className="btn" onClick={() => setTarget(null)}>
            {t.btnCancel}
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              const f = target;
              setTarget(null);
              void onStartPrint(f);
            }}
          >
            {t.reprintYes}
          </button>
        </div>
      </div>
    </div>
  );

  return { requestReprint, reprintModal: modal };
}

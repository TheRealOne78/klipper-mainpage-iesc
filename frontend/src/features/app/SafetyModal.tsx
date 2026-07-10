import React from "react";
import type { Dispatch, SetStateAction } from "react";
import { AlertTriangle, X } from "lucide-react";
import mainImage from "../../assets/main.webp";
import type { Translations } from "../../translations";

interface SafetyModalProps {
  t: Translations;
  setSafetyModalOpen: Dispatch<SetStateAction<boolean>>;
  setIsUploadSafety: Dispatch<SetStateAction<boolean>>;
  setUploadedFileName: Dispatch<SetStateAction<string | null>>;
  handleSidebarLinkClick: (pageName: string, elementId?: string) => void;
  isUploadSafety: boolean;
  countdown: number;
  uploadedFileName: string | null;
  startPrint: (filename: string) => Promise<any>;
  pushToast: (type: "error" | "success", message: string) => void;
}

/** The big red pre-print safety warning — shown either standalone (from the
 * sidebar "Rules" nav) or as an upload confirmation gate (with Cancel/Confirm
 * buttons) when `isUploadSafety` is set. */
export const SafetyModal: React.FC<SafetyModalProps> = ({
  t,
  setSafetyModalOpen,
  setIsUploadSafety,
  setUploadedFileName,
  handleSidebarLinkClick,
  isUploadSafety,
  countdown,
  uploadedFileName,
  startPrint,
  pushToast,
}) => (
  <div className="modal-overlay" style={{ zIndex: 110 }}>
    <div
      className="modal-content"
      style={{
        width: "90%",
        maxWidth: "800px",
        maxHeight: "95vh",
        overflowY: "auto",
        position: "relative",
        padding: "2rem",
      }}
    >
      {/* X button — outside the warning div */}
      <button
        onClick={() => {
          setSafetyModalOpen(false);
          setIsUploadSafety(false);
          setUploadedFileName(null);
        }}
        style={{
          position: "absolute",
          top: "12px",
          right: "12px",
          background: "transparent",
          border: "none",
          color: "var(--text-secondary)",
          cursor: "pointer",
          padding: "4px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 2,
        }}
        title={t.appClose}
      >
        <X size={24} />
      </button>

      <div
        className="big-red-warning"
        style={{
          marginBottom: "1.5rem",
          padding: "2rem",
          display: "flex",
          alignItems: "center",
          gap: "16px",
        }}
      >
        <AlertTriangle
          size={36}
          className="warning-icon"
          style={{ flexShrink: 0 }}
        />
        <span
          style={{
            fontSize: "1.35rem",
            fontWeight: "800",
            lineHeight: "1.4",
          }}
        >
          {t.bigRedWarning}
        </span>
      </div>

      <div
        className="hero-image-container"
        style={{
          marginBottom: "1.5rem",
          boxShadow: "none",
          border: "none",
        }}
      >
        <img
          src={mainImage}
          className="hero-img-full"
          alt={t.warningIllustrationAlt}
        />
      </div>

      {/* Navigation buttons: Go to Rules, Go to Instructions */}
      <div
        style={{ display: "flex", gap: "12px", marginBottom: "1.5rem" }}
      >
        <button
          className="btn"
          style={{
            flex: 1,
            padding: "12px",
            fontWeight: "600",
            fontSize: "1rem",
          }}
          onClick={() => {
            handleSidebarLinkClick("rules");
            setSafetyModalOpen(false);
            setIsUploadSafety(false);
            setUploadedFileName(null);
          }}
        >
          {t.appViewRules}
        </button>
        <button
          className="btn"
          style={{
            flex: 1,
            padding: "12px",
            fontWeight: "600",
            fontSize: "1rem",
          }}
          onClick={() => {
            handleSidebarLinkClick(
              "troubleshooting",
              "proceduri-standard",
            );
            setSafetyModalOpen(false);
            setIsUploadSafety(false);
            setUploadedFileName(null);
          }}
        >
          {t.appViewInstructions}
        </button>
      </div>

      {/* Bottom action buttons — only shown for upload flow */}
      {isUploadSafety && (
        <div style={{ display: "flex", gap: "12px" }}>
          <button
            className="btn"
            style={{
              flex: 1,
              padding: "14px",
              fontWeight: "bold",
              fontSize: "1.05rem",
            }}
            onClick={() => {
              setSafetyModalOpen(false);
              setIsUploadSafety(false);
              setUploadedFileName(null);
            }}
          >
            {t.appCancel}
          </button>
          <button
            className="btn btn-primary"
            disabled={countdown > 0}
            onClick={async () => {
              if (uploadedFileName) {
                try {
                  await startPrint(uploadedFileName);
                  pushToast("success", t.printStarted);
                } catch {
                  pushToast("error", t.printStartFailed);
                }
              }
              setSafetyModalOpen(false);
              setIsUploadSafety(false);
              setUploadedFileName(null);
            }}
            style={{
              flex: 1,
              padding: "14px",
              fontWeight: "bold",
              fontSize: "1.05rem",
              backgroundColor:
                countdown > 0
                  ? "var(--border-color)"
                  : "var(--accent-color)",
              cursor: countdown > 0 ? "not-allowed" : "pointer",
            }}
          >
            {`${t.appConfirmPrint}${countdown > 0 ? ` (${countdown}s)` : ""}`}
          </button>
        </div>
      )}
    </div>
  </div>
);

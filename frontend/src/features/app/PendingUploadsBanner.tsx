import React from "react";
import { UploadCloud, X } from "lucide-react";
import type { PendingUpload } from "../../hooks/usePendingUploads";
import type { Translations } from "../../translations";
import { GcodeThumbnail } from "../../components/GcodeThumbnail";
import { getGcodeBasename } from "../../lib/gcodeThumbnails";

interface PendingUploadsBannerProps {
  t: Translations;
  items: PendingUpload[];
  /** Whether the current viewer (anonymous or logged in) already has
   * `control_print` — if so, "Start print" is offered directly instead of
   * a login prompt. */
  canControlPrint: boolean;
  isLoggedIn: boolean;
  onRequestPrint: (item: PendingUpload) => void;
  onCancel: (id: string) => void;
  onLoginClick: () => void;
  onDismiss: () => void;
}

/** Centered, dimmed-backdrop modal (same visual language as `SafetyModal`/
 * `AuthModal`) listing files a slicer uploaded that are awaiting
 * confirmation — see `usePendingUploads`'s doc comment. Dismissable (the
 * backdrop click / X just hides it for this session; the file stays queued
 * server-side either way) rather than a hard gate like `SafetyModal`, since
 * unlike reading the safety rules, noticing a slicer upload isn't
 * mandatory. */
export const PendingUploadsBanner: React.FC<PendingUploadsBannerProps> = ({
  t,
  items,
  canControlPrint,
  isLoggedIn,
  onRequestPrint,
  onCancel,
  onLoginClick,
  onDismiss,
}) => {
  if (items.length === 0) return null;

  return (
    <div className="modal-overlay pending-uploads-overlay" onClick={onDismiss}>
      <div
        className="modal-content pending-uploads-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="icon-button pending-uploads-modal-close"
          title={t.pendingUploadDismiss}
          onClick={onDismiss}
        >
          <X size={18} />
        </button>
        <h3 className="pending-uploads-modal-title">
          <UploadCloud size={22} />
          {items.length > 1 ? t.pendingUploadTitlePlural : t.pendingUploadTitle}
        </h3>
        <div className="pending-uploads-modal-list">
          {items.map((item) => (
            <div className="pending-uploads-modal-item" key={item.id}>
              <GcodeThumbnail
                smallUrl={`/api/pending-uploads/${item.id}/thumbnail`}
                bigUrl={`/api/pending-uploads/${item.id}/thumbnail`}
                size={44}
                title={getGcodeBasename(item.filename)}
              />
              <div className="pending-uploads-modal-item-body">
                <span className="pending-uploads-modal-filename">{item.filename}</span>
                <span className="pending-uploads-modal-meta">
                  {item.uploaded_by
                    ? t.pendingUploadFrom.replace("{who}", item.uploaded_by)
                    : t.pendingUploadFromUnknown}
                </span>
              </div>
              <div className="pending-uploads-modal-item-actions">
                {canControlPrint ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => onRequestPrint(item)}
                  >
                    {t.pendingUploadStartPrint}
                  </button>
                ) : !isLoggedIn ? (
                  <button type="button" className="btn btn-primary" onClick={onLoginClick}>
                    {t.pendingUploadLoginToPrint}
                  </button>
                ) : (
                  <span className="pending-uploads-modal-no-permission">
                    {t.pendingUploadNoPermission}
                  </span>
                )}
                <button
                  type="button"
                  className="btn"
                  title={t.pendingUploadCancel}
                  onClick={() => onCancel(item.id)}
                >
                  {t.pendingUploadCancel}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

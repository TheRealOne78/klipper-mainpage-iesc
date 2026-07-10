import React, { useEffect } from "react";
import { AlertTriangle, CheckCircle, X } from "lucide-react";

export interface ToastItem {
  id: string;
  type: "success" | "error";
  message: string;
}

interface ToastItemViewProps {
  toast: ToastItem;
  durationMs: number;
  onDismiss: (id: string) => void;
  closeLabel: string;
}

// Owns its own dismiss timer, started once on mount — keeping it isolated
// from the parent's toast array means adding/removing a sibling toast can't
// reset this one's countdown.
const ToastItemView: React.FC<ToastItemViewProps> = ({
  toast,
  durationMs,
  onDismiss,
  closeLabel,
}) => {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), durationMs);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`toast-item ${toast.type}`}>
      {toast.type === "error" ? (
        <AlertTriangle size={16} />
      ) : (
        <CheckCircle size={16} />
      )}
      <span className="toast-item-message">{toast.message}</span>
      <button
        type="button"
        className="toast-item-close"
        onClick={() => onDismiss(toast.id)}
        aria-label={closeLabel}
      >
        <X size={14} />
      </button>
      <div className="toast-progress-track">
        <div
          className="toast-progress-bar"
          style={{ animationDuration: `${durationMs}ms` }}
        />
      </div>
    </div>
  );
};

interface ToastStackProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
  closeLabel: string;
  durationMs?: number;
}

/** Fixed top-right stack of closable, auto-dismissing toasts. */
export const ToastStack: React.FC<ToastStackProps> = ({
  toasts,
  onDismiss,
  closeLabel,
  durationMs = 10000,
}) => {
  if (toasts.length === 0) return null;
  return (
    <div className="toast-stack">
      {toasts.map((toast) => (
        <ToastItemView
          key={toast.id}
          toast={toast}
          durationMs={durationMs}
          onDismiss={onDismiss}
          closeLabel={closeLabel}
        />
      ))}
    </div>
  );
};

let toastCounter = 0;
/** Monotonic-ish id generator — no crypto.randomUUID dependency needed. */
export const nextToastId = (): string => `toast-${Date.now()}-${toastCounter++}`;

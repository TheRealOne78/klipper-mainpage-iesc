import React, { createContext, useCallback, useContext, useState } from "react";
import { ToastStack, nextToastId, type ToastItem } from "../components/Toast";
import { localizeErrorMessage } from "../lib/errorTranslations";
import { translations, type Lang } from "../translations";

interface ToastContextValue {
  /** Shows a closeable, auto-dismissing (10s) toast in the top-right corner.
   * For "error" toasts, `message` is run through localizeErrorMessage() —
   * most error text originates as a single hardcoded language (raw backend
   * response text, or this app's own English fetch-failure fallbacks), so
   * this is the one place that translates it to the current UI language
   * before display. */
  pushToast: (type: ToastItem["type"], message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

// ToastProvider wraps the whole app (main.tsx), outside of App's own `lang`
// state, so it can't receive it as a prop — read it straight from
// localStorage instead (App.tsx is the sole writer, via the language
// switcher and on initial-load restore), defaulting to the same "ro" App
// itself defaults to before any language has been chosen.
const currentLang = (): Lang => {
  const stored = typeof window === "undefined" ? null : localStorage.getItem("lang");
  return stored === "en" || stored === "ro" || stored === "pl" ? stored : "ro";
};

/** Wraps the whole app once (see main.tsx) so any component can call
 * useToast() to surface an error/success message, instead of every page
 * owning its own inline error banner state + JSX. */
export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const pushToast = useCallback((type: ToastItem["type"], message: string) => {
    const text =
      type === "error" ? localizeErrorMessage(message, currentLang()) : message;
    setToasts((current) => [...current, { id: nextToastId(), type, message: text }]);
  }, []);

  return (
    <ToastContext.Provider value={{ pushToast }}>
      {children}
      <ToastStack
        toasts={toasts}
        onDismiss={dismissToast}
        closeLabel={translations[currentLang()].closeToastLabel}
      />
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastContextValue => {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
};

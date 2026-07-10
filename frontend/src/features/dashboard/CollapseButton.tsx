import React from "react";
import { ChevronDown } from "lucide-react";
import type { Translations } from "../../translations";

/** Toggles `setter` and persists the new value to `localStorage[storageKey]`
 * — the write-side counterpart to `useStoredBool`, which only handles the
 * read-on-mount side. */
export const setStoredBool = (
  key: string,
  setter: React.Dispatch<React.SetStateAction<boolean>>,
) => {
  setter((prev) => {
    const next = !prev;
    localStorage.setItem(key, String(next));
    return next;
  });
};

interface CollapseButtonProps {
  collapsed: boolean;
  storageKey: string;
  setter: React.Dispatch<React.SetStateAction<boolean>>;
  t: Translations;
}

/** The chevron button every dashboard card uses to collapse/expand itself,
 * persisting the choice to localStorage under `storageKey`. */
export const CollapseButton: React.FC<CollapseButtonProps> = ({
  collapsed,
  storageKey,
  setter,
  t,
}) => (
  <button
    className={`icon-button ${collapsed ? "collapsed" : ""}`}
    title={collapsed ? t.expand : t.collapse}
    onClick={() => setStoredBool(storageKey, setter)}
  >
    <ChevronDown size={18} />
  </button>
);

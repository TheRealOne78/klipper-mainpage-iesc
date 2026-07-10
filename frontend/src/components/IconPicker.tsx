import React, { useEffect, useRef, useState } from "react";
import { Globe, Search } from "lucide-react";
import { FOOTER_ICON_PRESETS } from "../lib/footerIcons";

interface IconPickerProps {
  /** Preset key (e.g. "repository"), or "" if none/a custom image is set. */
  value: string;
  onSelect: (name: string) => void;
  searchPlaceholder: string;
  triggerTitle: string;
}

/** A compact trigger button that opens a searchable icon grid dropdown —
 * same interaction shape as an emoji picker, scoped to the bundled
 * lucide-react icon set used for footer links. */
export const IconPicker: React.FC<IconPickerProps> = ({
  value,
  onSelect,
  searchPlaceholder,
  triggerTitle,
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const TriggerIcon = FOOTER_ICON_PRESETS[value] ?? Globe;
  const query = search.trim().toLowerCase();
  const entries = Object.entries(FOOTER_ICON_PRESETS).filter(([name]) =>
    query ? name.includes(query) : true,
  );

  return (
    <div className="icon-picker" ref={rootRef}>
      <button
        type="button"
        className={`icon-picker-trigger${value ? " active" : ""}`}
        title={triggerTitle}
        onClick={() => setOpen((o) => !o)}
      >
        <TriggerIcon size={16} />
      </button>
      {open && (
        <div className="icon-picker-popup">
          <div className="icon-picker-search">
            <Search size={13} />
            <input
              type="text"
              autoFocus
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
            />
          </div>
          <div className="icon-picker-grid">
            {entries.map(([name, Icon]) => (
              <button
                type="button"
                key={name}
                title={name}
                className={`icon-picker-cell${name === value ? " active" : ""}`}
                onClick={() => {
                  onSelect(name);
                  setOpen(false);
                  setSearch("");
                }}
              >
                <Icon size={16} />
              </button>
            ))}
            {entries.length === 0 && (
              <div className="icon-picker-empty">{"—"}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

export interface SelectOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
  /** Inline style applied to both the option row and (when selected) the
   * trigger's value — e.g. `{ fontFamily: "..." }` so a font picker can
   * render each candidate in its own font instead of just naming it. */
  style?: React.CSSProperties;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Extra always-visible row pinned to the end of the list (e.g. an
   * "Upload font..." action) — same shape as a normal option but calls
   * `onClick` instead of `onChange`. */
  extraAction?: {
    label: string;
    icon?: React.ReactNode;
    onClick: () => void;
  };
  /** Adds a filter-as-you-type text box at the top of the open menu.
   * Needed for option lists that can run into the thousands (e.g. a
   * populous country's city list) — rendering all of them unfiltered would
   * mean tens of thousands of DOM nodes at once. */
  searchable?: boolean;
  searchPlaceholder?: string;
  /** Rendered below a truncated list, with `{n}` replaced by the count of
   * results not shown. Required when `searchable` is set (only shown once
   * a list actually needs truncating). */
  truncatedHint?: string;
}

/** Themed dropdown replacing native `<select>`, whose OS-rendered popup
 * can't be styled to match the app's dark theme. Same open/close/
 * click-outside/Escape shape as `IconPicker`, so it behaves the same as the
 * other custom pickers already in this app. */
export const Select: React.FC<SelectProps> = ({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  className,
  extraAction,
  searchable,
  searchPlaceholder,
  truncatedHint,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
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

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const selected = options.find((option) => option.value === value);
  const matchedOptions =
    searchable && query.trim()
      ? options.filter((option) =>
          option.label.toLowerCase().includes(query.trim().toLowerCase()),
        )
      : options;
  // Rendering every option as a DOM node breaks down for lists in the
  // thousands (e.g. a populous country's city list) — cap what's actually
  // rendered and nudge the user to narrow the search instead.
  const RENDER_CAP = 200;
  const visibleOptions = searchable
    ? matchedOptions.slice(0, RENDER_CAP)
    : matchedOptions;
  const truncatedCount = matchedOptions.length - visibleOptions.length;

  return (
    <div
      className={`custom-select${className ? ` ${className}` : ""}${
        disabled ? " disabled" : ""
      }`}
      ref={rootRef}
    >
      <button
        type="button"
        className="custom-select-trigger"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="custom-select-value">
          {selected ? (
            <>
              {selected.icon}
              <span style={selected.style}>{selected.label}</span>
            </>
          ) : (
            <span className="custom-select-placeholder">{placeholder ?? ""}</span>
          )}
        </span>
        <ChevronDown
          size={14}
          className={`custom-select-chevron${open ? " open" : ""}`}
        />
      </button>
      {open && (
        <div className="custom-select-menu">
          {searchable && (
            <input
              type="text"
              className="custom-select-search"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
              placeholder={searchPlaceholder ?? ""}
              onClick={(e) => e.stopPropagation()}
            />
          )}
          {visibleOptions.map((option) => (
            <button
              type="button"
              key={option.value}
              className={`custom-select-option${
                option.value === value ? " active" : ""
              }`}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              {option.icon}
              <span style={option.style}>{option.label}</span>
            </button>
          ))}
          {truncatedCount > 0 && truncatedHint && (
            <p className="custom-select-truncated-hint">
              {truncatedHint.replace("{n}", String(truncatedCount))}
            </p>
          )}
          {extraAction && (
            <button
              type="button"
              className="custom-select-option custom-select-extra"
              onClick={() => {
                extraAction.onClick();
                setOpen(false);
              }}
            >
              {extraAction.icon}
              <span>{extraAction.label}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};

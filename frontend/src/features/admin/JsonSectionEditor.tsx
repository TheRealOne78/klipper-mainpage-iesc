import React from "react";

interface JsonSectionEditorProps {
  title: string;
  applyLabel: string;
  value: string;
  onChange: (value: string) => void;
  onApply: () => void;
}

/** A raw-JSON textarea + "Apply" button for editing one config section
 * directly, used as a power-user escape hatch alongside every section's
 * structured fields. */
export const JsonSectionEditor: React.FC<JsonSectionEditorProps> = ({
  title,
  applyLabel,
  value,
  onChange,
  onApply,
}) => (
  <label className="admin-field full">
    {title}
    <textarea
      className="admin-json-editor"
      rows={10}
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
    <button type="button" className="btn btn-compact" onClick={onApply}>
      {applyLabel}
    </button>
  </label>
);

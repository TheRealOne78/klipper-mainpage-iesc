import React from "react";
import { Upload } from "lucide-react";

interface UploadIconButtonProps {
  accept: string;
  busy: boolean;
  title: string;
  onFile: (file: File | null) => void;
}

/** A small icon-only button (instead of a native "Browse..." file input) that
 * opens the file picker on click. Used for every branding/footer-icon upload
 * so the surrounding row stays a single compact line. */
export const UploadIconButton: React.FC<UploadIconButtonProps> = ({
  accept,
  busy,
  title,
  onFile,
}) => (
  <label
    className={`admin-upload-icon-btn${busy ? " busy" : ""}`}
    title={title}
  >
    <Upload size={14} />
    <input
      type="file"
      accept={accept}
      disabled={busy}
      onChange={(event) => onFile(event.currentTarget.files?.[0] ?? null)}
    />
  </label>
);

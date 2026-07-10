import React from "react";
import { asNumber, asText, readRecord } from "../../lib/formCoercion";
import type { AdminConfig } from "../../printerTypes";
import type { Translations } from "../../translations";

interface SystemSectionProps {
  t: Translations;
  draft: AdminConfig | null;
  setRecordField: (
    section: keyof AdminConfig,
    field: string,
    value: unknown,
  ) => void;
}

export const SystemSection: React.FC<SystemSectionProps> = ({
  t,
  draft,
  setRecordField,
}) => (
  <div className="admin-form-grid">
    <label className="admin-check-row">
      <input
        type="checkbox"
        checked={Boolean(readRecord(draft?.audit).enabled)}
        onChange={(event) =>
          setRecordField(
            "audit",
            "enabled",
            event.currentTarget.checked,
          )
        }
      />
      <span>{t.admAuditLoggingEnabled}</span>
    </label>
    <label className="admin-field">
      {t.admAuditDatabasePath}
      <input
        value={asText(readRecord(draft?.audit).database_path)}
        onChange={(event) =>
          setRecordField(
            "audit",
            "database_path",
            event.currentTarget.value,
          )
        }
      />
    </label>
    <label className="admin-field">
      {t.admSessionTtlMinutes}
      <input
        type="number"
        min={1}
        value={asNumber(readRecord(draft?.auth).session_ttl_minutes)}
        onChange={(event) =>
          setRecordField(
            "auth",
            "session_ttl_minutes",
            Number(event.currentTarget.value),
          )
        }
      />
    </label>
  </div>
);

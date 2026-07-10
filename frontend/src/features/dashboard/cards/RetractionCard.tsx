import React from "react";
import type { Dispatch, SetStateAction } from "react";
import { ArrowUp } from "lucide-react";
import { CollapseButton } from "../CollapseButton";
import type { Translations } from "../../../translations";

interface RetractionCardProps {
  t: Translations;
  retractionCollapsed: boolean;
  setRetractionCollapsed: Dispatch<SetStateAction<boolean>>;
  retractionRows: { key: string; label: string; def: number }[];
  retractField: (key: string, fallback: number) => string;
  setRetractFields: Dispatch<SetStateAction<Record<string, string>>>;
  retractBusy: boolean;
  isOfflineOrNotReady: boolean;
  applyRetraction: () => Promise<void>;
}

export const RetractionCard: React.FC<RetractionCardProps> = ({
  t,
  retractionCollapsed,
  setRetractionCollapsed,
  retractionRows,
  retractField,
  setRetractFields,
  retractBusy,
  isOfflineOrNotReady,
  applyRetraction,
}) => (
  <div className="dashboard-card retraction-card">
    <div className="card-title">
      <ArrowUp size={20} />
      <span>{t.retraction}</span>
      <div className="panel-header-actions" style={{ marginLeft: "auto" }}>
        <CollapseButton
          collapsed={retractionCollapsed}
          storageKey="retractionCollapsed"
          setter={setRetractionCollapsed}
          t={t}
        />
      </div>
    </div>

    {!retractionCollapsed && (
      <div className="extruder-body">
        <div className="retraction-grid">
          {retractionRows.map((row) => (
            <label className="extruder-field" key={row.key}>
              {row.label}
              <input
                type="number"
                min={0}
                step={0.1}
                value={retractField(row.key, row.def)}
                onChange={(e) =>
                  setRetractFields((f) => ({
                    ...f,
                    [row.key]: e.currentTarget.value,
                  }))
                }
              />
            </label>
          ))}
        </div>
        <button
          type="button"
          className="btn btn-primary"
          disabled={retractBusy || isOfflineOrNotReady}
          onClick={() => void applyRetraction()}
        >
          {retractBusy ? t.updatesUpdating : t.configSave}
        </button>
      </div>
    )}
  </div>
);

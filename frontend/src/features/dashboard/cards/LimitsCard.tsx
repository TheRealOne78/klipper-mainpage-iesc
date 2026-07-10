import React from "react";
import type { Dispatch, SetStateAction } from "react";
import { Sliders } from "lucide-react";
import { CollapseButton } from "../CollapseButton";
import type { Translations } from "../../../translations";

interface LimitsCardProps {
  t: Translations;
  limitsCollapsed: boolean;
  setLimitsCollapsed: Dispatch<SetStateAction<boolean>>;
  limitsRows: { key: string; label: string; def: number; step: number }[];
  limitField: (key: string, fallback: number) => string;
  setLimitsFields: Dispatch<SetStateAction<Record<string, string>>>;
  limitsBusy: boolean;
  isOfflineOrNotReady: boolean;
  applyLimits: () => Promise<void>;
}

export const LimitsCard: React.FC<LimitsCardProps> = ({
  t,
  limitsCollapsed,
  setLimitsCollapsed,
  limitsRows,
  limitField,
  setLimitsFields,
  limitsBusy,
  isOfflineOrNotReady,
  applyLimits,
}) => (
  <div className="dashboard-card limits-card">
    <div className="card-title">
      <Sliders size={20} />
      <span>{t.limits}</span>
      <div className="panel-header-actions" style={{ marginLeft: "auto" }}>
        <CollapseButton
          collapsed={limitsCollapsed}
          storageKey="limitsCollapsed"
          setter={setLimitsCollapsed}
          t={t}
        />
      </div>
    </div>

    {!limitsCollapsed && (
      <div className="extruder-body">
        <div className="retraction-grid">
          {limitsRows.map((row) => (
            <label className="extruder-field" key={row.key}>
              {row.label}
              <input
                type="number"
                min={0}
                step={row.step}
                value={limitField(row.key, row.def)}
                onChange={(e) =>
                  setLimitsFields((f) => ({
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
          disabled={limitsBusy || isOfflineOrNotReady}
          onClick={() => void applyLimits()}
        >
          {limitsBusy ? t.updatesUpdating : t.configSave}
        </button>
      </div>
    )}
  </div>
);

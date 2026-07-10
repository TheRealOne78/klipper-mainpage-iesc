import React from "react";
import type { Dispatch, SetStateAction } from "react";
import { ArrowDown, ArrowUp, Ruler } from "lucide-react";
import { CollapseButton } from "../CollapseButton";
import type { Translations } from "../../../translations";

interface CalibrateCardProps {
  t: Translations;
  calibrateCollapsed: boolean;
  setCalibrateCollapsed: Dispatch<SetStateAction<boolean>>;
  zOffset: number | undefined;
  babystepDisabled: boolean;
  babystep: (delta: number) => Promise<void>;
  calibrateActions: { key: string; label: string; gcode: string }[];
  calibrateActionDisabled: boolean;
  onRunMacro: (name: string) => Promise<any>;
}

export const CalibrateCard: React.FC<CalibrateCardProps> = ({
  t,
  calibrateCollapsed,
  setCalibrateCollapsed,
  zOffset,
  babystepDisabled,
  babystep,
  calibrateActions,
  calibrateActionDisabled,
  onRunMacro,
}) => (
  <div className="dashboard-card calibrate-card">
    <div className="card-title">
      <Ruler size={20} />
      <span>{t.calibrate}</span>
      <div className="panel-header-actions" style={{ marginLeft: "auto" }}>
        <CollapseButton
          collapsed={calibrateCollapsed}
          storageKey="calibrateCollapsed"
          setter={setCalibrateCollapsed}
          t={t}
        />
      </div>
    </div>

    {!calibrateCollapsed && (
      <div className="calibrate-body">
        <div className="calibrate-babystep">
          <div className="calibrate-babystep-head">
            <span>{t.calZOffset}</span>
            {typeof zOffset === "number" && (
              <span className="calibrate-offset">
                {zOffset.toFixed(3)} mm
              </span>
            )}
          </div>
          <div className="calibrate-babystep-row">
            {[0.05, 0.01, -0.01, -0.05].map((delta) => (
              <button
                key={delta}
                className="btn btn-compact"
                disabled={babystepDisabled}
                onClick={() => void babystep(delta)}
              >
                {delta > 0 ? (
                  <ArrowUp size={13} />
                ) : (
                  <ArrowDown size={13} />
                )}
                {Math.abs(delta)}
              </button>
            ))}
          </div>
        </div>

        <div className="calibrate-actions">
          {calibrateActions.length === 0 ? (
            <div className="list-empty-state">{t.calNone}</div>
          ) : (
            calibrateActions.map((action) => (
              <button
                key={action.key}
                className="btn btn-compact calibrate-btn"
                disabled={calibrateActionDisabled}
                onClick={() => void onRunMacro(action.gcode)}
              >
                {action.label}
              </button>
            ))
          )}
        </div>
      </div>
    )}
  </div>
);

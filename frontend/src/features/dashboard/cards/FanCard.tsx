import React from "react";
import { Fan } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { CollapseButton } from "../CollapseButton";
import type { PrinterState } from "../../../printerTypes";
import type { Translations } from "../../../translations";

interface FanCardProps {
  state: PrinterState;
  t: Translations;
  fanCollapsed: boolean;
  setFanCollapsed: Dispatch<SetStateAction<boolean>>;
  fanPct: number;
  canControlTemps: boolean;
  isOfflineOrNotReady: boolean;
  commitFan: (pct: number) => Promise<void>;
}

export const FanCard: React.FC<FanCardProps> = ({
  state,
  t,
  fanCollapsed,
  setFanCollapsed,
  fanPct,
  canControlTemps,
  isOfflineOrNotReady,
  commitFan,
}) => (
  <div className="dashboard-card fan-card">
    <div className="card-title">
      <Fan size={20} />
      <span>{t.fan}</span>
      {state.fan?.rpm ? (
        <span className="fan-rpm">{Math.round(state.fan.rpm)} RPM</span>
      ) : null}
      <div className="panel-header-actions" style={{ marginLeft: "auto" }}>
        <CollapseButton
          collapsed={fanCollapsed}
          storageKey="fanCollapsed"
          setter={setFanCollapsed}
          t={t}
        />
      </div>
    </div>

    {!fanCollapsed && (
      <div className="fan-body">
        <div className="card-value-row">
          <span>{t.fan}</span>
          <span className="card-value-row-value">{fanPct}%</span>
        </div>
        {/* Controls are hidden (not just disabled) without control_temps. */}
        {canControlTemps && (
          <>
            <input
              type="range"
              min={0}
              max={100}
              value={fanPct}
              disabled={isOfflineOrNotReady}
              onChange={(event) => void commitFan(Number(event.target.value))}
              style={{
                width: "100%",
                accentColor: "var(--accent-color)",
                cursor: isOfflineOrNotReady ? "default" : "pointer",
              }}
            />
            <div className="fan-presets">
              <button
                className="btn btn-compact"
                disabled={isOfflineOrNotReady}
                onClick={() => void commitFan(0)}
              >
                {t.fanOff}
              </button>
              <button
                className="btn btn-compact"
                disabled={isOfflineOrNotReady}
                onClick={() => void commitFan(50)}
              >
                50%
              </button>
              <button
                className="btn btn-compact"
                disabled={isOfflineOrNotReady}
                onClick={() => void commitFan(100)}
              >
                100%
              </button>
            </div>
          </>
        )}
      </div>
    )}
  </div>
);

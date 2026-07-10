import React from "react";
import type { Dispatch, SetStateAction } from "react";
import { Sliders } from "lucide-react";
import { CollapseButton } from "../CollapseButton";
import type { Translations } from "../../../translations";

interface FlowCardProps {
  t: Translations;
  flowCollapsed: boolean;
  setFlowCollapsed: Dispatch<SetStateAction<boolean>>;
  flowPct: number;
  canControlToolhead: boolean;
  isOfflineOrNotReady: boolean;
  commitFlow: (pct: number) => Promise<void>;
}

export const FlowCard: React.FC<FlowCardProps> = ({
  t,
  flowCollapsed,
  setFlowCollapsed,
  flowPct,
  canControlToolhead,
  isOfflineOrNotReady,
  commitFlow,
}) => (
  <div className="dashboard-card flow-card">
    <div className="card-title">
      <Sliders size={20} />
      <span>{t.flow}</span>
      <div className="panel-header-actions" style={{ marginLeft: "auto" }}>
        <CollapseButton
          collapsed={flowCollapsed}
          storageKey="flowCollapsed"
          setter={setFlowCollapsed}
          t={t}
        />
      </div>
    </div>

    {!flowCollapsed && (
      <div className="fan-body">
        <div className="card-value-row">
          <span>{t.flow}</span>
          <span className="card-value-row-value">{flowPct}%</span>
        </div>
        {canControlToolhead && (
          <>
            <input
              type="range"
              min={50}
              max={200}
              value={flowPct}
              disabled={isOfflineOrNotReady}
              onChange={(event) => void commitFlow(Number(event.target.value))}
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
                onClick={() => void commitFlow(flowPct - 5)}
              >
                -5%
              </button>
              <button
                className="btn btn-compact"
                disabled={isOfflineOrNotReady}
                onClick={() => void commitFlow(100)}
              >
                {t.speedReset}
              </button>
              <button
                className="btn btn-compact"
                disabled={isOfflineOrNotReady}
                onClick={() => void commitFlow(flowPct + 5)}
              >
                +5%
              </button>
            </div>
          </>
        )}
      </div>
    )}
  </div>
);

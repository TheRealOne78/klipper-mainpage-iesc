import React from "react";
import type { Dispatch, SetStateAction } from "react";
import { Ruler } from "lucide-react";
import { CollapseButton } from "../CollapseButton";
import type { Translations } from "../../../translations";

interface InputShaperCardProps {
  t: Translations;
  inputShaperCollapsed: boolean;
  setInputShaperCollapsed: Dispatch<SetStateAction<boolean>>;
  inputShaperActions: { key: string; label: string; gcode: string }[];
  calibrateActionDisabled: boolean;
  onRunMacro: (name: string) => Promise<any>;
}

export const InputShaperCard: React.FC<InputShaperCardProps> = ({
  t,
  inputShaperCollapsed,
  setInputShaperCollapsed,
  inputShaperActions,
  calibrateActionDisabled,
  onRunMacro,
}) => (
  <div className="dashboard-card inputshaper-card">
    <div className="card-title">
      <Ruler size={20} />
      <span>{t.inputShaper}</span>
      <div className="panel-header-actions" style={{ marginLeft: "auto" }}>
        <CollapseButton
          collapsed={inputShaperCollapsed}
          storageKey="inputShaperCollapsed"
          setter={setInputShaperCollapsed}
          t={t}
        />
      </div>
    </div>
    {!inputShaperCollapsed && (
      <div className="calibrate-actions">
        <div className="list-empty-state">{t.shaperHint}</div>
        {inputShaperActions.map((a) => (
          <button
            key={a.key}
            className="btn btn-compact"
            disabled={calibrateActionDisabled}
            onClick={() => void onRunMacro(a.gcode)}
          >
            {a.label}
          </button>
        ))}
      </div>
    )}
  </div>
);

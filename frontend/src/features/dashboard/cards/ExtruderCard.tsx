import React from "react";
import type { Dispatch, SetStateAction } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, Thermometer } from "lucide-react";
import { CollapseButton } from "../CollapseButton";
import type { Translations } from "../../../translations";

interface ExtruderCardProps {
  t: Translations;
  extruderCardCollapsed: boolean;
  setExtruderCardCollapsed: Dispatch<SetStateAction<boolean>>;
  hotEnough: boolean;
  minExtrudeTemp: number;
  extrudeLen: string;
  setExtrudeLen: Dispatch<SetStateAction<string>>;
  extrudeSpeed: string;
  setExtrudeSpeed: Dispatch<SetStateAction<string>>;
  extrudeDisabled: boolean;
  doExtrude: (direction: 1 | -1) => Promise<void>;
}

export const ExtruderCard: React.FC<ExtruderCardProps> = ({
  t,
  extruderCardCollapsed,
  setExtruderCardCollapsed,
  hotEnough,
  minExtrudeTemp,
  extrudeLen,
  setExtrudeLen,
  extrudeSpeed,
  setExtrudeSpeed,
  extrudeDisabled,
  doExtrude,
}) => (
  <div className="dashboard-card extruder-card">
    <div className="card-title">
      <Thermometer size={20} />
      <span>{t.extruderControl}</span>
      <div className="panel-header-actions" style={{ marginLeft: "auto" }}>
        <CollapseButton
          collapsed={extruderCardCollapsed}
          storageKey="extruderCardCollapsed"
          setter={setExtruderCardCollapsed}
          t={t}
        />
      </div>
    </div>

    {!extruderCardCollapsed && (
      <div className="extruder-body">
        {!hotEnough && (
          <div className="extruder-warn">
            <AlertTriangle size={14} />{" "}
            {t.extruderTooCold.replace("{temp}", String(minExtrudeTemp))}
          </div>
        )}
        <div className="extruder-inputs">
          <label className="extruder-field">
            {t.extruderLength}
            <input
              type="number"
              min={0}
              value={extrudeLen}
              onChange={(e) => setExtrudeLen(e.currentTarget.value)}
            />
          </label>
          <label className="extruder-field">
            {t.extruderSpeed}
            <input
              type="number"
              min={0}
              value={extrudeSpeed}
              onChange={(e) => setExtrudeSpeed(e.currentTarget.value)}
            />
          </label>
        </div>
        <div className="extruder-actions">
          <button
            type="button"
            className="btn"
            disabled={extrudeDisabled}
            onClick={() => void doExtrude(-1)}
          >
            <ArrowUp size={15} /> {t.extruderRetract}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={extrudeDisabled}
            onClick={() => void doExtrude(1)}
          >
            <ArrowDown size={15} /> {t.extruderExtrude}
          </button>
        </div>
      </div>
    )}
  </div>
);

import React from "react";
import type { Dispatch, SetStateAction } from "react";
import { AlertTriangle, Power } from "lucide-react";
import { CollapseButton } from "../CollapseButton";
import type { PowerDevice } from "../../../printerTypes";
import type { Translations } from "../../../translations";

interface PowerCardProps {
  t: Translations;
  powerCollapsed: boolean;
  setPowerCollapsed: Dispatch<SetStateAction<boolean>>;
  powerError: string | null;
  powerDevices: PowerDevice[];
  canControlPower: boolean;
  powerBusy: string | null;
  handlePowerToggle: (dev: PowerDevice) => Promise<void>;
}

export const PowerCard: React.FC<PowerCardProps> = ({
  t,
  powerCollapsed,
  setPowerCollapsed,
  powerError,
  powerDevices,
  canControlPower,
  powerBusy,
  handlePowerToggle,
}) => (
  <div className="dashboard-card power-card">
    <div className="card-title">
      <Power size={20} />
      <span>{t.power}</span>
      <div className="panel-header-actions" style={{ marginLeft: "auto" }}>
        <CollapseButton
          collapsed={powerCollapsed}
          storageKey="powerCollapsed"
          setter={setPowerCollapsed}
          t={t}
        />
      </div>
    </div>

    {!powerCollapsed && (
      <div className="power-body">
        {powerError && (
          <div className="power-error">
            <AlertTriangle size={14} /> {powerError}
          </div>
        )}
        {powerDevices.length === 0 && !powerError ? (
          <div className="list-empty-state">{t.noPowerDevices}</div>
        ) : (
          powerDevices.map((dev) => {
            const on = dev.status === "on";
            const unknown = dev.status !== "on" && dev.status !== "off";
            return (
              <div className="power-row" key={dev.device}>
                <span className="power-name">{dev.device}</span>
                <span className={`power-status ${dev.status}`}>
                  {on ? t.powerOn : unknown ? dev.status : t.powerOff}
                </span>
                {canControlPower && (
                  <button
                    type="button"
                    className={`power-toggle ${on ? "on" : "off"}`}
                    disabled={powerBusy === dev.device}
                    onClick={() => void handlePowerToggle(dev)}
                    aria-pressed={on}
                    title={dev.device}
                  >
                    <span className="power-toggle-knob" />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    )}
  </div>
);

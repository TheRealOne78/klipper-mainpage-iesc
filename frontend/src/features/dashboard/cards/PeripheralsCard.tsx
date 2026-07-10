import React from "react";
import type { Dispatch, SetStateAction } from "react";
import { Fan } from "lucide-react";
import { CollapseButton } from "../CollapseButton";
import { num, auxType, auxLabel, ledColor } from "../../../lib/dashboardFormat";
import type { Translations } from "../../../translations";

type AuxEntry = [string, Record<string, any>];

interface PeripheralsCardProps {
  t: Translations;
  peripheralsCollapsed: boolean;
  setPeripheralsCollapsed: Dispatch<SetStateAction<boolean>>;
  hasPeripherals: boolean;
  auxFans: AuxEntry[];
  auxPins: AuxEntry[];
  auxLeds: AuxEntry[];
  auxTempSensors: AuxEntry[];
  auxHeaters: AuxEntry[];
  auxTmc: AuxEntry[];
  auxFilament: AuxEntry[];
  isOfflineOrNotReady: boolean;
  canControlTemps: boolean;
  canControlToolhead: boolean;
  canControlMachine: boolean;
  onSetAuxFan: (name: string, speed: number) => Promise<any>;
  onSetAuxPin: (name: string, value: number) => Promise<any>;
  onSetAuxLed: (
    name: string,
    red: number,
    green: number,
    blue: number,
    white?: number,
  ) => Promise<any>;
  onSetAuxHeater: (name: string, target: number) => Promise<any>;
  onSetTmcCurrent: (stepper: string, current: number) => Promise<any>;
}

export const PeripheralsCard: React.FC<PeripheralsCardProps> = ({
  t,
  peripheralsCollapsed,
  setPeripheralsCollapsed,
  hasPeripherals,
  auxFans,
  auxPins,
  auxLeds,
  auxTempSensors,
  auxHeaters,
  auxTmc,
  auxFilament,
  isOfflineOrNotReady,
  canControlTemps,
  canControlToolhead,
  canControlMachine,
  onSetAuxFan,
  onSetAuxPin,
  onSetAuxLed,
  onSetAuxHeater,
  onSetTmcCurrent,
}) => (
  <div className="dashboard-card peripherals-card">
    <div className="card-title">
      <Fan size={20} />
      <span>{t.peripherals}</span>
      <div className="panel-header-actions" style={{ marginLeft: "auto" }}>
        <CollapseButton
          collapsed={peripheralsCollapsed}
          storageKey="peripheralsCollapsed"
          setter={setPeripheralsCollapsed}
          t={t}
        />
      </div>
    </div>

    {!peripheralsCollapsed && (
      <div className="peripherals-body">
        {!hasPeripherals && (
          <div className="list-empty-state">{t.peripheralsEmpty}</div>
        )}

        {auxFans.map(([name, info]) => {
          const speedPct = Math.round(num(info.speed) * 100);
          const isControllable = auxType(name) === "fan_generic";
          return (
            <div className="peripheral-row" key={name}>
              <span className="peripheral-name">{auxLabel(name)}</span>
              {isControllable && !isOfflineOrNotReady && canControlTemps ? (
                <input
                  type="range"
                  min={0}
                  max={100}
                  defaultValue={speedPct}
                  className="peripheral-slider"
                  onMouseUp={(e) =>
                    void onSetAuxFan(name, Number(e.currentTarget.value) / 100)
                  }
                  onTouchEnd={(e) =>
                    void onSetAuxFan(name, Number(e.currentTarget.value) / 100)
                  }
                />
              ) : null}
              <span className="peripheral-value">{speedPct}%</span>
            </div>
          );
        })}

        {auxPins.map(([name, info]) => {
          const value = num(info.value);
          const pct = Math.round(value * 100);
          return (
            <div className="peripheral-row" key={name}>
              <span className="peripheral-name">{auxLabel(name)}</span>
              {!isOfflineOrNotReady && canControlToolhead ? (
                <input
                  type="range"
                  min={0}
                  max={100}
                  defaultValue={pct}
                  className="peripheral-slider"
                  onMouseUp={(e) =>
                    void onSetAuxPin(name, Number(e.currentTarget.value) / 100)
                  }
                  onTouchEnd={(e) =>
                    void onSetAuxPin(name, Number(e.currentTarget.value) / 100)
                  }
                />
              ) : null}
              <span className="peripheral-value">{pct}%</span>
            </div>
          );
        })}

        {auxLeds.map(([name, info]) => (
          <div className="peripheral-row" key={name}>
            <span className="peripheral-name">{auxLabel(name)}</span>
            {!isOfflineOrNotReady && canControlToolhead ? (
              <input
                type="color"
                className="peripheral-color"
                defaultValue={ledColor(info)}
                onChange={(e) => {
                  const hex = e.currentTarget.value;
                  const r = parseInt(hex.slice(1, 3), 16) / 255;
                  const g = parseInt(hex.slice(3, 5), 16) / 255;
                  const b = parseInt(hex.slice(5, 7), 16) / 255;
                  void onSetAuxLed(name, r, g, b, 0);
                }}
              />
            ) : (
              /* Read-only colour swatch when the user can't control the LED. */
              <span
                className="peripheral-color"
                style={{ background: ledColor(info) }}
                title={ledColor(info)}
              />
            )}
          </div>
        ))}

        {auxTempSensors.map(([name, info]) => (
          <div className="peripheral-row" key={name}>
            <span className="peripheral-name">{auxLabel(name)}</span>
            <span className="peripheral-value">
              {num(info.temperature).toFixed(1)}°C
            </span>
          </div>
        ))}

        {auxHeaters.map(([name, info]) => (
          <div className="peripheral-row" key={name}>
            <span className="peripheral-name">{auxLabel(name)}</span>
            <span className="peripheral-value">
              {num(info.temperature).toFixed(1)} /{" "}
              {num(info.target).toFixed(0)}°C
            </span>
            {canControlTemps && (
              <input
                type="number"
                className="peripheral-heater-input"
                min={0}
                max={350}
                placeholder="°C"
                disabled={isOfflineOrNotReady}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const v = Number(e.currentTarget.value);
                    if (Number.isFinite(v)) {
                      void onSetAuxHeater(name, v);
                      e.currentTarget.value = "";
                    }
                  }
                }}
              />
            )}
          </div>
        ))}

        {auxTmc.map(([name, info]) => (
          <div className="peripheral-row" key={name}>
            <span className="peripheral-name">{auxLabel(name)}</span>
            <span className="peripheral-value">
              {num(info.run_current).toFixed(2)}A
            </span>
            {canControlMachine && (
              <input
                type="number"
                className="peripheral-heater-input"
                min={0}
                max={5}
                step={0.05}
                placeholder="A"
                disabled={isOfflineOrNotReady}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const v = Number(e.currentTarget.value);
                    if (Number.isFinite(v) && v > 0) {
                      void onSetTmcCurrent(auxLabel(name), v);
                      e.currentTarget.value = "";
                    }
                  }
                }}
              />
            )}
          </div>
        ))}

        {auxFilament.map(([name, info]) => {
          const detected = Boolean(info.filament_detected);
          const enabled = info.enabled === undefined || Boolean(info.enabled);
          return (
            <div className="peripheral-row" key={name}>
              <span className="peripheral-name">{auxLabel(name)}</span>
              <span
                className={`peripheral-badge ${detected ? "ok" : "bad"}`}
              >
                {detected ? t.filamentDetected : t.filamentAbsent}
              </span>
              {!enabled && (
                <span className="peripheral-badge muted">
                  {t.filamentDisabled}
                </span>
              )}
            </div>
          );
        })}
      </div>
    )}
  </div>
);

import React from "react";
import type { Dispatch, SetStateAction } from "react";
import { ChevronDown, Settings, Sliders, Thermometer } from "lucide-react";
import { CollapseButton } from "../CollapseButton";
import { TempGraph, type TempDataPoint } from "../TempGraph";
import { getHeaterStateStr } from "../../../lib/dashboardFormat";
import type { PortalConfig, PrinterState } from "../../../printerTypes";
import type { Translations } from "../../../translations";

interface TempsCardProps {
  t: Translations;
  state: PrinterState;
  config: PortalConfig | null;
  canControlTemps: boolean;
  canViewTempTarget: boolean;
  isOfflineOrNotReady: boolean;
  tempsCollapsed: boolean;
  setTempsCollapsed: Dispatch<SetStateAction<boolean>>;
  dropdownRef: React.RefObject<HTMLDivElement | null>;
  presetDropdownOpen: boolean;
  setPresetDropdownOpen: Dispatch<SetStateAction<boolean>>;
  handlePreheatPreset: (preset: string) => Promise<void>;
  settingsRef: React.RefObject<HTMLDivElement | null>;
  settingsOpen: boolean;
  setSettingsOpen: Dispatch<SetStateAction<boolean>>;
  showChart: boolean;
  autoscaleChart: boolean;
  hideMonitors: boolean;
  toggleSetting: (key: "showChart" | "autoscaleChart" | "hideMonitors") => void;
  extruderTarget: string;
  setExtruderTarget: Dispatch<SetStateAction<string>>;
  setIsExtruderFocused: Dispatch<SetStateAction<boolean>>;
  handleExtruderTargetSubmit: (e?: React.FormEvent) => Promise<void>;
  extruderPresetRef: React.RefObject<HTMLDivElement | null>;
  extruderPresetOpen: boolean;
  setExtruderPresetOpen: Dispatch<SetStateAction<boolean>>;
  handleTargetPreset: (
    heater: "extruder" | "heater_bed",
    presetName: string,
  ) => Promise<void>;
  bedTarget: string;
  setBedTarget: Dispatch<SetStateAction<string>>;
  setIsBedFocused: Dispatch<SetStateAction<boolean>>;
  handleBedTargetSubmit: (e?: React.FormEvent) => Promise<void>;
  bedPresetRef: React.RefObject<HTMLDivElement | null>;
  bedPresetOpen: boolean;
  setBedPresetOpen: Dispatch<SetStateAction<boolean>>;
  tempHistory: TempDataPoint[];
  theme: "light" | "dark";
  chartLabels: {
    extruder: string;
    bed: string;
    extruderTarget: string;
    bedTarget: string;
  };
}

export const TempsCard: React.FC<TempsCardProps> = ({
  t,
  state,
  config,
  canControlTemps,
  canViewTempTarget,
  isOfflineOrNotReady,
  tempsCollapsed,
  setTempsCollapsed,
  dropdownRef,
  presetDropdownOpen,
  setPresetDropdownOpen,
  handlePreheatPreset,
  settingsRef,
  settingsOpen,
  setSettingsOpen,
  showChart,
  autoscaleChart,
  hideMonitors,
  toggleSetting,
  extruderTarget,
  setExtruderTarget,
  setIsExtruderFocused,
  handleExtruderTargetSubmit,
  extruderPresetRef,
  extruderPresetOpen,
  setExtruderPresetOpen,
  handleTargetPreset,
  bedTarget,
  setBedTarget,
  setIsBedFocused,
  handleBedTargetSubmit,
  bedPresetRef,
  bedPresetOpen,
  setBedPresetOpen,
  tempHistory,
  theme,
  chartLabels,
}) => (
  <div className="dashboard-card temps-card">
    <div className="card-title" style={{ position: "relative" }}>
      <Thermometer size={20} />
      <span>{t.tempPreheat}</span>

      {/* Presets dropdown like Mainsail */}
      <div
        style={{
          marginLeft: "auto",
          display: "flex",
          alignItems: "center",
          gap: "10px",
        }}
      >
        {canControlTemps && (
        <div ref={dropdownRef} style={{ position: "relative" }}>
          <button
            onClick={() => setPresetDropdownOpen(!presetDropdownOpen)}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-secondary)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "4px",
              fontSize: "0.85rem",
              padding: "4px 8px",
              borderRadius: "4px",
            }}
            className="dropdown-item-hover"
          >
            {t.preset} <ChevronDown size={14} />
          </button>
          {presetDropdownOpen && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                right: 0,
                zIndex: 10,
                background: "var(--surface-color)",
                border: "1px solid var(--border-color)",
                borderRadius: "4px",
                boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
                minWidth: "160px",
                marginTop: "4px",
              }}
            >
              {config &&
                Object.keys(config.preheat_presets).map((preset) => (
                  <div
                    key={preset}
                    className="dropdown-item-hover"
                    style={{
                      padding: "8px 12px",
                      cursor: "pointer",
                      fontSize: "0.85rem",
                      borderBottom: "1px solid var(--border-color)",
                    }}
                    onClick={() => {
                      handlePreheatPreset(preset);
                      setPresetDropdownOpen(false);
                    }}
                  >
                    {preset.toUpperCase()} (
                    {config.preheat_presets[preset].hotend}/
                    {config.preheat_presets[preset].bed})
                  </div>
                ))}
              <div
                className="dropdown-item-hover"
                style={{
                  padding: "8px 12px",
                  cursor: "pointer",
                  fontSize: "0.85rem",
                  color: "var(--info-color)",
                }}
                onClick={() => {
                  handlePreheatPreset("cooldown");
                  setPresetDropdownOpen(false);
                }}
              >
                {t.cooldown}
              </div>
            </div>
          )}
        </div>
        )}

        <div ref={settingsRef} style={{ position: "relative" }}>
          <button
            className="icon-button"
            title={t.temperatureSettings}
            onClick={() => setSettingsOpen(!settingsOpen)}
          >
            <Settings
              size={18}
              style={{
                color: settingsOpen
                  ? "var(--accent-color)"
                  : "currentColor",
              }}
            />
          </button>
          {settingsOpen && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                right: 0,
                zIndex: 10,
                background: "var(--surface-color)",
                border: "1px solid var(--border-color)",
                borderRadius: "4px",
                boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
                padding: "10px",
                minWidth: "180px",
                marginTop: "4px",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
              }}
            >
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  fontSize: "0.85rem",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={showChart}
                  onChange={() => toggleSetting("showChart")}
                />
                {t.showChart}
              </label>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  fontSize: "0.85rem",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={autoscaleChart}
                  onChange={() => toggleSetting("autoscaleChart")}
                />
                {t.autoscaleChart}
              </label>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  fontSize: "0.85rem",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={hideMonitors}
                  onChange={() => toggleSetting("hideMonitors")}
                />
                {t.hideTargets}
              </label>
            </div>
          )}
        </div>
        <CollapseButton
          collapsed={tempsCollapsed}
          storageKey="tempsCollapsed"
          setter={setTempsCollapsed}
          t={t}
        />
      </div>
    </div>

    {/* Mainsail-style Temperatures Table */}
    {!tempsCollapsed && (
      <>
    <div
      className={`temps-table${canViewTempTarget ? "" : " no-target"}`}
      style={{ marginTop: "0.5rem" }}
    >
      <div className="temps-table-header">
        <div>{t.tableName}</div>
        <div style={{ textAlign: "center" }}>{t.tableState}</div>
        <div style={{ textAlign: "right" }}>{t.tableCurrent}</div>
        {canViewTempTarget && (
          <div style={{ textAlign: "right" }}>{t.tableTarget}</div>
        )}
      </div>

      {/* Extruder Row */}
      <div className="temps-table-row">
        <div className="heater-name">
          <Thermometer
            size={16}
            style={{ color: "var(--danger-color)", marginRight: "6px" }}
          />
          <span>{t.extruder}</span>
        </div>
        <div
          className="heater-state"
          style={{
            textAlign: "center",
            textTransform: "capitalize",
            fontSize: "0.85rem",
            opacity: 0.7,
          }}
        >
          {getHeaterStateStr(state.hotend_temp, state.hotend_target, t)}
        </div>
        <div
          className="heater-current"
          style={{ textAlign: "right", fontWeight: "bold" }}
        >
          {state.hotend_temp.toFixed(1)}°C
        </div>
        {!canControlTemps && canViewTempTarget && (
          <div
            className="heater-target-readonly"
            style={{ textAlign: "right", fontWeight: "bold" }}
          >
            {state.hotend_target.toFixed(1)}°C
          </div>
        )}
        {canControlTemps && (
        <div className="heater-target">
          <form
            className="heater-target-control"
            onSubmit={handleExtruderTargetSubmit}
          >
            <div className="heater-input-box">
              <input
                type="number"
                value={extruderTarget}
                onChange={(e) => setExtruderTarget(e.target.value)}
                onFocus={() => setIsExtruderFocused(true)}
                onBlur={() => {
                  setIsExtruderFocused(false);
                  handleExtruderTargetSubmit();
                }}
                disabled={isOfflineOrNotReady}
              />
              <span className="heater-unit">°C</span>
            </div>
            <div ref={extruderPresetRef} style={{ position: "relative" }}>
              <button
                type="button"
                className="preset-select-btn"
                title={t.preset}
                disabled={isOfflineOrNotReady}
                onClick={() => setExtruderPresetOpen((o) => !o)}
              >
                <ChevronDown size={14} />
              </button>
              {extruderPresetOpen && (
                <div className="preset-popup">
                  {config && Object.entries(config.preheat_presets).map(([name, vals]) => (
                    <button key={name} type="button" className="preset-popup-item" onClick={() => { handleTargetPreset("extruder", name); setExtruderPresetOpen(false); }}>
                      <span>{vals.hotend}°C</span>
                      <span className="preset-popup-name">{name}</span>
                    </button>
                  ))}
                  <button type="button" className="preset-popup-item preset-popup-cooldown" onClick={() => { handleTargetPreset("extruder", "cooldown"); setExtruderPresetOpen(false); }}>
                    <span>0°C</span>
                    <span className="preset-popup-name">{t.cooldown}</span>
                  </button>
                </div>
              )}
            </div>
          </form>
        </div>
        )}
      </div>

      {/* Bed Row */}
      <div className="temps-table-row">
        <div className="heater-name">
          <Sliders
            size={16}
            style={{ color: "var(--info-color)", marginRight: "6px" }}
          />
          <span>{t.heaterBed}</span>
        </div>
        <div
          className="heater-state"
          style={{
            textAlign: "center",
            textTransform: "capitalize",
            fontSize: "0.85rem",
            opacity: 0.7,
          }}
        >
          {getHeaterStateStr(state.bed_temp, state.bed_target, t)}
        </div>
        <div
          className="heater-current"
          style={{ textAlign: "right", fontWeight: "bold" }}
        >
          {state.bed_temp.toFixed(1)}°C
        </div>
        {!canControlTemps && canViewTempTarget && (
          <div
            className="heater-target-readonly"
            style={{ textAlign: "right", fontWeight: "bold" }}
          >
            {state.bed_target.toFixed(1)}°C
          </div>
        )}
        {canControlTemps && (
        <div className="heater-target">
          <form
            className="heater-target-control"
            onSubmit={handleBedTargetSubmit}
          >
            <div className="heater-input-box">
              <input
                type="number"
                value={bedTarget}
                onChange={(e) => setBedTarget(e.target.value)}
                onFocus={() => setIsBedFocused(true)}
                onBlur={() => {
                  setIsBedFocused(false);
                  handleBedTargetSubmit();
                }}
                disabled={isOfflineOrNotReady}
              />
              <span className="heater-unit">°C</span>
            </div>
            <div ref={bedPresetRef} style={{ position: "relative" }}>
              <button
                type="button"
                className="preset-select-btn"
                title={t.preset}
                disabled={isOfflineOrNotReady}
                onClick={() => setBedPresetOpen((o) => !o)}
              >
                <ChevronDown size={14} />
              </button>
              {bedPresetOpen && (
                <div className="preset-popup">
                  {config && Object.entries(config.preheat_presets).map(([name, vals]) => (
                    <button key={name} type="button" className="preset-popup-item" onClick={() => { handleTargetPreset("heater_bed", name); setBedPresetOpen(false); }}>
                      <span>{vals.bed}°C</span>
                      <span className="preset-popup-name">{name}</span>
                    </button>
                  ))}
                  <button type="button" className="preset-popup-item preset-popup-cooldown" onClick={() => { handleTargetPreset("heater_bed", "cooldown"); setBedPresetOpen(false); }}>
                    <span>0°C</span>
                    <span className="preset-popup-name">{t.cooldown}</span>
                  </button>
                </div>
              )}
            </div>
          </form>
        </div>
        )}
      </div>
    </div>

    {/* Real-time Graph Visualizer */}
    {showChart && (
      <TempGraph
        history={tempHistory}
        autoscale={autoscaleChart}
        hideMonitors={hideMonitors}
        theme={theme}
        labels={chartLabels}
      />
    )}
      </>
    )}
  </div>
);

import React, { useState, useEffect } from "react";
import {
  Play,
  Pause,
  Square,
  Thermometer,
  Sliders,
  Move,
  Upload,
  CheckCircle,
  AlertTriangle,
} from "lucide-react";
import type { PrinterState, PortalConfig } from "../usePrinterState";
import { translations } from "../translations";

interface DashboardProps {
  state: PrinterState;
  config: PortalConfig | null;
  role: string | null;
  lang: "ro" | "en";
  uploadProgress: number | null;
  onPreheat: (preset: string) => Promise<any>;
  onRunMacro: (name: string) => Promise<any>;
  onJog: (axis: string, distance: number) => Promise<any>;
  onHome: () => Promise<any>;
  onSetSpeedFactor: (factor: number) => Promise<any>;
  onStartPrint: (filename: string) => Promise<any>;
  onPause: () => Promise<any>;
  onResume: () => Promise<any>;
  onCancel: () => Promise<any>;
  onUpload: (
    file: File,
  ) => Promise<{ success: boolean; filename?: string; error?: string }>;
}

export const Dashboard: React.FC<DashboardProps> = ({
  state,
  config,
  lang,
  uploadProgress,
  onPreheat,
  onRunMacro,
  onJog,
  onHome,
  onSetSpeedFactor,
  onStartPrint,
  onPause,
  onResume,
  onCancel,
  onUpload,
}) => {
  const [stepSize, setStepSize] = useState<number>(1.0);
  const [speedVal, setSpeedVal] = useState<number>(state.speed_factor || 100);
  const [uploadedFile, setUploadedFile] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const t = translations[lang];

  // Keep speedVal in sync with state.speed_factor when it changes
  useEffect(() => {
    if (state.speed_factor) {
      setSpeedVal(state.speed_factor);
    }
  }, [state.speed_factor]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    setErrorMsg(null);
    setSuccessMsg(null);

    const res = await onUpload(file);
    if (res.success) {
      setUploadedFile(res.filename || file.name);
      setSuccessMsg(
        t.uploadSuccess.replace("{name}", res.filename || file.name),
      );
    } else {
      setErrorMsg(res.error || t.uploadFailed);
    }
  };

  const handleStartPrint = async () => {
    if (!uploadedFile) return;
    try {
      await onStartPrint(uploadedFile);
      setUploadedFile(null);
      setSuccessMsg(t.printStarted);
    } catch (e: any) {
      setErrorMsg(e.message || t.printStartFailed);
    }
  };

  const handleJogAction = async (axis: string, sign: number) => {
    try {
      setErrorMsg(null);
      await onJog(axis, stepSize * sign);
    } catch (e: any) {
      setErrorMsg(e.message || t.moveFailed);
    }
  };

  const handleHomeAction = async () => {
    try {
      setErrorMsg(null);
      await onHome();
    } catch (e: any) {
      setErrorMsg(e.message || t.homeFailed);
    }
  };

  const handlePreheatPreset = async (preset: string) => {
    try {
      setErrorMsg(null);
      await onPreheat(preset);
    } catch (e: any) {
      setErrorMsg(e.message || t.preheatFailed);
    }
  };

  const handleMacroAction = async (macroName: string) => {
    try {
      setErrorMsg(null);
      await onRunMacro(macroName);
    } catch (e: any) {
      setErrorMsg(e.message || t.macroFailed);
    }
  };

  const handleSpeedFactorChange = async (newFactor: number) => {
    setSpeedVal(newFactor);
    try {
      await onSetSpeedFactor(newFactor);
    } catch (e: any) {
      setErrorMsg(e.message || t.speedFailed);
    }
  };

  // Format seconds to HH:MM:SS
  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return "00:00:00";
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    return [
      h.toString().padStart(2, "0"),
      m.toString().padStart(2, "0"),
      s.toString().padStart(2, "0"),
    ].join(":");
  };

  const isPrinting = state.print_state === "printing";
  const isPaused = state.print_state === "paused";
  const isOffline = state.connection_state !== "connected";
  const canMove =
    !isOffline &&
    (!isPrinting || (config?.limits.allow_movement_while_printing ?? false));

  // Human readable state strings
  const getStatusText = (status: string) => {
    switch (status) {
      case "standby":
        return t.statusStandby;
      case "disconnected":
        return t.statusOffline;
      case "connecting":
        return t.statusConnecting;
      case "printing":
        return t.statusPrinting;
      case "paused":
        return t.statusPaused;
      case "error":
        return t.statusError;
      default:
        return status;
    }
  };

  if (isOffline) {
    return (
      <div className="page-content dashboard-offline-page">
        <div className="dashboard-offline-message">
          <AlertTriangle size={42} />
          <div className="dashboard-offline-copy">
            <h4>{t.errorTitle}</h4>
            <p>{t.offlineMessage}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="page-content"
      style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}
    >
      {/* Alert Banner */}
      {!isOffline && errorMsg && (
        <div className="rules-warning-banner" style={{ margin: 0 }}>
          <AlertTriangle size={24} />
          <div>
            <h4 style={{ fontWeight: "bold" }}>{t.errorTitle}</h4>
            <p style={{ fontSize: "0.9rem" }}>{errorMsg}</p>
          </div>
        </div>
      )}

      {successMsg && (
        <div
          className="rules-warning-banner"
          style={{
            margin: 0,
            backgroundColor: "rgba(76, 175, 80, 0.08)",
            borderColor: "var(--success-color)",
          }}
        >
          <CheckCircle size={24} style={{ color: "var(--success-color)" }} />
          <div>
            <h4 style={{ fontWeight: "bold", color: "var(--success-color)" }}>
              {t.successTitle}
            </h4>
            <p style={{ fontSize: "0.9rem", color: "var(--text-primary)" }}>
              {successMsg}
            </p>
          </div>
        </div>
      )}

      <div className="dashboard-grid">
        {/* Left Column: Status, Temperatures, Upload */}
        <div
          style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}
        >
          {/* Card 1: Job Status & Control */}
          <div className="dashboard-card">
            <div className="card-title">
              <Sliders size={20} />
              <span>{t.printerState}</span>
              <div style={{ marginLeft: "auto" }} className="status-indicator">
                <div className={`status-dot ${state.print_state}`} />
                <span style={{ textTransform: "capitalize" }}>
                  {getStatusText(state.print_state)}
                </span>
              </div>
            </div>

            <div className="job-info-grid">
              <div>
                <span className="label">{t.currentFile}</span>
                <span className="val" style={{ wordBreak: "break-all" }}>
                  {state.filename || "N/A"}
                </span>
              </div>
              <div>
                <span className="label">{t.progress}</span>
                <span className="val">{state.progress.toFixed(1)}%</span>
              </div>
              <div>
                <span className="label">{t.elapsedTime}</span>
                <span className="val">{formatTime(state.elapsed_time)}</span>
              </div>
              <div>
                <span className="label">
                  {t.timeLeft}{" "}
                  <span style={{ fontSize: "0.75rem", opacity: 0.7 }}>
                    ({t.estimated})
                  </span>
                </span>
                <span className="val">
                  {state.time_left !== undefined
                    ? formatTime(state.time_left)
                    : "N/A"}
                </span>
              </div>
            </div>

            {/* Print Progress Bar */}
            {(isPrinting || isPaused) && (
              <div style={{ marginTop: "1rem" }}>
                <div className="progress-bar-bg">
                  <div
                    className="progress-bar-fill"
                    style={{ width: `${state.progress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div style={{ display: "flex", gap: "10px", marginTop: "1.5rem" }}>
              {isPrinting && (
                <button
                  className="btn btn-primary"
                  onClick={onPause}
                  disabled={isOffline}
                >
                  <Pause size={16} /> Pause
                </button>
              )}
              {isPaused && (
                <button
                  className="btn btn-primary"
                  onClick={onResume}
                  disabled={isOffline}
                >
                  <Play size={16} /> {t.btnResume}
                </button>
              )}
              {(isPrinting || isPaused) && (
                <button
                  className="btn btn-danger"
                  onClick={onCancel}
                  disabled={isOffline}
                >
                  <Square size={16} /> {t.btnCancel}
                </button>
              )}
              {!isPrinting && !isPaused && uploadedFile && (
                <button
                  className="btn btn-primary"
                  onClick={handleStartPrint}
                  disabled={isOffline}
                >
                  <Play size={16} /> {t.btnStartPrint}
                </button>
              )}
            </div>
          </div>

          {/* Card 2: Temperatures & Preheat */}
          <div className="dashboard-card">
            <div className="card-title">
              <Thermometer size={20} />
              <span>{t.tempPreheat}</span>
            </div>

            <div className="temperatures-container">
              <div className="temp-gauge">
                <div
                  style={{
                    fontSize: "0.85rem",
                    color: "var(--text-secondary)",
                  }}
                >
                  Hotend
                </div>
                <div className="temp-val">{state.hotend_temp.toFixed(1)}°C</div>
                <div className="temp-target">
                  {t.timeLeft.split(" ")[0]} {t.estimated}:{" "}
                  {state.hotend_target.toFixed(0)}°C
                </div>
              </div>
              <div className="temp-gauge">
                <div
                  style={{
                    fontSize: "0.85rem",
                    color: "var(--text-secondary)",
                  }}
                >
                  {lang === "ro" ? "Pat" : "Bed"}
                </div>
                <div className="temp-val">{state.bed_temp.toFixed(1)}°C</div>
                <div className="temp-target">
                  {t.timeLeft.split(" ")[0]} {t.estimated}:{" "}
                  {state.bed_target.toFixed(0)}°C
                </div>
              </div>
            </div>

            <div>
              <div
                style={{
                  fontSize: "0.9rem",
                  marginBottom: "8px",
                  fontWeight: "500",
                }}
              >
                {t.preheatPresets}:
              </div>
              <div className="control-grid">
                {config &&
                  Object.keys(config.preheat_presets).map((preset) => (
                    <button
                      key={preset}
                      className="btn"
                      disabled={isOffline || isPrinting}
                      onClick={() => handlePreheatPreset(preset)}
                    >
                      {preset.toUpperCase()} (
                      {config.preheat_presets[preset].hotend}/
                      {config.preheat_presets[preset].bed})
                    </button>
                  ))}
                <button
                  className="btn btn-danger"
                  disabled={isOffline || isPrinting}
                  onClick={() => handlePreheatPreset("cooldown")}
                >
                  {t.cooldown}
                </button>
              </div>
            </div>
          </div>

          {/* Card 3: G-Code Upload */}
          <div className="dashboard-card">
            <div className="card-title">
              <Upload size={20} />
              <span>{t.uploadTitle}</span>
            </div>

            <label
              className={`upload-dropzone ${isOffline || isPrinting ? "disabled" : ""}`}
            >
              <input
                type="file"
                accept=".gcode,.gco"
                style={{ display: "none" }}
                onChange={handleFileChange}
                disabled={isOffline || isPrinting}
              />
              <Upload size={32} style={{ opacity: 0.7 }} />
              <div style={{ fontWeight: "500" }}>{t.uploadPlaceholder}</div>
              <div
                style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}
              >
                {t.uploadLimits.replace(
                  "{max}",
                  (config?.limits.max_upload_mb || 250).toString(),
                )}
              </div>
            </label>

            {uploadProgress !== null && (
              <div className="upload-progress-container">
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "0.85rem",
                  }}
                >
                  <span>{t.uploading}</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="progress-bar-bg">
                  <div
                    className="progress-bar-fill"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Jog Controls, Macros, Speed Factor */}
        <div
          style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}
        >
          {/* Card 4: Movement / Jog */}
          <div className="dashboard-card">
            <div className="card-title">
              <Move size={20} />
              <span>{t.jogTitle}</span>
            </div>

            <div className="jog-controls">
              {/* Step Size Selector */}
              <div style={{ display: "flex", gap: "6px", fontSize: "0.85rem" }}>
                {[0.1, 1.0, 10.0].map((size) => (
                  <button
                    key={size}
                    className={`btn-step-size ${stepSize === size ? "active" : ""}`}
                    onClick={() => setStepSize(size)}
                    disabled={
                      isOffline || size > (config?.limits.max_jog_step ?? 10.0)
                    }
                  >
                    {size} mm
                  </button>
                ))}
              </div>

              {/* X/Y Cross */}
              <div className="jog-cross">
                <button
                  style={{ gridArea: "yplus" }}
                  className="btn"
                  disabled={!canMove}
                  onClick={() => handleJogAction("y", 1)}
                >
                  Y+
                </button>
                <button
                  style={{ gridArea: "xminus" }}
                  className="btn"
                  disabled={!canMove}
                  onClick={() => handleJogAction("x", -1)}
                >
                  X-
                </button>
                <button
                  style={{
                    gridArea: "home",
                    backgroundColor: "var(--accent-light)",
                    borderColor: "var(--accent-color)",
                  }}
                  className="btn"
                  disabled={!canMove || !config?.limits.allow_home_for_guests}
                  onClick={handleHomeAction}
                >
                  G28
                </button>
                <button
                  style={{ gridArea: "xplus" }}
                  className="btn"
                  disabled={!canMove}
                  onClick={() => handleJogAction("x", 1)}
                >
                  X+
                </button>
                <button
                  style={{ gridArea: "yminus" }}
                  className="btn"
                  disabled={!canMove}
                  onClick={() => handleJogAction("y", -1)}
                >
                  Y-
                </button>
              </div>

              {/* Z Buttons */}
              <div className="jog-z">
                <button
                  className="btn"
                  disabled={!canMove}
                  onClick={() => handleJogAction("z", 1)}
                >
                  Z+
                </button>
                <button
                  className="btn"
                  disabled={!canMove}
                  onClick={() => handleJogAction("z", -1)}
                >
                  Z-
                </button>
              </div>
            </div>
          </div>

          {/* Card 5: Whitelisted Macros */}
          <div className="dashboard-card">
            <div className="card-title">
              <Sliders size={20} />
              <span>{t.macrosTitle}</span>
            </div>

            <div
              className="control-grid"
              style={{ gridTemplateColumns: "1fr" }}
            >
              {config &&
                config.allowed_macros.map((macro) => (
                  <button
                    key={macro}
                    className="btn"
                    disabled={isOffline || isPrinting}
                    onClick={() => handleMacroAction(macro)}
                    style={{ justifyContent: "flex-start" }}
                  >
                    ▶ {macro}
                  </button>
                ))}
              {(!config || config.allowed_macros.length === 0) && (
                <span
                  style={{
                    fontSize: "0.85rem",
                    color: "var(--text-secondary)",
                  }}
                >
                  {t.macrosNone}
                </span>
              )}
            </div>
          </div>

          {/* Card 6: Speed Factor Adjustment */}
          <div className="dashboard-card">
            <div className="card-title">
              <Sliders size={20} />
              <span>{t.speedFactorTitle}</span>
            </div>

            <div
              style={{ display: "flex", flexDirection: "column", gap: "8px" }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "0.9rem",
                }}
              >
                <span>{lang === "ro" ? "Viteza:" : "Speed:"}</span>
                <span
                  style={{ fontWeight: "bold", color: "var(--accent-color)" }}
                >
                  {speedVal}%
                </span>
              </div>
              <input
                type="range"
                min="10"
                max={config?.limits.max_speed_factor || 500}
                value={speedVal}
                onChange={(e) =>
                  handleSpeedFactorChange(Number(e.target.value))
                }
                disabled={isOffline}
                style={{
                  width: "100%",
                  accentColor: "var(--accent-color)",
                  cursor: isOffline ? "default" : "pointer",
                }}
              />
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  className="btn"
                  style={{ flex: 1, padding: "4px" }}
                  disabled={isOffline}
                  onClick={() =>
                    handleSpeedFactorChange(Math.max(10, speedVal - 10))
                  }
                >
                  -10%
                </button>
                <button
                  className="btn"
                  style={{ flex: 1, padding: "4px" }}
                  disabled={isOffline}
                  onClick={() => handleSpeedFactorChange(100)}
                >
                  Reset (100%)
                </button>
                <button
                  className="btn"
                  style={{ flex: 1, padding: "4px" }}
                  disabled={isOffline}
                  onClick={() =>
                    handleSpeedFactorChange(
                      Math.min(
                        config?.limits.max_speed_factor || 500,
                        speedVal + 10,
                      ),
                    )
                  }
                >
                  +10%
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

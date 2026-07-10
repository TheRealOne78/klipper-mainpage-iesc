import React from "react";
import type { Dispatch, SetStateAction, RefObject } from "react";
import {
  AlertTriangle,
  Globe,
  LayoutGrid,
  Menu,
  Moon,
  Power,
  RefreshCw,
  Save,
  Server,
  Sun,
  Upload,
} from "lucide-react";
import { LANGUAGES, type Lang } from "../../translations";
import type { PowerDevice, PrinterState } from "../../printerTypes";
import type { Translations } from "../../translations";
import { AUTO_THEME, THEMES } from "../../lib/themes";

interface AppHeaderProps {
  t: Translations;
  sidebarOpen: boolean;
  setSidebarOpen: Dispatch<SetStateAction<boolean>>;
  handleSidebarLinkClick: (pageName: string, elementId?: string) => void;
  logoSrc: string;
  appName: string;
  canUpload: boolean;
  handleNavUploadClick: () => void;
  isOfflineOrNotReady: boolean;
  fileInputRef: RefObject<HTMLInputElement | null>;
  handleNavUploadFile: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleEmergencyStopClick: () => Promise<void>;
  isOffline: boolean;
  page: string;
  editLayout: boolean;
  setEditLayout: Dispatch<SetStateAction<boolean>>;
  langSelectorRef: RefObject<HTMLDivElement | null>;
  langDropdownOpen: boolean;
  setLangDropdownOpen: Dispatch<SetStateAction<boolean>>;
  lang: Lang;
  setLang: (lang: Lang) => void;
  theme: string;
  themeMode: "light" | "dark";
  onSelectTheme: (id: string) => void;
  themeMenuOpen: boolean;
  setThemeMenuOpen: Dispatch<SetStateAction<boolean>>;
  themeMenuRef: RefObject<HTMLDivElement | null>;
  powerMenuHasItems: boolean;
  powerMenuRef: RefObject<HTMLDivElement | null>;
  powerMenuOpen: boolean;
  setPowerMenuOpen: Dispatch<SetStateAction<boolean>>;
  navPowerError: string | null;
  canControlMachine: boolean;
  navPowerBusy: string | null;
  runPowerAction: (id: string, action: () => Promise<any>) => Promise<void>;
  runMacro: (name: string) => Promise<any>;
  visiblePowerDevices: PowerDevice[];
  canTogglePowerDevice: (device: { device: string }) => boolean;
  togglePowerDevice: (device: string) => Promise<void>;
  powerDeviceLabel: (device: { device: string; type?: string }) => string;
  printerState: PrinterState;
  navServices: string[];
  serviceAction: (
    service: string,
    action: "restart" | "start" | "stop",
  ) => Promise<any>;
  hostReboot: () => Promise<any>;
  hostShutdown: () => Promise<any>;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  t,
  sidebarOpen,
  setSidebarOpen,
  handleSidebarLinkClick,
  logoSrc,
  appName,
  canUpload,
  handleNavUploadClick,
  isOfflineOrNotReady,
  fileInputRef,
  handleNavUploadFile,
  handleEmergencyStopClick,
  isOffline,
  page,
  editLayout,
  setEditLayout,
  langSelectorRef,
  langDropdownOpen,
  setLangDropdownOpen,
  lang,
  setLang,
  theme,
  themeMode,
  onSelectTheme,
  themeMenuOpen,
  setThemeMenuOpen,
  themeMenuRef,
  powerMenuHasItems,
  powerMenuRef,
  powerMenuOpen,
  setPowerMenuOpen,
  navPowerError,
  canControlMachine,
  navPowerBusy,
  runPowerAction,
  runMacro,
  visiblePowerDevices,
  canTogglePowerDevice,
  togglePowerDevice,
  powerDeviceLabel,
  printerState,
  navServices,
  serviceAction,
  hostReboot,
  hostShutdown,
}) => (
  <header>
    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
      <button
        className="btn-menu-toggle"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        title={t.sidebarToggle}
      >
        <Menu size={20} />
      </button>

      <div
        className="logo-container"
        onClick={() => handleSidebarLinkClick("dashboard")}
        style={{ cursor: "pointer" }}
      >
        <img
          src={logoSrc}
          alt={appName}
          className="logo-img"
          style={{ height: "45px" }}
        />
        <div className="app-title-group" style={{ marginLeft: "8px" }}>
          <h1 style={{ fontSize: "1.1rem" }}>{appName}</h1>
        </div>
      </div>
    </div>

    <div className="header-controls">
      {/* Upload GCode Button in Header */}
      {canUpload && (
        <>
          <button
            className="btn btn-upload-nav"
            onClick={handleNavUploadClick}
            disabled={isOfflineOrNotReady}
          >
            <Upload size={16} />
            <span className="hide-mobile">G-code</span>
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleNavUploadFile}
            accept=".gcode,.gco"
            style={{ display: "none" }}
            disabled={isOfflineOrNotReady}
          />
        </>
      )}

      {/* Emergency Stop Button in Header */}
      <button
        className="btn btn-danger btn-estop"
        onClick={handleEmergencyStopClick}
        disabled={isOffline}
      >
        <AlertTriangle size={16} />
        {t.emergencyStop}
      </button>

      {/* Rearrange dashboard cards (dashboard only) */}
      {page === "dashboard" && (
        <button
          className={`btn-theme-toggle${editLayout ? " active" : ""}`}
          onClick={() => setEditLayout((v) => !v)}
          title={t.layoutHint}
        >
          <LayoutGrid size={18} />
        </button>
      )}

      {/* Language selection dropdown icon */}
      <div
        className="lang-selector-container"
        style={{ position: "relative" }}
        ref={langSelectorRef}
      >
        <button
          className="btn-lang-toggle"
          onClick={() => setLangDropdownOpen(!langDropdownOpen)}
          style={{
            background: "transparent",
            border: "1px solid var(--border-color)",
            color: "var(--text-primary)",
            padding: "8px",
            borderRadius: "50%",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          title={t.languageSelect}
        >
          <Globe size={18} />
        </button>
        {langDropdownOpen && (
          <div
            className="lang-dropdown"
            style={{
              position: "absolute",
              top: "100%",
              right: 0,
              marginTop: "8px",
              backgroundColor: "var(--surface-color)",
              border: "1px solid var(--border-color)",
              borderRadius: "var(--border-radius)",
              boxShadow: "0 4px 12px var(--shadow-color)",
              zIndex: 20,
              display: "flex",
              flexDirection: "column",
              minWidth: "120px",
              overflow: "hidden",
            }}
          >
            {LANGUAGES.map((option) => (
              <button
                key={option.code}
                onClick={() => {
                  setLang(option.code);
                  localStorage.setItem("lang", option.code);
                  setLangDropdownOpen(false);
                }}
                style={{
                  padding: "10px 16px",
                  background: "none",
                  border: "none",
                  color: "var(--text-primary)",
                  textAlign: "left",
                  cursor: "pointer",
                  fontWeight: lang === option.code ? "bold" : "normal",
                  backgroundColor:
                    lang === option.code
                      ? "var(--accent-light)"
                      : "transparent",
                }}
              >
                {option.label} ({option.code.toUpperCase()})
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Theme selection dropdown */}
      <div
        className="theme-selector-container"
        style={{ position: "relative" }}
        ref={themeMenuRef}
      >
        <button
          className="btn-theme-toggle"
          onClick={() => setThemeMenuOpen((v) => !v)}
          title={t.themeSelect}
        >
          {themeMode === "dark" ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        {themeMenuOpen && (
          <div
            className="theme-dropdown"
            style={{
              position: "absolute",
              top: "100%",
              right: 0,
              marginTop: "8px",
              backgroundColor: "var(--surface-color)",
              border: "1px solid var(--border-color)",
              borderRadius: "var(--border-radius)",
              boxShadow: "0 4px 12px var(--shadow-color)",
              zIndex: 20,
              display: "flex",
              flexDirection: "column",
              minWidth: "180px",
              maxHeight: "min(420px, 70vh)",
              overflowY: "auto",
            }}
          >
            <button
              key={AUTO_THEME}
              onClick={() => onSelectTheme(AUTO_THEME)}
              style={{
                padding: "10px 16px",
                background: "none",
                border: "none",
                color: "var(--text-primary)",
                textAlign: "left",
                cursor: "pointer",
                fontWeight: theme === AUTO_THEME ? "bold" : "normal",
                backgroundColor:
                  theme === AUTO_THEME ? "var(--accent-light)" : "transparent",
              }}
            >
              {t.themeAuto}
            </button>
            <div
              style={{
                borderTop: "1px solid var(--border-color)",
                margin: "2px 0",
              }}
            />
            {THEMES.map((option) => (
              <button
                key={option.id}
                onClick={() => onSelectTheme(option.id)}
                style={{
                  padding: "10px 16px",
                  background: "none",
                  border: "none",
                  color: "var(--text-primary)",
                  textAlign: "left",
                  cursor: "pointer",
                  fontWeight: theme === option.id ? "bold" : "normal",
                  backgroundColor:
                    theme === option.id ? "var(--accent-light)" : "transparent",
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {powerMenuHasItems && (
        <div className="nav-power-wrap" ref={powerMenuRef}>
          <button
            className={`btn-theme-toggle nav-power-button${powerMenuOpen ? " active" : ""}`}
            onClick={() => setPowerMenuOpen((open) => !open)}
            title={t.powerTitle}
          >
            <Power size={18} />
          </button>
          {powerMenuOpen && (
            <div className="nav-power-menu">
              {navPowerError && (
                <div className="nav-power-error">
                  <AlertTriangle size={14} /> {navPowerError}
                </div>
              )}

              {canControlMachine && (
                <div className="nav-power-section">
                  <div className="nav-power-heading">Klipper</div>
                  <button
                    className="nav-power-row"
                    disabled={navPowerBusy !== null || isOfflineOrNotReady}
                    onClick={() =>
                      void runPowerAction("klipper:restart", () =>
                        runMacro("RESTART"),
                      )
                    }
                  >
                    <span>
                      <RefreshCw size={15} /> RESTART
                    </span>
                  </button>
                  <button
                    className="nav-power-row"
                    disabled={navPowerBusy !== null || isOfflineOrNotReady}
                    onClick={() =>
                      void runPowerAction("klipper:firmware", () =>
                        runMacro("FIRMWARE_RESTART"),
                      )
                    }
                  >
                    <span>
                      <RefreshCw size={15} /> FIRMWARE_RESTART
                    </span>
                  </button>
                  <button
                    className="nav-power-row"
                    disabled={navPowerBusy !== null || isOfflineOrNotReady}
                    onClick={() =>
                      void runPowerAction("klipper:save", () =>
                        runMacro("SAVE_CONFIG"),
                      )
                    }
                  >
                    <span>
                      <Save size={15} /> SAVE_CONFIG
                    </span>
                  </button>
                </div>
              )}

              {visiblePowerDevices.length > 0 && (
                <div className="nav-power-section">
                  <div className="nav-power-heading">{t.powerDevicesHeading}</div>
                  {visiblePowerDevices.map((device) => {
                    const isOn = device.status === "on";
                    return (
                      <button
                        key={device.device}
                        className="nav-power-row"
                        disabled={
                          !canTogglePowerDevice(device) ||
                          navPowerBusy !== null ||
                          // locked_while_printing only blocks DURING an active
                          // print, not permanently (Moonraker config flag).
                          (device.locked_while_printing &&
                            printerState.print_state === "printing")
                        }
                        onClick={() => void togglePowerDevice(device.device)}
                      >
                        <span>
                          <Power size={15} />
                          {powerDeviceLabel(device)}
                        </span>
                        <span
                          className={`nav-power-state ${isOn ? "on" : "off"}`}
                        >
                          {navPowerBusy === device.device
                            ? "..."
                            : device.status}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {canControlMachine && navServices.length > 0 && (
                <div className="nav-power-section">
                  <div className="nav-power-heading">{t.servicesHeading}</div>
                  {navServices.map((service) => (
                    <div
                      className="nav-service-row"
                      key={service}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "4px",
                        padding: "6px 4px",
                      }}
                    >
                      <span
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          fontSize: "0.85rem",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        <Server size={15} /> {service}
                      </span>
                      <div style={{ display: "flex", gap: "4px" }}>
                        {(["restart", "start", "stop"] as const).map(
                          (action) => (
                            <button
                              key={action}
                              disabled={navPowerBusy !== null}
                              onClick={() =>
                                void runPowerAction(
                                  `service:${service}:${action}`,
                                  () => serviceAction(service, action),
                                )
                              }
                              style={{
                                flex: 1,
                                minWidth: 0,
                                padding: "3px 4px",
                                fontSize: "0.72rem",
                                textTransform: "capitalize",
                                borderRadius: "4px",
                                border: "1px solid var(--border-color)",
                                background: "var(--bg-color)",
                                color: "var(--text-primary)",
                                cursor: "pointer",
                              }}
                            >
                              {action}
                            </button>
                          ),
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {canControlMachine && (
                <div className="nav-power-section">
                  <div className="nav-power-heading">{t.hostHeading}</div>
                  <button
                    className="nav-power-row"
                    disabled={navPowerBusy !== null}
                    onClick={() =>
                      void runPowerAction("host:reboot", hostReboot)
                    }
                  >
                    <span>
                      <Power size={15} /> {t.rebootHost}
                    </span>
                  </button>
                  <button
                    className="nav-power-row danger"
                    disabled={navPowerBusy !== null}
                    onClick={() =>
                      void runPowerAction("host:shutdown", hostShutdown)
                    }
                  >
                    <span>
                      <Power size={15} /> {t.shutdownHost}
                    </span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

    </div>
  </header>
);

import React from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  Crosshair,
  Grid3X3,
  Home,
  MoreVertical,
  Move,
  Settings,
  Unlock,
} from "lucide-react";
import { CollapseButton, setStoredBool } from "../CollapseButton";
import type { PrinterState } from "../../../printerTypes";
import type { Translations } from "../../../translations";

interface ToolheadCardProps {
  t: Translations;
  state: PrinterState;
  canControlToolhead: boolean;
  isPrinting: boolean;
  toolheadActionsRef: React.RefObject<HTMLDivElement | null>;
  toolheadActionsOpen: boolean;
  setToolheadActionsOpen: Dispatch<SetStateAction<boolean>>;
  handleDisableMotors: () => Promise<void>;
  unlockMotorsDisabled: boolean;
  hasHomePermission: boolean;
  handleHomeAction: (axis?: string) => Promise<void>;
  canMove: boolean;
  toolheadSettingsRef: React.RefObject<HTMLDivElement | null>;
  toolheadSettingsOpen: boolean;
  setToolheadSettingsOpen: Dispatch<SetStateAction<boolean>>;
  showToolheadPosition: boolean;
  setShowToolheadPosition: Dispatch<SetStateAction<boolean>>;
  showToolheadCoordinates: boolean;
  setShowToolheadCoordinates: Dispatch<SetStateAction<boolean>>;
  showToolheadControl: boolean;
  setShowToolheadControl: Dispatch<SetStateAction<boolean>>;
  showToolheadZOffset: boolean;
  setShowToolheadZOffset: Dispatch<SetStateAction<boolean>>;
  showToolheadSpeedFactor: boolean;
  setShowToolheadSpeedFactor: Dispatch<SetStateAction<boolean>>;
  toolheadCollapsed: boolean;
  setToolheadCollapsed: Dispatch<SetStateAction<boolean>>;
  positionMode: "absolute" | "relative";
  activeMeshProfile: string;
  renderAxisInput: (
    axis: "x" | "y" | "z",
    label: string,
    index: number,
    isHomed: boolean,
  ) => React.ReactNode;
  isXHomed: boolean;
  isYHomed: boolean;
  isZHomed: boolean;
  allHomed: boolean;
  handleJogAction: (axis: string, distance: number) => Promise<void>;
}

export const ToolheadCard: React.FC<ToolheadCardProps> = ({
  t,
  state,
  canControlToolhead,
  isPrinting,
  toolheadActionsRef,
  toolheadActionsOpen,
  setToolheadActionsOpen,
  handleDisableMotors,
  unlockMotorsDisabled,
  hasHomePermission,
  handleHomeAction,
  canMove,
  toolheadSettingsRef,
  toolheadSettingsOpen,
  setToolheadSettingsOpen,
  showToolheadPosition,
  setShowToolheadPosition,
  showToolheadCoordinates,
  setShowToolheadCoordinates,
  showToolheadControl,
  setShowToolheadControl,
  showToolheadZOffset,
  setShowToolheadZOffset,
  showToolheadSpeedFactor,
  setShowToolheadSpeedFactor,
  toolheadCollapsed,
  setToolheadCollapsed,
  positionMode,
  activeMeshProfile,
  renderAxisInput,
  isXHomed,
  isYHomed,
  isZHomed,
  allHomed,
  handleJogAction,
}) => (
  <div className="dashboard-card toolhead-card">
    <div className="card-title">
      <Move size={20} />
      <span>{t.toolhead}</span>
      <div
        className="panel-header-actions"
        style={{
          marginLeft: "auto",
          display: "flex",
          color: "var(--text-secondary)",
        }}
      >
        {canControlToolhead && (
          <>
        <div ref={toolheadActionsRef} className="panel-menu-wrap">
          <button
            className="icon-button"
            disabled={isPrinting}
            title={t.actions}
            onClick={() => setToolheadActionsOpen((open) => !open)}
          >
            <MoreVertical size={18} />
          </button>
          {toolheadActionsOpen && (
            <div className="panel-menu">
              <button
                onClick={() => {
                  handleDisableMotors();
                  setToolheadActionsOpen(false);
                }}
                disabled={unlockMotorsDisabled}
              >
                <Unlock size={14} /> {t.unlockMotors}
              </button>
              {hasHomePermission && (
                <button
                  onClick={() => {
                    handleHomeAction("home");
                    setToolheadActionsOpen(false);
                  }}
                  disabled={!canMove}
                >
                  <Home size={14} /> {t.homeAll}
                </button>
              )}
            </div>
          )}
        </div>
        <div ref={toolheadSettingsRef} className="panel-menu-wrap">
          <button
            className="icon-button"
            title={t.toolheadSettings}
            onClick={() => setToolheadSettingsOpen((open) => !open)}
          >
            <Settings size={18} />
          </button>
          {toolheadSettingsOpen && (
            <div className="panel-menu">
              <label>
                <input
                  type="checkbox"
                  checked={showToolheadPosition}
                  onChange={() =>
                    setStoredBool(
                      "showToolheadPosition",
                      setShowToolheadPosition,
                    )
                  }
                />
                {t.positionOutput}
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={showToolheadCoordinates}
                  onChange={() =>
                    setStoredBool(
                      "showToolheadCoordinates",
                      setShowToolheadCoordinates,
                    )
                  }
                />
                {t.coordinateFields}
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={showToolheadControl}
                  onChange={() =>
                    setStoredBool(
                      "showToolheadControl",
                      setShowToolheadControl,
                    )
                  }
                />
                {t.controlButtons}
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={showToolheadZOffset}
                  onChange={() =>
                    setStoredBool(
                      "showToolheadZOffset",
                      setShowToolheadZOffset,
                    )
                  }
                />
                {t.zOffsetSetting}
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={showToolheadSpeedFactor}
                  onChange={() =>
                    setStoredBool(
                      "showToolheadSpeedFactor",
                      setShowToolheadSpeedFactor,
                    )
                  }
                />
                {t.speedFactorSetting}
              </label>
            </div>
          )}
        </div>
          </>
        )}
        <CollapseButton
          collapsed={toolheadCollapsed}
          storageKey="toolheadCollapsed"
          setter={setToolheadCollapsed}
          t={t}
        />
      </div>
    </div>

    {!toolheadCollapsed && showToolheadPosition && (
    <div className="toolhead-status-row">
      <div className="toolhead-position-mode">
        <Crosshair size={14} />
        <span>
          {t.position}:{" "}
          {positionMode === "absolute"
            ? t.positionAbsolute
            : t.positionRelative}
        </span>
      </div>
      {activeMeshProfile && (
        <div className="toolhead-mesh-profile">
          <Grid3X3 size={14} />
          <span>{activeMeshProfile}</span>
        </div>
      )}
    </div>
    )}

    {!toolheadCollapsed && showToolheadCoordinates && (
    <div className="toolhead-coordinate-grid">
      {renderAxisInput("x", "X", 0, isXHomed)}
      {renderAxisInput("y", "Y", 1, isYHomed)}
      {renderAxisInput("z", "Z", 2, isZHomed)}
    </div>
    )}

    {!toolheadCollapsed && showToolheadControl && canControlToolhead && (
    <div
      className="toolhead-controls-grid"
      style={{ marginTop: "1rem" }}
    >
      <div className="toolhead-main-actions">
        {hasHomePermission && (
          <button
            className={`btn btn-secondary ${allHomed ? "homed" : ""}`}
            onClick={() => handleHomeAction("home")}
            disabled={!canMove}
          >
            <Home size={16} /> {t.all}
          </button>
        )}
        <button
          className="btn btn-secondary"
          onClick={handleDisableMotors}
          disabled={unlockMotorsDisabled}
        >
          <Unlock size={16} /> {t.unlockMotors}
        </button>
      </div>

      {/* Row 1: X Axis Controls */}
      <div className="toolhead-control-row">
        <div className="step-buttons">
          <button
            className="btn btn-step"
            disabled={!canMove || !allHomed}
            onClick={() => handleJogAction("x", -100)}
          >
            -100
          </button>
          <button
            className="btn btn-step"
            disabled={!canMove || !allHomed}
            onClick={() => handleJogAction("x", -10)}
          >
            -10
          </button>
          <button
            className="btn btn-step"
            disabled={!canMove || !allHomed}
            onClick={() => handleJogAction("x", -1)}
          >
            -1
          </button>
          {hasHomePermission && (
            <button
              className={`btn-axis-home ${isXHomed ? "homed" : ""}`}
              onClick={() => handleHomeAction("x")}
              disabled={!canMove}
            >
              X
            </button>
          )}
          <button
            className="btn btn-step"
            disabled={!canMove || !allHomed}
            onClick={() => handleJogAction("x", 1)}
          >
            +1
          </button>
          <button
            className="btn btn-step"
            disabled={!canMove || !allHomed}
            onClick={() => handleJogAction("x", 10)}
          >
            +10
          </button>
          <button
            className="btn btn-step"
            disabled={!canMove || !allHomed}
            onClick={() => handleJogAction("x", 100)}
          >
            +100
          </button>
        </div>
      </div>

      {/* Row 2: Y Axis Controls */}
      <div className="toolhead-control-row">
        <div className="step-buttons">
          <button
            className="btn btn-step"
            disabled={!canMove || !allHomed}
            onClick={() => handleJogAction("y", -100)}
          >
            -100
          </button>
          <button
            className="btn btn-step"
            disabled={!canMove || !allHomed}
            onClick={() => handleJogAction("y", -10)}
          >
            -10
          </button>
          <button
            className="btn btn-step"
            disabled={!canMove || !allHomed}
            onClick={() => handleJogAction("y", -1)}
          >
            -1
          </button>
          {hasHomePermission && (
            <button
              className={`btn-axis-home ${isYHomed ? "homed" : ""}`}
              onClick={() => handleHomeAction("y")}
              disabled={!canMove}
            >
              Y
            </button>
          )}
          <button
            className="btn btn-step"
            disabled={!canMove || !allHomed}
            onClick={() => handleJogAction("y", 1)}
          >
            +1
          </button>
          <button
            className="btn btn-step"
            disabled={!canMove || !allHomed}
            onClick={() => handleJogAction("y", 10)}
          >
            +10
          </button>
          <button
            className="btn btn-step"
            disabled={!canMove || !allHomed}
            onClick={() => handleJogAction("y", 100)}
          >
            +100
          </button>
        </div>
      </div>

      {/* Row 3: Z Axis Controls */}
      <div className="toolhead-control-row">
        <div className="step-buttons">
          <button
            className="btn btn-step"
            disabled={!canMove || !allHomed}
            onClick={() => handleJogAction("z", -25)}
          >
            -25
          </button>
          <button
            className="btn btn-step"
            disabled={!canMove || !allHomed}
            onClick={() => handleJogAction("z", -1)}
          >
            -1
          </button>
          <button
            className="btn btn-step"
            disabled={!canMove || !allHomed}
            onClick={() => handleJogAction("z", -0.1)}
          >
            -0.1
          </button>
          {hasHomePermission && (
            <button
              className={`btn-axis-home ${isZHomed ? "homed" : ""}`}
              onClick={() => handleHomeAction("z")}
              disabled={!canMove}
            >
              Z
            </button>
          )}
          <button
            className="btn btn-step"
            disabled={!canMove || !allHomed}
            onClick={() => handleJogAction("z", 0.1)}
          >
            +0.1
          </button>
          <button
            className="btn btn-step"
            disabled={!canMove || !allHomed}
            onClick={() => handleJogAction("z", 1)}
          >
            +1
          </button>
          <button
            className="btn btn-step"
            disabled={!canMove || !allHomed}
            onClick={() => handleJogAction("z", 25)}
          >
            +25
          </button>
        </div>
      </div>
    </div>
    )}

    {/* Z-Offset Section — control-only, hidden without control_toolhead. */}
    {!toolheadCollapsed && showToolheadZOffset && canControlToolhead && (
      <div
      className="toolhead-zoffset-section"
      style={{
        borderTop: "1px solid var(--border-color)",
        paddingTop: "1rem",
        marginTop: "1rem",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: "0.5rem",
          fontSize: "0.85rem",
        }}
      >
        <span>{t.zOffset}:</span>
        <span style={{ fontWeight: "bold" }}>
          {state.gcode_move?.homing_origin?.[2] !== undefined
            ? (-state.gcode_move.homing_origin[2]).toFixed(3)
            : "0.000"}{" "}
          mm
        </span>
      </div>
      <div
        className="zoffset-buttons-grid"
        style={{ display: "flex", flexDirection: "column", gap: "6px" }}
      >
        <div style={{ display: "flex", gap: "6px" }}>
          <button
            className="btn btn-step"
            style={{ flex: 1 }}
            disabled={!canMove || !allHomed}
            onClick={() => handleJogAction("z_offset", 0.005)}
          >
            +0.005
          </button>
          <button
            className="btn btn-step"
            style={{ flex: 1 }}
            disabled={!canMove || !allHomed}
            onClick={() => handleJogAction("z_offset", 0.01)}
          >
            +0.01
          </button>
          <button
            className="btn btn-step"
            style={{ flex: 1 }}
            disabled={!canMove || !allHomed}
            onClick={() => handleJogAction("z_offset", 0.025)}
          >
            +0.025
          </button>
          <button
            className="btn btn-step"
            style={{ flex: 1 }}
            disabled={!canMove || !allHomed}
            onClick={() => handleJogAction("z_offset", 0.05)}
          >
            +0.05
          </button>
        </div>
        <div style={{ display: "flex", gap: "6px" }}>
          <button
            className="btn btn-step"
            style={{ flex: 1 }}
            disabled={!canMove || !allHomed}
            onClick={() => handleJogAction("z_offset", -0.005)}
          >
            -0.005
          </button>
          <button
            className="btn btn-step"
            style={{ flex: 1 }}
            disabled={!canMove || !allHomed}
            onClick={() => handleJogAction("z_offset", -0.01)}
          >
            -0.01
          </button>
          <button
            className="btn btn-step"
            style={{ flex: 1 }}
            disabled={!canMove || !allHomed}
            onClick={() => handleJogAction("z_offset", -0.025)}
          >
            -0.025
          </button>
          <button
            className="btn btn-step"
            style={{ flex: 1 }}
            disabled={!canMove || !allHomed}
            onClick={() => handleJogAction("z_offset", -0.05)}
          >
            -0.05
          </button>
        </div>
      </div>
      </div>
    )}
  </div>
);

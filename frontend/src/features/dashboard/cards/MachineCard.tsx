import React from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  Crosshair,
  Power,
  PowerOff,
  RefreshCw,
  RotateCcw,
  Save,
  Wrench,
} from "lucide-react";
import { CollapseButton } from "../CollapseButton";
import { Select } from "../../../components/Select";
import type { Translations } from "../../../translations";

interface MachineCardProps {
  t: Translations;
  machineCollapsed: boolean;
  setMachineCollapsed: Dispatch<SetStateAction<boolean>>;
  machineBusy: string | null;
  isOffline: boolean;
  runMachineAction: (
    key: string,
    fn: () => Promise<any>,
    confirmMsg?: string,
  ) => Promise<void>;
  onRunMacro: (name: string) => Promise<any>;
  onHostReboot: () => Promise<any>;
  onHostShutdown: () => Promise<any>;
  services: string[];
  selectedService: string;
  setSelectedService: Dispatch<SetStateAction<string>>;
  onServiceAction: (
    service: string,
    action: "restart" | "start" | "stop",
  ) => Promise<any>;
  onGetEndstops: () => Promise<Record<string, string>>;
  endstops: Record<string, string> | null;
  setEndstops: Dispatch<SetStateAction<Record<string, string> | null>>;
}

export const MachineCard: React.FC<MachineCardProps> = ({
  t,
  machineCollapsed,
  setMachineCollapsed,
  machineBusy,
  isOffline,
  runMachineAction,
  onRunMacro,
  onHostReboot,
  onHostShutdown,
  services,
  selectedService,
  setSelectedService,
  onServiceAction,
  onGetEndstops,
  endstops,
  setEndstops,
}) => (
  <div className="dashboard-card machine-card">
    <div className="card-title">
      <Wrench size={20} />
      <span>{t.machine}</span>
      <div className="panel-header-actions" style={{ marginLeft: "auto" }}>
        <CollapseButton
          collapsed={machineCollapsed}
          storageKey="machineCollapsed"
          setter={setMachineCollapsed}
          t={t}
        />
      </div>
    </div>

    {!machineCollapsed && (
      <div className="machine-body">
        <button
          type="button"
          className="btn machine-btn"
          disabled={machineBusy !== null || isOffline}
          onClick={() =>
            void runMachineAction("fw", () => onRunMacro("FIRMWARE_RESTART"))
          }
        >
          <RefreshCw size={15} /> {t.btnFirmwareRestart}
        </button>
        <button
          type="button"
          className="btn machine-btn"
          disabled={machineBusy !== null || isOffline}
          onClick={() =>
            void runMachineAction("restart", () => onRunMacro("RESTART"))
          }
        >
          <RotateCcw size={15} /> {t.btnKlipperRestart}
        </button>
        <button
          type="button"
          className="btn machine-btn"
          disabled={machineBusy !== null || isOffline}
          onClick={() =>
            void runMachineAction("save", () => onRunMacro("SAVE_CONFIG"))
          }
        >
          <Save size={15} /> {t.machineSaveConfig}
        </button>
        <div className="machine-divider" />
        <button
          type="button"
          className="btn btn-danger machine-btn"
          disabled={machineBusy !== null}
          onClick={() =>
            void runMachineAction(
              "reboot",
              onHostReboot,
              t.confirmHostReboot,
            )
          }
        >
          <Power size={15} /> {t.machineHostReboot}
        </button>
        <button
          type="button"
          className="btn btn-danger machine-btn"
          disabled={machineBusy !== null}
          onClick={() =>
            void runMachineAction(
              "shutdown",
              onHostShutdown,
              t.confirmHostShutdown,
            )
          }
        >
          <PowerOff size={15} /> {t.machineHostShutdown}
        </button>

        {services.length > 0 && (
          <>
            <div className="machine-divider" />
            <div className="machine-service-row">
              <Select
                className="machine-service-select"
                value={selectedService}
                onChange={setSelectedService}
                options={services.map((svc) => ({ value: svc, label: svc }))}
              />
              <button
                type="button"
                className="btn machine-btn"
                disabled={machineBusy !== null || !selectedService}
                onClick={() =>
                  void runMachineAction(
                    "service",
                    () => onServiceAction(selectedService, "restart"),
                    `${t.machineServiceRestart}: ${selectedService}?`,
                  )
                }
              >
                <RotateCcw size={15} /> {t.machineServiceRestart}
              </button>
            </div>
          </>
        )}

        <div className="machine-divider" />
        <button
          type="button"
          className="btn machine-btn"
          disabled={machineBusy !== null || isOffline}
          onClick={() =>
            void runMachineAction("endstops", async () => {
              setEndstops(await onGetEndstops());
            })
          }
        >
          <Crosshair size={15} /> {t.machineQueryEndstops}
        </button>
        {endstops && (
          <div className="endstop-grid">
            {Object.entries(endstops).map(([axis, value]) => (
              <div className="endstop-item" key={axis}>
                <span className="endstop-axis">{axis}</span>
                <span
                  className={`endstop-state ${
                    value === "TRIGGERED" ? "triggered" : "open"
                  }`}
                >
                  {value}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    )}
  </div>
);

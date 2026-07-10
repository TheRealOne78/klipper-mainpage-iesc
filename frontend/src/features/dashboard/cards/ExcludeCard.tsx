import React from "react";
import type { Dispatch, SetStateAction } from "react";
import { Crosshair } from "lucide-react";
import { CollapseButton } from "../CollapseButton";
import type { Translations } from "../../../translations";

interface ExcludeCardProps {
  t: Translations;
  excludeCollapsed: boolean;
  setExcludeCollapsed: Dispatch<SetStateAction<boolean>>;
  excludeObjectNames: string[];
  excludedObjects: string[];
  excludeBusy: string | null;
  isOfflineOrNotReady: boolean;
  canControlPrint: boolean;
  excludeObject: (name: string) => Promise<void>;
}

export const ExcludeCard: React.FC<ExcludeCardProps> = ({
  t,
  excludeCollapsed,
  setExcludeCollapsed,
  excludeObjectNames,
  excludedObjects,
  excludeBusy,
  isOfflineOrNotReady,
  canControlPrint,
  excludeObject,
}) => (
  <div className="dashboard-card exclude-card">
    <div className="card-title">
      <Crosshair size={20} />
      <span>{t.excludeObjects}</span>
      <div className="panel-header-actions" style={{ marginLeft: "auto" }}>
        <CollapseButton
          collapsed={excludeCollapsed}
          storageKey="excludeCollapsed"
          setter={setExcludeCollapsed}
          t={t}
        />
      </div>
    </div>

    {!excludeCollapsed && (
      <div className="exclude-body">
        {excludeObjectNames.map((name) => {
          const isExcluded = excludedObjects.includes(name);
          return (
            <div className="exclude-row" key={name}>
              <span
                className={`exclude-name ${isExcluded ? "excluded" : ""}`}
                title={name}
              >
                {name}
              </span>
              <button
                type="button"
                className="btn btn-compact btn-danger"
                disabled={
                  isExcluded ||
                  excludeBusy !== null ||
                  isOfflineOrNotReady ||
                  !canControlPrint
                }
                onClick={() => void excludeObject(name)}
              >
                {isExcluded ? t.excludeDone : t.excludeAction}
              </button>
            </div>
          );
        })}
      </div>
    )}
  </div>
);

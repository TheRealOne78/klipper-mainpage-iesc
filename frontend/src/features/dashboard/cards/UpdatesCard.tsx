import React from "react";
import type { Dispatch, SetStateAction } from "react";
import { AlertTriangle, Package } from "lucide-react";
import { CollapseButton } from "../CollapseButton";
import type { UpdateComponent } from "../../../printerTypes";
import type { Translations } from "../../../translations";

interface UpdatesCardProps {
  t: Translations;
  updatesCollapsed: boolean;
  setUpdatesCollapsed: Dispatch<SetStateAction<boolean>>;
  updateError: string | null;
  updateComponents: UpdateComponent[] | null;
  updateBusy: string | null;
  runUpdate: (name: string) => Promise<void>;
}

export const UpdatesCard: React.FC<UpdatesCardProps> = ({
  t,
  updatesCollapsed,
  setUpdatesCollapsed,
  updateError,
  updateComponents,
  updateBusy,
  runUpdate,
}) => (
  <div className="dashboard-card updates-card">
    <div className="card-title">
      <Package size={20} />
      <span>{t.updates}</span>
      <div className="panel-header-actions" style={{ marginLeft: "auto" }}>
        <CollapseButton
          collapsed={updatesCollapsed}
          storageKey="updatesCollapsed"
          setter={setUpdatesCollapsed}
          t={t}
        />
      </div>
    </div>

    {!updatesCollapsed && (
      <div className="updates-body">
        {updateError ? (
          <div className="updates-error">
            <AlertTriangle size={14} /> {updateError}
          </div>
        ) : !updateComponents ? (
          <div className="list-empty-state">{t.updatesLoading}</div>
        ) : updateComponents.length === 0 ? (
          <div className="list-empty-state">{t.updatesEmpty}</div>
        ) : (
          updateComponents.map((comp) => {
            const behind =
              (comp.remote_version &&
                comp.version &&
                comp.remote_version !== comp.version) ||
              (comp.package_count ?? 0) > 0;
            return (
              <div className="updates-row" key={comp.name}>
                <div className="updates-info">
                  <span className="updates-name">{comp.name}</span>
                  <span className="updates-version">
                    {comp.package_count !== undefined
                      ? `${comp.package_count} ${t.updatesPackages}`
                      : behind
                        ? `${comp.version ?? "?"} → ${comp.remote_version}`
                        : comp.version ?? ""}
                  </span>
                </div>
                {behind ? (
                  <button
                    type="button"
                    className="btn btn-compact btn-primary"
                    disabled={updateBusy !== null}
                    onClick={() => void runUpdate(comp.name)}
                  >
                    {updateBusy === comp.name ? t.updatesUpdating : t.updatesUpdate}
                  </button>
                ) : (
                  <span className="updates-ok">{t.updatesUpToDate}</span>
                )}
              </div>
            );
          })
        )}
      </div>
    )}
  </div>
);

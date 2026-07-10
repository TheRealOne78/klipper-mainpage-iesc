import React, { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle,
  Download,
  FileText,
  RefreshCw,
  UploadCloud,
} from "lucide-react";
import type { UpdateComponent } from "../usePrinterState";
import { SystemLoadsCard } from "../features/machine/SystemLoadsCard";
import { ConfigFilesCard } from "../features/machine/ConfigFilesCard";
import { translations } from "../translations";
import { useToast } from "../contexts/ToastContext";
import { toErrorMessage } from "../lib/toErrorMessage";

interface MachinePageProps {
  lang: "ro" | "en" | "pl";
  canControlMachine: boolean;
  onRunMacro: (name: string) => Promise<any>;
  onGetServices: () => Promise<string[]>;
  onServiceAction: (
    service: string,
    action: "restart" | "start" | "stop",
  ) => Promise<any>;
  onGetEndstops: () => Promise<Record<string, string>>;
  onGetConfigFiles: () => Promise<string[]>;
  onReadConfigFile: (path: string) => Promise<string>;
  onWriteConfigFile: (path: string, content: string) => Promise<void>;
  onGetUpdateStatus: (refresh?: boolean) => Promise<UpdateComponent[]>;
  onMachineUpdate: (component: string) => Promise<any>;
  onHostReboot: () => Promise<any>;
  onHostShutdown: () => Promise<any>;
}

function needsUpdate(c: UpdateComponent): boolean {
  return (
    (c.package_count ?? 0) > 0 ||
    (!!c.version && !!c.remote_version && c.version !== c.remote_version)
  );
}

export const MachinePage: React.FC<MachinePageProps> = ({
  lang,
  canControlMachine,
  onRunMacro,
  onGetEndstops,
  onReadConfigFile,
  onWriteConfigFile,
  onGetUpdateStatus,
  onMachineUpdate,
}) => {
  const t = translations[lang];
  const [endstops, setEndstops] = useState<Record<string, string> | null>(null);
  const [updates, setUpdates] = useState<UpdateComponent[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const { pushToast } = useToast();
  const [isDark, setIsDark] = useState<boolean>(() =>
    typeof document === "undefined"
      ? true
      : document.documentElement.getAttribute("data-theme-mode") !== "light",
  );

  const run = useCallback(
    async (name: string, action: () => Promise<any>, successMessage?: string) => {
      setBusy(name);
      try {
        await action();
        // Silent by default (e.g. the on-mount auto-refresh) — only explicit
        // user-triggered actions pass a successMessage and show a toast.
        if (successMessage) pushToast("success", successMessage);
      } catch (err) {
        pushToast("error", toErrorMessage(err));
      } finally {
        setBusy(null);
      }
    },
    [pushToast],
  );

  const refreshUpdates = useCallback(
    async (force = false) => {
      setUpdates(await onGetUpdateStatus(force));
    },
    [onGetUpdateStatus],
  );

  useEffect(() => {
    void run("load", async () => {
      await refreshUpdates();
    });
  }, [refreshUpdates, run]);

  // Keep the editor theme in sync with the app theme (App.tsx toggles the
  // `data-theme-mode` attribute on <html>); MachinePage has no theme prop.
  useEffect(() => {
    const el = document.documentElement;
    const observer = new MutationObserver(() => {
      setIsDark(el.getAttribute("data-theme-mode") !== "light");
    });
    observer.observe(el, {
      attributes: true,
      attributeFilter: ["data-theme-mode"],
    });
    return () => observer.disconnect();
  }, []);

  // Derived state: which components actually need an update right now
  const updatable = updates.filter(needsUpdate);

  const getVersionLabel = (c: UpdateComponent): string => {
    const pkg = c.package_count ?? 0;
    if (pkg > 0) return `${pkg} ${t.machPackages}`;
    if (c.version && c.remote_version && c.version !== c.remote_version)
      return `${c.version} → ${c.remote_version}`;
    return c.version ?? c.remote_version ?? "N/A";
  };

  const handleUpdate = async (componentName: string) => {
    const msg = t.machConfirmUpdate.replace("{name}", componentName);
    if (!window.confirm(msg)) return;
    await run(
      `update:${componentName}`,
      async () => {
        await onMachineUpdate(componentName);
        setUpdates(await onGetUpdateStatus(true));
      },
      t.machActionSuccess,
    );
  };

  const handleUpdateAll = async () => {
    const names = updatable.map((c) => c.name).join(", ");
    const msg = t.machConfirmUpdateAll.replace("{names}", names);
    if (!window.confirm(msg)) return;
    await run(
      "update-all",
      async () => {
        for (const c of updatable) {
          await onMachineUpdate(c.name);
        }
        setUpdates(await onGetUpdateStatus(true));
      },
      t.machActionSuccess,
    );
  };

  const downloadLog = (name: string) => {
    window.open(`/api/files/download/${name}?root=logs`, "_blank");
  };

  return (
    <div className="page-content machine-page">
      <style>{`
        .machine-2col{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,0.95fr);gap:1rem;align-items:start;}
        .machine-2col-side{display:flex;flex-direction:column;gap:1rem;}
        @media (max-width:900px){.machine-2col{grid-template-columns:1fr;}}
      `}</style>
      <div className="page-heading-row">
        <div>
          <h2>{t.machTitle}</h2>
          <p>{t.machSubtitle}</p>
        </div>
      </div>

      <div className="machine-2col">
        {/* Left column: Config files browser + fullscreen editor */}
        <div>
          <ConfigFilesCard
            lang={lang}
            canControlMachine={canControlMachine}
            dark={isDark}
            onReadConfigFile={onReadConfigFile}
            onWriteConfigFile={onWriteConfigFile}
            onRunMacro={onRunMacro}
          />
        </div>

        {/* Right column: system loads, update manager, endstops, logs */}
        <div className="machine-2col-side">
          <SystemLoadsCard lang={lang} />

          <section className="dashboard-card machine-panel">
            <div className="card-title">
              <UploadCloud size={20} />
              <span>{t.machUpdates}</span>
              {updatable.length > 1 && (
                <button
                  className="btn"
                  disabled={!canControlMachine || busy !== null}
                  onClick={() => void handleUpdateAll()}
                  style={{ marginLeft: "auto", marginRight: "0.4rem" }}
                >
                  <UploadCloud size={14} /> {t.machUpdateAll}
                </button>
              )}
              <button
                className="icon-button"
                onClick={() =>
                  void run("updates", () => refreshUpdates(true), t.machActionSuccess)
                }
                disabled={busy !== null}
                style={{ marginLeft: updatable.length > 1 ? undefined : "auto" }}
                title={t.machRefresh}
              >
                <RefreshCw size={16} />
              </button>
            </div>
            {updates.length === 0 ? (
              <div className="list-empty-state">{t.machNoUpdates}</div>
            ) : (
              <>
                {updatable.length === 0 && (
                  <div
                    className="list-empty-state"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "0.4rem",
                    }}
                  >
                    <CheckCircle size={15} style={{ color: "var(--success-color)" }} />
                    <span>{t.machEverythingUpToDate}</span>
                  </div>
                )}
                <div className="machine-update-list">
                  {updates.map((c) => {
                    const hasUpdate = needsUpdate(c);
                    const versionLabel = getVersionLabel(c);
                    const hasProblem =
                      c.corrupt || c.detached || c.is_dirty || c.is_valid === false;
                    const problemLabel = c.corrupt
                      ? t.machCorrupt
                      : c.detached
                        ? t.machDetached
                        : c.is_dirty
                          ? t.machDirty
                          : t.machInvalid;
                    return (
                      <div className="machine-update-row" key={c.name}>
                        <div>
                          <strong>
                            {c.name}
                            {hasProblem && (
                              <AlertTriangle
                                size={13}
                                style={{
                                  color: "var(--warning-color)",
                                  marginLeft: "0.35rem",
                                  verticalAlign: "middle",
                                }}
                              />
                            )}
                          </strong>
                          <span
                            style={{
                              color: hasProblem
                                ? "var(--warning-color)"
                                : hasUpdate
                                  ? "var(--accent-color)"
                                  : undefined,
                            }}
                          >
                            {hasProblem ? problemLabel : versionLabel}
                          </span>
                          {c.warnings && c.warnings.length > 0 && (
                            <span
                              style={{
                                color: "var(--warning-color)",
                                fontSize: "0.72rem",
                              }}
                            >
                              {c.warnings.join("; ")}
                            </span>
                          )}
                        </div>
                        {hasUpdate && !hasProblem ? (
                          <button
                            className="btn"
                            disabled={!canControlMachine || busy !== null}
                            onClick={() => void handleUpdate(c.name)}
                          >
                            {t.machUpdate}
                          </button>
                        ) : (
                          <span
                            className={hasProblem ? undefined : "updates-ok"}
                            style={
                              hasProblem
                                ? {
                                    color: "var(--warning-color)",
                                    fontSize: "0.72rem",
                                    fontWeight: 700,
                                    textTransform: "uppercase" as const,
                                    flexShrink: 0,
                                  }
                                : undefined
                            }
                          >
                            {hasProblem ? problemLabel : t.machUpToDate}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </section>

          <section className="dashboard-card machine-panel">
            <div className="card-title">
              <AlertTriangle size={20} />
              <span>{t.machEndstops}</span>
              <button
                className="btn"
                onClick={() =>
                  void run(
                    "endstops",
                    async () => setEndstops(await onGetEndstops()),
                    t.machActionSuccess,
                  )
                }
                disabled={!canControlMachine || busy !== null}
                style={{ marginLeft: "auto" }}
              >
                {t.machQuery}
              </button>
            </div>
            <div className="machine-kv-grid">
              {endstops ? (
                Object.entries(endstops).map(([name, value]) => (
                  <div key={name}>
                    <span>{name}</span>
                    <strong>{value}</strong>
                  </div>
                ))
              ) : (
                <div className="list-empty-state">N/A</div>
              )}
            </div>
          </section>

          <section className="dashboard-card machine-panel">
            <div className="card-title">
              <FileText size={20} />
              <span>{t.machLogs}</span>
            </div>
            <p style={{ color: "var(--text-secondary, #8b93a1)", fontSize: "0.82rem", marginTop: 0 }}>
              {t.machLogsHint}
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
              <button
                className="btn"
                onClick={() => downloadLog("klippy.log")}
                style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
              >
                <Download size={16} /> {t.machDownloadKlippy}
              </button>
              <button
                className="btn"
                onClick={() => downloadLog("moonraker.log")}
                style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
              >
                <Download size={16} /> {t.machDownloadMoonraker}
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

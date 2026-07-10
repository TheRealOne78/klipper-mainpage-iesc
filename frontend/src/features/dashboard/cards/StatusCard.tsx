import React from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  AlertTriangle,
  CheckCircle,
  History,
  ListOrdered,
  Pause,
  Play,
  Sliders,
  Square,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { CollapseButton } from "../CollapseButton";
import { GcodeThumbnail } from "../../../components/GcodeThumbnail";
import { getGcodeBasename } from "../../../lib/gcodeThumbnails";
import { statusLabel } from "../../../lib/historyStatus";
import { formatTime, getStatusText } from "../../../lib/dashboardFormat";
import type {
  GcodeFileMetadata,
  JobQueueEntry,
  PrintHistoryJob,
  PrintHistoryTotals,
  PrinterState,
} from "../../../printerTypes";
import type { Translations } from "../../../translations";

interface QueueJobWithMeta {
  job: JobQueueEntry;
  metadata: GcodeFileMetadata | null;
  thumbnailUrl: string | null;
}

interface StatusTabItem {
  key: "status" | "history" | "queue";
  icon: LucideIcon;
  label: string;
}

interface StatusCardProps {
  t: Translations;
  state: PrinterState;
  displayPrintState: string;
  isPrinting: boolean;
  isPaused: boolean;
  isBusy: boolean;
  isOfflineOrNotReady: boolean;
  canControlPrint: boolean;
  onPause: () => Promise<any>;
  onResume: () => Promise<any>;
  onCancel: () => Promise<any>;
  uploadedFile: string | null;
  handleStartPrint: () => Promise<void>;
  statusCollapsed: boolean;
  setStatusCollapsed: Dispatch<SetStateAction<boolean>>;
  hasCurrentJob: boolean;
  currentFileMetadata: GcodeFileMetadata | null;
  currentFileLabel: string;
  statusPreviewSummary: string;
  statusTabItems: StatusTabItem[];
  activeStatusTab: "status" | "history" | "queue";
  setStatusTab: Dispatch<SetStateAction<"status" | "history" | "queue">>;
  queueJobs: JobQueueEntry[];
  reportedFlowPct: number;
  statusFilamentUsedM: number | null;
  statusTotalEstimate: number | null;
  statusSlicerTime: number | null;
  statusEta: Date | null;
  canViewQueue: boolean;
  queueState: string;
  queueCollapsed: boolean;
  setQueueCollapsed: Dispatch<SetStateAction<boolean>>;
  canManageQueue: boolean;
  queueBusy: string | null;
  runQueueAction: (key: string, fn: () => Promise<any>) => Promise<void>;
  onJobQueueSetState: (pause: boolean) => Promise<any>;
  queuePaused: boolean;
  onJobQueueDelete: (jobIds: string[], all?: boolean) => Promise<any>;
  queueError: string | null;
  queueJobsWithMeta: QueueJobWithMeta[];
  canStartQueuedJob: boolean;
  onStartPrint: (filename: string) => Promise<any>;
  hiddenQueueJobs: number;
  canViewHistory: boolean;
  historyTotals: PrintHistoryTotals | null;
  historyError: string | null;
  historyJobs: PrintHistoryJob[];
  historySummaryItems: { label: string; value: string }[];
  historyBreakdown: Record<string, number>;
  requestReprint: (filename: string) => void;
}

export const StatusCard: React.FC<StatusCardProps> = ({
  t,
  state,
  displayPrintState,
  isPrinting,
  isPaused,
  isBusy,
  isOfflineOrNotReady,
  canControlPrint,
  onPause,
  onResume,
  onCancel,
  uploadedFile,
  handleStartPrint,
  statusCollapsed,
  setStatusCollapsed,
  hasCurrentJob,
  currentFileMetadata,
  currentFileLabel,
  statusPreviewSummary,
  statusTabItems,
  activeStatusTab,
  setStatusTab,
  queueJobs,
  reportedFlowPct,
  statusFilamentUsedM,
  statusTotalEstimate,
  statusSlicerTime,
  statusEta,
  canViewQueue,
  queueState,
  queueCollapsed,
  setQueueCollapsed,
  canManageQueue,
  queueBusy,
  runQueueAction,
  onJobQueueSetState,
  queuePaused,
  onJobQueueDelete,
  queueError,
  queueJobsWithMeta,
  canStartQueuedJob,
  onStartPrint,
  hiddenQueueJobs,
  canViewHistory,
  historyTotals,
  historyError,
  historyJobs,
  historySummaryItems,
  historyBreakdown,
  requestReprint,
}) => (
  <div className="dashboard-card status-card">
    <div className="card-title">
      <Sliders size={20} />
      <span>{t.printerState}</span>
      <div style={{ marginLeft: "auto" }} className="status-indicator">
        <div className={`status-dot ${displayPrintState}`} />
        <span style={{ textTransform: "capitalize" }}>
          {isPrinting || isPaused
            ? `${Math.round(state.progress)}% ${getStatusText(displayPrintState, t)}`
            : getStatusText(displayPrintState, t)}
        </span>
      </div>
      {/* Print controls are hidden (not disabled) without control_print. */}
      {canControlPrint && isPrinting && (
        <button
          className="icon-button"
          title={t.dashPause}
          onClick={onPause}
          disabled={isOfflineOrNotReady}
        >
          <Pause size={18} />
        </button>
      )}
      {canControlPrint && isPaused && (
        <button
          className="icon-button"
          title={t.btnResume}
          onClick={onResume}
          disabled={isOfflineOrNotReady}
        >
          <Play size={18} />
        </button>
      )}
      {canControlPrint && (isPrinting || isPaused) && (
        <button
          className="icon-button status-cancel-btn"
          title={t.btnCancel}
          onClick={onCancel}
          disabled={isOfflineOrNotReady}
        >
          <Square size={16} />
        </button>
      )}
      {canControlPrint &&
        !isPrinting &&
        !isPaused &&
        !isBusy &&
        Boolean(
          (state.filename && state.filename !== "N/A") || uploadedFile,
        ) && (
          <button
            className="icon-button"
            title={t.btnStartPrint}
            onClick={handleStartPrint}
            disabled={isOfflineOrNotReady}
          >
            <Play size={18} />
          </button>
        )}
      <CollapseButton
        collapsed={statusCollapsed}
        storageKey="statusCollapsed"
        setter={setStatusCollapsed}
        t={t}
      />
    </div>

    {!statusCollapsed && (
      <>
        {hasCurrentJob && (
          <div className="status-print-preview">
            <div className="status-print-thumb">
              <GcodeThumbnail
                filename={state.filename}
                metadata={currentFileMetadata}
                size={88}
                radius={8}
                title={currentFileLabel}
              />
            </div>
            <div className="status-print-info">
              <span
                className="status-print-filename"
                title={currentFileLabel}
              >
                {currentFileLabel}
              </span>
              {statusPreviewSummary && (
                <span className="status-print-sub">
                  {statusPreviewSummary}
                </span>
              )}
              <div className="progress-bar-bg status-print-bar">
                <div
                  className="progress-bar-fill"
                  style={{ width: `${state.progress}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {statusTabItems.length > 0 && (
          <div className="status-tabs">
            {statusTabItems.map((tab) => {
              const TabIcon = tab.icon;
              const isActive = activeStatusTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  className={`status-tab${isActive ? " active" : ""}`}
                  title={tab.label}
                  onClick={() => setStatusTab(tab.key)}
                >
                  <TabIcon size={18} />
                  {tab.key === "queue" && queueJobs.length > 0 && (
                    <span className="status-tab-badge">
                      {queueJobs.length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        <div className="status-tab-content">
        {activeStatusTab === "status" &&
          (hasCurrentJob ? (
            <div className="status-metrics">
              <div className="status-metric">
                <span className="status-metric-label">
                  {t.dashSpeed}
                </span>
                <span className="status-metric-value">
                  {Math.round(state.speed_factor)}%
                </span>
              </div>
              <div className="status-metric">
                <span className="status-metric-label">
                  {t.dashFlow}
                </span>
                <span className="status-metric-value">
                  {reportedFlowPct}%
                </span>
              </div>
              <div className="status-metric">
                <span className="status-metric-label">
                  {t.dashFilament}
                </span>
                <span className="status-metric-value">
                  {statusFilamentUsedM !== null
                    ? `${statusFilamentUsedM.toFixed(2)} m`
                    : "--"}
                </span>
              </div>
              <div className="status-metric">
                <span className="status-metric-label">
                  {t.dashLayer}
                </span>
                <span className="status-metric-value">
                  {state.current_layer ?? 0} / {state.total_layer ?? "--"}
                </span>
              </div>
              <div className="status-metric">
                <span className="status-metric-label">
                  {t.dashEstimate}
                </span>
                <span className="status-metric-value">
                  {statusTotalEstimate !== null
                    ? formatTime(statusTotalEstimate)
                    : "--"}
                </span>
              </div>
              <div className="status-metric">
                <span className="status-metric-label">
                  {t.dashSlicer}
                </span>
                <span className="status-metric-value">
                  {statusSlicerTime !== null
                    ? formatTime(statusSlicerTime)
                    : "--"}
                </span>
              </div>
              <div className="status-metric">
                <span className="status-metric-label">
                  {t.dashTotal}
                </span>
                <span className="status-metric-value">
                  {formatTime(state.elapsed_time)}
                </span>
              </div>
              <div className="status-metric">
                <span className="status-metric-label">
                  {t.dashEta}
                </span>
                <span className="status-metric-value">
                  {statusEta
                    ? statusEta.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "--"}
                </span>
              </div>
            </div>
          ) : (
            <div className="status-idle-hint">{t.dashIdleHint}</div>
          ))}


        {activeStatusTab === "queue" && canViewQueue && (
          <div
            className="status-history-panel"
            style={{ marginTop: canControlPrint ? "1rem" : 0 }}
          >
            <div className="status-history-title">
              <ListOrdered size={16} />
              <span>{t.queue}</span>
              <span className="status-history-count">{queueJobs.length}</span>
              {queueState && queueJobs.length > 0 && (
                <span
                  className={`queue-state ${queueState}`}
                  style={{ marginLeft: "0.5rem" }}
                >
                  {queueState}
                </span>
              )}
              <div className="panel-header-actions" style={{ marginLeft: "auto" }}>
                <CollapseButton
                  collapsed={queueCollapsed}
                  storageKey="queueCollapsed"
                  setter={setQueueCollapsed}
                  t={t}
                />
              </div>
            </div>

            {!queueCollapsed && (
              <>
                {canManageQueue && queueJobs.length > 0 && (
                  <div className="queue-actions" style={{ marginBottom: "0.75rem" }}>
                    <button
                      type="button"
                      className="btn btn-compact"
                      disabled={queueBusy !== null || queueJobs.length === 0}
                      onClick={() =>
                        void runQueueAction("toggle", () =>
                          onJobQueueSetState(!queuePaused),
                        )
                      }
                    >
                      {queuePaused ? <Play size={14} /> : <Pause size={14} />}
                      {queuePaused ? t.queueStart : t.queuePause}
                    </button>
                    <button
                      type="button"
                      className="btn btn-compact btn-danger"
                      disabled={queueBusy !== null || queueJobs.length === 0}
                      onClick={() =>
                        void runQueueAction("clear", () =>
                          onJobQueueDelete([], true),
                        )
                      }
                    >
                      <Trash2 size={14} /> {t.queueClear}
                    </button>
                  </div>
                )}

                {queueError ? (
                  <div className="queue-error">
                    <AlertTriangle size={14} /> {queueError}
                  </div>
                ) : queueJobs.length === 0 ? (
                  <div className="list-empty-state">{t.queueEmpty}</div>
                ) : (
                  <div className="status-history-list">
                    {queueJobsWithMeta.map(({ job, metadata }, index) => {
                      const name = getGcodeBasename(job.filename) || `Job ${index + 1}`;
                      const metaBits = [
                        metadata?.filament_total
                          ? `${(metadata.filament_total / 1000).toFixed(2)} m`
                          : "",
                        metadata?.estimated_time
                          ? formatTime(metadata.estimated_time)
                          : "",
                      ].filter(Boolean);
                      const isFirstJob = index === 0;
                      return (
                        <div
                          key={job.job_id ?? `${job.filename}-${index}`}
                          className="status-history-row"
                          title={name}
                        >
                          <GcodeThumbnail
                            filename={job.filename}
                            metadata={metadata}
                            size={40}
                            className="status-history-object"
                            title={name}
                          />
                          <div className="status-history-main">
                            <span className="status-history-name">{name}</span>
                            {metaBits.length > 0 && (
                              <span className="status-history-meta">
                                {metaBits.join(" · ")}
                              </span>
                            )}
                          </div>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "0.35rem",
                              marginLeft: "auto",
                            }}
                          >
                            {canStartQueuedJob && isFirstJob && (
                              <button
                                type="button"
                                className="files-action"
                                disabled={queueBusy !== null}
                                title={t.btnStartPrint}
                                onClick={() =>
                                  void runQueueAction(`start:${job.job_id}`, () =>
                                    onStartPrint(job.filename),
                                  )
                                }
                              >
                                <Play size={14} />
                              </button>
                            )}
                            {canManageQueue && (
                              <button
                                type="button"
                                className="queue-delete"
                                disabled={queueBusy !== null}
                                title={t.queueRemove}
                                onClick={() =>
                                  void runQueueAction(job.job_id, () =>
                                    onJobQueueDelete([job.job_id], false),
                                  )
                                }
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {hiddenQueueJobs > 0 && (
                      <div className="list-empty-state">
                        +{hiddenQueueJobs} {t.dashQueuedMore}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {activeStatusTab === "history" && canViewHistory && (
          <div className="status-history-panel">
            <div className="status-history-title">
              <History size={16} />
              <span>{t.history}</span>
              {historyTotals?.total_jobs !== undefined && (
                <span className="status-history-count">
                  {historyTotals.total_jobs}
                </span>
              )}
            </div>
            {historyError ? (
              <div className="history-error status-history-error">
                <AlertTriangle size={14} /> {historyError}
              </div>
            ) : historyJobs.length === 0 ? (
              <div className="list-empty-state">{t.historyEmpty}</div>
            ) : (
              <div className="status-history-list">
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
                    gap: "0.5rem",
                    marginBottom: "0.75rem",
                  }}
                >
                  {historySummaryItems.map((item) => (
                    <div
                      key={item.label}
                      style={{
                        padding: "0.55rem 0.65rem",
                        borderRadius: 8,
                        background: "var(--bg-color-light, rgba(255,255,255,0.03))",
                      }}
                    >
                      <div style={{ fontSize: "0.75rem", opacity: 0.75 }}>
                        {item.label}
                      </div>
                      <strong>{item.value}</strong>
                    </div>
                  ))}
                </div>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "0.4rem",
                    marginBottom: "0.75rem",
                  }}
                >
                  {Object.entries(historyBreakdown).map(([status, count]) => (
                    <span
                      key={status}
                      className={`history-badge ${
                        status === "completed" ? "ok" : "bad"
                      }`}
                    >
                      {statusLabel(t, status)}: {count}
                    </span>
                  ))}
                </div>
                {historyJobs.slice(0, 5).map((job, index) => {
                  const name = getGcodeBasename(job.filename) || `Job ${index + 1}`;
                  const ok = job.status === "completed";
                  const warn =
                    job.status === "cancelled" ||
                    job.status === "error";
                  return (
                    <div
                      key={job.job_id ?? `${name}-${index}`}
                      className="status-history-row"
                      title={name}
                    >
                      <GcodeThumbnail
                        filename={job.filename}
                        metadata={job.metadata ?? null}
                        size={40}
                        className="status-history-object"
                        title={t.reprintTitle}
                        onClick={
                          canControlPrint && job.filename
                            ? () => requestReprint(job.filename!)
                            : undefined
                        }
                      />
                      <div className="status-history-main">
                        <span
                          className="status-history-name"
                          style={
                            canControlPrint && job.filename
                              ? { cursor: "pointer" }
                              : undefined
                          }
                          onClick={
                            canControlPrint && job.filename
                              ? () => requestReprint(job.filename!)
                              : undefined
                          }
                        >
                          {name}
                        </span>
                        <span className="status-history-meta">
                          {job.filament_used !== undefined
                            ? `${(job.filament_used / 1000).toFixed(2)} m`
                            : "N/A"}
                          {" · "}
                          {formatTime(
                            job.print_duration ??
                              job.total_duration ??
                              0,
                          )}
                          {job.start_time
                            ? ` · ${new Date(job.start_time * 1000).toLocaleDateString()}`
                            : ""}
                        </span>
                      </div>
                      {ok ? (
                        <CheckCircle
                          className="history-status-ok"
                          size={16}
                        />
                      ) : warn ? (
                        <AlertTriangle
                          className="history-status-warn"
                          size={16}
                        />
                      ) : (
                        <span className="history-status-dot" />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
        </div>
      </>
    )}
  </div>
);

import React from "react";
import type { Dispatch, SetStateAction } from "react";
import { AlertTriangle, History } from "lucide-react";
import { CollapseButton } from "../CollapseButton";
import { formatTime } from "../../../lib/dashboardFormat";
import type { PrintHistoryJob, PrintHistoryTotals } from "../../../printerTypes";
import type { Translations } from "../../../translations";

interface HistoryCardProps {
  t: Translations;
  historyCollapsed: boolean;
  setHistoryCollapsed: Dispatch<SetStateAction<boolean>>;
  historyTotals: PrintHistoryTotals | null;
  historyError: string | null;
  historyJobs: PrintHistoryJob[];
}

export const HistoryCard: React.FC<HistoryCardProps> = ({
  t,
  historyCollapsed,
  setHistoryCollapsed,
  historyTotals,
  historyError,
  historyJobs,
}) => (
  <div className="dashboard-card history-card">
    <div className="card-title">
      <History size={20} />
      <span>{t.history}</span>
      <div className="panel-header-actions" style={{ marginLeft: "auto" }}>
        <CollapseButton
          collapsed={historyCollapsed}
          storageKey="historyCollapsed"
          setter={setHistoryCollapsed}
          t={t}
        />
      </div>
    </div>

    {!historyCollapsed && (
      <div className="history-body">
        {historyTotals && (
          <div className="history-totals">
            <div className="history-total">
              <span className="history-total-value">
                {historyTotals.total_jobs ?? 0}
              </span>
              <span className="history-total-label">{t.historyTotalJobs}</span>
            </div>
            <div className="history-total">
              <span className="history-total-value">
                {formatTime(historyTotals.total_print_time ?? 0)}
              </span>
              <span className="history-total-label">{t.historyTotalTime}</span>
            </div>
            <div className="history-total">
              <span className="history-total-value">
                {(
                  (historyTotals.total_filament_used ?? 0) / 1000
                ).toFixed(1)}
                m
              </span>
              <span className="history-total-label">
                {t.historyTotalFilament}
              </span>
            </div>
          </div>
        )}

        {historyError ? (
          <div className="history-error">
            <AlertTriangle size={14} /> {historyError}
          </div>
        ) : historyJobs.length === 0 ? (
          <div className="list-empty-state">{t.historyEmpty}</div>
        ) : (
          <div className="history-list">
            {historyJobs.map((job, index) => {
              const name = (job.filename ?? "")
                .split("/")
                .pop();
              const ok = job.status === "completed";
              return (
                <div
                  className="history-row"
                  key={`${job.job_id ?? index}-${job.start_time ?? index}`}
                >
                  <span
                    className={`history-status-dot ${job.status ?? "unknown"}`}
                    title={job.status ?? ""}
                  />
                  <span className="history-filename" title={name}>
                    {name || t.historyUnknownFile}
                  </span>
                  <span className="history-duration">
                    {formatTime(
                      job.print_duration ?? job.total_duration ?? 0,
                    )}
                  </span>
                  <span
                    className={`history-badge ${ok ? "ok" : "bad"}`}
                  >
                    {ok
                      ? t.historyCompleted
                      : job.status ?? t.historyUnknownFile}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    )}
  </div>
);

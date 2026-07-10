import React from "react";
import type { Dispatch, SetStateAction } from "react";
import { AlertTriangle, ListOrdered, Pause, Play, Trash2 } from "lucide-react";
import { CollapseButton } from "../CollapseButton";
import type { JobQueueEntry } from "../../../printerTypes";
import type { Translations } from "../../../translations";

interface QueueCardProps {
  t: Translations;
  queueState: string;
  queueCollapsed: boolean;
  setQueueCollapsed: Dispatch<SetStateAction<boolean>>;
  canManageQueue: boolean;
  queueBusy: string | null;
  queueJobs: JobQueueEntry[];
  queuePaused: boolean;
  runQueueAction: (key: string, fn: () => Promise<any>) => Promise<void>;
  onJobQueueSetState: (pause: boolean) => Promise<any>;
  onJobQueueDelete: (jobIds: string[], all?: boolean) => Promise<any>;
  queueError: string | null;
}

export const QueueCard: React.FC<QueueCardProps> = ({
  t,
  queueState,
  queueCollapsed,
  setQueueCollapsed,
  canManageQueue,
  queueBusy,
  queueJobs,
  queuePaused,
  runQueueAction,
  onJobQueueSetState,
  onJobQueueDelete,
  queueError,
}) => (
  <div className="dashboard-card queue-card">
    <div className="card-title">
      <ListOrdered size={20} />
      <span>{t.queue}</span>
      {queueState && (
        <span className={`queue-state ${queueState}`}>{queueState}</span>
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
      <div className="queue-body">
        {canManageQueue && (
          <div className="queue-actions">
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
                void runQueueAction("clear", () => onJobQueueDelete([], true))
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
          <div className="queue-list">
            {queueJobs.map((job, index) => {
              const name = (job.filename ?? "").split("/").pop();
              return (
                <div className="queue-row" key={job.job_id ?? index}>
                  <span className="queue-index">{index + 1}</span>
                  <span className="queue-filename" title={name}>
                    {name}
                  </span>
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
              );
            })}
          </div>
        )}
      </div>
    )}
  </div>
);

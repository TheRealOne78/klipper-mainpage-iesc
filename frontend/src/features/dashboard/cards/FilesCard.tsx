import React from "react";
import type { Dispatch, SetStateAction } from "react";
import { AlertTriangle, Download, FolderOpen, Play, Plus, Trash2 } from "lucide-react";
import { CollapseButton } from "../CollapseButton";
import { GcodeThumbnail } from "../../../components/GcodeThumbnail";
import { formatBytes, formatTime } from "../../../lib/dashboardFormat";
import type {
  GcodeFile,
  GcodeFileMetadata,
  PortalConfig,
} from "../../../printerTypes";
import type { Translations } from "../../../translations";

interface FilesCardProps {
  t: Translations;
  filesCollapsed: boolean;
  setFilesCollapsed: Dispatch<SetStateAction<boolean>>;
  filesFilter: string;
  setFilesFilter: Dispatch<SetStateAction<string>>;
  filesError: string | null;
  filesList: GcodeFile[];
  filesBusy: string | null;
  fileMeta: Record<string, GcodeFileMetadata | null>;
  canControlPrint: boolean;
  requestReprint: (filename: string) => void;
  isOfflineOrNotReady: boolean;
  isPrinting: boolean;
  runFileAction: (key: string, fn: () => Promise<any>) => Promise<void>;
  onStartPrint: (filename: string) => Promise<any>;
  canManageQueue: boolean;
  onJobQueueAdd: (filenames: string[]) => Promise<any>;
  config: PortalConfig | null;
  canManageFiles: boolean;
  onDeleteGcodeFile: (path: string) => Promise<void>;
}

export const FilesCard: React.FC<FilesCardProps> = ({
  t,
  filesCollapsed,
  setFilesCollapsed,
  filesFilter,
  setFilesFilter,
  filesError,
  filesList,
  filesBusy,
  fileMeta,
  canControlPrint,
  requestReprint,
  isOfflineOrNotReady,
  isPrinting,
  runFileAction,
  onStartPrint,
  canManageQueue,
  onJobQueueAdd,
  config,
  canManageFiles,
  onDeleteGcodeFile,
}) => (
  <div className="dashboard-card files-card">
    <div className="card-title">
      <FolderOpen size={20} />
      <span>{t.files}</span>
      <div className="panel-header-actions" style={{ marginLeft: "auto" }}>
        <CollapseButton
          collapsed={filesCollapsed}
          storageKey="filesCollapsed"
          setter={setFilesCollapsed}
          t={t}
        />
      </div>
    </div>

    {!filesCollapsed && (
      <div className="files-body">
        <input
          className="files-filter"
          type="text"
          placeholder={t.filesFilter}
          value={filesFilter}
          onChange={(event) => setFilesFilter(event.currentTarget.value)}
        />
        {filesError ? (
          <div className="files-error">
            <AlertTriangle size={14} /> {filesError}
          </div>
        ) : filesList.length === 0 ? (
          <div className="list-empty-state">{t.filesEmpty}</div>
        ) : (
          <div className="files-list">
            {filesList.map((file) => {
              const name = (file.path ?? "").split("/").pop();
              const busy = filesBusy === file.path;
              const meta = fileMeta[file.path];
              const metaBits = [
                file.size ? formatBytes(file.size) : "",
                meta?.estimated_time
                  ? formatTime(meta.estimated_time)
                  : "",
                meta?.filament_total
                  ? `${(meta.filament_total / 1000).toFixed(1)}m`
                  : "",
              ].filter(Boolean);
              return (
                <div className="files-row" key={file.path}>
                  <GcodeThumbnail
                    filename={file.path}
                    metadata={meta}
                    size={34}
                    radius={4}
                    className="files-thumb"
                    title={canControlPrint ? t.reprintTitle : undefined}
                    onClick={
                      canControlPrint
                        ? () => requestReprint(file.path)
                        : undefined
                    }
                  />
                  <div className="files-info">
                    <span
                      className="files-name"
                      title={file.path}
                      style={canControlPrint ? { cursor: "pointer" } : undefined}
                      onClick={
                        canControlPrint
                          ? () => requestReprint(file.path)
                          : undefined
                      }
                    >
                      {name}
                    </span>
                    {metaBits.length > 0 && (
                      <span className="files-size">
                        {metaBits.join(" · ")}
                      </span>
                    )}
                  </div>
                  <div className="files-actions">
                    {canControlPrint && (
                      <button
                        type="button"
                        className="files-action"
                        disabled={busy || isOfflineOrNotReady || isPrinting}
                        title={t.btnStartPrint}
                        onClick={() =>
                          void runFileAction(file.path, () =>
                            onStartPrint(file.path),
                          )
                        }
                      >
                        <Play size={14} />
                      </button>
                    )}
                    {canManageQueue && (
                      <button
                        type="button"
                        className="files-action"
                        disabled={busy}
                        title={t.filesAddQueue}
                        onClick={() =>
                          void runFileAction(file.path, () =>
                            onJobQueueAdd([file.path]),
                          )
                        }
                      >
                        <Plus size={14} />
                      </button>
                    )}
                    <a
                      className="files-action"
                      href={`${config?.moonraker_url ?? ""}/server/files/gcodes/${file.path}`}
                      target="_blank"
                      rel="noreferrer"
                      title={t.filesDownload}
                    >
                      <Download size={14} />
                    </a>
                    {canManageFiles && (
                      <button
                        type="button"
                        className="files-action danger"
                        disabled={busy}
                        title={t.queueRemove}
                        onClick={() => {
                          if (window.confirm(`${t.queueRemove}: ${name}?`)) {
                            void runFileAction(file.path, () =>
                              onDeleteGcodeFile(file.path),
                            );
                          }
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    )}
  </div>
);

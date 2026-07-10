import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronRight,
  CornerLeftUp,
  Download,
  Folder,
  FolderPlus,
  Home,
  ListPlus,
  Pencil,
  Play,
  RefreshCw,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import type {
  DirectoryDir,
  DirectoryFile,
  DirectoryListing,
  FileMovePayload,
  GcodeFileMetadata,
  PortalConfig,
} from "../usePrinterState";
import { GcodeThumbnail } from "../components/GcodeThumbnail";
import { translations } from "../translations";
import { useReprintConfirm } from "../hooks/useReprintConfirm";
import { useToast } from "../contexts/ToastContext";

interface GcodeFilesPageProps {
  lang: "ro" | "en" | "pl";
  config: PortalConfig | null;
  canControlPrint: boolean;
  canManageFiles: boolean;
  canUpload: boolean;
  onListDirectory: (root: string, path?: string) => Promise<DirectoryListing>;
  onGetFileMetadata: (filename: string) => Promise<GcodeFileMetadata>;
  onCreateDirectory: (root: string, path: string) => Promise<any>;
  onMoveFile: (payload: FileMovePayload) => Promise<any>;
  onDeleteGcodePath: (path: string) => Promise<any>;
  onDeleteDirectory: (
    root: string,
    path: string,
    force?: boolean,
  ) => Promise<any>;
  onUploadToDirectory: (root: string, path: string, file: File) => Promise<any>;
  onStartPrint: (filename: string) => Promise<any>;
  onJobQueueAdd: (filenames: string[]) => Promise<any>;
}

const ROOT = "gcodes";

const formatTime = (seconds?: number | null) => {
  if (!seconds || seconds < 0) return "N/A";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`;
};

const formatBytes = (bytes?: number | null) => {
  if (!bytes || bytes < 0) return "N/A";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const formatDate = (timestamp?: number | null) => {
  if (!timestamp) return "N/A";
  return new Date(timestamp * 1000).toLocaleString();
};

const joinPath = (base: string, name: string) =>
  base ? `${base}/${name}` : name;

const encodePath = (path: string) =>
  path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

export const GcodeFilesPage: React.FC<GcodeFilesPageProps> = ({
  lang,
  canControlPrint,
  canManageFiles,
  canUpload,
  onListDirectory,
  onGetFileMetadata,
  onCreateDirectory,
  onMoveFile,
  onDeleteGcodePath,
  onDeleteDirectory,
  onUploadToDirectory,
  onStartPrint,
  onJobQueueAdd,
}) => {
  const t = translations[lang];
  const { requestReprint, reprintModal } = useReprintConfirm(t, onStartPrint);
  const [currentPath, setCurrentPath] = useState("");
  const [dirs, setDirs] = useState<DirectoryDir[]>([]);
  const [files, setFiles] = useState<DirectoryFile[]>([]);
  const [metadata, setMetadata] = useState<Record<string, GcodeFileMetadata>>(
    {},
  );
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const { pushToast } = useToast();
  // Lazy-render the file list so directories with many files stay responsive.
  const [visibleCount, setVisibleCount] = useState(60);
  const loadMoreRef = React.useRef<HTMLDivElement | null>(null);
  const uploadInputRef = React.useRef<HTMLInputElement | null>(null);

  const refresh = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const listing = await onListDirectory(ROOT, currentPath || undefined);
      const sortedDirs = [...listing.dirs].sort((a, b) =>
        (a.dirname || "").localeCompare(b.dirname || ""),
      );
      const sortedFiles = [...listing.files].sort(
        (a, b) => (b.modified ?? 0) - (a.modified ?? 0),
      );
      setDirs(sortedDirs);
      setFiles(sortedFiles);
      const entries = await Promise.all(
        sortedFiles.slice(0, 40).map(async (file) => {
          const fullPath = joinPath(currentPath, file.filename);
          try {
            return [fullPath, await onGetFileMetadata(fullPath)] as const;
          } catch {
            return null;
          }
        }),
      );
      setMetadata(
        Object.fromEntries(
          entries.filter(
            (entry): entry is readonly [string, GcodeFileMetadata] => !!entry,
          ),
        ),
      );
    } catch (err) {
      setDirs([]);
      setFiles([]);
      setError(err instanceof Error ? err.message : t.filesError);
    } finally {
      setBusy(false);
    }
  }, [onListDirectory, onGetFileMetadata, currentPath, t.filesError]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const breadcrumbs = useMemo(() => {
    const segments = currentPath ? currentPath.split("/") : [];
    const crumbs: { label: string; path: string }[] = [
      { label: t.filesHome, path: "" },
    ];
    let acc = "";
    for (const segment of segments) {
      acc = acc ? `${acc}/${segment}` : segment;
      crumbs.push({ label: segment, path: acc });
    }
    return crumbs;
  }, [currentPath, t.filesHome]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return { dirs, files };
    return {
      dirs: dirs.filter((d) => (d.dirname || "").toLowerCase().includes(needle)),
      files: files.filter((f) =>
        (f.filename || "").toLowerCase().includes(needle),
      ),
    };
  }, [dirs, files, query]);

  // Reset the lazy window when the directory or search changes.
  useEffect(() => {
    setVisibleCount(60);
  }, [currentPath, query]);

  // Grow the lazy window as the sentinel scrolls into view.
  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setVisibleCount((c) => c + 60);
      },
      { rootMargin: "400px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [filtered.files.length, visibleCount]);

  const runAction = useCallback(
    async (action: () => Promise<unknown>) => {
      setActionBusy(true);
      try {
        await action();
        await refresh();
      } catch (err) {
        // A toast, not setError — this file list is still valid and
        // shouldn't be hidden behind an error just because e.g. one delete
        // failed (setError below is reserved for "couldn't load the
        // directory at all", which does need to blank the list).
        pushToast("error", err instanceof Error ? err.message : t.filesError);
      } finally {
        setActionBusy(false);
      }
    },
    [refresh, t.filesError, pushToast],
  );

  const enterFolder = (name: string) => {
    setQuery("");
    setCurrentPath((prev) => joinPath(prev, name));
  };

  const goUp = () => {
    setQuery("");
    setCurrentPath((prev) => {
      const idx = prev.lastIndexOf("/");
      return idx >= 0 ? prev.slice(0, idx) : "";
    });
  };

  const handleNewFolder = () => {
    const name = window.prompt(t.filesNewFolderPrompt)?.trim();
    if (!name) return;
    void runAction(() => onCreateDirectory(ROOT, joinPath(currentPath, name)));
  };

  const handleUploadPick = () => uploadInputRef.current?.click();

  const handleUploadChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    void runAction(() => onUploadToDirectory(ROOT, currentPath, file));
  };

  const handleRename = (currentName: string) => {
    const next = window.prompt(t.filesRenamePrompt, currentName)?.trim();
    if (!next || next === currentName) return;
    void runAction(() =>
      onMoveFile({
        source: joinPath(currentPath, currentName),
        dest: joinPath(currentPath, next),
      }),
    );
  };

  const handleDeleteFile = (name: string) => {
    if (!window.confirm(t.filesConfirmDeleteFile.replace("{name}", name))) return;
    void runAction(() => onDeleteGcodePath(joinPath(currentPath, name)));
  };

  const handleDeleteDir = (name: string) => {
    if (!window.confirm(t.filesConfirmDeleteDir.replace("{name}", name))) return;
    void runAction(() =>
      onDeleteDirectory(ROOT, joinPath(currentPath, name), true),
    );
  };

  const isEmpty = filtered.dirs.length === 0 && filtered.files.length === 0;

  return (
    <div className="page-content files-page">
      {reprintModal}
      <div className="page-heading-row">
        <div>
          <h2>{t.filesTitle}</h2>
          <p>{t.filesSubtitle}</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {canManageFiles && (
            <button
              className="btn"
              onClick={handleNewFolder}
              disabled={busy || actionBusy}
            >
              <FolderPlus size={16} /> {t.filesNewFolder}
            </button>
          )}
          {(canUpload || canManageFiles) && (
            <button
              className="btn"
              onClick={handleUploadPick}
              disabled={busy || actionBusy}
            >
              <Upload size={16} /> {t.filesUpload}
            </button>
          )}
          <button
            className="btn"
            onClick={() => void refresh()}
            disabled={busy}
          >
            <RefreshCw size={16} /> {t.filesRefresh}
          </button>
        </div>
      </div>

      <input
        ref={uploadInputRef}
        type="file"
        style={{ display: "none" }}
        onChange={handleUploadChange}
      />

      <div className="dashboard-card files-page-card">
        {/* Breadcrumbs */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 4,
            marginBottom: 12,
          }}
        >
          {breadcrumbs.map((crumb, index) => (
            <React.Fragment key={crumb.path || "__root"}>
              {index > 0 && (
                <ChevronRight size={14} style={{ opacity: 0.5 }} />
              )}
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setCurrentPath(crumb.path);
                }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "inherit",
                  padding: "2px 4px",
                  font: "inherit",
                  fontWeight:
                    index === breadcrumbs.length - 1 ? 600 : 400,
                  opacity: index === breadcrumbs.length - 1 ? 1 : 0.75,
                }}
                disabled={index === breadcrumbs.length - 1}
              >
                {index === 0 ? <Home size={14} /> : null}
                {crumb.label}
              </button>
            </React.Fragment>
          ))}
        </div>

        <label className="files-search">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t.filesSearch}
          />
        </label>

        {error ? (
          <div className="files-error">
            <AlertTriangle size={14} /> {error}
          </div>
        ) : (
          <div className="files-page-list">
            {/* Up affordance */}
            {currentPath && (
              <div
                className="files-page-row"
                style={{ cursor: "pointer" }}
                onClick={goUp}
                role="button"
              >
                <div className="files-thumb">
                  <CornerLeftUp size={22} />
                </div>
                <div className="files-info">
                  <strong className="files-name">..</strong>
                  <span className="files-size">{t.filesUp}</span>
                </div>
                <div className="files-actions" />
              </div>
            )}

            {/* Folders first */}
            {filtered.dirs.map((dir) => (
              <div className="files-page-row" key={`dir:${dir.dirname}`}>
                <div
                  className="files-thumb"
                  style={{ cursor: "pointer" }}
                  onClick={() => enterFolder(dir.dirname)}
                >
                  <Folder size={22} />
                </div>
                <div
                  className="files-info"
                  style={{ cursor: "pointer" }}
                  onClick={() => enterFolder(dir.dirname)}
                >
                  <strong className="files-name">{dir.dirname}</strong>
                  <span className="files-size">
                    {t.filesModified}: {formatDate(dir.modified)}
                  </span>
                </div>
                <div className="files-actions">
                  {canManageFiles && (
                    <button
                      className="files-action"
                      disabled={actionBusy}
                      title={t.filesDelete}
                      onClick={() => handleDeleteDir(dir.dirname)}
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>
            ))}

            {/* Files (lazy-rendered) */}
            {filtered.files.slice(0, visibleCount).map((file) => {
              const fullPath = joinPath(currentPath, file.filename);
              const meta = metadata[fullPath];
              return (
                <div className="files-page-row" key={`file:${file.filename}`}>
                  <GcodeThumbnail
                    filename={fullPath}
                    metadata={meta}
                    size={48}
                    className="files-thumb"
                    title={canControlPrint ? t.reprintTitle : undefined}
                    onClick={
                      canControlPrint
                        ? () => requestReprint(fullPath)
                        : undefined
                    }
                  />
                  <div className="files-info">
                    <strong
                      className="files-name"
                      style={canControlPrint ? { cursor: "pointer" } : undefined}
                      onClick={
                        canControlPrint
                          ? () => requestReprint(fullPath)
                          : undefined
                      }
                    >
                      {file.filename}
                    </strong>
                    <span className="files-size">
                      {t.filesFilament}:{" "}
                      {meta?.filament_total
                        ? `${(meta.filament_total / 1000).toFixed(2)} m`
                        : t.filesUnknown}
                      {" · "}
                      {t.filesTime}: {formatTime(meta?.estimated_time)}
                      {" · "}
                      {t.filesSize}: {formatBytes(meta?.size ?? file.size)}
                      {" · "}
                      {t.filesModified}: {formatDate(meta?.modified ?? file.modified)}
                    </span>
                  </div>
                  <div className="files-actions">
                    {/* Actions are hidden (not disabled) without permission. */}
                    {canControlPrint && (
                      <>
                        <button
                          className="files-action"
                          disabled={actionBusy}
                          title={t.filesPrint}
                          onClick={() =>
                            void runAction(() => onStartPrint(fullPath))
                          }
                        >
                          <Play size={15} />
                        </button>
                        <button
                          className="files-action"
                          disabled={actionBusy}
                          title={t.filesQueue}
                          onClick={() =>
                            void runAction(() => onJobQueueAdd([fullPath]))
                          }
                        >
                          <ListPlus size={15} />
                        </button>
                      </>
                    )}
                    <a
                      className="files-action"
                      title={t.filesDownload}
                      href={`/api/files/download/${encodePath(fullPath)}?root=gcodes`}
                    >
                      <Download size={15} />
                    </a>
                    {canManageFiles && (
                      <>
                        <button
                          className="files-action"
                          disabled={actionBusy}
                          title={t.filesRename}
                          onClick={() => handleRename(file.filename)}
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          className="files-action"
                          disabled={actionBusy}
                          title={t.filesDelete}
                          onClick={() => handleDeleteFile(file.filename)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}

            {filtered.files.length > visibleCount && (
              <div
                ref={loadMoreRef}
                className="list-empty-state"
                style={{ opacity: 0.6 }}
              >
                …
              </div>
            )}

            {isEmpty && (
              <div className="list-empty-state">
                {busy ? "..." : t.filesEmptyFolder}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * ConfigFilesCard
 * ---------------
 * Mainsail-style "Fișiere config" / "Config Files" panel: a file browser with a
 * root selector (config / gcodes / logs), a breadcrumb path, free-disk-space
 * readout and a toolbar (upload, new file, new folder, refresh). Clicking a file
 * opens a FULLSCREEN editor overlay (the shared ConfigEditor) with Save and
 * Save & Restart (FIRMWARE_RESTART for .cfg files).
 *
 * Directory listing, upload, folder creation and downloads talk to the existing
 * /api/files/* endpoints directly (App.tsx does not thread these callbacks into
 * MachinePage). Reading/writing config files reuses the config-root callbacks
 * passed down from MachinePage. Files outside the `config` root open read-only
 * (view + download); only `config` files are editable.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  FileCode2,
  Folder,
  FileText,
  RefreshCw,
  Upload,
  FilePlus,
  FolderPlus,
  Download,
  Save,
  RotateCcw,
  X,
  CheckCircle,
  ChevronRight,
  HardDrive,
} from "lucide-react";
import { ConfigEditor } from "../editor/ConfigEditor";
import { Select } from "../../components/Select";
import { translations } from "../../translations";
import { useToast } from "../../contexts/ToastContext";

type Root = "config" | "gcodes" | "logs";

interface DirEntry {
  name: string;
  size?: number;
  modified?: number;
  isDir: boolean;
}

interface EditingState {
  root: Root;
  path: string; // full path within the root
  content: string;
  dirty: boolean;
  saved: boolean;
  editable: boolean;
}

interface ConfigFilesCardProps {
  lang: "ro" | "en" | "pl";
  canControlMachine: boolean;
  dark: boolean;
  onReadConfigFile: (path: string) => Promise<string>;
  onWriteConfigFile: (path: string, content: string) => Promise<void>;
  onRunMacro: (name: string) => Promise<any>;
}


function formatBytes(bytes?: number): string {
  if (bytes === undefined || bytes === null) return "—";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDate(seconds?: number): string {
  if (!seconds) return "—";
  return new Date(seconds * 1000).toLocaleString();
}

const encodePath = (path: string) =>
  path.split("/").map(encodeURIComponent).join("/");

export const ConfigFilesCard: React.FC<ConfigFilesCardProps> = ({
  lang,
  canControlMachine,
  dark,
  onReadConfigFile,
  onWriteConfigFile,
  onRunMacro,
}) => {
  const t = translations[lang];
  const [root, setRoot] = useState<Root>("config");
  const [path, setPath] = useState("");
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [freeBytes, setFreeBytes] = useState<number | null>(null);
  const { pushToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<EditingState | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadDir = useCallback(async (nextRoot: Root, nextPath: string) => {
    setBusy(true);
    try {
      const params = new URLSearchParams({ root: nextRoot });
      if (nextPath) params.set("path", nextPath);
      const res = await fetch(`/api/files/directory?${params.toString()}`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      const dirs: DirEntry[] = (Array.isArray(data?.dirs) ? data.dirs : []).map(
        (d: any) => ({
          name: d.dirname,
          size: d.size,
          modified: d.modified,
          isDir: true,
        }),
      );
      const files: DirEntry[] = (Array.isArray(data?.files) ? data.files : []).map(
        (f: any) => ({
          name: f.filename,
          size: f.size,
          modified: f.modified,
          isDir: false,
        }),
      );
      dirs.sort((a, b) => a.name.localeCompare(b.name));
      files.sort((a, b) => a.name.localeCompare(b.name));
      setEntries([...dirs, ...files]);
      setFreeBytes(
        typeof data?.disk_usage?.free === "number" ? data.disk_usage.free : null,
      );
    } catch {
      setEntries([]);
      setFreeBytes(null);
      pushToast("error", t.machLoadError);
    } finally {
      setBusy(false);
    }
  }, [t.machLoadError, pushToast]);

  useEffect(() => {
    void loadDir(root, path);
  }, [root, path, loadDir]);

  const fullPath = (name: string) => (path ? `${path}/${name}` : name);

  const openFile = async (name: string) => {
    const target = fullPath(name);
    const editable = root === "config";
    try {
      let content: string;
      if (root === "config") {
        content = await onReadConfigFile(target);
      } else {
        const res = await fetch(
          `/api/files/raw/${encodePath(target)}?root=${root}`,
          { headers: { Accept: "text/plain" } },
        );
        if (!res.ok) throw new Error(String(res.status));
        content = await res.text();
      }
      setEditing({ root, path: target, content, dirty: false, saved: false, editable });
    } catch {
      pushToast("error", t.machLoadError);
    }
  };

  const closeEditor = () => {
    if (editing?.dirty && !window.confirm(t.machDiscard)) return;
    setEditing(null);
  };

  const saveEditor = async (restart: boolean) => {
    if (!editing || !editing.editable || !canControlMachine) return;
    setBusy(true);
    try {
      await onWriteConfigFile(editing.path, editing.content);
      setEditing((prev) => (prev ? { ...prev, dirty: false, saved: true } : prev));
      if (restart && editing.path.toLowerCase().endsWith(".cfg")) {
        await onRunMacro("FIRMWARE_RESTART");
      }
      void loadDir(root, path);
    } catch (e) {
      pushToast("error", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const downloadEntry = (name: string) => {
    const target = fullPath(name);
    window.open(`/api/files/download/${encodePath(target)}?root=${root}`, "_blank");
  };

  const handleUpload = async (file: File) => {
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("root", root);
      if (path) form.append("path", path);
      const res = await fetch("/api/files/upload", { method: "POST", body: form });
      if (!res.ok) throw new Error(String(res.status));
      void loadDir(root, path);
    } catch (e) {
      pushToast("error", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const newFolder = async () => {
    const name = window.prompt(t.machPromptFolder);
    if (!name) return;
    setBusy(true);
    try {
      const res = await fetch("/api/files/directory", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ root, path: fullPath(name) }),
      });
      if (!res.ok) throw new Error(String(res.status));
      void loadDir(root, path);
    } catch (e) {
      pushToast("error", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const newFile = async () => {
    const name = window.prompt(t.machPromptFile);
    if (!name) return;
    const target = fullPath(name);
    setBusy(true);
    try {
      if (root === "config") {
        await onWriteConfigFile(target, "");
      } else {
        const form = new FormData();
        form.append("file", new File([""], name, { type: "text/plain" }));
        form.append("root", root);
        if (path) form.append("path", path);
        const res = await fetch("/api/files/upload", { method: "POST", body: form });
        if (!res.ok) throw new Error(String(res.status));
      }
      void loadDir(root, path);
    } catch (e) {
      pushToast("error", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const crumbs = path ? path.split("/") : [];
  const iconBtn = { display: "inline-flex", alignItems: "center" } as const;

  return (
    <section className="dashboard-card machine-panel machine-config-panel">
      <div className="card-title">
        <FileCode2 size={20} />
        <span>{t.machConfigFiles}</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: "0.4rem" }}>
          <Select
            className="config-root-select"
            value={root}
            onChange={(value) => {
              setRoot(value as Root);
              setPath("");
            }}
            options={[
              { value: "config", label: "config" },
              { value: "gcodes", label: "gcodes" },
              { value: "logs", label: "logs" },
            ]}
          />
          {canControlMachine && (
            <>
              <button
                className="icon-button"
                title={t.machUpload}
                style={iconBtn}
                disabled={busy}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={16} />
              </button>
              <button
                className="icon-button"
                title={t.machNewFile}
                style={iconBtn}
                disabled={busy}
                onClick={() => void newFile()}
              >
                <FilePlus size={16} />
              </button>
              <button
                className="icon-button"
                title={t.machNewFolder}
                style={iconBtn}
                disabled={busy}
                onClick={() => void newFolder()}
              >
                <FolderPlus size={16} />
              </button>
            </>
          )}
          <button
            className="icon-button"
            title={t.machRefresh}
            style={iconBtn}
            disabled={busy}
            onClick={() => void loadDir(root, path)}
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleUpload(f);
          e.target.value = "";
        }}
      />

      {/* Breadcrumb + free space */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.5rem",
          fontSize: "0.8rem",
          margin: "0.5rem 0",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "0.15rem" }}>
          <button
            className="link-button"
            style={{ background: "none", border: 0, cursor: "pointer", color: "var(--accent-color)", padding: 0 }}
            onClick={() => setPath("")}
          >
            {root}
          </button>
          {crumbs.map((seg, i) => (
            <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: "0.15rem" }}>
              <ChevronRight size={13} style={{ opacity: 0.5 }} />
              <button
                className="link-button"
                style={{ background: "none", border: 0, cursor: "pointer", color: "var(--accent-color)", padding: 0 }}
                onClick={() => setPath(crumbs.slice(0, i + 1).join("/"))}
              >
                {seg}
              </button>
            </span>
          ))}
        </div>
        {freeBytes !== null && (
          <span style={{ color: "var(--text-secondary, #8b93a1)", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
            <HardDrive size={13} /> {formatBytes(freeBytes)} {t.machFree}
          </span>
        )}
      </div>

      {/* File list */}
      <div style={{ border: "1px solid var(--border-color)", borderRadius: "var(--border-radius)", overflow: "hidden" }}>
        <div
          className="config-file-header"
          style={{
            padding: "0.4rem 0.6rem",
            fontSize: "0.72rem",
            textTransform: "uppercase",
            letterSpacing: "0.03em",
            color: "var(--text-secondary, #8b93a1)",
            borderBottom: "1px solid var(--border-color)",
          }}
        >
          <span>{t.machName}</span>
          <span style={{ textAlign: "right" }}>{t.machSize}</span>
          <span style={{ textAlign: "right" }}>{t.machModified}</span>
        </div>
        <div style={{ maxHeight: 420, overflowY: "auto" }}>
          {path && (
            <button
              className="config-file-row"
              onClick={() => setPath(crumbs.slice(0, -1).join("/"))}
            >
              <span className="config-file-name">
                <Folder size={16} /> ..
              </span>
              <span />
              <span />
            </button>
          )}
          {entries.length === 0 && !path ? (
            <div className="list-empty-state" style={{ padding: "1rem" }}>{t.machEmpty}</div>
          ) : (
            entries.map((entry) => (
              <button
                key={entry.name}
                className="config-file-row"
                onClick={() =>
                  entry.isDir ? setPath(fullPath(entry.name)) : void openFile(entry.name)
                }
              >
                <span className="config-file-name">
                  {entry.isDir ? <Folder size={16} /> : <FileText size={16} />}
                  {entry.name}
                </span>
                <span className="config-file-meta">
                  {entry.isDir ? "" : formatBytes(entry.size)}
                </span>
                <span className="config-file-meta">{formatDate(entry.modified)}</span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Fullscreen editor overlay */}
      {editing && (
        <div className="machine-fs-editor" style={overlayStyle}>
          <style>{`.machine-fs-editor .config-editor-container{height:100%;margin-top:0;border:0;border-radius:0;}`}</style>
          <div style={overlayHeaderStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0 }}>
              <FileText size={18} />
              <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {editing.root}/{editing.path}
              </strong>
              {editing.dirty && (
                <span className="config-editor-dirty">
                  <span className="config-editor-dirty-dot" /> {t.machUnsaved}
                </span>
              )}
              {!editing.dirty && editing.saved && (
                <span className="config-editor-saved">
                  <CheckCircle size={13} /> {t.machSaved}
                </span>
              )}
              {!editing.editable && (
                <span style={{ fontSize: "0.72rem", color: "var(--text-secondary, #8b93a1)" }}>
                  ({t.machReadonly})
                </span>
              )}
            </div>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button className="btn" onClick={() => downloadEntry(editing.path.split("/").pop() || editing.path)} style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                <Download size={16} /> {t.machDownload}
              </button>
              {editing.editable && canControlMachine && (
                <>
                  <button
                    className="btn"
                    disabled={busy}
                    onClick={() => void saveEditor(false)}
                    style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
                  >
                    <Save size={16} /> {t.save}
                  </button>
                  <button
                    className="btn"
                    disabled={busy}
                    onClick={() => void saveEditor(true)}
                    style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
                  >
                    <RotateCcw size={16} /> {t.machSaveRestart}
                  </button>
                </>
              )}
              <button className="btn btn-danger" onClick={closeEditor} style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                <X size={16} /> {t.machClose}
              </button>
            </div>
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <ConfigEditor
              value={editing.content}
              dark={dark}
              readOnly={!editing.editable || !canControlMachine}
              onChange={(value) =>
                setEditing((prev) =>
                  prev ? { ...prev, content: value, dirty: true, saved: false } : prev,
                )
              }
              onSave={() => void saveEditor(false)}
              onSaveAndRestart={() => void saveEditor(true)}
            />
          </div>
        </div>
      )}
    </section>
  );
};

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 1000,
  background: "var(--bg-color)",
  display: "flex",
  flexDirection: "column",
};

const overlayHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "1rem",
  padding: "0.75rem 1rem",
  borderBottom: "1px solid var(--border-color)",
  background: "var(--card-bg, var(--bg-color))",
};

export default ConfigFilesCard;

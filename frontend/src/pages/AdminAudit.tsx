import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, LockKeyhole, RefreshCcw, XCircle } from "lucide-react";
import type { AdminAuditEntry, GcodeFileMetadata } from "../usePrinterState";
import { translations } from "../translations";
import { useToast } from "../contexts/ToastContext";
import { toErrorMessage } from "../lib/toErrorMessage";
import { GcodeThumbnail } from "../components/GcodeThumbnail";
import { getGcodeBasename } from "../lib/gcodeThumbnails";

type Lang = "ro" | "en" | "pl";

interface AdminAuditProps {
  lang: Lang;
  role: string | null;
  getAdminAudit: () => Promise<AdminAuditEntry[]>;
  getFileMetadata: (filename: string) => Promise<GcodeFileMetadata>;
}

export const asText = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

/** Returns the first present, non-empty value for any of `keys` in a
 * (already-parsed) plain object — used to pull a representative "target"
 * value out of an audit entry's `details_json` without needing to know in
 * advance which action produced it (a macro run has `macro`, an upload has
 * `filename`, a group change has `email`, ...). */
export const pick = (record: Record<string, unknown>, keys: string[]): unknown => {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null && record[key] !== "") {
      return record[key];
    }
  }
  return undefined;
};

export const formatTime = (value: unknown): string => {
  if (typeof value !== "string" || !value.trim()) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
};

/** Parses `details_json`, tolerating malformed/missing data (older rows,
 * write races) rather than throwing mid-render. */
const parseDetails = (detailsJson: string): Record<string, unknown> => {
  try {
    const parsed: unknown = JSON.parse(detailsJson);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
};

const TARGET_KEYS = [
  "filename",
  "email",
  "macro",
  "name",
  "device",
  "id",
  "path",
  "url",
  "role",
  "scope",
  "heater",
  "stepper",
  "pin",
  "fan",
  "led",
  "component",
  "command",
];

/** Actions that plausibly reference a real G-code file — these get a
 * zoomable thumbnail cell (see `GcodeThumbnail`, the same component/hover-
 * zoom behavior used on the status card, history, queue and file manager). */
const THUMBNAIL_ACTIONS = new Set(["upload", "print.start", "upload.cancel"]);

export const AdminAudit: React.FC<AdminAuditProps> = ({
  lang,
  role,
  getAdminAudit,
  getFileMetadata,
}) => {
  const t = translations[lang];
  const { pushToast } = useToast();
  const [entries, setEntries] = useState<AdminAuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [thumbnails, setThumbnails] = useState<Record<string, GcodeFileMetadata | null>>({});

  const loadAudit = useCallback(async () => {
    if (role !== "admin") return;
    setLoading(true);
    try {
      setEntries(await getAdminAudit());
    } catch (err) {
      pushToast("error", toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [getAdminAudit, role, pushToast]);

  useEffect(() => {
    void loadAudit();
  }, [loadAudit]);

  const rows = useMemo(
    () =>
      entries.map((entry) => {
        const details = parseDetails(entry.details_json);
        const filename =
          THUMBNAIL_ACTIONS.has(entry.action) && typeof details.filename === "string"
            ? details.filename
            : null;
        return {
          key: String(entry.id),
          time: formatTime(entry.created_at),
          actor: asText(entry.actor_identity),
          role: asText(entry.actor_role),
          source: asText(details.via),
          action: asText(entry.action),
          target: asText(pick(details, TARGET_KEYS)),
          success: entry.success,
          details,
          filename,
        };
      }),
    [entries],
  );

  // Lazily fetch metadata (needed for the thumbnail image URL) for every
  // unique filename among the currently-loaded rows, one request per
  // filename regardless of how many rows reference it. Capped so a very
  // upload-heavy audit page can't fire off an unbounded burst of requests.
  useEffect(() => {
    const MAX_LOOKUPS = 40;
    const wanted = Array.from(
      new Set(
        rows
          .map((row) => row.filename)
          .filter((name): name is string => Boolean(name)),
      ),
    )
      .filter((name) => !(name in thumbnails))
      .slice(0, MAX_LOOKUPS);

    if (wanted.length === 0) return;

    let cancelled = false;
    void Promise.all(
      wanted.map(async (name) => {
        try {
          const metadata = await getFileMetadata(name);
          return [name, metadata] as const;
        } catch {
          return [name, null] as const;
        }
      }),
    ).then((results) => {
      if (cancelled) return;
      setThumbnails((current) => {
        const next = { ...current };
        for (const [name, metadata] of results) next[name] = metadata;
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  if (role !== "admin") {
    return (
      <section className="admin-settings-page">
        <div className="admin-settings-empty">
          <LockKeyhole size={22} />
          <h2>{t.adminAuditTitle}</h2>
          <p>{t.adminSettingsAdminOnly}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="admin-settings-page">
      <div className="admin-settings-topbar">
        <div>
          <h2>{t.adminAuditTitle}</h2>
          <p>{t.adminAuditSubtitle}</p>
        </div>
        <div className="admin-settings-actions">
          <button
            className="btn"
            onClick={() => void loadAudit()}
            disabled={loading}
          >
            <RefreshCcw size={15} />
            {t.retry}
          </button>
        </div>
      </div>

      {loading && (
        <div className="admin-settings-banner">
          <CheckCircle2 size={16} />
          <span>{t.adminAuditLoading}</span>
        </div>
      )}

      <div className="admin-audit-table-wrap">
        {rows.length === 0 && !loading ? (
          <div className="admin-settings-empty compact">
            <CheckCircle2 size={22} />
            <h3>{t.adminAuditEmpty}</h3>
          </div>
        ) : (
          <table className="admin-audit-table">
            <thead>
              <tr>
                <th>{t.auditTime}</th>
                <th>{t.auditPreview}</th>
                <th>{t.auditActor}</th>
                <th>{t.auditRole}</th>
                <th>{t.auditSource}</th>
                <th>{t.auditAction}</th>
                <th>{t.auditTarget}</th>
                <th>{t.auditStatus}</th>
                <th>{t.auditDetails}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <td>{row.time}</td>
                  <td>
                    {row.filename ? (
                      <GcodeThumbnail
                        filename={row.filename}
                        metadata={thumbnails[row.filename] ?? null}
                        size={36}
                        title={getGcodeBasename(row.filename)}
                      />
                    ) : (
                      "-"
                    )}
                  </td>
                  <td>{row.actor}</td>
                  <td>{row.role}</td>
                  <td>{row.source}</td>
                  <td>{row.action}</td>
                  <td>{row.target}</td>
                  <td>
                    <span
                      className={`admin-audit-status${row.success ? " success" : " failure"}`}
                    >
                      {row.success ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                      {row.success ? t.auditStatusSuccess : t.auditStatusFailed}
                    </span>
                  </td>
                  <td className="admin-audit-details-cell">
                    {Object.keys(row.details).length > 0
                      ? Object.entries(row.details)
                          .filter(([key]) => key !== "via")
                          .map(([key, value]) => `${key}: ${asText(value)}`)
                          .join(", ") || "-"
                      : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
};

import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as echarts from "echarts/core";
import { PieChart, BarChart, LineChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
} from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle,
  Clock,
  Search,
  Table as TableIcon,
  XCircle,
} from "lucide-react";
import { GcodeThumbnail } from "../components/GcodeThumbnail";
import { getGcodeBasename } from "../lib/gcodeThumbnails";
import { statusLabel } from "../lib/historyStatus";
import { toErrorMessage } from "../lib/toErrorMessage";
import { translations } from "../translations";
import { useReprintConfirm } from "../hooks/useReprintConfirm";
import type { PortalConfig, PrintHistory, PrintHistoryJob } from "../usePrinterState";

// ECharts modules used by this page's three statistics charts. echarts.use is
// additive/idempotent, so registering these alongside Dashboard's set is safe.
echarts.use([
  PieChart,
  BarChart,
  LineChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  SVGRenderer,
]);

interface HistoryPageProps {
  lang: "ro" | "en" | "pl";
  config: PortalConfig | null;
  canControlPrint: boolean;
  onGetPrintHistory: (limit?: number) => Promise<PrintHistory>;
  onStartPrint: (filename: string) => Promise<unknown> | void;
}

type DonutMetric = "jobs" | "filament" | "time";
type UsageMetric = "filament" | "avg";


const STATUS_COLORS: Record<string, string> = {
  completed: "#4caf50",
  cancelled: "#9e9e9e",
  error: "#f44336",
  in_progress: "#2196f3",
  interrupted: "#607d8b",
  klippy_shutdown: "#ff9800",
  klippy_disconnect: "#ff9800",
  server_exit: "#795548",
  unknown: "#616161",
};

const PAGE_SIZE = 30;

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------
export const formatTime = (seconds?: number | null): string => {
  if (!seconds || seconds < 0) return "–";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};

export const formatDate = (timestamp?: number | null): string => {
  if (!timestamp) return "–";
  return new Date(timestamp * 1000).toLocaleString();
};

// Filament length is reported in millimetres by Moonraker.
export const formatFilament = (mm?: number | null): string => {
  if (!mm || mm <= 0) return "–";
  if (mm >= 1000) return `${(mm / 1000).toFixed(2)} m`;
  return `${Math.round(mm)} mm`;
};

export const statusIcon = (status?: string) => {
  if (status === "completed") return <CheckCircle size={15} />;
  if (status === "cancelled") return <XCircle size={15} />;
  if (status === "error") return <AlertTriangle size={15} />;
  return <Clock size={15} />;
};

// ---------------------------------------------------------------------------
// Theme detection (the page isn't given a theme prop, so read <html data-theme-mode>)
// ---------------------------------------------------------------------------
function useThemeMode(): "light" | "dark" {
  const read = (): "light" | "dark" => {
    const attr = document.documentElement.getAttribute("data-theme-mode");
    return attr === "light" ? "light" : "dark";
  };
  const [mode, setMode] = useState<"light" | "dark">(read);
  useEffect(() => {
    const el = document.documentElement;
    const observer = new MutationObserver(() => setMode(read()));
    observer.observe(el, {
      attributes: true,
      attributeFilter: ["data-theme-mode"],
    });
    return () => observer.disconnect();
  }, []);
  return mode;
}

// ---------------------------------------------------------------------------
// Small ECharts wrapper. Creates one chart instance per mount and updates its
// option when it changes; resizes with its container.
// ---------------------------------------------------------------------------
const EChart: React.FC<{
  option: echarts.EChartsCoreOption;
  height: number;
  empty?: boolean;
  emptyLabel?: string;
}> = ({ option, height, empty, emptyLabel }) => {
  const ref = useRef<HTMLDivElement>(null);
  const instance = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current, undefined, { renderer: "svg" });
    instance.current = chart;
    const resize = new ResizeObserver(() => chart.resize());
    resize.observe(ref.current);
    return () => {
      resize.disconnect();
      chart.dispose();
      instance.current = null;
    };
  }, []);

  useEffect(() => {
    if (instance.current) instance.current.setOption(option, true);
  }, [option]);

  return (
    <div style={{ position: "relative", width: "100%", height }}>
      <div ref={ref} style={{ width: "100%", height }} />
      {empty && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--text-secondary)",
            fontSize: "0.85rem",
            pointerEvents: "none",
          }}
        >
          {emptyLabel}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Reusable segmented toggle
// ---------------------------------------------------------------------------
function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: React.ReactNode; title?: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div
      style={{
        display: "inline-flex",
        border: "1px solid var(--border-color)",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            title={opt.title}
            onClick={() => onChange(opt.value)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "4px 10px",
              fontSize: "0.78rem",
              border: "none",
              cursor: "pointer",
              background: active ? "var(--accent-color)" : "transparent",
              color: active ? "#fff" : "var(--text-secondary)",
              transition: "background 0.15s",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export const HistoryPage: React.FC<HistoryPageProps> = ({
  lang,
  canControlPrint,
  onGetPrintHistory,
  onStartPrint,
}) => {
  const t = translations[lang];
  const theme = useThemeMode();
  const { requestReprint, reprintModal } = useReprintConfirm(t, onStartPrint);

  const [history, setHistory] = useState<PrintHistory>({ jobs: [], totals: null });
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [donutMode, setDonutMode] = useState<"chart" | "table">("chart");
  const [donutMetric, setDonutMetric] = useState<DonutMetric>("jobs");
  const [usageMetric, setUsageMetric] = useState<UsageMetric>("filament");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const sentinelRef = useRef<HTMLDivElement>(null);

  // Fetch the history once on mount (backend caps the limit at 200).
  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    onGetPrintHistory(200)
      .then((data) => {
        if (!cancelled) {
          setHistory(data);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(toErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [onGetPrintHistory]);

  const allJobs = history.jobs ?? [];
  const totals = history.totals;

  // Filtered + newest-first job list for the table.
  const filteredJobs = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = [...allJobs].sort(
      (a, b) => (b.start_time ?? 0) - (a.start_time ?? 0),
    );
    if (!needle) return list;
    return list.filter((job) =>
      getGcodeBasename(job.filename).toLowerCase().includes(needle),
    );
  }, [allJobs, query]);

  // Reset the lazy window whenever the filter changes.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [query]);

  // IntersectionObserver "load more" sentinel — grows the window as the user
  // scrolls so we never render the whole (potentially huge) list at once.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((count) =>
            Math.min(count + PAGE_SIZE, filteredJobs.length),
          );
        }
      },
      { rootMargin: "300px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [filteredJobs.length]);

  const visibleJobs = filteredJobs.slice(0, visibleCount);

  // ----- Left summary list -------------------------------------------------
  const totalJobs = totals?.total_jobs ?? allJobs.length;
  const totalPrintTime = totals?.total_print_time ?? 0;
  const avgPrintTime = totalJobs > 0 ? totalPrintTime / totalJobs : 0;
  const summary = [
    { label: t.histTotalPrintTime, value: formatTime(totalPrintTime) },
    { label: t.histLongestPrintTime, value: formatTime(totals?.longest_print) },
    { label: t.histPrintTimeAvg, value: formatTime(avgPrintTime) },
    { label: t.histTotalFilament, value: formatFilament(totals?.total_filament_used) },
    { label: t.histTotalJobs, value: String(totalJobs) },
  ];

  // ----- Status groups (drive the donut + status table) --------------------
  const statusGroups = useMemo(() => {
    const map = new Map<
      string,
      { count: number; filament: number; time: number }
    >();
    for (const job of allJobs) {
      const key = job.status ?? "unknown";
      const g = map.get(key) ?? { count: 0, filament: 0, time: 0 };
      g.count += 1;
      g.filament += job.filament_used ?? 0;
      g.time += job.print_duration ?? 0;
      map.set(key, g);
    }
    return [...map.entries()].sort((a, b) => b[1].count - a[1].count);
  }, [allJobs]);

  const metricValue = (g: { count: number; filament: number; time: number }) =>
    donutMetric === "jobs" ? g.count : donutMetric === "filament" ? g.filament : g.time;

  const metricDisplay = (value: number) =>
    donutMetric === "jobs"
      ? String(value)
      : donutMetric === "filament"
        ? formatFilament(value)
        : formatTime(value);

  // ----- Daily aggregation (drive the usage / avg-time chart) --------------
  const daily = useMemo(() => {
    const map = new Map<number, { filament: number; time: number; count: number }>();
    for (const job of allJobs) {
      if (!job.start_time) continue;
      const d = new Date(job.start_time * 1000);
      d.setHours(0, 0, 0, 0);
      const key = d.getTime();
      const g = map.get(key) ?? { filament: 0, time: 0, count: 0 };
      g.filament += job.filament_used ?? 0;
      g.time += job.print_duration ?? 0;
      g.count += 1;
      map.set(key, g);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [allJobs]);

  // ----- Theme-aware chart colours -----------------------------------------
  const isDark = theme === "dark";
  const fg = isDark ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.8)";
  const fgFaint = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
  const tooltipBg = isDark ? "rgba(30,30,30,0.95)" : "rgba(255,255,255,0.97)";

  const donutOption = useMemo<echarts.EChartsCoreOption>(
    () => ({
      animation: false,
      tooltip: {
        trigger: "item",
        backgroundColor: tooltipBg,
        borderWidth: 0,
        textStyle: { color: fg, fontSize: 12 },
        valueFormatter: (value: unknown) => metricDisplay(Number(value) || 0),
      },
      legend: {
        type: "scroll",
        bottom: 0,
        textStyle: { color: fg, fontSize: 11 },
      },
      series: [
        {
          type: "pie",
          radius: ["42%", "68%"],
          center: ["50%", "44%"],
          avoidLabelOverlap: true,
          minAngle: 5,
          itemStyle: { borderColor: "var(--surface-color)", borderWidth: 2 },
          label: { show: false },
          data: statusGroups.map(([status, g]) => ({
            name: statusLabel(t, status),
            value: metricValue(g),
            itemStyle: { color: STATUS_COLORS[status] ?? STATUS_COLORS.unknown },
          })),
        },
      ],
    }),
    // metricDisplay/metricValue depend on donutMetric; include the primitives.
    [statusGroups, donutMetric, t, fg, tooltipBg],
  );

  const usageOption = useMemo<echarts.EChartsCoreOption>(() => {
    const isFilament = usageMetric === "filament";
    const seriesData = daily.map(([ts, g]) => [
      ts,
      isFilament ? g.filament / 1000 : g.count > 0 ? g.time / g.count / 60 : 0,
    ]);
    const unit = isFilament ? " m" : " min";
    return {
      animation: false,
      grid: { top: 16, right: 16, bottom: 26, left: 44 },
      tooltip: {
        trigger: "axis",
        backgroundColor: tooltipBg,
        borderWidth: 0,
        textStyle: { color: fg, fontSize: 12 },
        formatter: (params: any) => {
          const p = Array.isArray(params) ? params[0] : params;
          if (!p?.value) return "";
          const d = new Date(p.value[0]).toLocaleDateString();
          const v = Math.round((p.value[1] ?? 0) * 10) / 10;
          return `${p.marker} ${d}: <strong>${v}${unit}</strong>`;
        },
      },
      xAxis: {
        type: "time",
        axisLine: { lineStyle: { color: fgFaint } },
        splitLine: { show: false },
        axisLabel: { color: fg, fontSize: 10 },
      },
      yAxis: {
        type: "value",
        splitLine: { lineStyle: { color: fgFaint } },
        axisLabel: { color: fg, fontSize: 10 },
      },
      series: [
        isFilament
          ? {
              type: "bar",
              data: seriesData,
              itemStyle: { color: "#2196f3", borderRadius: [3, 3, 0, 0] },
              barMaxWidth: 22,
            }
          : {
              type: "line",
              data: seriesData,
              smooth: true,
              showSymbol: false,
              lineStyle: { width: 2, color: "#4caf50" },
              itemStyle: { color: "#4caf50" },
              areaStyle: {
                color: isDark ? "rgba(76,175,80,0.15)" : "rgba(76,175,80,0.12)",
              },
            },
      ],
    };
  }, [daily, usageMetric, fg, fgFaint, tooltipBg, isDark]);

  const hasJobs = allJobs.length > 0;

  return (
    <div className="page-content history-page">
      {reprintModal}
      <div className="page-heading-row">
        <div>
          <h2>{t.histTitle}</h2>
          <p>{t.histSubtitle}</p>
        </div>
      </div>

      {/* ---------------- STATISTICS ---------------- */}
      <div className="dashboard-card" style={{ marginBottom: "1rem" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: "1rem",
          }}
        >
          <BarChart3 size={18} />
          <strong>{t.histStatistics}</strong>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(180px, 1fr) minmax(220px, 1.2fr) minmax(220px, 1.4fr)",
            gap: "1.25rem",
            alignItems: "start",
          }}
        >
          {/* Left: summary list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {summary.map((row) => (
              <div
                key={row.label}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  gap: 12,
                  padding: "8px 0",
                  borderBottom: "1px solid var(--border-color)",
                }}
              >
                <span style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>
                  {row.label}
                </span>
                <strong style={{ fontSize: "0.92rem", whiteSpace: "nowrap" }}>
                  {row.value}
                </strong>
              </div>
            ))}
          </div>

          {/* Middle: donut (chart/table) + metric toggle */}
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 8,
                marginBottom: 8,
              }}
            >
              <Segmented
                value={donutMode}
                onChange={setDonutMode}
                options={[
                  {
                    value: "chart",
                    label: (
                      <>
                        <BarChart3 size={13} /> {t.histChart}
                      </>
                    ),
                  },
                  {
                    value: "table",
                    label: (
                      <>
                        <TableIcon size={13} /> {t.histTable}
                      </>
                    ),
                  },
                ]}
              />
              <Segmented
                value={donutMetric}
                onChange={setDonutMetric}
                options={[
                  { value: "jobs", label: t.histJobs },
                  { value: "filament", label: t.histFilament },
                  { value: "time", label: t.histTime },
                ]}
              />
            </div>

            {donutMode === "chart" ? (
              <EChart
                option={donutOption}
                height={210}
                empty={!hasJobs}
                emptyLabel={t.histEmpty}
              />
            ) : (
              <div style={{ maxHeight: 210, overflowY: "auto" }}>
                <table className="history-status-table" style={{ width: "100%", fontSize: "0.82rem" }}>
                  <tbody>
                    {statusGroups.map(([status, g]) => (
                      <tr key={status}>
                        <td style={{ padding: "5px 6px" }}>
                          <span
                            style={{
                              display: "inline-block",
                              width: 10,
                              height: 10,
                              borderRadius: 3,
                              marginRight: 8,
                              background: STATUS_COLORS[status] ?? STATUS_COLORS.unknown,
                            }}
                          />
                          {statusLabel(t, status)}
                        </td>
                        <td style={{ padding: "5px 6px", textAlign: "right", fontWeight: 600 }}>
                          {metricDisplay(metricValue(g))}
                        </td>
                      </tr>
                    ))}
                    {statusGroups.length === 0 && (
                      <tr>
                        <td style={{ padding: "12px 6px", color: "var(--text-secondary)" }}>
                          {t.histEmpty}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Right: filament usage / print-time avg over time */}
          <div>
            <div style={{ marginBottom: 8, textAlign: "right" }}>
              <Segmented
                value={usageMetric}
                onChange={setUsageMetric}
                options={[
                  { value: "filament", label: t.histFilamentUsage },
                  { value: "avg", label: t.histPrintTimeAvgShort },
                ]}
              />
            </div>
            <EChart
              option={usageOption}
              height={210}
              empty={daily.length === 0}
              emptyLabel={t.histEmpty}
            />
          </div>
        </div>
      </div>

      {/* ---------------- PRINT HISTORY TABLE ---------------- */}
      <div className="dashboard-card">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 10,
            marginBottom: "0.85rem",
          }}
        >
          <strong>{t.histPrintHistory}</strong>
          <label className="files-search" style={{ minWidth: 220 }}>
            <Search size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t.histSearch}
            />
          </label>
        </div>

        {error ? (
          <div className="history-error">
            <AlertTriangle size={14} /> {error}
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="list-empty-state">
            {busy ? t.histLoading : query ? t.histNoResults : t.histEmpty}
          </div>
        ) : (
          <>
            <div style={{ overflowX: "auto" }}>
              <table className="history-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "var(--text-secondary)" }}>
                    <th style={{ padding: "8px 10px", fontWeight: 600 }}>{t.histColFilename}</th>
                    <th style={{ padding: "8px 10px", fontWeight: 600, width: 130 }}>{t.histColStatus}</th>
                    <th style={{ padding: "8px 10px", fontWeight: 600, width: 170 }}>{t.histColStart}</th>
                    <th style={{ padding: "8px 10px", fontWeight: 600, width: 110 }}>{t.histColEstimated}</th>
                    <th style={{ padding: "8px 10px", fontWeight: 600, width: 100 }}>{t.histColPrintTime}</th>
                    <th style={{ padding: "8px 10px", fontWeight: 600, width: 100 }}>{t.histColFilamentUsed}</th>
                    <th style={{ padding: "8px 10px", fontWeight: 600, width: 120 }}>{t.histColSlicer}</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleJobs.map((job: PrintHistoryJob, index) => {
                    const key = job.job_id ?? `${job.filename}-${index}`;
                    const name = getGcodeBasename(job.filename) || "–";
                    return (
                      <tr
                        key={key}
                        style={{ borderTop: "1px solid var(--border-color)" }}
                      >
                        <td style={{ padding: "6px 10px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                            <GcodeThumbnail
                              filename={job.filename}
                              metadata={job.metadata ?? null}
                              size={38}
                              radius={6}
                              title={canControlPrint ? t.reprintTitle : undefined}
                              onClick={
                                canControlPrint && job.filename
                                  ? () => requestReprint(job.filename!)
                                  : undefined
                              }
                            />
                            <span
                              style={{
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                maxWidth: 280,
                                cursor:
                                  canControlPrint && job.filename
                                    ? "pointer"
                                    : undefined,
                              }}
                              title={name}
                              onClick={
                                canControlPrint && job.filename
                                  ? () => requestReprint(job.filename!)
                                  : undefined
                              }
                            >
                              {name}
                            </span>
                          </div>
                        </td>
                        <td style={{ padding: "6px 10px" }}>
                          <span
                            className={`history-page-status ${job.status ?? "unknown"}`}
                            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                          >
                            {statusIcon(job.status)}
                            <span>{statusLabel(t, job.status)}</span>
                          </span>
                        </td>
                        <td style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>
                          {formatDate(job.start_time)}
                        </td>
                        <td style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>
                          {formatTime(job.metadata?.estimated_time)}
                        </td>
                        <td style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>
                          {formatTime(job.print_duration ?? job.total_duration)}
                        </td>
                        <td style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>
                          {formatFilament(job.filament_used)}
                        </td>
                        <td
                          style={{
                            padding: "6px 10px",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            maxWidth: 120,
                            color: "var(--text-secondary)",
                          }}
                          title={
                            [job.metadata?.slicer, job.metadata?.slicer_version]
                              .filter(Boolean)
                              .join(" ") || undefined
                          }
                        >
                          {job.metadata?.slicer ? (
                            <>
                              {job.metadata.slicer}
                              {job.metadata.slicer_version && (
                                <>
                                  <br />
                                  <span style={{ opacity: 0.7 }}>
                                    {job.metadata.slicer_version}
                                  </span>
                                </>
                              )}
                            </>
                          ) : (
                            "–"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Lazy-load sentinel + count footer */}
            {visibleCount < filteredJobs.length && (
              <div ref={sentinelRef} style={{ height: 1 }} />
            )}
            <div
              style={{
                textAlign: "center",
                padding: "10px 0 2px",
                color: "var(--text-secondary)",
                fontSize: "0.78rem",
              }}
            >
              {(t.histShowingOf as string)
                .replace("{shown}", String(visibleJobs.length))
                .replace("{total}", String(filteredJobs.length))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

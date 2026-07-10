/**
 * SystemLoadsCard
 * ---------------
 * "Încărcare sistem" / "System Loads" panel for the Machine page, modelled on
 * Mainsail's SystemLoadPanel. Shows CPU% and MEM% gauges plus host details
 * (OS, CPU, memory, temperature, network) and per-MCU stats (version, freq,
 * load, awake).
 *
 * Data comes from GET /api/machine/system (Moonraker machine.system_info +
 * machine.proc_stats + the printer `mcu` objects). The card polls on its own
 * interval. It fetches directly rather than through a prop because App.tsx does
 * not thread new callbacks into MachinePage.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import * as echarts from "echarts/core";
import { GaugeChart } from "echarts/charts";
import { SVGRenderer } from "echarts/renderers";
import { Cpu, Server, Thermometer, Network, MemoryStick } from "lucide-react";
import type { MachineSystem } from "../../usePrinterState";
import { translations } from "../../translations";

echarts.use([GaugeChart, SVGRenderer]);

const POLL_MS = 5000;

interface SystemLoadsCardProps {
  lang: "ro" | "en" | "pl";
}

function formatBytes(kib?: number): string {
  // Moonraker reports system_memory in KiB.
  if (!kib || kib <= 0) return "N/A";
  const bytes = kib * 1024;
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatFreq(hz?: number): string {
  if (!hz || hz <= 0) return "N/A";
  if (hz >= 1_000_000) return `${(hz / 1_000_000).toFixed(0)} MHz`;
  if (hz >= 1_000) return `${(hz / 1_000).toFixed(0)} kHz`;
  return `${hz} Hz`;
}

const Gauge: React.FC<{ value: number; label: string; dark: boolean }> = ({
  value,
  label,
  dark,
}) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current, undefined, { renderer: "svg" });
    chartRef.current = chart;
    const handle = () => chart.resize();
    window.addEventListener("resize", handle);
    return () => {
      window.removeEventListener("resize", handle);
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const axisColor = dark ? "#3a4150" : "#d4d9e0";
    const textColor = dark ? "#e6e9ee" : "#1f2733";
    const v = Math.max(0, Math.min(100, Math.round(value)));
    chart.setOption({
      series: [
        {
          type: "gauge",
          startAngle: 210,
          endAngle: -30,
          min: 0,
          max: 100,
          radius: "92%",
          center: ["50%", "58%"],
          progress: {
            show: true,
            width: 10,
            roundCap: true,
            itemStyle: {
              color:
                v >= 90 ? "#e5484d" : v >= 70 ? "#f5a524" : "#3aa675",
            },
          },
          axisLine: { lineStyle: { width: 10, color: [[1, axisColor]] } },
          pointer: { show: false },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: { show: false },
          anchor: { show: false },
          title: {
            show: true,
            offsetCenter: [0, "38%"],
            color: textColor,
            fontSize: 12,
          },
          detail: {
            valueAnimation: true,
            offsetCenter: [0, "0%"],
            fontSize: 22,
            fontWeight: 700,
            color: textColor,
            formatter: "{value}%",
          },
          data: [{ value: v, name: label }],
        },
      ],
    });
  }, [value, label, dark]);

  return <div ref={ref} style={{ width: "100%", height: 130 }} />;
};

const KV: React.FC<{ icon?: React.ReactNode; k: string; v: React.ReactNode }> = ({
  icon,
  k,
  v,
}) => (
  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      gap: "0.75rem",
      padding: "0.25rem 0",
      fontSize: "0.82rem",
    }}
  >
    <span style={{ color: "var(--text-secondary, #8b93a1)", display: "flex", alignItems: "center", gap: "0.35rem" }}>
      {icon}
      {k}
    </span>
    <strong style={{ textAlign: "right", overflow: "hidden", textOverflow: "ellipsis" }}>
      {v}
    </strong>
  </div>
);

export const SystemLoadsCard: React.FC<SystemLoadsCardProps> = ({ lang }) => {
  const t = translations[lang];
  const [data, setData] = useState<MachineSystem | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [dark, setDark] = useState<boolean>(() =>
    typeof document === "undefined"
      ? true
      : document.documentElement.getAttribute("data-theme-mode") !== "light",
  );

  useEffect(() => {
    const el = document.documentElement;
    const observer = new MutationObserver(() =>
      setDark(el.getAttribute("data-theme-mode") !== "light"),
    );
    observer.observe(el, {
      attributes: true,
      attributeFilter: ["data-theme-mode"],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch("/api/machine/system", {
          headers: { Accept: "application/json" },
        });
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as MachineSystem;
        if (!cancelled) setData(json);
      } catch {
        /* keep last good data */
      } finally {
        if (!cancelled) setLoaded(true);
      }
    };
    void poll();
    const id = window.setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const { cpuPct, memPct, memUsed, memTotal, cpuTemp, host, mcus } = useMemo(() => {
    const proc = data?.proc_stats ?? {};
    const info = data?.system_info ?? {};
    const cpu =
      typeof proc?.system_cpu_usage?.cpu === "number"
        ? proc.system_cpu_usage.cpu
        : 0;
    const mem = proc?.system_memory ?? {};
    const total = typeof mem?.total === "number" ? mem.total : 0;
    const used = typeof mem?.used === "number" ? mem.used : 0;
    const mp = total > 0 ? (used / total) * 100 : 0;
    const mcuList = Object.entries(data?.mcus ?? {}).map(([name, obj]: [string, any]) => {
      const stats = obj?.last_stats ?? {};
      // mcu_task_avg alone is a task-execution DURATION in seconds (e.g. 0.00001),
      // not a 0-100 load %. Mirrors Mainsail's heuristic instead: task_avg plus 3
      // std-deviations, scaled against Klipper's ~2.5ms per-task time budget.
      const taskAvg = typeof stats?.mcu_task_avg === "number" ? stats.mcu_task_avg : undefined;
      const taskStddev =
        typeof stats?.mcu_task_stddev === "number" ? stats.mcu_task_stddev : undefined;
      const loadRatio =
        taskAvg !== undefined && taskStddev !== undefined
          ? taskAvg + (3 * taskStddev) / 0.0025
          : undefined;
      return {
        name,
        version: obj?.mcu_version ?? "N/A",
        freq:
          typeof stats?.freq === "number"
            ? stats.freq
            : Number(obj?.mcu_constants?.CLOCK_FREQ) || 0,
        loadPercent:
          loadRatio !== undefined ? Math.max(0, Math.min(100, Math.round(loadRatio * 100))) : undefined,
        awake: stats?.mcu_awake,
      };
    });
    return {
      cpuPct: cpu,
      memPct: mp,
      memUsed: used,
      memTotal: total,
      cpuTemp: typeof proc?.cpu_temp === "number" ? proc.cpu_temp : undefined,
      host: {
        os:
          info?.distribution?.name ??
          info?.distribution?.id ??
          "N/A",
        cpu:
          info?.cpu_info?.cpu_desc ??
          info?.cpu_info?.model ??
          info?.cpu_info?.processor ??
          "N/A",
        cores: info?.cpu_info?.cpu_count,
        python: info?.python?.version_parts
          ? info.python.version_parts.slice(0, 3).join(".")
          : info?.python?.version ?? undefined,
        network: info?.network ?? {},
      },
      mcus: mcuList,
    };
  }, [data]);

  return (
    <section className="dashboard-card machine-panel">
      <div className="card-title">
        <Cpu size={20} />
        <span>{t.machSystemLoads}</span>
      </div>

      {!loaded ? (
        <div className="list-empty-state">{t.machLoading}</div>
      ) : !data?.system_info && !data?.proc_stats ? (
        <div className="list-empty-state">{t.machUnavailable}</div>
      ) : (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "0.5rem",
              marginBottom: "0.5rem",
            }}
          >
            <Gauge value={cpuPct} label={t.machCpu} dark={dark} />
            <Gauge value={memPct} label={t.machMem} dark={dark} />
          </div>

          <div style={{ marginTop: "0.25rem" }}>
            <div
              style={{
                fontSize: "0.72rem",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                color: "var(--text-secondary, #8b93a1)",
                display: "flex",
                alignItems: "center",
                gap: "0.35rem",
                marginBottom: "0.25rem",
              }}
            >
              <Server size={13} /> {t.machHost}
            </div>
            <KV k={t.machOs} v={host.os} />
            <KV
              k={t.machProcessor}
              v={host.cores ? `${host.cpu} (${host.cores})` : host.cpu}
            />
            <KV
              icon={<MemoryStick size={13} />}
              k={t.machMemory}
              v={`${formatBytes(memUsed)} / ${formatBytes(memTotal)}`}
            />
            {cpuTemp !== undefined && (
              <KV
                icon={<Thermometer size={13} />}
                k={t.machTemp}
                v={`${cpuTemp.toFixed(1)} °C`}
              />
            )}
            {host.python && <KV k={t.machPython} v={host.python} />}
            {Object.entries(host.network).map(([iface, val]: [string, any]) => (
              <KV
                key={iface}
                icon={<Network size={13} />}
                k={iface}
                v={
                  Array.isArray(val?.ip_addresses)
                    ? val.ip_addresses
                        .map((ip: any) => ip?.address ?? ip)
                        .filter(Boolean)
                        .join(", ") || "—"
                    : "—"
                }
              />
            ))}
          </div>

          {mcus.map((mcu) => (
            <div key={mcu.name} style={{ marginTop: "0.5rem" }}>
              <div
                style={{
                  fontSize: "0.72rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  color: "var(--text-secondary, #8b93a1)",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.35rem",
                  marginBottom: "0.25rem",
                }}
              >
                <Cpu size={13} /> {mcu.name}
              </div>
              {mcu.loadPercent !== undefined && (
                <div style={{ maxWidth: 160, margin: "0 auto" }}>
                  <Gauge value={mcu.loadPercent} label={t.machLoad} dark={dark} />
                </div>
              )}
              <KV k={t.machVersion} v={mcu.version} />
              <KV k={t.machFreq} v={formatFreq(mcu.freq)} />
              {mcu.awake !== undefined && mcu.awake !== null && (
                <KV k={t.machAwake} v={String(mcu.awake)} />
              )}
            </div>
          ))}
        </>
      )}
    </section>
  );
};

export default SystemLoadsCard;

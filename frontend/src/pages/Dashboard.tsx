import React, { useState, useEffect, useMemo, useRef } from "react";
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DatasetComponent,
} from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import {
  Play,
  Pause,
  Square,
  Thermometer,
  Sliders,
  Move,
  Crosshair,
  Grid3X3,
  CheckCircle,
  AlertTriangle,
  Home,
  Unlock,
  Settings,
  MoreVertical,
  ChevronDown,
  FileText,
  Terminal,
  Send,
} from "lucide-react";
import type { PrinterState, PortalConfig } from "../usePrinterState";
import { translations } from "../translations";

// Register ECharts modules
echarts.use([
  LineChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DatasetComponent,
  SVGRenderer,
]);

interface DashboardProps {
  state: PrinterState;
  config: PortalConfig | null;
  role: string | null;
  lang: "ro" | "en";
  theme: "light" | "dark";
  uploadProgress: number | null;
  onPreheat: (preset: string) => Promise<any>;
  onRunMacro: (name: string) => Promise<any>;
  onJog: (axis: string, distance: number) => Promise<any>;
  onMoveTo: (axis: string, position: number) => Promise<any>;
  onHome: (axis?: string) => Promise<any>;
  onDisableMotors: () => Promise<any>;
  onSetTargetTemp: (heater: string, target: number) => Promise<any>;
  onSetSpeedFactor: (factor: number) => Promise<any>;
  onStartPrint: (filename: string) => Promise<any>;
  onPause: () => Promise<any>;
  onResume: () => Promise<any>;
  onCancel: () => Promise<any>;
  onUpload: (
    file: File,
  ) => Promise<{ success: boolean; filename?: string; error?: string }>;
}

interface TempDataPoint {
  time: number;
  hotend: number;
  hotendTarget: number;
  bed: number;
  bedTarget: number;
}

type TemperatureStoreObject = {
  temperatures?: Array<number | null>;
  targets?: Array<number | null>;
};

type FileMetadata = {
  estimated_time?: number;
  thumbnails?: Array<{
    width?: number;
    relative_path?: string;
  }>;
};

type MacroParam = {
  type: "int" | "string" | "double" | null;
  default: string | null;
};

type MacroDefinition = {
  name: string;
  label: string;
  description?: string;
  params: Record<string, MacroParam>;
};

const DEFAULT_MACRO_DESCRIPTION = "G-Code macro";

const toFiniteNumber = (value: unknown, fallback = 0): number => {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
};

const hasValue = (value: unknown): boolean => {
  if (value === null || value === undefined) return false;
  if (typeof value === "number") return Number.isFinite(value) && value > 0;
  if (typeof value === "string") return value.trim() !== "" && value !== "N/A";
  return true;
};

const getMacroParams = (gcode: string): Record<string, MacroParam> => {
  const ret: Record<string, MacroParam> = {};
  const paramRegex =
    /{%?.*?params\.([A-Za-z_0-9]+)(?:\|(int|string|double))?(?:\|default\('?"?(.*?)"?'?\))?(?:\|(int|string))?.*?%?}/;
  let currentMatch = gcode;
  let params = paramRegex.exec(currentMatch);

  while (params) {
    ret[params[1]] = {
      type: (params[2] ?? params[4] ?? null) as MacroParam["type"],
      default: params[3] ?? null,
    };
    currentMatch = currentMatch.replace(params[0], "");
    params = paramRegex.exec(currentMatch);
  }

  const paramInRegex = /{%?.*?if.*?'([A-Za-z_0-9]+)' (?:not )?in params.*?%?}/;
  currentMatch = gcode;
  params = paramInRegex.exec(currentMatch);

  while (params) {
    if (!ret[params[1]]) {
      ret[params[1]] = { type: null, default: null };
    }
    currentMatch = currentMatch.replace(params[0], "");
    params = paramInRegex.exec(currentMatch);
  }

  return ret;
};

const formatMacroLabel = (name: string): string => {
  return name.replace(/_/g, " ");
};

const parseTemperatureStore = (payload: unknown): TempDataPoint[] => {
  const root =
    payload && typeof payload === "object" && "result" in payload
      ? (payload as { result?: unknown }).result
      : payload;

  if (!root || typeof root !== "object") return [];

  const store = root as Record<string, TemperatureStoreObject | undefined>;
  const extruder = store.extruder;
  const bed = store.heater_bed;
  const sampleCount = Math.max(
    extruder?.temperatures?.length ?? 0,
    extruder?.targets?.length ?? 0,
    bed?.temperatures?.length ?? 0,
    bed?.targets?.length ?? 0,
  );

  if (sampleCount === 0) return [];

  const now = Date.now();
  const points: TempDataPoint[] = [];
  for (let i = 0; i < sampleCount; i += 1) {
    const ageSeconds = sampleCount - 1 - i;
    points.push({
      time: now - ageSeconds * 1000,
      hotend: toFiniteNumber(extruder?.temperatures?.[i]),
      hotendTarget: toFiniteNumber(extruder?.targets?.[i]),
      bed: toFiniteNumber(bed?.temperatures?.[i]),
      bedTarget: toFiniteNumber(bed?.targets?.[i]),
    });
  }

  return points;
};

const TempGraph: React.FC<{
  history: TempDataPoint[];
  autoscale: boolean;
  hideMonitors: boolean;
  theme: "light" | "dark";
  labels: {
    extruder: string;
    bed: string;
    extruderTarget: string;
    bedTarget: string;
  };
}> = ({ history, autoscale, hideMonitors, theme, labels }) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);

  // Initialize chart
  useEffect(() => {
    if (!chartRef.current) return;

    const chart = echarts.init(chartRef.current, undefined, {
      renderer: "svg",
    });
    chartInstance.current = chart;

    const handleResize = () => chart.resize();
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(chartRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.dispose();
      chartInstance.current = null;
    };
  }, []);

  // Update chart options when data or settings change
  useEffect(() => {
    const chart = chartInstance.current;
    if (!chart || history.length === 0) return;

    const isDark = theme === "dark";
    const fgColorHi = isDark ? "rgba(255,255,255,0.87)" : "rgba(0,0,0,0.87)";
    const fgColorMid = isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)";
    const fgColorFaint = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
    const bgTooltip = isDark ? "rgba(30,30,30,0.95)" : "rgba(255,255,255,0.95)";

    const hotendColor = "#f44336";
    const hotendTargetColor = isDark
      ? "rgba(244,67,54,0.4)"
      : "rgba(244,67,54,0.55)";
    const bedColor = "#2196f3";
    const bedTargetColor = isDark
      ? "rgba(33,150,243,0.4)"
      : "rgba(33,150,243,0.55)";

    const series: any[] = [
      {
        name: labels.extruder,
        type: "line",
        data: history.map((p) => [p.time, p.hotend]),
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2, color: hotendColor },
        itemStyle: { color: hotendColor },
        emphasis: { focus: "series" },
      },
      {
        name: labels.bed,
        type: "line",
        data: history.map((p) => [p.time, p.bed]),
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2, color: bedColor },
        itemStyle: { color: bedColor },
        emphasis: { focus: "series" },
      },
    ];

    if (!hideMonitors) {
      series.push(
        {
          name: labels.extruderTarget,
          type: "line",
          data: history.map((p) => [p.time, p.hotendTarget]),
          smooth: false,
          showSymbol: false,
          lineStyle: {
            width: 1.5,
            color: hotendTargetColor,
            type: "dashed",
          },
          itemStyle: { color: hotendTargetColor },
          emphasis: { focus: "series" },
        },
        {
          name: labels.bedTarget,
          type: "line",
          data: history.map((p) => [p.time, p.bedTarget]),
          smooth: false,
          showSymbol: false,
          lineStyle: {
            width: 1.5,
            color: bedTargetColor,
            type: "dashed",
          },
          itemStyle: { color: bedTargetColor },
          emphasis: { focus: "series" },
        },
      );
    }

    const formatTime = (ts: number) => {
      const d = new Date(ts);
      return d.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    };

    const option: echarts.EChartsCoreOption = {
      animation: false,
      grid: {
        top: 12,
        right: 12,
        bottom: 28,
        left: 38,
      },
      tooltip: {
        trigger: "axis",
        backgroundColor: bgTooltip,
        borderColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)",
        borderWidth: 1,
        textStyle: {
          color: fgColorHi,
          fontSize: 12,
        },
        axisPointer: {
          type: "cross",
          lineStyle: {
            color: fgColorMid,
            type: "dashed",
          },
          crossStyle: {
            color: fgColorMid,
          },
          label: {
            backgroundColor: isDark ? "#333" : "#555",
            color: "#fff",
          },
        },
        formatter: (params: any) => {
          if (!Array.isArray(params) || params.length === 0) return "";
          const ts = params[0].value[0];
          const d = new Date(ts);
          const timeStr = d.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          });

          let rows = `<div style="font-weight:600;margin-bottom:4px;border-bottom:1px solid ${isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.1)"};padding-bottom:4px">🕐 ${timeStr}</div>`;

          for (const p of params) {
            const val =
              p.value[1] !== null && p.value[1] !== undefined
                ? p.value[1].toFixed(1)
                : "--";
            rows += `<div style="display:flex;justify-content:space-between;gap:16px;align-items:center"><span>${p.marker} ${p.seriesName}</span><strong>${val}°C</strong></div>`;
          }

          return rows;
        },
      },
      xAxis: {
        type: "time",
        splitNumber: 5,
        minInterval: 60 * 1000,
        splitLine: {
          show: true,
          lineStyle: { color: fgColorFaint },
        },
        axisLine: {
          lineStyle: { color: fgColorFaint },
        },
        axisLabel: {
          color: fgColorMid,
          fontSize: 10,
          formatter: (value: number) => formatTime(value),
        },
      },
      yAxis: {
        type: "value",
        min: autoscale
          ? (value: any) => Math.max(0, Math.floor(value.min - 5))
          : 0,
        max: autoscale
          ? (value: any) => Math.ceil((value.max + 10) / 20) * 20
          : (value: any) => Math.max(300, Math.ceil(value.max + 20)),
        minInterval: 20,
        splitLine: {
          lineStyle: { color: fgColorFaint },
        },
        axisLine: {
          show: true,
          lineStyle: { color: fgColorFaint },
        },
        axisLabel: {
          color: fgColorMid,
          fontSize: 10,
          formatter: "{value}",
        },
      },
      series,
    };

    chart.setOption(option, true);
  }, [history, autoscale, hideMonitors, theme, labels]);

  return (
    <div className="temp-graph-container" style={{ marginTop: "1rem" }}>
      <div ref={chartRef} style={{ width: "100%", height: "220px" }} />
    </div>
  );
};

export const Dashboard: React.FC<DashboardProps> = ({
  state,
  config,
  role,
  lang,
  theme,
  onPreheat,
  onRunMacro,
  onJog,
  onMoveTo,
  onHome,
  onDisableMotors,
  onSetTargetTemp,
  onSetSpeedFactor,
  onStartPrint,
  onPause,
  onResume,
  onCancel,
}) => {
  const [speedVal, setSpeedVal] = useState<number>(state.speed_factor || 100);
  const [speedInput, setSpeedInput] = useState<string>(
    String(state.speed_factor || 100),
  );
  const [isSpeedFocused, setIsSpeedFocused] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [extruderTarget, setExtruderTarget] = useState<string>("");
  const [bedTarget, setBedTarget] = useState<string>("");
  const [axisInputs, setAxisInputs] = useState<Record<"x" | "y" | "z", string>>({
    x: "",
    y: "",
    z: "",
  });
  const [focusedAxis, setFocusedAxis] = useState<"x" | "y" | "z" | null>(null);
  const [isExtruderFocused, setIsExtruderFocused] = useState(false);
  const [isBedFocused, setIsBedFocused] = useState(false);

  // Synchronize target inputs with current state targets when not focused
  useEffect(() => {
    if (!isExtruderFocused) {
      setExtruderTarget(
        state.hotend_target > 0 ? state.hotend_target.toString() : "0",
      );
    }
  }, [state.hotend_target, isExtruderFocused]);

  useEffect(() => {
    if (!isBedFocused) {
      setBedTarget(state.bed_target > 0 ? state.bed_target.toString() : "0");
    }
  }, [state.bed_target, isBedFocused]);

  // Settings dropdown for temperature graph
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toolheadSettingsOpen, setToolheadSettingsOpen] = useState(false);
  const [toolheadActionsOpen, setToolheadActionsOpen] = useState(false);
  const [toolheadCollapsed, setToolheadCollapsed] = useState<boolean>(() => {
    return localStorage.getItem("toolheadCollapsed") === "true";
  });
  const [statusCollapsed, setStatusCollapsed] = useState<boolean>(() => {
    return localStorage.getItem("statusCollapsed") === "true";
  });
  const [tempsCollapsed, setTempsCollapsed] = useState<boolean>(() => {
    return localStorage.getItem("tempsCollapsed") === "true";
  });
  const [macrosCollapsed, setMacrosCollapsed] = useState<boolean>(() => {
    return localStorage.getItem("macrosCollapsed") === "true";
  });
  const [consoleCollapsed, setConsoleCollapsed] = useState<boolean>(() => {
    return localStorage.getItem("consoleCollapsed") === "true";
  });
  const [speedFactorCollapsed, setSpeedFactorCollapsed] = useState<boolean>(
    () => {
      return localStorage.getItem("speedFactorCollapsed") === "true";
    },
  );
  const [showToolheadPosition, setShowToolheadPosition] = useState<boolean>(() => {
    return localStorage.getItem("showToolheadPosition") !== "false";
  });
  const [showToolheadCoordinates, setShowToolheadCoordinates] =
    useState<boolean>(() => {
      return localStorage.getItem("showToolheadCoordinates") !== "false";
    });
  const [showToolheadControl, setShowToolheadControl] = useState<boolean>(() => {
    return localStorage.getItem("showToolheadControl") !== "false";
  });
  const [showToolheadZOffset, setShowToolheadZOffset] = useState<boolean>(() => {
    return localStorage.getItem("showToolheadZOffset") !== "false";
  });
  const [showToolheadSpeedFactor, setShowToolheadSpeedFactor] =
    useState<boolean>(() => {
      return localStorage.getItem("showToolheadSpeedFactor") !== "false";
    });
  const [showChart, setShowChart] = useState<boolean>(() => {
    return localStorage.getItem("showChart") !== "false";
  });
  const [autoscaleChart, setAutoscaleChart] = useState<boolean>(() => {
    return localStorage.getItem("autoscaleChart") === "true";
  });
  const [hideMonitors, setHideMonitors] = useState<boolean>(() => {
    return localStorage.getItem("hideMonitors") === "true";
  });

  const [presetDropdownOpen, setPresetDropdownOpen] = useState(false);
  const [extruderPresetOpen, setExtruderPresetOpen] = useState(false);
  const [bedPresetOpen, setBedPresetOpen] = useState(false);
  const [openMacroParams, setOpenMacroParams] = useState<string | null>(null);
  const [macroParamValues, setMacroParamValues] = useState<
    Record<string, Record<string, string>>
  >({});
  const dropdownRef = useRef<HTMLDivElement>(null);
  const extruderPresetRef = useRef<HTMLDivElement>(null);
  const bedPresetRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const toolheadSettingsRef = useRef<HTMLDivElement>(null);
  const toolheadActionsRef = useRef<HTMLDivElement>(null);
  const macroParamRef = useRef<HTMLDivElement>(null);

  const t = translations[lang];

  const chartLabels = useMemo(
    () => ({
      extruder: t.extruder,
      bed: t.heaterBed,
      extruderTarget: t.chartExtruderTarget,
      bedTarget: t.chartBedTarget,
    }),
    [t],
  );

  useEffect(() => {
    if (state.speed_factor) {
      setSpeedVal(state.speed_factor);
    }
  }, [state.speed_factor]);

  // Keep the editable speed input in sync unless the user is typing in it.
  useEffect(() => {
    if (!isSpeedFocused) {
      setSpeedInput(String(speedVal));
    }
  }, [speedVal, isSpeedFocused]);

  useEffect(() => {
    if (!isExtruderFocused) {
      setExtruderTarget(state.hotend_target.toFixed(0));
    }
  }, [state.hotend_target, isExtruderFocused]);

  useEffect(() => {
    if (!isBedFocused) {
      setBedTarget(state.bed_target.toFixed(0));
    }
  }, [state.bed_target, isBedFocused]);

  // Handle click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setPresetDropdownOpen(false);
      }
      if (extruderPresetRef.current && !extruderPresetRef.current.contains(event.target as Node)) {
        setExtruderPresetOpen(false);
      }
      if (bedPresetRef.current && !bedPresetRef.current.contains(event.target as Node)) {
        setBedPresetOpen(false);
      }
      if (
        settingsRef.current &&
        !settingsRef.current.contains(event.target as Node)
      ) {
        setSettingsOpen(false);
      }
      if (
        toolheadSettingsRef.current &&
        !toolheadSettingsRef.current.contains(event.target as Node)
      ) {
        setToolheadSettingsOpen(false);
      }
      if (
        toolheadActionsRef.current &&
        !toolheadActionsRef.current.contains(event.target as Node)
      ) {
        setToolheadActionsOpen(false);
      }
      if (
        macroParamRef.current &&
        !macroParamRef.current.contains(event.target as Node)
      ) {
        setOpenMacroParams(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const [tempHistory, setTempHistory] = useState<TempDataPoint[]>([]);

  useEffect(() => {
    let active = true;

    const fetchTemperatureHistory = async () => {
      try {
        const response = await fetch("/api/temperature_store");
        if (!response.ok) {
          throw new Error(`Temperature history failed: ${response.status}`);
        }

        const payload = await response.json();
        const points = parseTemperatureStore(payload);
        if (active && points.length > 0) {
          setTempHistory(points.slice(-600));
        }
      } catch (error) {
        console.warn("Failed to fetch temperature history", error);
      }
    };

    fetchTemperatureHistory();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setTempHistory((prev) => {
        const next = [
          ...prev,
          {
            time: now,
            hotend: state.hotend_temp || 0,
            hotendTarget: state.hotend_target || 0,
            bed: state.bed_temp || 0,
            bedTarget: state.bed_target || 0,
          },
        ];
        if (next.length > 600) {
          return next.slice(next.length - 600);
        }
        return next;
      });
    }, 2000);
    return () => clearInterval(interval);
  }, [
    state.hotend_temp,
    state.hotend_target,
    state.bed_temp,
    state.bed_target,
  ]);

  // Fetch Moonraker Thumbnail
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [currentFileMetadata, setCurrentFileMetadata] =
    useState<FileMetadata | null>(null);

  useEffect(() => {
    const fname = state.filename;
    if (!fname || fname === "N/A" || !config?.moonraker_url) {
      setThumbnailUrl(null);
      setCurrentFileMetadata(null);
      return;
    }

    let active = true;
    const fetchMetadata = async () => {
      try {
        const url = `${config.moonraker_url}/server/files/metadata?filename=${encodeURIComponent(fname)}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error("Failed to fetch metadata");
        const data = await res.json();
        const metadata = data.result as FileMetadata | undefined;
        if (active) setCurrentFileMetadata(metadata ?? null);
        const thumbs = metadata?.thumbnails;
        if (thumbs && thumbs.length > 0) {
          const bestThumb = thumbs.reduce((prev: any, current: any) =>
            prev.width > current.width ? prev : current,
          );
          if (active) {
            setThumbnailUrl(
              `${config.moonraker_url}/server/files/gcodes/${bestThumb.relative_path}`,
            );
          }
        } else {
          if (active) setThumbnailUrl(null);
        }
      } catch (e) {
        console.error("Error fetching thumbnail:", e);
        if (active) setThumbnailUrl(null);
        if (active) setCurrentFileMetadata(null);
      }
    };

    fetchMetadata();
    return () => {
      active = false;
    };
  }, [state.filename, config?.moonraker_url]);

  const handleStartPrint = async () => {
    const fileToPrint = state.filename || uploadedFile;
    if (!fileToPrint) return;
    try {
      await onStartPrint(fileToPrint);
      setUploadedFile(null);
      setSuccessMsg(t.printStarted);
    } catch (e: any) {
      setErrorMsg(e.message || t.printStartFailed);
    }
  };

  const handleJogAction = async (axis: string, distance: number) => {
    try {
      setErrorMsg(null);
      await onJog(axis, distance);
    } catch (e: any) {
      setErrorMsg(e.message || t.moveFailed);
    }
  };

  const handleHomeAction = async (axis: string = "home") => {
    try {
      setErrorMsg(null);
      const targetAxis = axis === "home" ? "home" : `home${axis}`;
      await onHome(targetAxis);
    } catch (e: any) {
      setErrorMsg(e.message || t.homeFailed);
    }
  };

  const handleDisableMotors = async () => {
    try {
      setErrorMsg(null);
      await onDisableMotors();
    } catch (e: any) {
      setErrorMsg(e.message || "Failed to disable motors");
    }
  };

  const handlePreheatPreset = async (preset: string) => {
    try {
      setErrorMsg(null);
      await onPreheat(preset);
    } catch (e: any) {
      setErrorMsg(e.message || t.preheatFailed);
    }
  };

  const handleMacroAction = async (macroName: string) => {
    try {
      setErrorMsg(null);
      await onRunMacro(macroName);
      setOpenMacroParams(null);
    } catch (e: any) {
      setErrorMsg(e.message || t.macroFailed);
    }
  };

  const handleMacroParamChange = (
    macroName: string,
    paramName: string,
    value: string,
  ) => {
    setMacroParamValues((prev) => ({
      ...prev,
      [macroName]: {
        ...(prev[macroName] ?? {}),
        [paramName]: value,
      },
    }));
  };

  const handleMacroWithParams = async (macro: MacroDefinition) => {
    const values = macroParamValues[macro.name] ?? {};
    const params = Object.keys(macro.params)
      .filter((paramName) => !paramName.startsWith("_"))
      .map((paramName) => {
        const raw = values[paramName]?.trim() ?? "";
        if (!raw) return null;
        const value = raw.includes(" ") ? `"${raw}"` : raw;
        return `${paramName}=${value}`;
      })
      .filter((value): value is string => Boolean(value));

    await handleMacroAction(
      params.length ? `${macro.name} ${params.join(" ")}` : macro.name,
    );
  };

  const handleSpeedFactorChange = async (newFactor: number) => {
    setSpeedVal(newFactor);
    try {
      await onSetSpeedFactor(newFactor);
    } catch (e: any) {
      setErrorMsg(e.message || t.speedFailed);
    }
  };

  // Commit the typed speed value, clamped to the allowed range.
  const handleSpeedInputSubmit = () => {
    const max = config?.limits.max_speed_factor || 500;
    const parsed = Math.round(parseFloat(speedInput));
    if (Number.isNaN(parsed)) {
      setSpeedInput(String(speedVal));
      return;
    }
    const clamped = Math.min(max, Math.max(10, parsed));
    setSpeedInput(String(clamped));
    if (clamped !== speedVal) {
      void handleSpeedFactorChange(clamped);
    }
  };

  const handleExtruderTargetSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const target = parseFloat(extruderTarget);
    if (!isNaN(target) && target >= 0 && target <= 300) {
      try {
        await onSetTargetTemp("extruder", target);
      } catch (err: any) {
        setErrorMsg(err.message || "Failed to set extruder temperature");
      }
    }
  };

  const handleBedTargetSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const target = parseFloat(bedTarget);
    if (!isNaN(target) && target >= 0 && target <= 120) {
      try {
        await onSetTargetTemp("heater_bed", target);
      } catch (err: any) {
        setErrorMsg(err.message || "Failed to set bed temperature");
      }
    }
  };

  const handleTargetPreset = async (
    heater: "extruder" | "heater_bed",
    presetName: string,
  ) => {
    if (presetName === "") return;

    if (presetName === "cooldown") {
      if (heater === "extruder") setExtruderTarget("0");
      else setBedTarget("0");
      try {
        await onSetTargetTemp(heater, 0);
      } catch (err: any) {
        setErrorMsg(err.message || "Failed to set temperature preset");
      }
      return;
    }

    const preset = config?.preheat_presets[presetName];
    if (!preset) return;

    const target = heater === "extruder" ? preset.hotend : preset.bed;
    if (heater === "extruder") setExtruderTarget(String(target));
    else setBedTarget(String(target));

    try {
      await onSetTargetTemp(heater, target);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to set temperature preset");
    }
  };

  const toggleSetting = (
    key: "showChart" | "autoscaleChart" | "hideMonitors",
  ) => {
    if (key === "showChart") {
      const val = !showChart;
      setShowChart(val);
      localStorage.setItem("showChart", String(val));
    } else if (key === "autoscaleChart") {
      const val = !autoscaleChart;
      setAutoscaleChart(val);
      localStorage.setItem("autoscaleChart", String(val));
    } else if (key === "hideMonitors") {
      const val = !hideMonitors;
      setHideMonitors(val);
      localStorage.setItem("hideMonitors", String(val));
    }
  };

  const setStoredBool = (
    key: string,
    setter: React.Dispatch<React.SetStateAction<boolean>>,
  ) => {
    setter((prev) => {
      const next = !prev;
      localStorage.setItem(key, String(next));
      return next;
    });
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return "00:00:00";
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    return [
      h.toString().padStart(2, "0"),
      m.toString().padStart(2, "0"),
      s.toString().padStart(2, "0"),
    ].join(":");
  };

  const formatSignedTime = (secs: number) => {
    if (!Number.isFinite(secs)) return "N/A";
    const sign = secs < 0 ? "-" : "";
    return `${sign}${formatTime(Math.abs(secs))}`;
  };

  const isPrinting = state.print_state === "printing";
  const isPaused = state.print_state === "paused";
  const isOffline = state.connection_state !== "connected";
  const canMove =
    !isOffline &&
    (!isPrinting || (config?.limits.allow_movement_while_printing ?? false));

  const isAdmin = role === "admin";
  const canHome =
    canMove && (isAdmin || (config?.limits.allow_home_for_guests ?? false));

  const macroDefinitions = useMemo<MacroDefinition[]>(() => {
    const settings = state.configfile?.settings;
    // Klipper lowercases config section names, so build a lowercase-keyed lookup.
    const settingMap: Record<string, unknown> = {};
    if (settings && typeof settings === "object") {
      for (const [key, value] of Object.entries(settings)) {
        settingMap[key.toLowerCase()] = value;
      }
    }

    return (config?.allowed_macros ?? []).map((macroName) => {
      const setting = settingMap[`gcode_macro ${macroName.toLowerCase()}`];
      const macroSetting =
        setting && typeof setting === "object"
          ? (setting as Record<string, unknown>)
          : {};
      const gcode =
        typeof macroSetting.gcode === "string" ? macroSetting.gcode : "";
      const description =
        typeof macroSetting.description === "string" &&
        macroSetting.description !== DEFAULT_MACRO_DESCRIPTION
          ? macroSetting.description
          : undefined;

      return {
        name: macroName,
        label: formatMacroLabel(macroName),
        description,
        params: getMacroParams(gcode),
      };
    });
  }, [config?.allowed_macros, state.configfile?.settings]);

  const consoleEvents = useMemo(() => {
    return (state.console_events ?? []).slice(-250).reverse();
  }, [state.console_events]);

  const homedAxes = (
    state.toolhead?.homed_axes ??
    state.homed_axes ??
    ""
  ).toLowerCase();
  const livePosition =
    state.motion_report?.live_position ??
    state.gcode_move?.gcode_position ??
    state.toolhead?.position ??
    [];
  const gcodePosition =
    state.gcode_move?.gcode_position ?? state.toolhead?.position ?? [];
  const gcodeX = gcodePosition[0];
  const gcodeY = gcodePosition[1];
  const gcodeZ = gcodePosition[2];
  const axisMinimum = state.toolhead?.axis_minimum ?? [];
  const axisMaximum = state.toolhead?.axis_maximum ?? [];
  const activeMeshProfile = state.bed_mesh?.profile_name?.trim() ?? "";
  const positionMode = (state.gcode_move?.absolute_coordinates ?? true)
    ? "absolute"
    : "relative";
  const isXHomed = homedAxes.includes("x");
  const isYHomed = homedAxes.includes("y");
  const isZHomed = homedAxes.includes("z");
  const allHomed = isXHomed && isYHomed && isZHomed;
  const idleState = state.idle_timeout?.state ?? "";
  const isMotorsLocked = homedAxes.trim() !== "" || idleState === "Printing";
  const unlockMotorsDisabled = !isMotorsLocked || isOffline || isPrinting;
  const isBusy = state.print_state === "standby" && idleState === "Printing";
  const displayPrintState = isBusy ? "busy" : state.print_state;
  const slicerEstimatedTime = currentFileMetadata?.estimated_time;
  const slicerTimeLeft =
    slicerEstimatedTime && slicerEstimatedTime > 0 && state.elapsed_time > 0
      ? slicerEstimatedTime - state.elapsed_time
      : null;

  useEffect(() => {
    setAxisInputs((prev) => {
      const next = { ...prev };
      if (focusedAxis !== "x" && gcodeX !== undefined) {
        next.x = gcodeX.toFixed(2);
      }
      if (focusedAxis !== "y" && gcodeY !== undefined) {
        next.y = gcodeY.toFixed(2);
      }
      if (focusedAxis !== "z" && gcodeZ !== undefined) {
        next.z = gcodeZ.toFixed(3);
      }
      return next.x === prev.x && next.y === prev.y && next.z === prev.z
        ? prev
        : next;
    });
  }, [focusedAxis, gcodeX, gcodeY, gcodeZ]);

  const getAxisBounds = (axis: "x" | "y" | "z") => {
    const index = axis === "x" ? 0 : axis === "y" ? 1 : 2;
    return {
      min: axisMinimum[index],
      max: axisMaximum[index],
    };
  };

  const handleMoveToSubmit = async (axis: "x" | "y" | "z") => {
    const rawValue = axisInputs[axis];
    const nextPosition = Number.parseFloat(rawValue);
    const currentPosition =
      gcodePosition[axis === "x" ? 0 : axis === "y" ? 1 : 2];
    const { min, max } = getAxisBounds(axis);

    if (!Number.isFinite(nextPosition)) {
      setErrorMsg(`Invalid ${axis.toUpperCase()} position`);
      return;
    }

    if (min === undefined || max === undefined) {
      setErrorMsg(`Axis ${axis.toUpperCase()} limits are unavailable`);
      return;
    }

    if (nextPosition < min || nextPosition > max) {
      setErrorMsg(
        `${axis.toUpperCase()} must be between ${min.toFixed(2)} and ${max.toFixed(2)} mm`,
      );
      return;
    }

    if (
      currentPosition !== undefined &&
      Math.abs(nextPosition - currentPosition) < 0.0005
    ) {
      return;
    }

    try {
      setErrorMsg(null);
      await onMoveTo(axis, nextPosition);
    } catch (e: any) {
      setErrorMsg(e.message || `Failed to move ${axis.toUpperCase()}`);
    }
  };

  const renderAxisInput = (
    axis: "x" | "y" | "z",
    label: string,
    index: number,
    isHomed: boolean,
  ) => {
    const precision = axis === "z" ? 3 : 2;
    const liveValue = livePosition[index];
    const gcodeValue = gcodePosition[index];
    const { min, max } = getAxisBounds(axis);

    return (
      <label className="toolhead-axis-input">
        <span className="toolhead-axis-current">
          [{gcodeValue !== undefined ? gcodeValue.toFixed(precision) : "--"}]
        </span>
        <span className="toolhead-axis-name">{label}</span>
        <input
          type="number"
          step={axis === "z" ? 0.001 : 0.01}
          min={min}
          max={max}
          value={axisInputs[axis]}
          disabled={!canMove || !isHomed}
          aria-label={`${label} position`}
          onFocus={() => setFocusedAxis(axis)}
          onChange={(event) =>
            setAxisInputs((prev) => ({ ...prev, [axis]: event.target.value }))
          }
          onBlur={() => {
            setFocusedAxis(null);
            handleMoveToSubmit(axis);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
            } else if (event.key === "Escape") {
              setAxisInputs((prev) => ({
                ...prev,
                [axis]:
                  gcodeValue !== undefined
                    ? gcodeValue.toFixed(precision)
                    : prev[axis],
              }));
              event.currentTarget.blur();
            }
          }}
        />
        <span className="toolhead-axis-live">
          {liveValue !== undefined ? liveValue.toFixed(precision) : "--"}
        </span>
      </label>
    );
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "standby":
        return t.statusStandby;
      case "disconnected":
        return t.statusOffline;
      case "connecting":
        return t.statusConnecting;
      case "printing":
        return t.statusPrinting;
      case "busy":
        return t.statusBusy;
      case "paused":
        return t.statusPaused;
      case "error":
        return t.statusError;
      default:
        return status;
    }
  };

  const getHeaterStateStr = (current: number, target: number) => {
    if (target === 0) return t.heaterOff;
    if (Math.abs(current - target) < 2) return t.heaterHolding;
    return current < target ? t.heaterHeating : t.heaterCooling;
  };

  const renderCollapseButton = (
    collapsed: boolean,
    storageKey: string,
    setter: React.Dispatch<React.SetStateAction<boolean>>,
  ) => (
    <button
      className={`icon-button ${collapsed ? "collapsed" : ""}`}
      title={collapsed ? t.expand : t.collapse}
      onClick={() => setStoredBool(storageKey, setter)}
    >
      <ChevronDown size={18} />
    </button>
  );

  if (isOffline) {
    return (
      <div className="page-content dashboard-offline-page">
        <div className="dashboard-offline-message">
          <AlertTriangle size={42} />
          <div className="dashboard-offline-copy">
            <h4>{t.errorTitle}</h4>
            <p>{t.offlineMessage}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="page-content dashboard-page"
      style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
    >
      {/* Alert Banner */}
      {!isOffline && errorMsg && (
        <div className="rules-warning-banner" style={{ margin: 0 }}>
          <AlertTriangle size={24} />
          <div>
            <h4 style={{ fontWeight: "bold" }}>{t.errorTitle}</h4>
            <p style={{ fontSize: "0.9rem" }}>{errorMsg}</p>
          </div>
        </div>
      )}

      {successMsg && (
        <div
          className="rules-warning-banner"
          style={{
            margin: 0,
            backgroundColor: "rgba(76, 175, 80, 0.08)",
            borderColor: "var(--success-color)",
          }}
        >
          <CheckCircle size={24} style={{ color: "var(--success-color)" }} />
          <div>
            <h4 style={{ fontWeight: "bold", color: "var(--success-color)" }}>
              {t.successTitle}
            </h4>
            <p style={{ fontSize: "0.9rem", color: "var(--text-primary)" }}>
              {successMsg}
            </p>
          </div>
        </div>
      )}

      <div className="dashboard-grid">
        {/* Column 1: Status & Toolhead */}
        <div
          style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}
        >
          {/* Card 1: Job Status & Control */}
          <div className="dashboard-card">
            <div className="card-title">
              <Sliders size={20} />
              <span>{t.printerState}</span>
              <div style={{ marginLeft: "auto" }} className="status-indicator">
                <div className={`status-dot ${displayPrintState}`} />
                <span style={{ textTransform: "capitalize" }}>
                  {getStatusText(displayPrintState)}
                </span>
              </div>
              {renderCollapseButton(
                statusCollapsed,
                "statusCollapsed",
                setStatusCollapsed,
              )}
            </div>

            {!statusCollapsed && (
              <>
                <div className="job-info-split">
                  {state.filename && state.filename !== "N/A" && (
                    <div className="job-info-image-container">
                      {thumbnailUrl ? (
                        <img
                          src={thumbnailUrl}
                          alt={state.filename}
                          className="job-info-image"
                        />
                      ) : (
                        <div
                          className="job-info-image-placeholder"
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: "100%",
                            height: "100%",
                            background: "var(--bg-color-light, #2e2e2e)",
                            borderRadius: "var(--border-radius)",
                          }}
                        >
                          <FileText size={48} style={{ opacity: 0.3 }} />
                        </div>
                      )}
                    </div>
                  )}

                  <div className="job-info-grid">
                    <div>
                      <span className="label">{t.currentFile}</span>
                      <span className="val filename-val">
                        {hasValue(state.filename) ? state.filename : "N/A"}
                      </span>
                    </div>
                    <div>
                      <span className="label">{t.progress}</span>
                      <span className="val">
                        {hasValue(state.progress)
                          ? `${state.progress.toFixed(1)}%`
                          : "N/A"}
                      </span>
                    </div>
                    <div>
                      <span className="label">{t.elapsedTime}</span>
                      <span className="val">
                        {hasValue(state.elapsed_time)
                          ? formatTime(state.elapsed_time)
                          : "N/A"}
                      </span>
                    </div>
                    <div>
                      <span className="label">
                        {t.timeLeft}{" "}
                        <span style={{ fontSize: "0.75rem", opacity: 0.7 }}>
                          ({t.estimated})
                        </span>
                      </span>
                      <span className="val">
                        {state.time_left !== undefined &&
                        hasValue(state.time_left)
                          ? formatTime(state.time_left)
                          : "N/A"}
                      </span>
                    </div>
                    <div>
                      <span className="label">{t.slicerRemaining}</span>
                      <span className="val">
                        {slicerTimeLeft !== null
                          ? formatSignedTime(slicerTimeLeft)
                          : "N/A"}
                      </span>
                    </div>
                  </div>
                </div>

                {(isPrinting || isPaused) && (
                  <div style={{ marginTop: "1rem" }}>
                    <div className="progress-bar-bg">
                      <div
                        className="progress-bar-fill"
                        style={{ width: `${state.progress}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="btn-action-row">
                  {isPrinting && (
                    <button
                      className="btn btn-primary btn-flex-action"
                      onClick={onPause}
                      disabled={isOffline}
                    >
                      <Pause size={16} /> Pause
                    </button>
                  )}
                  {isPaused && (
                    <button
                      className="btn btn-primary btn-flex-action"
                      onClick={onResume}
                      disabled={isOffline}
                    >
                      <Play size={16} /> {t.btnResume}
                    </button>
                  )}
                  {(isPrinting || isPaused) && (
                    <button
                      className="btn btn-danger btn-flex-action"
                      onClick={onCancel}
                      disabled={isOffline}
                    >
                      <Square size={16} /> {t.btnCancel}
                    </button>
                  )}
                  {!isPrinting &&
                    !isPaused &&
                    (state.filename || uploadedFile) && (
                      <button
                        className="btn btn-primary btn-flex-action"
                        onClick={handleStartPrint}
                        disabled={isOffline}
                      >
                        <Play size={16} /> {t.btnStartPrint}
                      </button>
                    )}
                </div>
              </>
            )}
          </div>

          {/* Card 4: Toolhead (Mainsail style) */}
          <div className="dashboard-card toolhead-card">
            <div className="card-title">
              <Move size={20} />
              <span>{t.toolhead}</span>
              <div
                className="panel-header-actions"
                style={{
                  marginLeft: "auto",
                  display: "flex",
                  color: "var(--text-secondary)",
                }}
              >
                <div ref={toolheadActionsRef} className="panel-menu-wrap">
                  <button
                    className="icon-button"
                    disabled={isPrinting}
                    title={t.actions}
                    onClick={() => setToolheadActionsOpen((open) => !open)}
                  >
                    <MoreVertical size={18} />
                  </button>
                  {toolheadActionsOpen && (
                    <div className="panel-menu">
                      <button
                        onClick={() => {
                          handleDisableMotors();
                          setToolheadActionsOpen(false);
                        }}
                        disabled={unlockMotorsDisabled}
                      >
                        <Unlock size={14} /> {t.unlockMotors}
                      </button>
                      <button
                        onClick={() => {
                          handleHomeAction("home");
                          setToolheadActionsOpen(false);
                        }}
                        disabled={!canHome}
                      >
                        <Home size={14} /> {t.homeAll}
                      </button>
                    </div>
                  )}
                </div>
                <div ref={toolheadSettingsRef} className="panel-menu-wrap">
                  <button
                    className="icon-button"
                    title={t.toolheadSettings}
                    onClick={() => setToolheadSettingsOpen((open) => !open)}
                  >
                    <Settings size={18} />
                  </button>
                  {toolheadSettingsOpen && (
                    <div className="panel-menu">
                      <label>
                        <input
                          type="checkbox"
                          checked={showToolheadPosition}
                          onChange={() =>
                            setStoredBool(
                              "showToolheadPosition",
                              setShowToolheadPosition,
                            )
                          }
                        />
                        {t.positionOutput}
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={showToolheadCoordinates}
                          onChange={() =>
                            setStoredBool(
                              "showToolheadCoordinates",
                              setShowToolheadCoordinates,
                            )
                          }
                        />
                        {t.coordinateFields}
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={showToolheadControl}
                          onChange={() =>
                            setStoredBool(
                              "showToolheadControl",
                              setShowToolheadControl,
                            )
                          }
                        />
                        {t.controlButtons}
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={showToolheadZOffset}
                          onChange={() =>
                            setStoredBool(
                              "showToolheadZOffset",
                              setShowToolheadZOffset,
                            )
                          }
                        />
                        {t.zOffsetSetting}
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={showToolheadSpeedFactor}
                          onChange={() =>
                            setStoredBool(
                              "showToolheadSpeedFactor",
                              setShowToolheadSpeedFactor,
                            )
                          }
                        />
                        {t.speedFactorSetting}
                      </label>
                    </div>
                  )}
                </div>
                {renderCollapseButton(
                  toolheadCollapsed,
                  "toolheadCollapsed",
                  setToolheadCollapsed,
                )}
              </div>
            </div>

            {!toolheadCollapsed && showToolheadPosition && (
            <div className="toolhead-status-row">
              <div className="toolhead-position-mode">
                <Crosshair size={14} />
                <span>
                  {t.position}:{" "}
                  {positionMode === "absolute"
                    ? t.positionAbsolute
                    : t.positionRelative}
                </span>
              </div>
              {activeMeshProfile && (
                <div className="toolhead-mesh-profile">
                  <Grid3X3 size={14} />
                  <span>{activeMeshProfile}</span>
                </div>
              )}
            </div>
            )}

            {!toolheadCollapsed && showToolheadCoordinates && (
            <div className="toolhead-coordinate-grid">
              {renderAxisInput("x", "X", 0, isXHomed)}
              {renderAxisInput("y", "Y", 1, isYHomed)}
              {renderAxisInput("z", "Z", 2, isZHomed)}
            </div>
            )}

            {!toolheadCollapsed && showToolheadControl && (
            <div
              className="toolhead-controls-grid"
              style={{ marginTop: "1rem" }}
            >
              <div className="toolhead-main-actions">
                <button
                  className={`btn btn-secondary ${allHomed ? "homed" : ""}`}
                  onClick={() => handleHomeAction("home")}
                  disabled={!canHome}
                >
                  <Home size={16} /> {t.all}
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={handleDisableMotors}
                  disabled={unlockMotorsDisabled}
                >
                  <Unlock size={16} /> {t.unlockMotors}
                </button>
              </div>

              {/* Row 1: X Axis Controls */}
              <div className="toolhead-control-row">
                <div className="step-buttons">
                  <button
                    className="btn btn-step"
                    disabled={!canMove}
                    onClick={() => handleJogAction("x", -100)}
                  >
                    -100
                  </button>
                  <button
                    className="btn btn-step"
                    disabled={!canMove}
                    onClick={() => handleJogAction("x", -10)}
                  >
                    -10
                  </button>
                  <button
                    className="btn btn-step"
                    disabled={!canMove}
                    onClick={() => handleJogAction("x", -1)}
                  >
                    -1
                  </button>
                  <button
                    className={`btn-axis-home ${isXHomed ? "homed" : ""}`}
                    onClick={() => handleHomeAction("x")}
                    disabled={!canHome}
                  >
                    X
                  </button>
                  <button
                    className="btn btn-step"
                    disabled={!canMove}
                    onClick={() => handleJogAction("x", 1)}
                  >
                    +1
                  </button>
                  <button
                    className="btn btn-step"
                    disabled={!canMove}
                    onClick={() => handleJogAction("x", 10)}
                  >
                    +10
                  </button>
                  <button
                    className="btn btn-step"
                    disabled={!canMove}
                    onClick={() => handleJogAction("x", 100)}
                  >
                    +100
                  </button>
                </div>
              </div>

              {/* Row 2: Y Axis Controls */}
              <div className="toolhead-control-row">
                <div className="step-buttons">
                  <button
                    className="btn btn-step"
                    disabled={!canMove}
                    onClick={() => handleJogAction("y", -100)}
                  >
                    -100
                  </button>
                  <button
                    className="btn btn-step"
                    disabled={!canMove}
                    onClick={() => handleJogAction("y", -10)}
                  >
                    -10
                  </button>
                  <button
                    className="btn btn-step"
                    disabled={!canMove}
                    onClick={() => handleJogAction("y", -1)}
                  >
                    -1
                  </button>
                  <button
                    className={`btn-axis-home ${isYHomed ? "homed" : ""}`}
                    onClick={() => handleHomeAction("y")}
                    disabled={!canHome}
                  >
                    Y
                  </button>
                  <button
                    className="btn btn-step"
                    disabled={!canMove}
                    onClick={() => handleJogAction("y", 1)}
                  >
                    +1
                  </button>
                  <button
                    className="btn btn-step"
                    disabled={!canMove}
                    onClick={() => handleJogAction("y", 10)}
                  >
                    +10
                  </button>
                  <button
                    className="btn btn-step"
                    disabled={!canMove}
                    onClick={() => handleJogAction("y", 100)}
                  >
                    +100
                  </button>
                </div>
              </div>

              {/* Row 3: Z Axis Controls */}
              <div className="toolhead-control-row">
                <div className="step-buttons">
                  <button
                    className="btn btn-step"
                    disabled={!canMove}
                    onClick={() => handleJogAction("z", -25)}
                  >
                    -25
                  </button>
                  <button
                    className="btn btn-step"
                    disabled={!canMove}
                    onClick={() => handleJogAction("z", -1)}
                  >
                    -1
                  </button>
                  <button
                    className="btn btn-step"
                    disabled={!canMove}
                    onClick={() => handleJogAction("z", -0.1)}
                  >
                    -0.1
                  </button>
                  <button
                    className={`btn-axis-home ${isZHomed ? "homed" : ""}`}
                    onClick={() => handleHomeAction("z")}
                    disabled={!canHome}
                  >
                    Z
                  </button>
                  <button
                    className="btn btn-step"
                    disabled={!canMove}
                    onClick={() => handleJogAction("z", 0.1)}
                  >
                    +0.1
                  </button>
                  <button
                    className="btn btn-step"
                    disabled={!canMove}
                    onClick={() => handleJogAction("z", 1)}
                  >
                    +1
                  </button>
                  <button
                    className="btn btn-step"
                    disabled={!canMove}
                    onClick={() => handleJogAction("z", 25)}
                  >
                    +25
                  </button>
                </div>
              </div>
            </div>
            )}

            {/* Z-Offset Section */}
            {!toolheadCollapsed && showToolheadZOffset && (
              <div
              className="toolhead-zoffset-section"
              style={{
                borderTop: "1px solid var(--border-color)",
                paddingTop: "1rem",
                marginTop: "1rem",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: "0.5rem",
                  fontSize: "0.85rem",
                }}
              >
                <span>{t.zOffset}:</span>
                <span style={{ fontWeight: "bold" }}>
                  {state.gcode_move?.homing_origin?.[2] !== undefined
                    ? (-state.gcode_move.homing_origin[2]).toFixed(3)
                    : "0.000"}{" "}
                  mm
                </span>
              </div>
              <div
                className="zoffset-buttons-grid"
                style={{ display: "flex", flexDirection: "column", gap: "6px" }}
              >
                <div style={{ display: "flex", gap: "6px" }}>
                  <button
                    className="btn btn-step"
                    style={{ flex: 1 }}
                    disabled={!canMove}
                    onClick={() => handleJogAction("z_offset", 0.005)}
                  >
                    +0.005
                  </button>
                  <button
                    className="btn btn-step"
                    style={{ flex: 1 }}
                    disabled={!canMove}
                    onClick={() => handleJogAction("z_offset", 0.01)}
                  >
                    +0.01
                  </button>
                  <button
                    className="btn btn-step"
                    style={{ flex: 1 }}
                    disabled={!canMove}
                    onClick={() => handleJogAction("z_offset", 0.025)}
                  >
                    +0.025
                  </button>
                  <button
                    className="btn btn-step"
                    style={{ flex: 1 }}
                    disabled={!canMove}
                    onClick={() => handleJogAction("z_offset", 0.05)}
                  >
                    +0.05
                  </button>
                </div>
                <div style={{ display: "flex", gap: "6px" }}>
                  <button
                    className="btn btn-step"
                    style={{ flex: 1 }}
                    disabled={!canMove}
                    onClick={() => handleJogAction("z_offset", -0.005)}
                  >
                    -0.005
                  </button>
                  <button
                    className="btn btn-step"
                    style={{ flex: 1 }}
                    disabled={!canMove}
                    onClick={() => handleJogAction("z_offset", -0.01)}
                  >
                    -0.01
                  </button>
                  <button
                    className="btn btn-step"
                    style={{ flex: 1 }}
                    disabled={!canMove}
                    onClick={() => handleJogAction("z_offset", -0.025)}
                  >
                    -0.025
                  </button>
                  <button
                    className="btn btn-step"
                    style={{ flex: 1 }}
                    disabled={!canMove}
                    onClick={() => handleJogAction("z_offset", -0.05)}
                  >
                    -0.05
                  </button>
                </div>
              </div>
              </div>
            )}
          </div>
        </div>

        {/* Column 2: Temperatures */}
        <div
          style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}
        >
          {/* Card 2: Temperatures (Mainsail style) */}
          <div className="dashboard-card temps-card">
            <div className="card-title" style={{ position: "relative" }}>
              <Thermometer size={20} />
              <span>{t.tempPreheat}</span>

              {/* Presets dropdown like Mainsail */}
              <div
                style={{
                  marginLeft: "auto",
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                }}
              >
                <div ref={dropdownRef} style={{ position: "relative" }}>
                  <button
                    onClick={() => setPresetDropdownOpen(!presetDropdownOpen)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--text-secondary)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                      fontSize: "0.85rem",
                      padding: "4px 8px",
                      borderRadius: "4px",
                    }}
                    className="dropdown-item-hover"
                  >
                    {t.preset} <ChevronDown size={14} />
                  </button>
                  {presetDropdownOpen && (
                    <div
                      style={{
                        position: "absolute",
                        top: "100%",
                        right: 0,
                        zIndex: 10,
                        background: "var(--surface-color)",
                        border: "1px solid var(--border-color)",
                        borderRadius: "4px",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
                        minWidth: "160px",
                        marginTop: "4px",
                      }}
                    >
                      {config &&
                        Object.keys(config.preheat_presets).map((preset) => (
                          <div
                            key={preset}
                            className="dropdown-item-hover"
                            style={{
                              padding: "8px 12px",
                              cursor: "pointer",
                              fontSize: "0.85rem",
                              borderBottom: "1px solid var(--border-color)",
                            }}
                            onClick={() => {
                              handlePreheatPreset(preset);
                              setPresetDropdownOpen(false);
                            }}
                          >
                            {preset.toUpperCase()} (
                            {config.preheat_presets[preset].hotend}/
                            {config.preheat_presets[preset].bed})
                          </div>
                        ))}
                      <div
                        className="dropdown-item-hover"
                        style={{
                          padding: "8px 12px",
                          cursor: "pointer",
                          fontSize: "0.85rem",
                          color: "var(--info-color)",
                        }}
                        onClick={() => {
                          handlePreheatPreset("cooldown");
                          setPresetDropdownOpen(false);
                        }}
                      >
                        {t.cooldown}
                      </div>
                    </div>
                  )}
                </div>

                <div ref={settingsRef} style={{ position: "relative" }}>
                  <button
                    className="icon-button"
                    title={t.temperatureSettings}
                    onClick={() => setSettingsOpen(!settingsOpen)}
                  >
                    <Settings
                      size={18}
                      style={{
                        color: settingsOpen
                          ? "var(--accent-color)"
                          : "currentColor",
                      }}
                    />
                  </button>
                  {settingsOpen && (
                    <div
                      style={{
                        position: "absolute",
                        top: "100%",
                        right: 0,
                        zIndex: 10,
                        background: "var(--surface-color)",
                        border: "1px solid var(--border-color)",
                        borderRadius: "4px",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
                        padding: "10px",
                        minWidth: "180px",
                        marginTop: "4px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                      }}
                    >
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          fontSize: "0.85rem",
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={showChart}
                          onChange={() => toggleSetting("showChart")}
                        />
                        {t.showChart}
                      </label>
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          fontSize: "0.85rem",
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={autoscaleChart}
                          onChange={() => toggleSetting("autoscaleChart")}
                        />
                        {t.autoscaleChart}
                      </label>
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          fontSize: "0.85rem",
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={hideMonitors}
                          onChange={() => toggleSetting("hideMonitors")}
                        />
                        {t.hideTargets}
                      </label>
                    </div>
                  )}
                </div>
                {renderCollapseButton(
                  tempsCollapsed,
                  "tempsCollapsed",
                  setTempsCollapsed,
                )}
              </div>
            </div>

            {/* Mainsail-style Temperatures Table */}
            {!tempsCollapsed && (
              <>
            <div className="temps-table" style={{ marginTop: "0.5rem" }}>
              <div className="temps-table-header">
                <div>{t.tableName}</div>
                <div style={{ textAlign: "center" }}>{t.tableState}</div>
                <div style={{ textAlign: "right" }}>{t.tableCurrent}</div>
                <div style={{ textAlign: "right" }}>{t.tableTarget}</div>
              </div>

              {/* Extruder Row */}
              <div className="temps-table-row">
                <div className="heater-name">
                  <Thermometer
                    size={16}
                    style={{ color: "#f44336", marginRight: "6px" }}
                  />
                  <span>{t.extruder}</span>
                </div>
                <div
                  className="heater-state"
                  style={{
                    textAlign: "center",
                    textTransform: "capitalize",
                    fontSize: "0.85rem",
                    opacity: 0.7,
                  }}
                >
                  {getHeaterStateStr(state.hotend_temp, state.hotend_target)}
                </div>
                <div
                  className="heater-current"
                  style={{ textAlign: "right", fontWeight: "bold" }}
                >
                  {state.hotend_temp.toFixed(1)}°C
                </div>
                <div className="heater-target">
                  <form
                    className="heater-target-control"
                    onSubmit={handleExtruderTargetSubmit}
                  >
                    <div className="heater-input-box">
                      <input
                        type="number"
                        value={extruderTarget}
                        onChange={(e) => setExtruderTarget(e.target.value)}
                        onFocus={() => setIsExtruderFocused(true)}
                        onBlur={() => {
                          setIsExtruderFocused(false);
                          handleExtruderTargetSubmit();
                        }}
                        disabled={isOffline || isPrinting}
                      />
                      <span className="heater-unit">°C</span>
                    </div>
                    <div ref={extruderPresetRef} style={{ position: "relative" }}>
                      <button
                        type="button"
                        className="preset-select-btn"
                        title={t.preset}
                        disabled={isOffline || isPrinting}
                        onClick={() => setExtruderPresetOpen((o) => !o)}
                      >
                        <ChevronDown size={14} />
                      </button>
                      {extruderPresetOpen && (
                        <div className="preset-popup">
                          {config && Object.entries(config.preheat_presets).map(([name, vals]) => (
                            <button key={name} type="button" className="preset-popup-item" onClick={() => { handleTargetPreset("extruder", name); setExtruderPresetOpen(false); }}>
                              <span>{vals.hotend}°C</span>
                              <span className="preset-popup-name">{name}</span>
                            </button>
                          ))}
                          <button type="button" className="preset-popup-item preset-popup-cooldown" onClick={() => { handleTargetPreset("extruder", "cooldown"); setExtruderPresetOpen(false); }}>
                            <span>0°C</span>
                            <span className="preset-popup-name">{t.cooldown}</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </form>
                </div>
              </div>

              {/* Bed Row */}
              <div className="temps-table-row">
                <div className="heater-name">
                  <Sliders
                    size={16}
                    style={{ color: "#2196f3", marginRight: "6px" }}
                  />
                  <span>{t.heaterBed}</span>
                </div>
                <div
                  className="heater-state"
                  style={{
                    textAlign: "center",
                    textTransform: "capitalize",
                    fontSize: "0.85rem",
                    opacity: 0.7,
                  }}
                >
                  {getHeaterStateStr(state.bed_temp, state.bed_target)}
                </div>
                <div
                  className="heater-current"
                  style={{ textAlign: "right", fontWeight: "bold" }}
                >
                  {state.bed_temp.toFixed(1)}°C
                </div>
                <div className="heater-target">
                  <form
                    className="heater-target-control"
                    onSubmit={handleBedTargetSubmit}
                  >
                    <div className="heater-input-box">
                      <input
                        type="number"
                        value={bedTarget}
                        onChange={(e) => setBedTarget(e.target.value)}
                        onFocus={() => setIsBedFocused(true)}
                        onBlur={() => {
                          setIsBedFocused(false);
                          handleBedTargetSubmit();
                        }}
                        disabled={isOffline || isPrinting}
                      />
                      <span className="heater-unit">°C</span>
                    </div>
                    <div ref={bedPresetRef} style={{ position: "relative" }}>
                      <button
                        type="button"
                        className="preset-select-btn"
                        title={t.preset}
                        disabled={isOffline || isPrinting}
                        onClick={() => setBedPresetOpen((o) => !o)}
                      >
                        <ChevronDown size={14} />
                      </button>
                      {bedPresetOpen && (
                        <div className="preset-popup">
                          {config && Object.entries(config.preheat_presets).map(([name, vals]) => (
                            <button key={name} type="button" className="preset-popup-item" onClick={() => { handleTargetPreset("heater_bed", name); setBedPresetOpen(false); }}>
                              <span>{vals.bed}°C</span>
                              <span className="preset-popup-name">{name}</span>
                            </button>
                          ))}
                          <button type="button" className="preset-popup-item preset-popup-cooldown" onClick={() => { handleTargetPreset("heater_bed", "cooldown"); setBedPresetOpen(false); }}>
                            <span>0°C</span>
                            <span className="preset-popup-name">{t.cooldown}</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </form>
                </div>
              </div>
            </div>

            {/* Real-time Graph Visualizer */}
            {showChart && (
              <TempGraph
                history={tempHistory}
                autoscale={autoscaleChart}
                hideMonitors={hideMonitors}
                theme={theme}
                labels={chartLabels}
              />
            )}
              </>
            )}
          </div>
        </div>

        {/* Column 3: Macros & Speed Factor */}
        <div
          style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}
        >
          {/* Card 5: Whitelisted Macros */}
          <div className="dashboard-card">
            <div className="card-title">
              <Sliders size={20} />
              <span>{t.macrosTitle}</span>
              <div className="panel-header-actions" style={{ marginLeft: "auto" }}>
                {renderCollapseButton(
                  macrosCollapsed,
                  "macrosCollapsed",
                  setMacrosCollapsed,
                )}
              </div>
            </div>

            {!macrosCollapsed && (
              <div className="macro-list">
                {macroDefinitions.map((macro) => {
                  const params = Object.entries(macro.params).filter(
                    ([paramName]) => !paramName.startsWith("_"),
                  );
                  const paramsOpen = openMacroParams === macro.name;

                  return (
                    <div
                      className="macro-entry"
                      key={macro.name}
                      ref={paramsOpen ? macroParamRef : undefined}
                    >
                      <div className="macro-button-group">
                        <button
                          className={`btn macro-run-button ${params.length ? "has-params" : ""}`}
                          disabled={isOffline || isPrinting}
                          onClick={() => handleMacroAction(macro.name)}
                          title={macro.description}
                        >
                          <span>{macro.label}</span>
                        </button>
                        {params.length > 0 && (
                          <button
                            className={`btn macro-param-toggle ${paramsOpen ? "active" : ""}`}
                            disabled={isOffline || isPrinting}
                            title={t.macroParameters}
                            onClick={() =>
                              setOpenMacroParams((current) =>
                                current === macro.name ? null : macro.name,
                              )
                            }
                          >
                            <ChevronDown size={16} />
                          </button>
                        )}
                      </div>
                      {paramsOpen && (
                        <div className="macro-param-panel">
                          <div className="macro-param-grid">
                            {params.map(([paramName, param]) => (
                              <label className="macro-param-field" key={paramName}>
                                <span>{paramName}</span>
                                <input
                                  value={
                                    macroParamValues[macro.name]?.[paramName] ??
                                    ""
                                  }
                                  placeholder={param.default ?? ""}
                                  inputMode={
                                    param.type === "int" ||
                                    param.type === "double"
                                      ? "decimal"
                                      : "text"
                                  }
                                  onChange={(event) =>
                                    handleMacroParamChange(
                                      macro.name,
                                      paramName,
                                      event.target.value,
                                    )
                                  }
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                      void handleMacroWithParams(macro);
                                    }
                                  }}
                                />
                              </label>
                            ))}
                          </div>
                          <button
                            className="btn btn-primary macro-param-send"
                            disabled={isOffline || isPrinting}
                            onClick={() => void handleMacroWithParams(macro)}
                          >
                            <Send size={15} /> {t.send}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
                {macroDefinitions.length === 0 && (
                  <span
                    style={{
                      fontSize: "0.85rem",
                      color: "var(--text-secondary)",
                    }}
                  >
                    {t.macrosNone}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="dashboard-card console-card">
            <div className="card-title">
              <Terminal size={20} />
              <span>{t.console}</span>
              <div className="panel-header-actions" style={{ marginLeft: "auto" }}>
                {renderCollapseButton(
                  consoleCollapsed,
                  "consoleCollapsed",
                  setConsoleCollapsed,
                )}
              </div>
            </div>

            {!consoleCollapsed && (
              <div className="console-log" aria-live="polite">
                {consoleEvents.length === 0 ? (
                  <div className="console-empty">{t.noConsoleMessages}</div>
                ) : (
                  consoleEvents.map((event, index) => (
                    <div
                      className={`console-row ${event.event_type}`}
                      key={`${event.time}-${index}`}
                    >
                      <span className="console-time">
                        {new Date(event.time * 1000).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <span className="console-message">{event.message}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Card 6: Speed Factor Adjustment */}
          {showToolheadSpeedFactor && (
          <div className="dashboard-card">
            <div className="card-title">
              <Sliders size={20} />
              <span>{t.speedFactorTitle}</span>
              <div className="panel-header-actions" style={{ marginLeft: "auto" }}>
                {renderCollapseButton(
                  speedFactorCollapsed,
                  "speedFactorCollapsed",
                  setSpeedFactorCollapsed,
                )}
              </div>
            </div>

            {!speedFactorCollapsed && (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "8px" }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "0.9rem",
                }}
              >
                <span>{t.speedLabel}</span>
                <span className="speed-input-wrap">
                  <input
                    type="number"
                    className="speed-input"
                    min={10}
                    max={config?.limits.max_speed_factor || 500}
                    value={speedInput}
                    disabled={isOffline}
                    onChange={(e) => setSpeedInput(e.target.value)}
                    onFocus={() => setIsSpeedFocused(true)}
                    onBlur={() => {
                      setIsSpeedFocused(false);
                      handleSpeedInputSubmit();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.currentTarget.blur();
                      } else if (e.key === "Escape") {
                        setSpeedInput(String(speedVal));
                        e.currentTarget.blur();
                      }
                    }}
                  />
                  <span className="speed-input-unit">%</span>
                </span>
              </div>
              <input
                type="range"
                min="10"
                max={config?.limits.max_speed_factor || 500}
                value={speedVal}
                onChange={(e) =>
                  handleSpeedFactorChange(Number(e.target.value))
                }
                disabled={isOffline}
                style={{
                  width: "100%",
                  accentColor: "var(--accent-color)",
                  cursor: isOffline ? "default" : "pointer",
                }}
              />
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  className="btn"
                  style={{ flex: 1, padding: "4px" }}
                  disabled={isOffline}
                  onClick={() =>
                    handleSpeedFactorChange(Math.max(10, speedVal - 10))
                  }
                >
                  -10%
                </button>
                <button
                  className="btn"
                  style={{ flex: 1, padding: "4px" }}
                  disabled={isOffline}
                  onClick={() => handleSpeedFactorChange(100)}
                >
                  {t.speedReset}
                </button>
                <button
                  className="btn"
                  style={{ flex: 1, padding: "4px" }}
                  disabled={isOffline}
                  onClick={() =>
                    handleSpeedFactorChange(
                      Math.min(
                        config?.limits.max_speed_factor || 500,
                        speedVal + 10,
                      ),
                    )
                  }
                >
                  +10%
                </button>
              </div>
            </div>
            )}
          </div>
          )}
        </div>
      </div>
    </div>
  );
};

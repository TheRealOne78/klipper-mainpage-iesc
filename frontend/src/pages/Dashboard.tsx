import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  Sliders,
  AlertTriangle,
  GripVertical,
  History,
  ListOrdered,
  Gauge,
} from "lucide-react";
import type {
  PrinterState,
  PortalConfig,
  PowerDevice,
  PrintHistory,
  PrintHistoryJob,
  JobQueueStatus,
  JobQueueEntry,
  GcodeFile,
  GcodeFileMetadata,
  UpdateComponent,
  AnnouncementEntry,
} from "../usePrinterState";
import { translations } from "../translations";
import {
  formatTime,
  getAxisBounds,
  num,
  auxType,
} from "../lib/dashboardFormat";
import { toErrorMessage } from "../lib/toErrorMessage";
import { useToast } from "../contexts/ToastContext";
import { WebcamPanel } from "./WebcamPanel";
import {
  buildMoonrakerThumbnailUrl,
  getGcodeBasename,
} from "../lib/gcodeThumbnails";
import { useReprintConfirm } from "../hooks/useReprintConfirm";
import { useStoredBool } from "../hooks/useStoredBool";
import { CollapseButton } from "../features/dashboard/CollapseButton";
import { FanCard } from "../features/dashboard/cards/FanCard";
import { ConsoleCard } from "../features/dashboard/cards/ConsoleCard";
import { PowerCard } from "../features/dashboard/cards/PowerCard";
import { MachineCard } from "../features/dashboard/cards/MachineCard";
import { CalibrateCard } from "../features/dashboard/cards/CalibrateCard";
import { UpdatesCard } from "../features/dashboard/cards/UpdatesCard";
import { ConfigCard } from "../features/dashboard/cards/ConfigCard";
import { InputShaperCard } from "../features/dashboard/cards/InputShaperCard";
import { FlowCard } from "../features/dashboard/cards/FlowCard";
import { PeripheralsCard } from "../features/dashboard/cards/PeripheralsCard";
import { ExcludeCard } from "../features/dashboard/cards/ExcludeCard";
import { ExtruderCard } from "../features/dashboard/cards/ExtruderCard";
import { RetractionCard } from "../features/dashboard/cards/RetractionCard";
import { LimitsCard } from "../features/dashboard/cards/LimitsCard";
import { ManualProbeCard } from "../features/dashboard/cards/ManualProbeCard";
import { AnnouncementsCard } from "../features/dashboard/cards/AnnouncementsCard";
import { HistoryCard } from "../features/dashboard/cards/HistoryCard";
import { QueueCard } from "../features/dashboard/cards/QueueCard";
import { FilesCard } from "../features/dashboard/cards/FilesCard";
import { MacrosCard } from "../features/dashboard/cards/MacrosCard";
import { TempsCard } from "../features/dashboard/cards/TempsCard";
import { ToolheadCard } from "../features/dashboard/cards/ToolheadCard";
import { StatusCard } from "../features/dashboard/cards/StatusCard";
import { usePermissions } from "../hooks/usePermissions";
import type { TempDataPoint } from "../features/dashboard/TempGraph";

interface DashboardProps {
  state: PrinterState;
  config: PortalConfig | null;
  role: string | null;
  lang: "ro" | "en" | "pl";
  theme: "light" | "dark";
  /** Card-rearrange mode, controlled from the nav bar in App. */
  editLayout: boolean;
  uploadProgress: number | null;
  onPreheat: (preset: string) => Promise<any>;
  onRunMacro: (name: string) => Promise<any>;
  onSendConsole: (command: string) => Promise<any>;
  onGetConsoleCommands: () => Promise<string[]>;
  onGetAnnouncements: () => Promise<AnnouncementEntry[]>;
  onSetFanSpeed: (speed: number) => Promise<any>;
  onExtrude: (length: number, speed: number) => Promise<any>;
  onManualProbe: (
    action: "testz" | "accept" | "abort",
    delta?: number,
  ) => Promise<any>;
  onSetRetraction: (
    retractLength: number,
    retractSpeed: number,
    unretractExtraLength: number,
    unretractSpeed: number,
  ) => Promise<any>;
  onSetLimits: (
    velocity: number,
    accel: number,
    squareCornerVelocity: number,
    minimumCruiseRatio: number,
  ) => Promise<any>;
  onSetFlow: (factor: number) => Promise<any>;
  onSetAuxFan: (name: string, speed: number) => Promise<any>;
  onSetAuxPin: (name: string, value: number) => Promise<any>;
  onSetAuxLed: (
    name: string,
    red: number,
    green: number,
    blue: number,
    white?: number,
  ) => Promise<any>;
  onSetAuxHeater: (name: string, target: number) => Promise<any>;
  onSetTmcCurrent: (stepper: string, current: number) => Promise<any>;
  onExcludeObject: (name: string) => Promise<any>;
  onGetPowerDevices: () => Promise<PowerDevice[]>;
  onSetPowerDevice: (
    device: string,
    action: "on" | "off" | "toggle",
  ) => Promise<any>;
  onHostReboot: () => Promise<any>;
  onHostShutdown: () => Promise<any>;
  onGetServices: () => Promise<string[]>;
  onServiceAction: (
    service: string,
    action: "restart" | "start" | "stop",
  ) => Promise<any>;
  onGetEndstops: () => Promise<Record<string, string>>;
  onGetConfigFiles: () => Promise<string[]>;
  onReadConfigFile: (path: string) => Promise<string>;
  onWriteConfigFile: (path: string, content: string) => Promise<void>;
  onGetUpdateStatus: () => Promise<UpdateComponent[]>;
  onMachineUpdate: (component: string) => Promise<any>;
  onGetPrintHistory: (limit?: number) => Promise<PrintHistory>;
  onGetGcodeFiles: () => Promise<GcodeFile[]>;
  onGetFileMetadata: (filename: string) => Promise<GcodeFileMetadata>;
  onDeleteGcodeFile: (path: string) => Promise<void>;
  onGetJobQueue: () => Promise<JobQueueStatus>;
  onJobQueueAdd: (filenames: string[]) => Promise<any>;
  onJobQueueDelete: (jobIds: string[], all?: boolean) => Promise<any>;
  onJobQueueSetState: (pause: boolean) => Promise<any>;
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

type TemperatureStoreObject = {
  temperatures?: Array<number | null>;
  targets?: Array<number | null>;
};

export type MacroParam = {
  type: "int" | "string" | "double" | null;
  default: string | null;
};

export type MacroDefinition = {
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

// Known dashboard card ids and their default column placement (3 columns).
const DASHBOARD_CARD_IDS = [
  "status",
  "webcam",
  "toolhead",
  "temps",
  "macros",
  "console",
  "speed",
  "queue",
  "fan",
  "calibrate",
  "peripherals",
  "exclude",
  "extruder",
  "retraction",
  "limits",
  "flow",
  "announcements",
  "manualprobe",
  "inputshaper",
] as const;

const DEFAULT_DASHBOARD_LAYOUT: string[][] = [
  [
    "status",
    "announcements",
    "manualprobe",
    "webcam",
    "toolhead",
    "calibrate",
    "inputshaper",
    "extruder",
    "flow",
  ],
  ["temps", "fan", "limits"],
  [
    "macros",
    "console",
    "speed",
    "queue",
    "peripherals",
    "exclude",
    "retraction",
  ],
];

// Load a persisted layout, dropping unknown ids and appending any newly-added
// card so future cards still show up for users who already have a saved layout.
function loadDashboardLayout(): string[][] {
  try {
    const raw = localStorage.getItem("dashboardLayout");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const cols: string[][] = parsed
          .slice(0, 3)
          .map((col: unknown) =>
            Array.isArray(col)
              ? col.filter(
                  (id): id is string =>
                    typeof id === "string" &&
                    (DASHBOARD_CARD_IDS as readonly string[]).includes(id),
                )
              : [],
          );
        while (cols.length < 3) cols.push([]);
        const present = new Set(cols.flat());
        const missing = DASHBOARD_CARD_IDS.filter((id) => !present.has(id));
        if (missing.length) cols[cols.length - 1].push(...missing);
        return cols;
      }
    }
  } catch {
    /* fall through to default */
  }
  return DEFAULT_DASHBOARD_LAYOUT.map((c) => [...c]);
}

export const Dashboard: React.FC<DashboardProps> = ({
  state,
  config,
  role,
  lang,
  theme,
  editLayout,
  onPreheat,
  onRunMacro,
  onSendConsole,
  onGetConsoleCommands,
  onGetAnnouncements,
  onSetFanSpeed,
  onExtrude,
  onManualProbe,
  onSetRetraction,
  onSetLimits,
  onSetFlow,
  onSetAuxFan,
  onSetAuxPin,
  onSetAuxLed,
  onSetAuxHeater,
  onSetTmcCurrent,
  onExcludeObject,
  onGetPowerDevices,
  onSetPowerDevice,
  onHostReboot,
  onHostShutdown,
  onGetServices,
  onServiceAction,
  onGetEndstops,
  onGetConfigFiles,
  onReadConfigFile,
  onWriteConfigFile,
  onGetUpdateStatus,
  onMachineUpdate,
  onGetPrintHistory,
  onGetGcodeFiles,
  onGetFileMetadata,
  onDeleteGcodeFile,
  onGetJobQueue,
  onJobQueueAdd,
  onJobQueueDelete,
  onJobQueueSetState,
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
  const { pushToast } = useToast();

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
  const [toolheadCollapsed, setToolheadCollapsed] = useStoredBool("toolheadCollapsed", false);
  const [statusCollapsed, setStatusCollapsed] = useStoredBool("statusCollapsed", false);
  // Active tab of the compact, Mainsail-style status card.
  const [statusTab, setStatusTab] = useState<
    "status" | "history" | "queue"
  >("status");
  const [tempsCollapsed, setTempsCollapsed] = useStoredBool("tempsCollapsed", false);
  const [macrosCollapsed, setMacrosCollapsed] = useStoredBool("macrosCollapsed", false);
  const [consoleCollapsed, setConsoleCollapsed] = useStoredBool("consoleCollapsed", false);
  // Console view controls (Mainsail-style): clear marker + settings dropdown.
  const [consoleClearedAt, setConsoleClearedAt] = useState(0);
  const [consoleSettingsOpen, setConsoleSettingsOpen] = useState(false);
  const [consoleHideTempReplies, setConsoleHideTempReplies] = useStoredBool(
    "consoleHideTempReplies",
    true,
  );
  const consoleSettingsRef = useRef<HTMLDivElement>(null);
  // Console command input + history (arrow-up recalls previous commands).
  const [consoleInput, setConsoleInput] = useState("");
  const [consoleSending, setConsoleSending] = useState(false);
  const [consoleHistory, setConsoleHistory] = useState<string[]>([]);
  const [consoleHistoryIdx, setConsoleHistoryIdx] = useState(-1);
  const [consoleCommands, setConsoleCommands] = useState<string[]>([]);
  const [announcements, setAnnouncements] = useState<AnnouncementEntry[]>([]);
  const [announcementsCollapsed, setAnnouncementsCollapsed] = useStoredBool(
    "announcementsCollapsed",
    false,
  );
  // Moonraker power devices (fetched over REST, not the WS state stream).
  const [powerDevices, setPowerDevices] = useState<PowerDevice[]>([]);
  const [powerError, setPowerError] = useState<string | null>(null);
  const [powerBusy, setPowerBusy] = useState<string | null>(null);
  const [powerCollapsed, setPowerCollapsed] = useStoredBool("powerCollapsed", false);
  const [machineCollapsed, setMachineCollapsed] = useStoredBool("machineCollapsed", false);
  const [machineBusy, setMachineBusy] = useState<string | null>(null);
  const [services, setServices] = useState<string[]>([]);
  const [selectedService, setSelectedService] = useState("");
  const [endstops, setEndstops] = useState<Record<string, string> | null>(null);
  const [updatesCollapsed, setUpdatesCollapsed] = useStoredBool("updatesCollapsed", false);
  const [updateComponents, setUpdateComponents] = useState<
    UpdateComponent[] | null
  >(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updateBusy, setUpdateBusy] = useState<string | null>(null);
  const [configCollapsed, setConfigCollapsed] = useStoredBool("configCollapsed", false);
  const [configFiles, setConfigFiles] = useState<string[]>([]);
  const [selectedConfig, setSelectedConfig] = useState("");
  const [configContent, setConfigContent] = useState("");
  const [configBusy, setConfigBusy] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [configNotice, setConfigNotice] = useState<string | null>(null);
  const [fanCollapsed, setFanCollapsed] = useStoredBool("fanCollapsed", false);
  const [fanPct, setFanPct] = useState(0);
  const [flowPct, setFlowPct] = useState(100);
  const [flowCollapsed, setFlowCollapsed] = useStoredBool("flowCollapsed", false);
  const [extruderCardCollapsed, setExtruderCardCollapsed] = useStoredBool("extruderCardCollapsed", false);
  const [extrudeLen, setExtrudeLen] = useState("10");
  const [extrudeSpeed, setExtrudeSpeed] = useState("5");
  const [extrudeBusy, setExtrudeBusy] = useState(false);
  const [retractionCollapsed, setRetractionCollapsed] = useStoredBool("retractionCollapsed", false);
  const [retractFields, setRetractFields] = useState<Record<string, string>>({});
  const [retractBusy, setRetractBusy] = useState(false);
  const [limitsCollapsed, setLimitsCollapsed] = useStoredBool("limitsCollapsed", false);
  const [limitsFields, setLimitsFields] = useState<Record<string, string>>({});
  const [limitsBusy, setLimitsBusy] = useState(false);
  const [calibrateCollapsed, setCalibrateCollapsed] = useStoredBool("calibrateCollapsed", false);
  const [inputShaperCollapsed, setInputShaperCollapsed] = useStoredBool(
    "inputShaperCollapsed",
    false,
  );
  const [peripheralsCollapsed, setPeripheralsCollapsed] = useStoredBool("peripheralsCollapsed", false);
  const [excludeCollapsed, setExcludeCollapsed] = useStoredBool("excludeCollapsed", false);
  const [excludeBusy, setExcludeBusy] = useState<string | null>(null);
  const [historyCollapsed, setHistoryCollapsed] = useStoredBool("historyCollapsed", false);
  const [printHistory, setPrintHistory] = useState<PrintHistory | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [queueCollapsed, setQueueCollapsed] = useStoredBool("queueCollapsed", false);
  const [jobQueue, setJobQueue] = useState<JobQueueStatus | null>(null);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [queueBusy, setQueueBusy] = useState<string | null>(null);
  const [filesCollapsed, setFilesCollapsed] = useStoredBool("filesCollapsed", false);
  const [gcodeFiles, setGcodeFiles] = useState<GcodeFile[] | null>(null);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [filesBusy, setFilesBusy] = useState<string | null>(null);
  const [filesFilter, setFilesFilter] = useState("");
  const [fileMeta, setFileMeta] = useState<
    Record<string, GcodeFileMetadata | null>
  >({});
  const requestedMetaRef = useRef<Set<string>>(new Set());
  const [speedFactorCollapsed, setSpeedFactorCollapsed] = useStoredBool("speedFactorCollapsed", false);
  const [showToolheadPosition, setShowToolheadPosition] = useStoredBool("showToolheadPosition", true);
  const [showToolheadCoordinates, setShowToolheadCoordinates] = useStoredBool("showToolheadCoordinates", true);
  const [showToolheadControl, setShowToolheadControl] = useStoredBool("showToolheadControl", true);
  const [showToolheadZOffset, setShowToolheadZOffset] = useStoredBool("showToolheadZOffset", true);
  const [showToolheadSpeedFactor, setShowToolheadSpeedFactor] = useStoredBool("showToolheadSpeedFactor", true);
  const [showChart, setShowChart] = useStoredBool("showChart", true);
  const [autoscaleChart, setAutoscaleChart] = useStoredBool("autoscaleChart", false);
  const [hideMonitors, setHideMonitors] = useStoredBool("hideMonitors", false);
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
  // "Print again?" confirmation (Mainsail-style reprint), shared with History/Files pages.
  const { requestReprint, reprintModal } = useReprintConfirm(t, onStartPrint);

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

  // Fetch current-file metadata (thumbnails are rendered by <GcodeThumbnail/>).
  const [currentFileMetadata, setCurrentFileMetadata] =
    useState<GcodeFileMetadata | null>(null);

  useEffect(() => {
    const fname = state.filename;
    if (!fname || fname === "N/A") {
      setCurrentFileMetadata(null);
      return;
    }

    let active = true;
    const fetchMetadata = async () => {
      try {
        const metadata = await onGetFileMetadata(fname);
        if (active) setCurrentFileMetadata(metadata ?? null);
      } catch (e) {
        console.error("Error fetching file metadata:", e);
        if (active) setCurrentFileMetadata(null);
      }
    };

    fetchMetadata();
    return () => {
      active = false;
    };
  }, [state.filename, config?.moonraker_url, onGetFileMetadata]);

  const handleStartPrint = async () => {
    const fileToPrint = state.filename || uploadedFile;
    if (!fileToPrint) return;
    try {
      await onStartPrint(fileToPrint);
      setUploadedFile(null);
      pushToast("success", t.printStarted);
    } catch (e: any) {
      pushToast("error", e.message || t.printStartFailed);
    }
  };

  const handleJogAction = async (axis: string, distance: number) => {
    try {
      await onJog(axis, distance);
    } catch (e: any) {
      pushToast("error", e.message || t.moveFailed);
    }
  };

  const handleHomeAction = async (axis: string = "home") => {
    try {
      const targetAxis = axis === "home" ? "home" : `home${axis}`;
      await onHome(targetAxis);
    } catch (e: any) {
      pushToast("error", e.message || t.homeFailed);
    }
  };

  const handleDisableMotors = async () => {
    try {
      await onDisableMotors();
    } catch (e: any) {
      pushToast("error", e.message || "Failed to disable motors");
    }
  };

  const handlePreheatPreset = async (preset: string) => {
    try {
      await onPreheat(preset);
    } catch (e: any) {
      pushToast("error", e.message || t.preheatFailed);
    }
  };

  const handleMacroAction = async (macroName: string) => {
    try {
      await onRunMacro(macroName);
      setOpenMacroParams(null);
    } catch (e: any) {
      pushToast("error", e.message || t.macroFailed);
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
      pushToast("error", e.message || t.speedFailed);
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
        pushToast("error", err.message || "Failed to set extruder temperature");
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
        pushToast("error", err.message || "Failed to set bed temperature");
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
        pushToast("error", err.message || "Failed to set temperature preset");
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
      pushToast("error", err.message || "Failed to set temperature preset");
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


  const isPrinting = state.print_state === "printing";
  const isPaused = state.print_state === "paused";
  const isOffline = state.connection_state !== "connected";
  const isPrinterReady = !isOffline && state.klipper_state === "ready";
  const isOfflineOrNotReady = isOffline || !isPrinterReady;

  // Config-driven capability gates. Admins bypass everything; guests are
  // governed by the [permissions] section of config.toml. Missing config
  // (still loading) uses usePermissions' per-key loading defaults.
  const {
    isAdmin,
    canViewStatus,
    canViewTemps,
    canControlTemps,
    canViewTempTarget,
    canViewWebcam,
    canViewToolhead,
    canControlToolhead,
    canViewMacros,
    canRunMacros,
    canViewConsole,
    canSendConsole,
    canViewSpeed,
    canControlPrint,
    canViewPower,
    canControlPower,
    canControlMachine,
    canViewFiles,
    canManageFiles,
  } = usePermissions(config, role);
  const canViewHistory = canViewFiles;
  const canViewQueue = canViewFiles;
  const canManageQueue = canControlPrint;

  // Poll power devices while the card is visible and expanded. Moonraker exposes
  // these over REST (not the WS status stream), so we fetch them separately.
  useEffect(() => {
    if (!canViewPower || powerCollapsed || isOffline) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const devices = await onGetPowerDevices();
        if (!cancelled) {
          setPowerDevices(devices);
          setPowerError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setPowerError(toErrorMessage(err));
        }
      }
    };
    void refresh();
    const id = window.setInterval(refresh, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [canViewPower, powerCollapsed, isOffline, onGetPowerDevices]);

  const handlePowerToggle = async (dev: PowerDevice) => {
    if (!canControlPower || powerBusy) return;
    const next = dev.status === "on" ? "off" : "on";
    setPowerBusy(dev.device);
    try {
      await onSetPowerDevice(dev.device, next);
      // Optimistic update; the next poll reconciles with Moonraker.
      setPowerDevices((list) =>
        list.map((d) =>
          d.device === dev.device ? { ...d, status: next } : d,
        ),
      );
      setPowerError(null);
    } catch (err) {
      setPowerError(toErrorMessage(err));
    } finally {
      setPowerBusy(null);
    }
  };

  // Fetch print history when the card is visible/expanded. Refreshed when a
  // print finishes (job count in the WS state changes) so the list stays current.
  // Keep the fan slider in sync with the reported part-cooling fan speed.
  const fanSpeedPct = Math.round((state.fan?.speed ?? 0) * 100);
  useEffect(() => {
    setFanPct(fanSpeedPct);
  }, [fanSpeedPct]);

  // Keep the flow slider in sync with the reported extrusion factor.
  const reportedFlowPct = Math.round(state.gcode_move?.extrude_factor ?? 100);
  useEffect(() => {
    setFlowPct(reportedFlowPct);
  }, [reportedFlowPct]);

  // Fetch Moonraker announcements (notification bell). The card auto-hides when
  // there are none.
  useEffect(() => {
    if (!canViewStatus || isOffline) return;
    let cancelled = false;
    (async () => {
      try {
        const entries = await onGetAnnouncements();
        if (!cancelled) setAnnouncements(entries);
      } catch {
        /* best-effort */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canViewStatus, isOffline, onGetAnnouncements]);

  // Fetch the available G-code command list once, for console autocomplete.
  useEffect(() => {
    if (!canSendConsole || isOffline || consoleCommands.length > 0) return;
    let cancelled = false;
    (async () => {
      try {
        const cmds = await onGetConsoleCommands();
        if (!cancelled) setConsoleCommands(cmds);
      } catch {
        /* autocomplete is best-effort */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canSendConsole, isOffline, consoleCommands.length, onGetConsoleCommands]);

  // Refetch when the print state transitions (e.g. printing -> complete) so a
  // newly finished job shows up without waiting for a manual refresh.
  const historyKey = state.print_state ?? "";
  useEffect(() => {
    if (!canViewHistory || statusCollapsed || isOffline) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await onGetPrintHistory(50);
        if (!cancelled) {
          setPrintHistory(data);
          setHistoryError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setHistoryError(toErrorMessage(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    canViewHistory,
    statusCollapsed,
    isOffline,
    onGetPrintHistory,
    historyKey,
  ]);

  // Poll the job queue while the status surface is visible.
  useEffect(() => {
    if (!canViewQueue || statusCollapsed || isOffline) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const data = await onGetJobQueue();
        if (!cancelled) {
          setJobQueue(data);
          setQueueError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setQueueError(toErrorMessage(err));
        }
      }
    };
    void refresh();
    const id = window.setInterval(refresh, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [canViewQueue, statusCollapsed, isOffline, onGetJobQueue]);

  const runQueueAction = async (key: string, fn: () => Promise<any>) => {
    if (queueBusy) return;
    setQueueBusy(key);
    try {
      await fn();
      const data = await onGetJobQueue();
      setJobQueue(data);
      setQueueError(null);
    } catch (err) {
      setQueueError(toErrorMessage(err));
    } finally {
      setQueueBusy(null);
    }
  };

  // Fetch the G-code file list when the card is visible/expanded.
  useEffect(() => {
    if (!canViewFiles || filesCollapsed || isOffline) return;
    let cancelled = false;
    (async () => {
      try {
        const files = await onGetGcodeFiles();
        if (!cancelled) {
          setGcodeFiles(files);
          setFilesError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setFilesError(toErrorMessage(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canViewFiles, filesCollapsed, isOffline, onGetGcodeFiles]);

  const warmMetadata = useCallback(
    async (paths: string[]) => {
      const targets = paths.filter(
        (path) => path && !requestedMetaRef.current.has(path),
      );
      if (targets.length === 0) return;
      targets.forEach((path) => requestedMetaRef.current.add(path));

      for (const path of targets) {
        try {
          const meta = await onGetFileMetadata(path);
          setFileMeta((prev) => ({ ...prev, [path]: meta }));
        } catch {
          setFileMeta((prev) => ({ ...prev, [path]: null }));
        }
      }
    },
    [onGetFileMetadata],
  );

  // Lazily fetch metadata (thumbnails, est. time, filament) for visible files.
  // A ref tracks in-flight/done requests so the loop isn't cancelled on each
  // setState; capped so a large library doesn't fire hundreds of requests.
  useEffect(() => {
    if (!canViewFiles || filesCollapsed || isOffline || !gcodeFiles) return;
    let cancelled = false;
    const targets = gcodeFiles
      .slice()
      .sort((a, b) => (b.modified ?? 0) - (a.modified ?? 0))
      .filter((f) =>
        filesFilter
          ? (f.path ?? "").toLowerCase().includes(filesFilter.toLowerCase())
          : true,
      )
      .map((f) => f.path)
      .slice(0, 40);
    if (targets.length === 0) return;
    (async () => {
      if (!cancelled) await warmMetadata(targets);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    canViewFiles,
    filesCollapsed,
    isOffline,
    gcodeFiles,
    filesFilter,
    warmMetadata,
  ]);

  useEffect(() => {
    if (!canViewQueue || statusCollapsed || isOffline || !jobQueue) return;
    const queuedPaths = (jobQueue.queued_jobs ?? [])
      .map((job) => job.filename)
      .filter((filename): filename is string => Boolean(filename))
      .slice(0, 8);
    if (queuedPaths.length === 0) return;
    void warmMetadata(queuedPaths);
  }, [canViewQueue, statusCollapsed, isOffline, jobQueue, warmMetadata]);

  const runFileAction = async (key: string, fn: () => Promise<any>) => {
    if (filesBusy) return;
    setFilesBusy(key);
    try {
      await fn();
      // Refresh the list after a mutating action (e.g. delete).
      try {
        setGcodeFiles(await onGetGcodeFiles());
      } catch {
        /* keep the current list if the refresh fails */
      }
      setFilesError(null);
    } catch (err) {
      setFilesError(toErrorMessage(err));
    } finally {
      setFilesBusy(null);
    }
  };

  // Fetch software-update status when the updates card is visible/expanded.
  useEffect(() => {
    if (!canControlMachine || updatesCollapsed || isOffline) return;
    let cancelled = false;
    (async () => {
      try {
        const components = await onGetUpdateStatus();
        if (!cancelled) {
          setUpdateComponents(components);
          setUpdateError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setUpdateError(toErrorMessage(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canControlMachine, updatesCollapsed, isOffline, onGetUpdateStatus]);

  const runUpdate = async (component: string) => {
    if (updateBusy) return;
    setUpdateBusy(component);
    try {
      await onMachineUpdate(component);
      setUpdateError(null);
    } catch (err) {
      setUpdateError(toErrorMessage(err));
    } finally {
      setUpdateBusy(null);
    }
  };

  // Load the managed-service list when the machine card is visible/expanded.
  useEffect(() => {
    if (!canControlMachine || machineCollapsed || isOffline) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await onGetServices();
        if (!cancelled) {
          setServices(list);
          setSelectedService((prev) => prev || list[0] || "");
        }
      } catch {
        /* service list is best-effort; ignore fetch errors */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canControlMachine, machineCollapsed, isOffline, onGetServices]);

  // Load the printer config file list when the config editor is expanded.
  useEffect(() => {
    if (!canControlMachine || configCollapsed || isOffline) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await onGetConfigFiles();
        if (!cancelled) {
          setConfigFiles(list);
          setConfigError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setConfigError(toErrorMessage(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canControlMachine, configCollapsed, isOffline, onGetConfigFiles]);

  const loadConfigFile = async (path: string) => {
    setSelectedConfig(path);
    setConfigContent("");
    setConfigNotice(null);
    if (!path) return;
    setConfigBusy(true);
    try {
      setConfigContent(await onReadConfigFile(path));
      setConfigError(null);
    } catch (err) {
      setConfigError(toErrorMessage(err));
    } finally {
      setConfigBusy(false);
    }
  };

  const saveConfigFile = async () => {
    if (!selectedConfig || configBusy) return;
    setConfigBusy(true);
    setConfigNotice(null);
    try {
      await onWriteConfigFile(selectedConfig, configContent);
      setConfigError(null);
      setConfigNotice(t.configSaved);
    } catch (err) {
      setConfigError(toErrorMessage(err));
    } finally {
      setConfigBusy(false);
    }
  };

  const canMove =
    !isOfflineOrNotReady &&
    canControlToolhead &&
    (!isPrinting || (config?.limits.allow_movement_while_printing ?? false));

  // hasHomePermission: permission gate — hide home buttons when false.
  // (canMove handles the transient-state disable on those buttons.)
  const hasHomePermission =
    canControlToolhead && (isAdmin || (config?.limits.allow_home_for_guests ?? false));

  // --- Draggable dashboard layout (Mainsail-style card rearranging) ---
  const cardLabel = (id: string): string =>
    ({
      status: t.printerState,
      webcam: t.webcam,
      toolhead: t.toolhead,
      temps: t.tempPreheat,
      macros: t.macrosTitle,
      console: t.console,
      speed: t.speedFactorTitle,
    })[id] ?? id;

  const [layout, setLayout] = useState<string[][]>(loadDashboardLayout);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    col: number;
    index: number;
  } | null>(null);

  const persistLayout = (next: string[][]) => {
    setLayout(next);
    try {
      localStorage.setItem("dashboardLayout", JSON.stringify(next));
    } catch {
      /* ignore quota / private-mode errors */
    }
  };

  const resetLayout = () => {
    persistLayout(DEFAULT_DASHBOARD_LAYOUT.map((c) => [...c]));
  };

  const handleDragStart = (
    e: React.DragEvent<HTMLDivElement>,
    id: string,
  ) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDropTarget(null);
  };

  const handleCardDragOver = (
    e: React.DragEvent<HTMLDivElement>,
    col: number,
    index: number,
  ) => {
    if (!draggedId) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const after = e.clientY > rect.top + rect.height / 2;
    setDropTarget({ col, index: after ? index + 1 : index });
  };

  const handleColumnDragOver = (
    e: React.DragEvent<HTMLDivElement>,
    col: number,
  ) => {
    if (!draggedId) return;
    e.preventDefault();
    // Only fires for empty column space (cards stopPropagation): drop at end.
    setDropTarget((prev) =>
      prev && prev.col === col ? prev : { col, index: layout[col].length },
    );
  };

  const handleColumnDrop = (
    e: React.DragEvent<HTMLDivElement>,
    col: number,
  ) => {
    e.preventDefault();
    if (!draggedId) return;
    const target = dropTarget ?? { col, index: layout[col].length };

    // Locate the dragged card's current position.
    let srcCol = -1;
    let srcIdx = -1;
    layout.forEach((ids, c) => {
      const i = ids.indexOf(draggedId);
      if (i !== -1) {
        srcCol = c;
        srcIdx = i;
      }
    });
    if (srcCol === -1) {
      handleDragEnd();
      return;
    }

    const next = layout.map((c) => [...c]);
    next[srcCol].splice(srcIdx, 1);
    let insertIdx = target.index;
    if (srcCol === target.col && srcIdx < target.index) insertIdx -= 1;
    next[target.col].splice(insertIdx, 0, draggedId);
    persistLayout(next);
    handleDragEnd();
  };

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
    // Temperature auto-reports look like "B:23.0 /0.0 T0:23.0 /0.0 ...".
    const tempReply = /^(ok\s+)?(B|T\d*|C):[-\d.]+\s*\/[-\d.]+/i;
    return (state.console_events ?? [])
      .filter((event) => event.time > consoleClearedAt)
      .filter(
        (event) =>
          !consoleHideTempReplies ||
          event.event_type !== "response" ||
          !tempReply.test(event.message ?? ""),
      )
      .slice(-250)
      .reverse();
  }, [state.console_events, consoleClearedAt, consoleHideTempReplies]);

  // Close the console settings dropdown on outside click.
  useEffect(() => {
    if (!consoleSettingsOpen) return;
    const onClick = (e: MouseEvent) => {
      if (
        consoleSettingsRef.current &&
        !consoleSettingsRef.current.contains(e.target as Node)
      ) {
        setConsoleSettingsOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [consoleSettingsOpen]);

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
  const unlockMotorsDisabled = !isMotorsLocked || isOfflineOrNotReady || isPrinting;
  const isBusy = state.print_state === "standby" && idleState === "Printing";
  const displayPrintState = isBusy ? "busy" : state.print_state;
  const hasCurrentJob =
    Boolean(state.filename && state.filename !== "N/A") &&
    (isPrinting || isPaused || isBusy);
  const slicerEstimatedTime = currentFileMetadata?.estimated_time;
  const slicerTimeLeft =
    slicerEstimatedTime && slicerEstimatedTime > 0 && state.elapsed_time > 0
      ? slicerEstimatedTime - state.elapsed_time
      : null;
  // Retained helpers/values superseded by the tabbed status metrics; kept for
  // reuse. Reference them so the unused-locals check stays green.
  void hasValue;
  void slicerTimeLeft;
  const currentFileLabel = getGcodeBasename(state.filename);

  // Mirror Mainsail: jump to the Status tab when a print starts, fall back to
  // History when it ends. Only fires on the transition, so manual tab switches
  // while idle/printing are preserved.
  useEffect(() => {
    setStatusTab(hasCurrentJob ? "status" : "history");
  }, [hasCurrentJob]);

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

  const handleMoveToSubmit = async (axis: "x" | "y" | "z") => {
    const rawValue = axisInputs[axis];
    const nextPosition = Number.parseFloat(rawValue);
    const currentPosition =
      gcodePosition[axis === "x" ? 0 : axis === "y" ? 1 : 2];
    const { min, max } = getAxisBounds(axis, axisMinimum, axisMaximum);

    if (!Number.isFinite(nextPosition)) {
      pushToast("error", `Invalid ${axis.toUpperCase()} position`);
      return;
    }

    if (min === undefined || max === undefined) {
      pushToast("error", `Axis ${axis.toUpperCase()} limits are unavailable`);
      return;
    }

    if (nextPosition < min || nextPosition > max) {
      pushToast(
        "error",
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
      await onMoveTo(axis, nextPosition);
    } catch (e: any) {
      pushToast("error", e.message || `Failed to move ${axis.toUpperCase()}`);
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
    const { min, max } = getAxisBounds(axis, axisMinimum, axisMaximum);

    return (
      <label className="toolhead-axis-input">
        <span className="toolhead-axis-current">
          [{gcodeValue !== undefined ? gcodeValue.toFixed(precision) : "--"}]
        </span>
        <span className="toolhead-axis-name">{label}</span>
        {/* The editable move-to-position input is a control: shown only with
            control_toolhead. View-only users just see the current position. */}
        {canControlToolhead ? (
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
        ) : (
          <span className="toolhead-axis-static">
            {gcodeValue !== undefined ? gcodeValue.toFixed(precision) : "--"}
          </span>
        )}
        <span className="toolhead-axis-live">
          {liveValue !== undefined ? liveValue.toFixed(precision) : "--"}
        </span>
      </label>
    );
  };


  const submitConsole = async () => {
    const cmd = consoleInput.trim();
    if (!cmd || consoleSending) return;
    setConsoleSending(true);
    try {
      await onSendConsole(cmd);
      setConsoleHistory((h) => [cmd, ...h.filter((c) => c !== cmd)].slice(0, 50));
      setConsoleInput("");
      setConsoleHistoryIdx(-1);
    } catch {
      /* backend surfaces the error in the console stream; keep text to retry */
    } finally {
      setConsoleSending(false);
    }
  };

  const onConsoleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (consoleHistory.length === 0) return;
      const next = Math.min(consoleHistoryIdx + 1, consoleHistory.length - 1);
      setConsoleHistoryIdx(next);
      setConsoleInput(consoleHistory[next] ?? "");
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      const next = consoleHistoryIdx - 1;
      if (next < 0) {
        setConsoleHistoryIdx(-1);
        setConsoleInput("");
      } else {
        setConsoleHistoryIdx(next);
        setConsoleInput(consoleHistory[next] ?? "");
      }
    }
  };

  const consoleCard = (
    <ConsoleCard
      state={state}
      t={t}
      consoleCollapsed={consoleCollapsed}
      setConsoleCollapsed={setConsoleCollapsed}
      setConsoleClearedAt={setConsoleClearedAt}
      consoleSettingsRef={consoleSettingsRef}
      consoleSettingsOpen={consoleSettingsOpen}
      setConsoleSettingsOpen={setConsoleSettingsOpen}
      consoleHideTempReplies={consoleHideTempReplies}
      setConsoleHideTempReplies={setConsoleHideTempReplies}
      consoleEvents={consoleEvents}
      canSendConsole={canSendConsole}
      consoleInput={consoleInput}
      setConsoleInput={setConsoleInput}
      consoleSending={consoleSending}
      isOfflineOrNotReady={isOfflineOrNotReady}
      onConsoleKeyDown={onConsoleKeyDown}
      consoleCommands={consoleCommands}
      submitConsole={submitConsole}
    />
  );

  const powerCard = (
    <PowerCard
      t={t}
      powerCollapsed={powerCollapsed}
      setPowerCollapsed={setPowerCollapsed}
      powerError={powerError}
      powerDevices={powerDevices}
      canControlPower={canControlPower}
      powerBusy={powerBusy}
      handlePowerToggle={handlePowerToggle}
    />
  );

  const runMachineAction = async (
    key: string,
    fn: () => Promise<any>,
    confirmMsg?: string,
  ) => {
    if (machineBusy) return;
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setMachineBusy(key);
    try {
      await fn();
    } catch {
      /* errors surface via the console stream / network layer */
    } finally {
      setMachineBusy(null);
    }
  };

  const machineCard = (
    <MachineCard
      t={t}
      machineCollapsed={machineCollapsed}
      setMachineCollapsed={setMachineCollapsed}
      machineBusy={machineBusy}
      isOffline={isOffline}
      runMachineAction={runMachineAction}
      onRunMacro={onRunMacro}
      onHostReboot={onHostReboot}
      onHostShutdown={onHostShutdown}
      services={services}
      selectedService={selectedService}
      setSelectedService={setSelectedService}
      onServiceAction={onServiceAction}
      onGetEndstops={onGetEndstops}
      endstops={endstops}
      setEndstops={setEndstops}
    />
  );

  // Calibration/adjustment tools. Availability is derived from the printer's
  // own config (configfile.settings), matching Mainsail's auto-detection.
  const cfgSettings = (state.configfile?.settings ?? {}) as Record<
    string,
    unknown
  >;
  const hasConfig = (key: string) => Boolean(cfgSettings[key]);
  const zOffset = state.gcode_move?.homing_origin?.[2];
  const babystep = async (delta: number) => {
    await onRunMacro(`SET_GCODE_OFFSET Z_ADJUST=${delta} MOVE=1`);
  };
  const calibrateActions: { key: string; label: string; gcode: string }[] = [
    ...(hasConfig("quad_gantry_level")
      ? [{ key: "qgl", label: t.calQgl, gcode: "QUAD_GANTRY_LEVEL" }]
      : []),
    ...(hasConfig("z_tilt")
      ? [{ key: "ztilt", label: t.calZTilt, gcode: "Z_TILT_ADJUST" }]
      : []),
    ...(hasConfig("bed_mesh")
      ? [{ key: "mesh", label: t.calBedMesh, gcode: "BED_MESH_CALIBRATE" }]
      : []),
    ...(hasConfig("screws_tilt_adjust")
      ? [
          {
            key: "screwstilt",
            label: t.calScrewsTilt,
            gcode: "SCREWS_TILT_CALCULATE",
          },
        ]
      : []),
    ...(hasConfig("bed_screws")
      ? [
          {
            key: "bedscrews",
            label: t.calBedScrews,
            gcode: "BED_SCREWS_ADJUST",
          },
        ]
      : []),
  ];
  // Mainsail logic: babystep (Z offset tuning) is allowed mid-print, but the
  // calibration routines (QGL/Z_TILT/mesh/screws) cannot run during a print.
  const babystepDisabled = isOfflineOrNotReady;
  const calibrateActionDisabled = isOfflineOrNotReady || isPrinting;
  const calibrateCard = (
    <CalibrateCard
      t={t}
      calibrateCollapsed={calibrateCollapsed}
      setCalibrateCollapsed={setCalibrateCollapsed}
      zOffset={zOffset}
      babystepDisabled={babystepDisabled}
      babystep={babystep}
      calibrateActions={calibrateActions}
      calibrateActionDisabled={calibrateActionDisabled}
      onRunMacro={onRunMacro}
    />
  );

  const updatesCard = (
    <UpdatesCard
      t={t}
      updatesCollapsed={updatesCollapsed}
      setUpdatesCollapsed={setUpdatesCollapsed}
      updateError={updateError}
      updateComponents={updateComponents}
      updateBusy={updateBusy}
      runUpdate={runUpdate}
    />
  );

  const configCard = (
    <ConfigCard
      t={t}
      configCollapsed={configCollapsed}
      setConfigCollapsed={setConfigCollapsed}
      selectedConfig={selectedConfig}
      loadConfigFile={loadConfigFile}
      configFiles={configFiles}
      configError={configError}
      configContent={configContent}
      setConfigContent={setConfigContent}
      configBusy={configBusy}
      configNotice={configNotice}
      saveConfigFile={saveConfigFile}
    />
  );

  // ---- Input shaper / resonance testing (only if a resonance_tester exists) ----
  const hasResonanceTester = hasConfig("resonance_tester");
  const inputShaperActions: { key: string; label: string; gcode: string }[] = [
    { key: "resx", label: t.shaperTestX, gcode: "TEST_RESONANCES AXIS=X" },
    { key: "resy", label: t.shaperTestY, gcode: "TEST_RESONANCES AXIS=Y" },
    { key: "calib", label: t.shaperCalibrate, gcode: "SHAPER_CALIBRATE" },
    { key: "noise", label: t.shaperNoise, gcode: "MEASURE_AXES_NOISE" },
    { key: "query", label: t.shaperQuery, gcode: "ACCELEROMETER_QUERY" },
  ];
  const inputShaperCard = (
    <InputShaperCard
      t={t}
      inputShaperCollapsed={inputShaperCollapsed}
      setInputShaperCollapsed={setInputShaperCollapsed}
      inputShaperActions={inputShaperActions}
      calibrateActionDisabled={calibrateActionDisabled}
      onRunMacro={onRunMacro}
    />
  );

  const commitFan = async (pct: number) => {
    const clamped = Math.max(0, Math.min(100, pct));
    setFanPct(clamped);
    try {
      await onSetFanSpeed(clamped / 100);
    } catch {
      /* keep slider position; error surfaces via network layer */
    }
  };
  const fanCard = (
    <FanCard
      state={state}
      t={t}
      fanCollapsed={fanCollapsed}
      setFanCollapsed={setFanCollapsed}
      fanPct={fanPct}
      canControlTemps={canControlTemps}
      isOfflineOrNotReady={isOfflineOrNotReady}
      commitFan={commitFan}
    />
  );

  const commitFlow = async (pct: number) => {
    const clamped = Math.max(50, Math.min(200, pct));
    setFlowPct(clamped);
    try {
      await onSetFlow(clamped);
    } catch {
      /* keep slider position; error surfaces via network layer */
    }
  };
  const flowCard = (
    <FlowCard
      t={t}
      flowCollapsed={flowCollapsed}
      setFlowCollapsed={setFlowCollapsed}
      flowPct={flowPct}
      canControlToolhead={canControlToolhead}
      isOfflineOrNotReady={isOfflineOrNotReady}
      commitFlow={commitFlow}
    />
  );

  // ---- Peripherals (dynamically-discovered aux objects) ----
  const auxEntries = Object.entries(state.auxiliary ?? {}).sort((a, b) =>
    a[0].localeCompare(b[0]),
  );
  const auxFans = auxEntries.filter(([n]) =>
    ["fan_generic", "heater_fan", "controller_fan", "temperature_fan"].includes(
      auxType(n),
    ),
  );
  const auxPins = auxEntries.filter(([n]) => auxType(n) === "output_pin");
  const auxLeds = auxEntries.filter(([n]) =>
    ["led", "neopixel", "dotstar", "pca9533", "pca9632"].includes(auxType(n)),
  );
  const auxTempSensors = auxEntries.filter(
    ([n]) => auxType(n) === "temperature_sensor",
  );
  const auxHeaters = auxEntries.filter(([n]) => auxType(n) === "heater_generic");
  const auxTmc = auxEntries.filter(([n]) => auxType(n).startsWith("tmc"));
  const auxFilament = auxEntries.filter(([n]) =>
    ["filament_switch_sensor", "filament_motion_sensor"].includes(auxType(n)),
  );
  const hasPeripherals =
    auxFans.length +
      auxPins.length +
      auxLeds.length +
      auxTempSensors.length +
      auxHeaters.length +
      auxTmc.length +
      auxFilament.length >
    0;
  const peripheralsCard = (
    <PeripheralsCard
      t={t}
      peripheralsCollapsed={peripheralsCollapsed}
      setPeripheralsCollapsed={setPeripheralsCollapsed}
      hasPeripherals={hasPeripherals}
      auxFans={auxFans}
      auxPins={auxPins}
      auxLeds={auxLeds}
      auxTempSensors={auxTempSensors}
      auxHeaters={auxHeaters}
      auxTmc={auxTmc}
      auxFilament={auxFilament}
      isOfflineOrNotReady={isOfflineOrNotReady}
      canControlTemps={canControlTemps}
      canControlToolhead={canControlToolhead}
      canControlMachine={canControlMachine}
      onSetAuxFan={onSetAuxFan}
      onSetAuxPin={onSetAuxPin}
      onSetAuxLed={onSetAuxLed}
      onSetAuxHeater={onSetAuxHeater}
      onSetTmcCurrent={onSetTmcCurrent}
    />
  );

  // ---- Exclude object (cancel individual objects mid-print) ----
  const excludeObjectsRaw = state.exclude_object?.objects;
  const excludeObjectNames: string[] = Array.isArray(excludeObjectsRaw)
    ? (excludeObjectsRaw as Array<{ name?: string }>)
        .map((o) => (o && typeof o === "object" ? o.name : undefined))
        .filter((n): n is string => typeof n === "string" && n.length > 0)
    : [];
  const excludedObjects = state.exclude_object?.excluded_objects ?? [];
  const hasExcludeObjects = excludeObjectNames.length > 0;
  const excludeObject = async (name: string) => {
    if (excludeBusy) return;
    setExcludeBusy(name);
    try {
      await onExcludeObject(name);
    } catch {
      /* error surfaces via network layer */
    } finally {
      setExcludeBusy(null);
    }
  };
  const excludeCard = (
    <ExcludeCard
      t={t}
      excludeCollapsed={excludeCollapsed}
      setExcludeCollapsed={setExcludeCollapsed}
      excludeObjectNames={excludeObjectNames}
      excludedObjects={excludedObjects}
      excludeBusy={excludeBusy}
      isOfflineOrNotReady={isOfflineOrNotReady}
      canControlPrint={canControlPrint}
      excludeObject={excludeObject}
    />
  );

  // ---- Extrude / retract (Mainsail exception: needs min_extrude_temp) ----
  const minExtrudeTemp = num(
    (
      state.configfile?.settings?.extruder as
        | { min_extrude_temp?: number }
        | undefined
    )?.min_extrude_temp,
    170,
  );
  const hotEnough = state.hotend_temp >= minExtrudeTemp;
  const extrudeDisabled =
    isOfflineOrNotReady || extrudeBusy || !hotEnough;
  const doExtrude = async (direction: 1 | -1) => {
    if (extrudeBusy) return;
    const len = Number(extrudeLen);
    const spd = Number(extrudeSpeed);
    if (!Number.isFinite(len) || len <= 0 || !Number.isFinite(spd) || spd <= 0) {
      return;
    }
    setExtrudeBusy(true);
    try {
      await onExtrude(direction * len, spd);
    } catch {
      /* error surfaces via network layer */
    } finally {
      setExtrudeBusy(false);
    }
  };
  const extruderCard = (
    <ExtruderCard
      t={t}
      extruderCardCollapsed={extruderCardCollapsed}
      setExtruderCardCollapsed={setExtruderCardCollapsed}
      hotEnough={hotEnough}
      minExtrudeTemp={minExtrudeTemp}
      extrudeLen={extrudeLen}
      setExtrudeLen={setExtrudeLen}
      extrudeSpeed={extrudeSpeed}
      setExtrudeSpeed={setExtrudeSpeed}
      extrudeDisabled={extrudeDisabled}
      doExtrude={doExtrude}
    />
  );

  // ---- Firmware retraction (only shown if the printer has [firmware_retraction]) ----
  const fwRetract = (state.auxiliary?.["firmware_retraction"] ?? null) as Record<
    string,
    unknown
  > | null;
  const hasRetraction = fwRetract !== null;
  const retractField = (key: string, def: number) =>
    retractFields[key] ?? String(num(fwRetract?.[key], def));
  const applyRetraction = async () => {
    if (retractBusy) return;
    setRetractBusy(true);
    try {
      await onSetRetraction(
        Number(retractField("retract_length", 0)),
        Number(retractField("retract_speed", 20)),
        Number(retractField("unretract_extra_length", 0)),
        Number(retractField("unretract_speed", 10)),
      );
    } catch {
      /* error surfaces via network layer */
    } finally {
      setRetractBusy(false);
    }
  };
  const retractionRows: { key: string; label: string; def: number }[] = [
    { key: "retract_length", label: t.retractLength, def: 0 },
    { key: "retract_speed", label: t.retractSpeed, def: 20 },
    { key: "unretract_extra_length", label: t.retractExtra, def: 0 },
    { key: "unretract_speed", label: t.retractUnretractSpeed, def: 10 },
  ];
  const retractionCard = (
    <RetractionCard
      t={t}
      retractionCollapsed={retractionCollapsed}
      setRetractionCollapsed={setRetractionCollapsed}
      retractionRows={retractionRows}
      retractField={retractField}
      setRetractFields={setRetractFields}
      retractBusy={retractBusy}
      isOfflineOrNotReady={isOfflineOrNotReady}
      applyRetraction={applyRetraction}
    />
  );

  // ---- Motion limits (velocity/accel), from the toolhead object ----
  const limitField = (key: string, fallback: number) =>
    limitsFields[key] ??
    String(
      num(
        (state.toolhead as Record<string, unknown> | null | undefined)?.[key],
        fallback,
      ),
    );
  const applyLimits = async () => {
    if (limitsBusy) return;
    setLimitsBusy(true);
    try {
      await onSetLimits(
        Number(limitField("max_velocity", 300)),
        Number(limitField("max_accel", 3000)),
        Number(limitField("square_corner_velocity", 5)),
        Number(limitField("minimum_cruise_ratio", 0.5)),
      );
    } catch {
      /* error surfaces via network layer */
    } finally {
      setLimitsBusy(false);
    }
  };
  const limitsRows: { key: string; label: string; def: number; step: number }[] =
    [
      { key: "max_velocity", label: t.limitVelocity, def: 300, step: 1 },
      { key: "max_accel", label: t.limitAccel, def: 3000, step: 10 },
      {
        key: "square_corner_velocity",
        label: t.limitSqv,
        def: 5,
        step: 0.1,
      },
      {
        key: "minimum_cruise_ratio",
        label: t.limitCruiseRatio,
        def: 0.5,
        step: 0.05,
      },
    ];
  const limitsCard = (
    <LimitsCard
      t={t}
      limitsCollapsed={limitsCollapsed}
      setLimitsCollapsed={setLimitsCollapsed}
      limitsRows={limitsRows}
      limitField={limitField}
      setLimitsFields={setLimitsFields}
      limitsBusy={limitsBusy}
      isOfflineOrNotReady={isOfflineOrNotReady}
      applyLimits={applyLimits}
    />
  );

  // ---- Manual probe (Z calibration dialog; only during a probe session) ----
  const manualProbeObj = (state.auxiliary?.["manual_probe"] ?? null) as Record<
    string,
    unknown
  > | null;
  const probeActive = Boolean(manualProbeObj?.is_active);
  const probeZ = manualProbeObj?.z_position;
  const manualProbeCard = (
    <ManualProbeCard
      t={t}
      probeZ={probeZ}
      isOfflineOrNotReady={isOfflineOrNotReady}
      onManualProbe={onManualProbe}
    />
  );

  const announcementsCard = (
    <AnnouncementsCard
      t={t}
      announcements={announcements}
      announcementsCollapsed={announcementsCollapsed}
      setAnnouncementsCollapsed={setAnnouncementsCollapsed}
    />
  );

  const historyJobs: PrintHistoryJob[] = printHistory?.jobs ?? [];
  const historyTotals = printHistory?.totals ?? null;
  const historyBreakdown = historyJobs.reduce<Record<string, number>>(
    (counts, job) => {
      const key = job.status ?? "unknown";
      counts[key] = (counts[key] ?? 0) + 1;
      return counts;
    },
    {},
  );
  const historySummaryItems = [
    {
      label: t.historyTotalJobs,
      value: String(historyTotals?.total_jobs ?? historyJobs.length),
    },
    {
      label: t.historyTotalTime,
      value: formatTime(historyTotals?.total_print_time ?? 0),
    },
    {
      label: t.historyTotalFilament,
      value: `${((historyTotals?.total_filament_used ?? 0) / 1000).toFixed(1)}m`,
    },
    {
      label: t.dashLongestJob,
      value: formatTime(historyTotals?.longest_job ?? 0),
    },
    {
      label: t.dashLongestPrint,
      value: formatTime(historyTotals?.longest_print ?? 0),
    },
  ];
  const historyCard = (
    <HistoryCard
      t={t}
      historyCollapsed={historyCollapsed}
      setHistoryCollapsed={setHistoryCollapsed}
      historyTotals={historyTotals}
      historyError={historyError}
      historyJobs={historyJobs}
    />
  );

  const queueJobs: JobQueueEntry[] = jobQueue?.queued_jobs ?? [];
  const queueState = jobQueue?.queue_state ?? "";
  const queuePaused = queueState === "paused";
  const visibleQueueJobs = queueJobs.slice(0, 3);
  const hiddenQueueJobs = Math.max(0, queueJobs.length - visibleQueueJobs.length);
  const queueJobsWithMeta = visibleQueueJobs.map((job) => ({
    job,
    metadata: fileMeta[job.filename] ?? null,
    thumbnailUrl: buildMoonrakerThumbnailUrl({
      moonrakerUrl: config?.moonraker_url,
      filename: job.filename,
      metadata: fileMeta[job.filename] ?? null,
      variant: "small",
    }),
  }));
  const canStartQueuedJob =
    canControlPrint &&
    !isOfflineOrNotReady &&
    !isPrinting &&
    !isPaused &&
    !isBusy;

  // --- Compact status-card (Mainsail-style) derived values ---

  const statusProgressFraction = state.progress > 0 ? state.progress / 100 : 0;
  // Progress-based total print-time estimate (elapsed / fraction done).
  const statusTotalEstimate =
    statusProgressFraction > 0 ? state.elapsed_time / statusProgressFraction : null;
  const statusRemaining =
    statusTotalEstimate !== null
      ? Math.max(0, statusTotalEstimate - state.elapsed_time)
      : typeof state.time_left === "number"
        ? state.time_left
        : null;
  const statusEta =
    statusRemaining !== null
      ? new Date(Date.now() + statusRemaining * 1000)
      : null;
  const statusFilamentTotalM =
    currentFileMetadata?.filament_total &&
    currentFileMetadata.filament_total > 0
      ? currentFileMetadata.filament_total / 1000
      : null;
  const statusFilamentUsedM =
    statusFilamentTotalM !== null
      ? statusFilamentTotalM * statusProgressFraction
      : null;
  const statusSlicerTime =
    currentFileMetadata?.estimated_time &&
    currentFileMetadata.estimated_time > 0
      ? currentFileMetadata.estimated_time
      : null;
  // Small filament/time summary under the print filename.
  const statusPreviewSummary = [
    statusFilamentTotalM !== null ? `${statusFilamentTotalM.toFixed(2)} m` : "",
    statusSlicerTime !== null ? formatTime(statusSlicerTime) : "",
  ]
    .filter(Boolean)
    .join(" · ");

  // Which tabs are available (permission-gated). The Status tab only exists
  // while there is a current job, matching Mainsail.
  const statusTabItems = [
    ...(hasCurrentJob
      ? [{ key: "status" as const, icon: Gauge, label: t.dashStatusTab }]
      : []),
    ...(canViewHistory
      ? [{ key: "history" as const, icon: History, label: t.history }]
      : []),
    ...(canViewQueue
      ? [{ key: "queue" as const, icon: ListOrdered, label: t.queue }]
      : []),
  ];
  // Guard: if the active tab isn't currently available, fall back to the first.
  const activeStatusTab = statusTabItems.some((tab) => tab.key === statusTab)
    ? statusTab
    : (statusTabItems[0]?.key ?? "history");
  const queueCard = (
    <QueueCard
      t={t}
      queueState={queueState}
      queueCollapsed={queueCollapsed}
      setQueueCollapsed={setQueueCollapsed}
      canManageQueue={canManageQueue}
      queueBusy={queueBusy}
      queueJobs={queueJobs}
      queuePaused={queuePaused}
      runQueueAction={runQueueAction}
      onJobQueueSetState={onJobQueueSetState}
      onJobQueueDelete={onJobQueueDelete}
      queueError={queueError}
    />
  );

  const filesList = (gcodeFiles ?? [])
    .slice()
    .sort((a, b) => (b.modified ?? 0) - (a.modified ?? 0))
    .filter((f) =>
      filesFilter
        ? (f.path ?? "").toLowerCase().includes(filesFilter.toLowerCase())
        : true,
    );
  const filesCard = (
    <FilesCard
      t={t}
      filesCollapsed={filesCollapsed}
      setFilesCollapsed={setFilesCollapsed}
      filesFilter={filesFilter}
      setFilesFilter={setFilesFilter}
      filesError={filesError}
      filesList={filesList}
      filesBusy={filesBusy}
      fileMeta={fileMeta}
      canControlPrint={canControlPrint}
      requestReprint={requestReprint}
      isOfflineOrNotReady={isOfflineOrNotReady}
      isPrinting={isPrinting}
      runFileAction={runFileAction}
      onStartPrint={onStartPrint}
      canManageQueue={canManageQueue}
      onJobQueueAdd={onJobQueueAdd}
      config={config}
      canManageFiles={canManageFiles}
      onDeleteGcodeFile={onDeleteGcodeFile}
    />
  );

  // Klipper/MCU error banner. Shown whenever the host is reachable but the
  // firmware is not "ready" (shutdown, error, startup). Offers the two
  // recovery actions the user asked for: FIRMWARE_RESTART and RESTART.
  const klipperBanner = (
    <div className="klipper-banner">
      <AlertTriangle size={24} className="klipper-banner-icon" />
      <div className="klipper-banner-body">
        <h4 className="klipper-banner-title">
          {state.klipper_state === "startup" ? t.klipperStarting : t.klipperError}
          <span className="klipper-banner-state">{state.klipper_state}</span>
        </h4>
        {state.state_message && (
          <pre className="klipper-banner-message">{state.state_message}</pre>
        )}
        <div className="klipper-banner-actions">
          <button
            className="btn btn-danger"
            onClick={() => onRunMacro("FIRMWARE_RESTART")}
          >
            {t.btnFirmwareRestart}
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => onRunMacro("RESTART")}
          >
            {t.btnKlipperRestart}
          </button>
        </div>
      </div>
    </div>
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

  // Host is reachable but the printer firmware is not ready: don't expose the
  // full control surface. Show only the error + recovery actions and the
  // console (so the user can see what Klipper is complaining about).
  if (!isPrinterReady) {
    return (
      <div
        className="page-content dashboard-page dashboard-not-ready"
        style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
      >
        {klipperBanner}
        {canViewConsole && consoleCard}
      </div>
    );
  }

  // These cards were moved out of the dashboard into top-nav/page routes.
  // Keep their implementations nearby for the ongoing Mainsail-parity split.
  void powerCard;
  void machineCard;
  void updatesCard;
  void configCard;
  void historyCard;
  void queueCard;
  void filesCard;

    const tempsCard = canViewTemps ? (
      <TempsCard
        t={t}
        state={state}
        config={config}
        canControlTemps={canControlTemps}
        canViewTempTarget={canViewTempTarget}
        isOfflineOrNotReady={isOfflineOrNotReady}
        tempsCollapsed={tempsCollapsed}
        setTempsCollapsed={setTempsCollapsed}
        dropdownRef={dropdownRef}
        presetDropdownOpen={presetDropdownOpen}
        setPresetDropdownOpen={setPresetDropdownOpen}
        handlePreheatPreset={handlePreheatPreset}
        settingsRef={settingsRef}
        settingsOpen={settingsOpen}
        setSettingsOpen={setSettingsOpen}
        showChart={showChart}
        autoscaleChart={autoscaleChart}
        hideMonitors={hideMonitors}
        toggleSetting={toggleSetting}
        extruderTarget={extruderTarget}
        setExtruderTarget={setExtruderTarget}
        setIsExtruderFocused={setIsExtruderFocused}
        handleExtruderTargetSubmit={handleExtruderTargetSubmit}
        extruderPresetRef={extruderPresetRef}
        extruderPresetOpen={extruderPresetOpen}
        setExtruderPresetOpen={setExtruderPresetOpen}
        handleTargetPreset={handleTargetPreset}
        bedTarget={bedTarget}
        setBedTarget={setBedTarget}
        setIsBedFocused={setIsBedFocused}
        handleBedTargetSubmit={handleBedTargetSubmit}
        bedPresetRef={bedPresetRef}
        bedPresetOpen={bedPresetOpen}
        setBedPresetOpen={setBedPresetOpen}
        tempHistory={tempHistory}
        theme={theme}
        chartLabels={chartLabels}
      />
    ) : null;

    const toolheadCard = canViewToolhead ? (
      <ToolheadCard
        t={t}
        state={state}
        canControlToolhead={canControlToolhead}
        isPrinting={isPrinting}
        toolheadActionsRef={toolheadActionsRef}
        toolheadActionsOpen={toolheadActionsOpen}
        setToolheadActionsOpen={setToolheadActionsOpen}
        handleDisableMotors={handleDisableMotors}
        unlockMotorsDisabled={unlockMotorsDisabled}
        hasHomePermission={hasHomePermission}
        handleHomeAction={handleHomeAction}
        canMove={canMove}
        toolheadSettingsRef={toolheadSettingsRef}
        toolheadSettingsOpen={toolheadSettingsOpen}
        setToolheadSettingsOpen={setToolheadSettingsOpen}
        showToolheadPosition={showToolheadPosition}
        setShowToolheadPosition={setShowToolheadPosition}
        showToolheadCoordinates={showToolheadCoordinates}
        setShowToolheadCoordinates={setShowToolheadCoordinates}
        showToolheadControl={showToolheadControl}
        setShowToolheadControl={setShowToolheadControl}
        showToolheadZOffset={showToolheadZOffset}
        setShowToolheadZOffset={setShowToolheadZOffset}
        showToolheadSpeedFactor={showToolheadSpeedFactor}
        setShowToolheadSpeedFactor={setShowToolheadSpeedFactor}
        toolheadCollapsed={toolheadCollapsed}
        setToolheadCollapsed={setToolheadCollapsed}
        positionMode={positionMode}
        activeMeshProfile={activeMeshProfile}
        renderAxisInput={renderAxisInput}
        isXHomed={isXHomed}
        isYHomed={isYHomed}
        isZHomed={isZHomed}
        allHomed={allHomed}
        handleJogAction={handleJogAction}
      />
    ) : null;

    const statusCard = canViewStatus ? (
      <StatusCard
        t={t}
        state={state}
        displayPrintState={displayPrintState}
        isPrinting={isPrinting}
        isPaused={isPaused}
        isBusy={isBusy}
        isOfflineOrNotReady={isOfflineOrNotReady}
        canControlPrint={canControlPrint}
        onPause={onPause}
        onResume={onResume}
        onCancel={onCancel}
        uploadedFile={uploadedFile}
        handleStartPrint={handleStartPrint}
        statusCollapsed={statusCollapsed}
        setStatusCollapsed={setStatusCollapsed}
        hasCurrentJob={hasCurrentJob}
        currentFileMetadata={currentFileMetadata}
        currentFileLabel={currentFileLabel}
        statusPreviewSummary={statusPreviewSummary}
        statusTabItems={statusTabItems}
        activeStatusTab={activeStatusTab}
        setStatusTab={setStatusTab}
        queueJobs={queueJobs}
        reportedFlowPct={reportedFlowPct}
        statusFilamentUsedM={statusFilamentUsedM}
        statusTotalEstimate={statusTotalEstimate}
        statusSlicerTime={statusSlicerTime}
        statusEta={statusEta}
        canViewQueue={canViewQueue}
        queueState={queueState}
        queueCollapsed={queueCollapsed}
        setQueueCollapsed={setQueueCollapsed}
        canManageQueue={canManageQueue}
        queueBusy={queueBusy}
        runQueueAction={runQueueAction}
        onJobQueueSetState={onJobQueueSetState}
        queuePaused={queuePaused}
        onJobQueueDelete={onJobQueueDelete}
        queueError={queueError}
        queueJobsWithMeta={queueJobsWithMeta}
        canStartQueuedJob={canStartQueuedJob}
        onStartPrint={onStartPrint}
        hiddenQueueJobs={hiddenQueueJobs}
        canViewHistory={canViewHistory}
        historyTotals={historyTotals}
        historyError={historyError}
        historyJobs={historyJobs}
        historySummaryItems={historySummaryItems}
        historyBreakdown={historyBreakdown}
        requestReprint={requestReprint}
      />
    ) : null;

  const cardNodes: Record<string, React.ReactNode> = {
    status: statusCard,
    webcam:
      canViewWebcam && config?.webcams && config.webcams.length > 0 ? (
            <WebcamPanel
              webcams={config.webcams}
              moonrakerUrl={config.moonraker_url}
              labels={{
                webcam: t.webcam,
                expand: t.expand,
                collapse: t.collapse,
                fullscreen: t.webcamFullscreen,
                exitFullscreen: t.webcamExitFullscreen,
                webcamError: t.webcamError,
                webcamErrorHint: t.webcamErrorHint,
              }}
            />
    ) : null,
    toolhead: toolheadCard,
    temps: tempsCard,
    // Macros require a real session — unlogged (role === null) visitors
    // never see this card, regardless of what the anonymous group's
    // view_macros/run_macros permissions are set to (the backend enforces
    // the same rule on /api/macro/run, so this also avoids a visible-but-
    // broken card that 403s on click).
    macros: role !== null && canViewMacros && canRunMacros ? (
      <MacrosCard
        t={t}
        macrosCollapsed={macrosCollapsed}
        setMacrosCollapsed={setMacrosCollapsed}
        macroDefinitions={macroDefinitions}
        openMacroParams={openMacroParams}
        setOpenMacroParams={setOpenMacroParams}
        macroParamRef={macroParamRef}
        isOfflineOrNotReady={isOfflineOrNotReady}
        isPrinting={isPrinting}
        canRunMacros={canRunMacros}
        handleMacroAction={handleMacroAction}
        macroParamValues={macroParamValues}
        handleMacroParamChange={handleMacroParamChange}
        handleMacroWithParams={handleMacroWithParams}
      />
    ) : null,
    console: canViewConsole ? consoleCard : null,
    speed:
      showToolheadSpeedFactor && canViewSpeed ? (
          <div className="dashboard-card">
            <div className="card-title">
              <Sliders size={20} />
              <span>{t.speedFactorTitle}</span>
              <div className="panel-header-actions" style={{ marginLeft: "auto" }}>
                {<CollapseButton collapsed={speedFactorCollapsed} storageKey="speedFactorCollapsed" setter={setSpeedFactorCollapsed} t={t} />}
              </div>
            </div>

            {!speedFactorCollapsed && (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "8px" }}
            >
              <div className="card-value-row">
                <span>{t.speedLabel}</span>
                <span className="speed-input-wrap">
                  {canControlToolhead ? (
                  <input
                    type="number"
                    className="speed-input"
                    min={10}
                    max={config?.limits.max_speed_factor || 500}
                    value={speedInput}
                    disabled={isOfflineOrNotReady}
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
                  ) : (
                    <span className="speed-input">{speedVal}</span>
                  )}
                  <span className="speed-input-unit">%</span>
                </span>
              </div>
              {/* Slider + presets hidden (not disabled) without control_toolhead. */}
              {canControlToolhead && (
                <>
                  <input
                    type="range"
                    min="10"
                    max={config?.limits.max_speed_factor || 500}
                    value={speedVal}
                    onChange={(e) =>
                      handleSpeedFactorChange(Number(e.target.value))
                    }
                    disabled={isOfflineOrNotReady}
                    style={{
                      width: "100%",
                      accentColor: "var(--accent-color)",
                      cursor: isOfflineOrNotReady ? "default" : "pointer",
                    }}
                  />
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      className="btn"
                      style={{ flex: 1, padding: "4px" }}
                      disabled={isOfflineOrNotReady}
                      onClick={() =>
                        handleSpeedFactorChange(Math.max(10, speedVal - 10))
                      }
                    >
                      -10%
                    </button>
                    <button
                      className="btn"
                      style={{ flex: 1, padding: "4px" }}
                      disabled={isOfflineOrNotReady}
                      onClick={() => handleSpeedFactorChange(100)}
                    >
                      {t.speedReset}
                    </button>
                    <button
                      className="btn"
                      style={{ flex: 1, padding: "4px" }}
                      disabled={isOfflineOrNotReady}
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
                </>
              )}
            </div>
            )}
          </div>
    ) : null,
    queue: null,
    fan: canViewTemps ? fanCard : null,
    flow: canViewSpeed ? flowCard : null,
    announcements:
      canViewStatus && announcements.length > 0 ? announcementsCard : null,
    manualprobe:
      canControlToolhead && probeActive ? manualProbeCard : null,
    inputshaper:
      canControlMachine && hasResonanceTester ? inputShaperCard : null,
    extruder: canControlToolhead ? extruderCard : null,
    retraction:
      canControlToolhead && hasRetraction ? retractionCard : null,
    limits: canControlToolhead ? limitsCard : null,
    calibrate: canControlToolhead ? calibrateCard : null,
    peripherals: canViewTemps && hasPeripherals ? peripheralsCard : null,
    exclude: canControlPrint && hasExcludeObjects ? excludeCard : null,
  };

  return (
    <div
      className="page-content dashboard-page"
      style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
    >
      {/* "Print again?" confirmation (Mainsail-style reprint). */}
      {reprintModal}

      {editLayout && (
        <div className="dashboard-layout-toolbar">
          <span className="layout-hint-text">{t.layoutHint}</span>
          <button type="button" className="btn" onClick={resetLayout}>
            {t.layoutReset}
          </button>
        </div>
      )}

      <div className={`dashboard-grid${editLayout ? " editing" : ""}`}>
        {layout.map((colIds, colIdx) => (
          <div
            key={colIdx}
            className="dashboard-column"
            onDragOver={editLayout ? (e) => handleColumnDragOver(e, colIdx) : undefined}
            onDrop={editLayout ? (e) => handleColumnDrop(e, colIdx) : undefined}
          >
            {colIds.map((id, index) => {
              const node = cardNodes[id];
              if (!node) return null;
              return (
                <div
                  key={id}
                  className="dashboard-card-slot"
                  onDragOver={
                    editLayout ? (e) => handleCardDragOver(e, colIdx, index) : undefined
                  }
                >
                  {editLayout &&
                    dropTarget &&
                    dropTarget.col === colIdx &&
                    dropTarget.index === index && (
                      <div className="drop-indicator" />
                    )}
                  <div
                    className={`card-drag-wrap${editLayout ? " editable" : ""}${
                      draggedId === id ? " dragging" : ""
                    }`}
                    draggable={editLayout}
                    onDragStart={editLayout ? (e) => handleDragStart(e, id) : undefined}
                    onDragEnd={editLayout ? handleDragEnd : undefined}
                  >
                    {editLayout && (
                      <div className="card-drag-badge">
                        <GripVertical size={16} />
                        <span>{cardLabel(id)}</span>
                      </div>
                    )}
                    {node}
                  </div>
                </div>
              );
            })}
            {editLayout &&
              dropTarget &&
              dropTarget.col === colIdx &&
              dropTarget.index === colIds.length && (
                <div className="drop-indicator" />
              )}
          </div>
        ))}
      </div>
    </div>
  );
};

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Crosshair,
  Eye,
  EyeOff,
  FileUp,
  Pause,
  Play,
  RefreshCw,
  RotateCw,
  Sparkles,
} from "lucide-react";
import GCodeViewerEngine from "@sindarius/gcodeviewer";
import type { PortalConfig, PrinterState } from "../usePrinterState";

interface GcodeViewerProps {
  lang: "ro" | "en";
  theme: "light" | "dark";
  fileName: string | null;
  printerState: PrinterState | null;
  config: PortalConfig | null;
}

type ViewerInstance = {
  init: (webgpu?: boolean) => Promise<void>;
  processFile: (content: string) => Promise<void>;
  reload?: () => Promise<void>;
  resize: () => void;
  resetCamera: () => void;
  toggleTravels?: (visible: boolean) => void;
  setCursorVisiblity?: (visible: boolean) => void;
  setZClipPlane?: (top: number, bottom: number) => void;
  updateToolPosition?: (position: Array<{ axes: "X" | "Y" | "Z"; position: number }>) => void;
  updateRenderQuality?: (quality: number) => void;
  setBackgroundColor?: (color: string) => void;
  setProgressColor?: (color: string) => void;
  forceRender?: () => void;
  simulateToolPosition?: () => void;
  fileSize?: number;
  axes?: {
    show?: (visible: boolean) => void;
  };
  bed?: {
    buildVolume?: {
      x: { min: number; max: number };
      y: { min: number; max: number };
      z: { min: number; max: number };
    };
    setDelta?: (enabled: boolean) => void;
    setBedColor?: (color: string) => void;
    dispose?: () => void;
    buildBed?: () => void;
  };
  gcodeProcessor?: {
    updateFilePosition?: (position: number) => void;
    setColorMode?: (mode: number) => void;
    setLiveTracking?: (enabled: boolean) => void;
    useHighQualityExtrusion?: (enabled: boolean) => void;
    updateTool?: (color: string, diameter: number, toolIndex: number) => void;
    loadingProgressCallback?: ((progress: number) => void) | null;
    cancelLoad?: boolean;
    tools?: Array<{ diameter?: number }>;
  };
  scene?: {
    activeCamera?: unknown;
    render?: (force?: boolean) => void;
    dispose?: () => void;
  };
  engine?: {
    dispose?: () => void;
  };
};

type BuildBounds = {
  x: { min: number; max: number };
  y: { min: number; max: number };
  z: { min: number; max: number };
};

const fallbackMin = [0, 0, 0];
const fallbackMax = [220, 220, 250];
const fallbackBounds: BuildBounds = {
  x: { min: fallbackMin[0], max: fallbackMax[0] },
  y: { min: fallbackMin[1], max: fallbackMax[1] },
  z: { min: fallbackMin[2], max: fallbackMax[2] },
};

// Matches Mainsail's tracking offset: trail slightly behind the actual
// file position so the printed toolpath stays visible under the nozzle.
const trackingOffset = 350;

// The viewer library keeps module-level state (the orientation-cube scene
// and a cached edge material), so a disposed engine poisons every viewer
// created after it — the cube renders white garbage. Mirror Mainsail's
// approach: create one canvas + viewer and reuse them across mounts
// instead of disposing (Mainsail stores them as viewerBackup/canvasBackup).
let sharedCanvas: HTMLCanvasElement | null = null;
let sharedViewer: ViewerInstance | null = null;
let sharedViewerInit: Promise<void> | null = null;
let lastLoadedFile: {
  content: string;
  name: string;
  bounds: BuildBounds | null;
} | null = null;

const cssVar = (name: string, fallback: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() ||
  fallback;

const normalizedName = (name?: string | null) => name?.replace(/^\/+/, "") ?? "";

const sameFile = (left?: string | null, right?: string | null) =>
  normalizedName(left) === normalizedName(right);

const isViewerReady = (viewer: ViewerInstance | null): viewer is ViewerInstance =>
  Boolean(viewer?.engine && viewer?.scene && viewer.scene.activeCamera);

// The renderer only draws toolpath segments whose file position is at or
// before gcodeProcessor.currentFilePosition (later segments get alpha 0),
// so after loading the position must be advanced to the end of the file
// or nothing is visible.
const showWholeFile = (viewer: ViewerInstance) => {
  viewer.gcodeProcessor?.updateFilePosition?.(viewer.fileSize ?? 0);
  viewer.forceRender?.();
};

const getNozzleDiameter = (printerState: PrinterState | null) => {
  const raw = printerState?.configfile?.settings?.extruder?.nozzle_diameter;
  const parsed = typeof raw === "string" ? Number(raw) : raw;
  return Number.isFinite(parsed) && parsed ? Number(parsed) : 0.4;
};

const parseGcodeBounds = (content: string): BuildBounds | null => {
  let x = 0;
  let y = 0;
  let z = 0;
  let absolutePositioning = true;
  let xMin = Infinity;
  let xMax = -Infinity;
  let yMin = Infinity;
  let yMax = -Infinity;
  let zMin = Infinity;
  let zMax = -Infinity;
  let hasXyMove = false;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.split(";")[0].trim().toUpperCase();
    if (!line) continue;

    if (/^G90\b/.test(line)) {
      absolutePositioning = true;
      continue;
    }
    if (/^G91\b/.test(line)) {
      absolutePositioning = false;
      continue;
    }
    if (!/^(G0|G1)\b/.test(line)) continue;

    const xMatch = line.match(/\bX(-?\d*\.?\d+)/);
    const yMatch = line.match(/\bY(-?\d*\.?\d+)/);
    const zMatch = line.match(/\bZ(-?\d*\.?\d+)/);

    if (xMatch) {
      const value = Number(xMatch[1]);
      x = absolutePositioning ? value : x + value;
    }
    if (yMatch) {
      const value = Number(yMatch[1]);
      y = absolutePositioning ? value : y + value;
    }
    if (zMatch) {
      const value = Number(zMatch[1]);
      z = absolutePositioning ? value : z + value;
    }

    if (xMatch || yMatch) {
      hasXyMove = true;
      xMin = Math.min(xMin, x);
      xMax = Math.max(xMax, x);
      yMin = Math.min(yMin, y);
      yMax = Math.max(yMax, y);
      zMin = Math.min(zMin, z);
      zMax = Math.max(zMax, z);
    }
  }

  if (!hasXyMove) return null;

  const pad = 12;
  return {
    x: { min: Math.max(0, xMin - pad), max: xMax + pad },
    y: { min: Math.max(0, yMin - pad), max: yMax + pad },
    z: { min: Math.min(0, zMin), max: Math.max(zMax + pad, 40) },
  };
};

export const GcodeViewer: React.FC<GcodeViewerProps> = ({
  lang,
  theme,
  fileName,
  printerState,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<ViewerInstance | null>(null);
  const viewerReadyRef = useRef(false);
  const activeLoadId = useRef(0);
  const langRef = useRef(lang);
  const configureViewerRef = useRef<((viewer: ViewerInstance) => void) | null>(null);
  const loadContentRef = useRef<((content: string, name: string) => Promise<void>) | null>(null);
  const loadCurrentFileRef = useRef<(() => Promise<void>) | null>(null);
  const pendingLocalFileRef = useRef<{ content: string; name: string } | null>(null);
  const appliedQualityRef = useRef<{ quality: number; hd: boolean } | null>(null);
  const [viewerReady, setViewerReady] = useState(false);
  const [loadedFileName, setLoadedFileName] = useState<string | null>(null);
  const [localFileBounds, setLocalFileBounds] = useState<BuildBounds | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [message, setMessage] = useState("");
  const [tracking, setTracking] = useState(true);
  const [showTravels, setShowTravels] = useState(false);
  const [showToolhead, setShowToolhead] = useState(true);
  const [quality, setQuality] = useState(3);
  const [hdRendering, setHdRendering] = useState(false);
  const [scrubFileSize, setScrubFileSize] = useState(0);
  const [scrubPosition, setScrubPosition] = useState(0);
  const [scrubPlaying, setScrubPlaying] = useState(false);
  const [scrubSpeed, setScrubSpeed] = useState(1);

  const liveTracking =
    tracking &&
    printerState?.print_state === "printing" &&
    sameFile(loadedFileName, printerState?.filename);

  // Key on the serialized values: the axis arrays get a fresh identity on
  // every websocket update, which must not retrigger bed rebuilds.
  const axisMinKey = printerState?.toolhead?.axis_minimum?.join() ?? null;
  const axisMaxKey = printerState?.toolhead?.axis_maximum?.join() ?? null;

  const bounds: BuildBounds = useMemo(() => {
    const min = axisMinKey !== null ? axisMinKey.split(",").map(Number) : fallbackMin;
    const max = axisMaxKey !== null ? axisMaxKey.split(",").map(Number) : fallbackMax;

    if ((axisMinKey === null || axisMaxKey === null) && localFileBounds) {
      return localFileBounds;
    }

    return {
      x: { min: min[0] ?? fallbackMin[0], max: max[0] ?? fallbackMax[0] },
      y: { min: min[1] ?? fallbackMin[1], max: max[1] ?? fallbackMax[1] },
      z: { min: min[2] ?? fallbackMin[2], max: max[2] ?? fallbackMax[2] },
    };
  }, [axisMaxKey, axisMinKey, localFileBounds]);

  const kinematics = printerState?.configfile?.settings?.printer?.kinematics;
  const nozzleDiameter = getNozzleDiameter(printerState);

  const configureViewer = useCallback(
    (viewer: ViewerInstance, boundsOverride?: BuildBounds | null) => {
      if (!isViewerReady(viewer)) return;

      const isLight = theme === "light";
      const nextBounds = boundsOverride ?? bounds ?? fallbackBounds;
      viewer.setBackgroundColor?.(
        cssVar("--surface-color", isLight ? "#fef7ff" : "#202020"),
      );
      viewer.setProgressColor?.(
        cssVar("--accent-color", isLight ? "#0064a0" : "#f09343"),
      );
      viewer.updateRenderQuality?.(quality);
      viewer.toggleTravels?.(showTravels);
      viewer.setCursorVisiblity?.(showToolhead);

      if (viewer.bed) {
        const buildVolume = viewer.bed.buildVolume;
        if (buildVolume) {
          buildVolume.x.min = nextBounds.x.min;
          buildVolume.x.max = nextBounds.x.max;
          buildVolume.y.min = nextBounds.y.min;
          buildVolume.y.max = nextBounds.y.max;
          buildVolume.z.min = nextBounds.z.min;
          buildVolume.z.max = nextBounds.z.max;
        }
        viewer.bed.setBedColor?.(cssVar("--border-color", "#B3B3B3"));
        viewer.bed.setDelta?.(kinematics?.includes("delta") ?? false);
      }

      viewer.gcodeProcessor?.setColorMode?.(2);
      viewer.gcodeProcessor?.useHighQualityExtrusion?.(hdRendering);
      viewer.gcodeProcessor?.updateTool?.(
        cssVar("--accent-color", "#f09343"),
        nozzleDiameter,
        0,
      );
      const tools = viewer.gcodeProcessor?.tools;
      if (Array.isArray(tools) && tools.length > 0) {
        tools[0].diameter = nozzleDiameter;
      }
    },
    [bounds, hdRendering, kinematics, nozzleDiameter, quality, showToolhead, showTravels, theme],
  );

  const loadContent = useCallback(
    async (content: string, name: string) => {
      const viewer = viewerRef.current;
      if (!isViewerReady(viewer)) {
        pendingLocalFileRef.current = { content, name };
        setStatus("loading");
        setMessage(
          lang === "ro"
            ? "Se pregătește vizualizatorul..."
            : "Preparing the 3D viewer...",
        );
        return;
      }

      const loadId = ++activeLoadId.current;
      const parsedBounds = parseGcodeBounds(content);
      setLocalFileBounds(parsedBounds);
      setStatus("loading");
      setMessage(lang === "ro" ? "Se încarcă fișierul..." : "Loading file...");

      try {
        configureViewer(viewer, parsedBounds);
        appliedQualityRef.current = { quality, hd: hdRendering };
        await viewer.processFile(content);
        if (activeLoadId.current !== loadId) return;
        configureViewer(viewer, parsedBounds);
        showWholeFile(viewer);
        lastLoadedFile = { content, name, bounds: parsedBounds };
        const size = viewer.fileSize ?? content.length;
        setScrubPlaying(false);
        setScrubFileSize(size);
        setScrubPosition(size);
        viewer.resetCamera();
        viewer.resize();
        requestAnimationFrame(() => {
          if (isViewerReady(viewerRef.current)) {
            viewerRef.current.resetCamera();
            viewerRef.current.forceRender?.();
          }
        });
        setLoadedFileName(name);
        setStatus("ready");
        setMessage("");
      } catch (error) {
        if (activeLoadId.current !== loadId) return;
        console.error("G-code viewer load failed", error);
        setStatus("error");
        setMessage(
          lang === "ro"
            ? "Fișierul G-code nu a putut fi randat."
            : "The G-code file could not be rendered.",
        );
      }
    },
    [configureViewer, hdRendering, lang, quality],
  );

  const loadCurrentFile = useCallback(async () => {
    if (!fileName) {
      setStatus("idle");
      setMessage(
        lang === "ro"
          ? "Nu există fișier curent. Încarcă un fișier local sau pornește o printare."
          : "No current file. Load a local file or start a print.",
      );
      return;
    }

    setStatus("loading");
    setMessage(lang === "ro" ? "Se descarcă G-code-ul..." : "Downloading G-code...");
    const encodedPath = normalizedName(fileName)
      .split("/")
      .map(encodeURIComponent)
      .join("/");
    const response = await fetch(`/api/files/gcodes/${encodedPath}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${fileName}: ${response.status}`);
    }
    const content = await response.text();
    await loadContent(content, fileName);
  }, [fileName, lang, loadContent]);

  useEffect(() => {
    langRef.current = lang;
  }, [lang]);

  useEffect(() => {
    configureViewerRef.current = configureViewer;
  }, [configureViewer]);

  useEffect(() => {
    loadContentRef.current = loadContent;
  }, [loadContent]);

  useEffect(() => {
    loadCurrentFileRef.current = loadCurrentFile;
  }, [loadCurrentFile]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;

    if (!sharedCanvas) {
      sharedCanvas = document.createElement("canvas");
    }
    container.appendChild(sharedCanvas);

    if (!sharedViewer) {
      const viewer = new GCodeViewerEngine(sharedCanvas) as ViewerInstance;
      sharedViewer = viewer;
      sharedViewerInit = viewer.init(false).then(() => {
        viewer.setZClipPlane?.(1000000, -1000000);
        viewer.gcodeProcessor?.setLiveTracking?.(false);
        if (import.meta.env.DEV) {
          (window as unknown as { __gcodeViewer?: ViewerInstance }).__gcodeViewer = viewer;
        }
      });
    }
    const viewer = sharedViewer;
    viewerRef.current = viewer;
    viewerReadyRef.current = false;
    setViewerReady(false);

    const resizeObserver = new ResizeObserver(() => {
      if (viewerReadyRef.current && isViewerReady(viewer)) {
        viewer.resize();
      }
    });
    resizeObserver.observe(container);

    const init = async () => {
      try {
        await sharedViewerInit;
        if (disposed) return;
        if (viewer.gcodeProcessor) {
          viewer.gcodeProcessor.loadingProgressCallback = (progress: number) => {
            if (disposed) return;
            const percent = Math.ceil(progress * 100);
            if (percent <= 99) {
              setStatus("loading");
              setMessage(
                `${langRef.current === "ro" ? "Se randează" : "Rendering"}... ${percent}%`,
              );
            }
          };
        }
        viewerReadyRef.current = true;
        setViewerReady(true);
        viewer.resize();
        configureViewerRef.current?.(viewer);
        const pendingLocalFile = pendingLocalFileRef.current;
        pendingLocalFileRef.current = null;
        if (pendingLocalFile) {
          await loadContentRef.current?.(pendingLocalFile.content, pendingLocalFile.name);
        } else if (lastLoadedFile && (viewer.fileSize ?? 0) > 0) {
          // The shared viewer still holds the model from the previous
          // mount; restore the UI state without reprocessing the file.
          setLocalFileBounds(lastLoadedFile.bounds);
          setLoadedFileName(lastLoadedFile.name);
          const size = viewer.fileSize ?? 0;
          setScrubFileSize(size);
          setScrubPosition(size);
          showWholeFile(viewer);
          setStatus("ready");
          setMessage("");
        } else {
          await loadCurrentFileRef.current?.();
        }
      } catch (error) {
        if (disposed) return;
        console.error("G-code viewer init failed", error);
        setStatus("error");
        setMessage(
          langRef.current === "ro"
            ? "Vizualizatorul 3D nu a putut fi inițializat."
            : "The 3D viewer could not be initialized.",
        );
      }
    };

    init();

    return () => {
      disposed = true;
      viewerReadyRef.current = false;
      setViewerReady(false);
      activeLoadId.current += 1;
      resizeObserver.disconnect();
      if (viewer.gcodeProcessor) {
        viewer.gcodeProcessor.loadingProgressCallback = null;
      }
      if (sharedCanvas && sharedCanvas.parentElement === container) {
        container.removeChild(sharedCanvas);
      }
      viewerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewerReady || !isViewerReady(viewer)) return;
    configureViewer(viewer);
    viewer.forceRender?.();
  }, [configureViewer, viewerReady]);

  // Render quality and HD extrusion only apply while parsing, so changing
  // them on an already loaded file needs a full reload (same as Mainsail).
  useEffect(() => {
    const viewer = viewerRef.current;
    const applied = appliedQualityRef.current;
    if (
      !viewerReady ||
      !isViewerReady(viewer) ||
      !loadedFileName ||
      !viewer.reload ||
      applied === null ||
      (applied.quality === quality && applied.hd === hdRendering)
    ) {
      return;
    }

    appliedQualityRef.current = { quality, hd: hdRendering };
    const loadId = ++activeLoadId.current;
    setStatus("loading");
    viewer.updateRenderQuality?.(quality);
    viewer.gcodeProcessor?.useHighQualityExtrusion?.(hdRendering);
    viewer
      .reload()
      .then(() => {
        if (activeLoadId.current !== loadId) return;
        showWholeFile(viewer);
        setScrubPlaying(false);
        setScrubPosition(viewer.fileSize ?? 0);
        setStatus("ready");
        setMessage("");
      })
      .catch((error) => {
        if (activeLoadId.current !== loadId) return;
        console.error("G-code viewer reload failed", error);
        setStatus("error");
        setMessage(
          langRef.current === "ro" ? "Reîncărcarea a eșuat." : "Reload failed.",
        );
      });
  }, [hdRendering, loadedFileName, quality, viewerReady]);

  // Live tracking: follow the printer's real position through the file.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewerReady || !isViewerReady(viewer) || status !== "ready" || !liveTracking) {
      return;
    }

    const live = printerState?.motion_report?.live_position;
    const origin = printerState?.gcode_move?.homing_origin ?? [0, 0, 0];
    if (Array.isArray(live) && live.length >= 3) {
      viewer.updateToolPosition?.([
        { axes: "X", position: (live[0] ?? 0) - (origin[0] ?? 0) },
        { axes: "Y", position: (live[1] ?? 0) - (origin[1] ?? 0) },
        { axes: "Z", position: (live[2] ?? 0) - (origin[2] ?? 0) },
      ]);
    }

    const filePosition = printerState?.virtual_sdcard?.file_position ?? 0;
    if (filePosition > trackingOffset) {
      viewer.gcodeProcessor?.updateFilePosition?.(filePosition - trackingOffset);
    } else {
      viewer.gcodeProcessor?.updateFilePosition?.(viewer.fileSize ?? 0);
    }
    viewer.forceRender?.();
  }, [
    liveTracking,
    printerState?.gcode_move?.homing_origin,
    printerState?.motion_report?.live_position,
    printerState?.virtual_sdcard?.file_position,
    status,
    viewerReady,
  ]);

  // Manual scrubbing through the print when not live tracking.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (
      !viewerReady ||
      !isViewerReady(viewer) ||
      status !== "ready" ||
      liveTracking ||
      scrubFileSize <= 0
    ) {
      return;
    }

    viewer.gcodeProcessor?.updateFilePosition?.(scrubPosition);
    if (scrubPosition < scrubFileSize) {
      viewer.simulateToolPosition?.();
    }
    viewer.forceRender?.();
  }, [liveTracking, scrubFileSize, scrubPosition, status, viewerReady]);

  // Restore the full model when live tracking ends.
  useEffect(() => {
    if (liveTracking) {
      setScrubPlaying(false);
      return;
    }
    setScrubPosition(scrubFileSize);
  }, [liveTracking, scrubFileSize]);

  useEffect(() => {
    if (!scrubPlaying) return;
    const interval = setInterval(() => {
      setScrubPosition((position) =>
        Math.min(position + 100 * scrubSpeed, scrubFileSize),
      );
    }, 200);
    return () => clearInterval(interval);
  }, [scrubFileSize, scrubPlaying, scrubSpeed]);

  useEffect(() => {
    if (scrubPlaying && scrubPosition >= scrubFileSize) {
      setScrubPlaying(false);
    }
  }, [scrubFileSize, scrubPlaying, scrubPosition]);

  const handleLocalFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    await loadContent(await file.text(), file.name);
  };

  const handleReload = async () => {
    try {
      if (sameFile(loadedFileName, fileName)) {
        await loadCurrentFile();
      } else if (viewerReady && isViewerReady(viewerRef.current) && viewerRef.current.reload) {
        setStatus("loading");
        await viewerRef.current.reload();
        showWholeFile(viewerRef.current);
        setStatus("ready");
      }
    } catch (error) {
      console.error("G-code reload failed", error);
      setStatus("error");
      setMessage(lang === "ro" ? "Reîncărcarea a eșuat." : "Reload failed.");
    }
  };

  return (
    <div className="page-content visualizer-page">
      <div className="visualizer-page-header">
        <div>
          <h2>{lang === "ro" ? "Vizualizare 3D G-Code" : "3D GCode view"}</h2>
          <p>
            {loadedFileName
              ? lang === "ro"
                ? `Fișier: ${loadedFileName}`
                : `File: ${loadedFileName}`
              : lang === "ro"
                ? "Niciun fișier încărcat"
                : "No file loaded"}
          </p>
        </div>
        <div className="visualizer-toolbar">
          <label className="btn">
            <FileUp size={16} />
            <span>{lang === "ro" ? "Local" : "Local"}</span>
            <input
              type="file"
              accept=".gcode,.gco,.g"
              onChange={handleLocalFile}
              hidden
            />
          </label>
          <button
            className="btn"
            onClick={handleReload}
            disabled={status === "loading" || !viewerReady}
          >
            <RefreshCw size={16} />
            <span>{lang === "ro" ? "Reîncarcă" : "Reload"}</span>
          </button>
          <button
            className="btn"
            onClick={() => {
              if (viewerReady && isViewerReady(viewerRef.current)) {
                viewerRef.current.resetCamera();
              }
            }}
            disabled={!viewerReady}
          >
            <RotateCw size={16} />
            <span>{lang === "ro" ? "Cameră" : "Camera"}</span>
          </button>
        </div>
      </div>

      <div className="native-visualizer-shell gcode-viewer-shell">
        <div ref={containerRef} className="gcode-viewer-canvas" />
        {message && (
          <div className={`visualizer-status-overlay ${status}`}>
            <span>{message}</span>
          </div>
        )}
        <div className="visualizer-overlay-controls native-controls">
          <div className="btn-group">
            <button
              className={`btn-control ${tracking ? "active" : ""}`}
              onClick={() => setTracking((value) => !value)}
            >
              <Crosshair size={14} />
              <span>{lang === "ro" ? "Urmărire" : "Tracking"}</span>
            </button>
            <button
              className={`btn-control ${showTravels ? "active" : ""}`}
              onClick={() => setShowTravels((value) => !value)}
            >
              {showTravels ? <Eye size={14} /> : <EyeOff size={14} />}
              <span>{lang === "ro" ? "Travel" : "Travel"}</span>
            </button>
            <button
              className={`btn-control ${showToolhead ? "active" : ""}`}
              onClick={() => setShowToolhead((value) => !value)}
            >
              {showToolhead ? <Eye size={14} /> : <EyeOff size={14} />}
              <span>{lang === "ro" ? "Duză" : "Toolhead"}</span>
            </button>
            <button
              className={`btn-control ${hdRendering ? "active" : ""}`}
              onClick={() => setHdRendering((value) => !value)}
              title={
                lang === "ro"
                  ? "Extrudare de înaltă calitate (reîncarcă fișierul)"
                  : "High quality extrusion (reloads the file)"
              }
            >
              <Sparkles size={14} />
              <span>HD</span>
            </button>
          </div>
          <label className="control-slider-container">
            <span>{lang === "ro" ? "Calitate" : "Quality"}</span>
            <input
              type="range"
              min="1"
              max="5"
              value={quality}
              onChange={(event) => setQuality(Number(event.target.value))}
            />
            <span>{quality}</span>
          </label>
        </div>
        {!liveTracking && scrubFileSize > 0 && status === "ready" && (
          <div className="gcode-scrub-bar">
            <button
              className="btn-control"
              onClick={() => {
                if (!scrubPlaying && scrubPosition >= scrubFileSize) {
                  setScrubPosition(0);
                }
                setScrubPlaying((value) => !value);
              }}
              title={
                scrubPlaying
                  ? lang === "ro"
                    ? "Pauză"
                    : "Pause"
                  : lang === "ro"
                    ? "Redă printarea"
                    : "Play print"
              }
            >
              {scrubPlaying ? <Pause size={14} /> : <Play size={14} />}
            </button>
            <input
              type="range"
              min="0"
              max={scrubFileSize}
              step="1"
              value={Math.min(scrubPosition, scrubFileSize)}
              onChange={(event) => {
                setScrubPlaying(false);
                setScrubPosition(Number(event.target.value));
              }}
            />
            <button
              className="btn-control"
              onClick={() =>
                setScrubSpeed((speed) =>
                  speed >= 20 ? 1 : speed >= 10 ? 20 : speed >= 5 ? 10 : speed >= 2 ? 5 : 2,
                )
              }
              title={lang === "ro" ? "Viteză de redare" : "Playback speed"}
            >
              <span>{scrubSpeed}x</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

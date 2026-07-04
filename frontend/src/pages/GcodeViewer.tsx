import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Crosshair,
  Eye,
  EyeOff,
  FileUp,
  RefreshCw,
  RotateCw,
} from "lucide-react";
import GCodeViewerEngine from "@sindarius/gcodeviewer";
import type { PortalConfig, PrinterState } from "../usePrinterState";

interface GcodeViewerProps {
  lang: "ro" | "en";
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
  updateToolPosition?: (position: Array<{ axes: "X" | "Y" | "Z"; position: number }>) => void;
  updateRenderQuality?: (quality: number) => void;
  setBackgroundColor?: (color: string) => void;
  setProgressColor?: (color: string) => void;
  forceRender?: () => void;
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
    updateTool?: (color: string, diameter: number, toolIndex: number) => void;
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

type ToolpathSegment = {
  start: [number, number, number];
  end: [number, number, number];
  extruding: boolean;
};

type ParsedToolpath = {
  bounds: BuildBounds;
  segments: ToolpathSegment[];
};

const fallbackMin = [0, 0, 0];
const fallbackMax = [220, 220, 250];
const fallbackBounds: BuildBounds = {
  x: { min: fallbackMin[0], max: fallbackMax[0] },
  y: { min: fallbackMin[1], max: fallbackMax[1] },
  z: { min: fallbackMin[2], max: fallbackMax[2] },
};
const viewerBackgroundColor = "#101318";
const viewerProgressColor = "#38bdf8";
const defaultToolColor = "#f59e0b";

const cssVar = (name: string, fallback: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() ||
  fallback;

const normalizedName = (name?: string | null) => name?.replace(/^\/+/, "") ?? "";

const sameFile = (left?: string | null, right?: string | null) =>
  normalizedName(left) === normalizedName(right);

const isViewerReady = (viewer: ViewerInstance | null): viewer is ViewerInstance =>
  Boolean(viewer?.engine && viewer?.scene && viewer.scene.activeCamera);

const getNozzleDiameter = (printerState: PrinterState | null) => {
  const raw = printerState?.configfile?.settings?.extruder?.nozzle_diameter;
  const parsed = typeof raw === "string" ? Number(raw) : raw;
  return Number.isFinite(parsed) && parsed ? Number(parsed) : 0.4;
};

const parseGcodeToolpath = (content: string): ParsedToolpath | null => {
  let x = 0;
  let y = 0;
  let z = 0;
  let e = 0;
  let absolutePositioning = true;
  let relativeExtrusion = false;
  let xMin = Infinity;
  let xMax = -Infinity;
  let yMin = Infinity;
  let yMax = -Infinity;
  let zMin = Infinity;
  let zMax = -Infinity;
  let hasXyMove = false;
  const segments: ToolpathSegment[] = [];

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
    if (/^M82\b/.test(line)) {
      relativeExtrusion = false;
      continue;
    }
    if (/^M83\b/.test(line)) {
      relativeExtrusion = true;
      continue;
    }
    if (/^G92\b/.test(line)) {
      const eMatch = line.match(/\bE(-?\d*\.?\d+)/);
      if (eMatch) e = Number(eMatch[1]);
      continue;
    }
    if (!/^(G0|G1)\b/.test(line)) continue;

    const xMatch = line.match(/\bX(-?\d*\.?\d+)/);
    const yMatch = line.match(/\bY(-?\d*\.?\d+)/);
    const zMatch = line.match(/\bZ(-?\d*\.?\d+)/);
    const eMatch = line.match(/\bE(-?\d*\.?\d+)/);

    const start: [number, number, number] = [x, y, z];
    let nextX = x;
    let nextY = y;
    let nextZ = z;
    let nextE = e;

    if (xMatch) {
      const value = Number(xMatch[1]);
      nextX = absolutePositioning ? value : x + value;
    }
    if (yMatch) {
      const value = Number(yMatch[1]);
      nextY = absolutePositioning ? value : y + value;
    }
    if (zMatch) {
      const value = Number(zMatch[1]);
      nextZ = absolutePositioning ? value : z + value;
    }
    if (eMatch) {
      const value = Number(eMatch[1]);
      nextE = relativeExtrusion ? e + value : value;
    }

    const extrusionDelta = nextE - e;
    const hasPositionMove = Boolean(xMatch || yMatch || zMatch);
    const hasXyMoveOnLine = Boolean(xMatch || yMatch);

    if (hasPositionMove) {
      segments.push({
        start,
        end: [nextX, nextY, nextZ],
        extruding: extrusionDelta > 0 && hasXyMoveOnLine,
      });
    }

    x = nextX;
    y = nextY;
    z = nextZ;
    e = nextE;

    if (hasXyMoveOnLine) {
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
    bounds: {
      x: { min: Math.max(0, xMin - pad), max: xMax + pad },
      y: { min: Math.max(0, yMin - pad), max: yMax + pad },
      z: { min: Math.min(0, zMin), max: Math.max(zMax + pad, 40) },
    },
    segments,
  };
};

export const GcodeViewer: React.FC<GcodeViewerProps> = ({
  lang,
  fileName,
  printerState,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewerRef = useRef<ViewerInstance | null>(null);
  const viewerReadyRef = useRef(false);
  const activeLoadId = useRef(0);
  const langRef = useRef(lang);
  const configureViewerRef = useRef<((viewer: ViewerInstance) => void) | null>(null);
  const loadContentRef = useRef<((content: string, name: string) => Promise<void>) | null>(null);
  const loadCurrentFileRef = useRef<(() => Promise<void>) | null>(null);
  const pendingLocalFileRef = useRef<{ content: string; name: string } | null>(null);
  const [viewerReady, setViewerReady] = useState(false);
  const [loadedFileName, setLoadedFileName] = useState<string | null>(null);
  const [localFileBounds, setLocalFileBounds] = useState<BuildBounds | null>(null);
  const [toolpathSegments, setToolpathSegments] = useState<ToolpathSegment[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [message, setMessage] = useState("");
  const [tracking, setTracking] = useState(true);
  const [showTravels, setShowTravels] = useState(false);
  const [showToolhead, setShowToolhead] = useState(true);
  const [quality, setQuality] = useState(3);

  const bounds: BuildBounds = useMemo(() => {
    const min = printerState?.toolhead?.axis_minimum ?? fallbackMin;
    const max = printerState?.toolhead?.axis_maximum ?? fallbackMax;
    const hasPrinterBounds =
      Array.isArray(printerState?.toolhead?.axis_minimum) &&
      Array.isArray(printerState?.toolhead?.axis_maximum);

    if (!hasPrinterBounds && localFileBounds) {
      return localFileBounds;
    }

    return {
      x: { min: min[0] ?? fallbackMin[0], max: max[0] ?? fallbackMax[0] },
      y: { min: min[1] ?? fallbackMin[1], max: max[1] ?? fallbackMax[1] },
      z: { min: min[2] ?? fallbackMin[2], max: max[2] ?? fallbackMax[2] },
    };
  }, [
    localFileBounds,
    printerState?.toolhead?.axis_maximum,
    printerState?.toolhead?.axis_minimum,
  ]);

  const configureViewer = useCallback(
    (viewer: ViewerInstance, boundsOverride?: BuildBounds | null) => {
      if (!isViewerReady(viewer)) return;

      const nextBounds = boundsOverride ?? bounds ?? fallbackBounds;
      viewer.setBackgroundColor?.(viewerBackgroundColor);
      viewer.setProgressColor?.(viewerProgressColor);
      viewer.updateRenderQuality?.(quality);
      viewer.toggleTravels?.(showTravels);
      viewer.setCursorVisiblity?.(showToolhead);

      if (viewer.bed) {
        viewer.bed.buildVolume = nextBounds;
        viewer.bed.setBedColor?.(cssVar("--border-color", "#313131"));
        const kinematics = printerState?.configfile?.settings?.printer?.kinematics;
        viewer.bed.setDelta?.(kinematics === "delta");
        viewer.bed.dispose?.();
        viewer.bed.buildBed?.();
      }

      const nozzleDiameter = getNozzleDiameter(printerState);
      viewer.gcodeProcessor?.setColorMode?.(2);
      viewer.gcodeProcessor?.updateTool?.(defaultToolColor, nozzleDiameter, 0);
      const tools = viewer.gcodeProcessor?.tools;
      if (Array.isArray(tools) && tools.length > 0) {
        tools[0].diameter = nozzleDiameter;
      }
    },
    [bounds, printerState, quality, showToolhead, showTravels],
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
      const parsedToolpath = parseGcodeToolpath(content);
      const parsedBounds = parsedToolpath?.bounds ?? null;
      setToolpathSegments(parsedToolpath?.segments ?? []);
      setLocalFileBounds(parsedBounds);
      setStatus("loading");
      setMessage(lang === "ro" ? "Se încarcă fișierul..." : "Loading file...");

      try {
        configureViewer(viewer, parsedBounds);
        await viewer.processFile(content);
        if (activeLoadId.current !== loadId) return;
        configureViewer(viewer, parsedBounds);
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
    [configureViewer, lang],
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
    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;
    const viewer = new GCodeViewerEngine(canvas) as ViewerInstance;
    viewerRef.current = viewer;
    viewerReadyRef.current = false;
    setViewerReady(false);

    const resizeObserver = new ResizeObserver(() => {
      if (viewerReadyRef.current && isViewerReady(viewer)) {
        viewer.resize();
      }
    });
    resizeObserver.observe(canvas);

    const init = async () => {
      try {
        await viewer.init(false);
        if (disposed) return;
        viewerReadyRef.current = true;
        setViewerReady(true);
        configureViewerRef.current?.(viewer);
        const pendingLocalFile = pendingLocalFileRef.current;
        pendingLocalFileRef.current = null;
        if (pendingLocalFile) {
          await loadContentRef.current?.(pendingLocalFile.content, pendingLocalFile.name);
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
      viewer.scene?.dispose?.();
      viewer.engine?.dispose?.();
      viewerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewerReady || !isViewerReady(viewer)) return;
    configureViewer(viewer);
    viewer.forceRender?.();
  }, [configureViewer, viewerReady]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (
      !viewerReady ||
      !isViewerReady(viewer) ||
      !tracking ||
      !sameFile(loadedFileName, printerState?.filename)
    ) {
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

    const filePosition = printerState?.virtual_sdcard?.file_position;
    if (typeof filePosition === "number") {
      viewer.gcodeProcessor?.updateFilePosition?.(filePosition);
      viewer.forceRender?.();
    }
  }, [
    loadedFileName,
    printerState?.filename,
    printerState?.gcode_move?.homing_origin,
    printerState?.motion_report?.live_position,
    printerState?.virtual_sdcard?.file_position,
    tracking,
    viewerReady,
  ]);

  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);
      if (!toolpathSegments.length) return;

      const activeBounds = localFileBounds ?? bounds;
      const centerX = (activeBounds.x.min + activeBounds.x.max) / 2;
      const centerY = (activeBounds.y.min + activeBounds.y.max) / 2;
      const minZ = activeBounds.z.min;
      const yaw = -0.72;
      const pitch = 0.82;

      const projectRaw = ([px, py, pz]: [number, number, number]) => {
        const tx = px - centerX;
        const ty = py - centerY;
        const tz = pz - minZ;
        const rx = tx * Math.cos(yaw) - ty * Math.sin(yaw);
        const ry = tx * Math.sin(yaw) + ty * Math.cos(yaw);
        const rz = tz;
        return {
          x: rx,
          y: -(ry * Math.cos(pitch) - rz * Math.sin(pitch)),
        };
      };

      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const segment of toolpathSegments) {
        if (!showTravels && !segment.extruding) continue;
        const a = projectRaw(segment.start);
        const b = projectRaw(segment.end);
        minX = Math.min(minX, a.x, b.x);
        maxX = Math.max(maxX, a.x, b.x);
        minY = Math.min(minY, a.y, b.y);
        maxY = Math.max(maxY, a.y, b.y);
      }

      if (!Number.isFinite(minX) || !Number.isFinite(minY)) return;

      const projectedWidth = Math.max(1, maxX - minX);
      const projectedHeight = Math.max(1, maxY - minY);
      const scale = Math.min(
        (rect.width * 0.76) / projectedWidth,
        (rect.height * 0.7) / projectedHeight,
      );
      const offsetX = rect.width / 2 - ((minX + maxX) / 2) * scale;
      const offsetY = rect.height / 2 - ((minY + maxY) / 2) * scale;
      const zRange = Math.max(1, activeBounds.z.max - activeBounds.z.min);

      const project = (point: [number, number, number]) => {
        const raw = projectRaw(point);
        return {
          x: raw.x * scale + offsetX,
          y: raw.y * scale + offsetY,
        };
      };

      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if (showTravels) {
        ctx.strokeStyle = "rgba(148, 163, 184, 0.18)";
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        for (const segment of toolpathSegments) {
          if (segment.extruding) continue;
          const a = project(segment.start);
          const b = project(segment.end);
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
        }
        ctx.stroke();
      }

      ctx.lineWidth = 1.35;
      for (const segment of toolpathSegments) {
        if (!segment.extruding) continue;
        const zRatio = (segment.end[2] - activeBounds.z.min) / zRange;
        const hue = 202 + zRatio * 95;
        const a = project(segment.start);
        const b = project(segment.end);
        ctx.strokeStyle = `hsla(${hue}, 92%, 62%, 0.9)`;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    };

    draw();
    const resizeObserver = new ResizeObserver(draw);
    resizeObserver.observe(canvas);
    return () => resizeObserver.disconnect();
  }, [bounds, localFileBounds, showTravels, toolpathSegments]);

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
        <canvas ref={canvasRef} className="gcode-viewer-canvas" />
        <canvas ref={overlayCanvasRef} className="gcode-toolpath-overlay" />
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
      </div>
    </div>
  );
};

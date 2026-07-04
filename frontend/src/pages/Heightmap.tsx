import React, { useEffect, useMemo, useRef, useState } from "react";
import { Compass, RotateCw, Home, Eraser, Palette, ChevronDown } from "lucide-react";
import * as echarts from "echarts";
import "echarts-gl";
import type { ECharts } from "echarts";
import type { PrinterState } from "../usePrinterState";
import { translations } from "../translations";

interface HeightmapProps {
  lang: "ro" | "en";
  printerState: PrinterState | null;
  sendGcode: (gcode: string) => Promise<boolean>;
  config: any;
}

const fallbackMin = [0, 0, 0];
const fallbackMax = [220, 220, 250];

// Color schemes, mirrored from Mainsail's gui/heightmap getters.
const colorSchemes: Record<string, string[]> = {
  portland: [
    "#313695",
    "#4575b4",
    "#74add1",
    "#abd9e9",
    "#e0f3f8",
    "#ffffbf",
    "#fee090",
    "#fdae61",
    "#f46d43",
    "#d73027",
    "#a50026",
  ],
  hsv: ["#0000ff", "#00ffff", "#00ff00", "#ffff00", "#ff0000"],
  spring: ["#ff00ff", "#ffff00"],
  hot: ["#000000", "#ff0000", "#ffff00", "#ffffff"],
  grayscale: ["#ffffff", "#000000"],
};

const orientationMap: Record<string, { alpha: number; beta: number }> = {
  rightFront: { alpha: 25, beta: 40 },
  leftFront: { alpha: 25, beta: -40 },
  front: { alpha: 25, beta: 0 },
  top: { alpha: 90, beta: 0 },
};

const cssVar = (name: string, fallback: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() ||
  fallback;

const isMatrix = (matrix?: number[][] | null): matrix is number[][] =>
  Array.isArray(matrix) &&
  matrix.length > 0 &&
  matrix.every((row) => Array.isArray(row) && row.length > 0);

type Surface = { data: number[][]; dataShape: number[] };

// Build a flat [x,y,z] point list plus dataShape so echarts-gl can triangulate
// the surface correctly (this is the core fix vs. the old buggy version).
const buildSurface = (
  matrix: number[][],
  meshMin: number[],
  meshMax: number[],
): Surface => {
  const yCount = matrix.length;
  const xCount = Math.max(...matrix.map((row) => row.length));
  const xMin = meshMin[0] ?? fallbackMin[0];
  const xMax = meshMax[0] ?? fallbackMax[0];
  const yMin = meshMin[1] ?? fallbackMin[1];
  const yMax = meshMax[1] ?? fallbackMax[1];
  const xStep = xCount > 1 ? (xMax - xMin) / (xCount - 1) : 0;
  const yStep = yCount > 1 ? (yMax - yMin) / (yCount - 1) : 0;

  const data: number[][] = [];
  matrix.forEach((row, yPoint) => {
    row.forEach((value, xPoint) => {
      data.push([xMin + xStep * xPoint, yMin + yStep * yPoint, value]);
    });
  });

  return { data, dataShape: [yCount, xCount] };
};

// The theoretical flat mesh, derived from the printer's bed_mesh config.
const buildFlatSurface = (bedMeshConfig: any): Surface | null => {
  if (!bedMeshConfig) return null;

  let probeCount: any = [1, 1];
  if (bedMeshConfig.probe_count && typeof bedMeshConfig.probe_count === "string") {
    probeCount = bedMeshConfig.probe_count.split(",");
  } else if (bedMeshConfig.probe_count) {
    probeCount =
      bedMeshConfig.probe_count.length < 2
        ? [bedMeshConfig.probe_count, bedMeshConfig.probe_count]
        : bedMeshConfig.probe_count;
  } else if (bedMeshConfig.round_probe_count) {
    probeCount = [bedMeshConfig.round_probe_count, bedMeshConfig.round_probe_count];
  }

  let meshMin: any = bedMeshConfig.mesh_min ?? [0, 0];
  let meshMax: any = bedMeshConfig.mesh_max ?? [200, 200];

  if ("mesh_radius" in bedMeshConfig) {
    meshMin = [bedMeshConfig.mesh_radius * -1, bedMeshConfig.mesh_radius * -1];
    meshMax = [bedMeshConfig.mesh_radius, bedMeshConfig.mesh_radius];
  }

  const xCount = Number(probeCount[0]);
  const yCount = Number(probeCount[1]);
  const xMin = parseFloat(meshMin[0]);
  const xMax = parseFloat(meshMax[0]);
  const yMin = parseFloat(meshMin[1]);
  const yMax = parseFloat(meshMax[1]);
  if (
    !Number.isFinite(xCount) ||
    !Number.isFinite(yCount) ||
    xCount < 2 ||
    yCount < 2
  ) {
    return null;
  }
  const xStep = (xMax - xMin) / (xCount - 1);
  const yStep = (yMax - yMin) / (yCount - 1);

  const data: number[][] = [];
  for (let y = 0; y < yCount; y++) {
    for (let x = 0; x < xCount; x++) {
      data.push([xMin + xStep * x, yMin + yStep * y, 0]);
    }
  }

  return { data, dataShape: [yCount, xCount] };
};

export const Heightmap: React.FC<HeightmapProps> = ({
  lang,
  printerState,
  sendGcode,
}) => {
  const t = translations[lang];
  const chartRef = useRef<HTMLDivElement | null>(null);
  const chartInstance = useRef<ECharts | null>(null);

  // Loading flags for header actions.
  const [busyAction, setBusyAction] = useState<string | null>(null);

  // Persisted view toggles (localStorage, mirroring Mainsail's gui store).
  // Defaults: probed off; mesh/flat/wireframe/scale-gradient on.
  const [showProbed, setShowProbed] = useState(
    () => localStorage.getItem("hm.probed") === "true",
  );
  const [showMesh, setShowMesh] = useState(
    () => localStorage.getItem("hm.mesh") !== "false",
  );
  const [showFlat, setShowFlat] = useState(
    () => localStorage.getItem("hm.flat") !== "false",
  );
  const [wireframe, setWireframe] = useState(
    () => localStorage.getItem("hm.wireframe") !== "false",
  );
  const [scaleGradient, setScaleGradient] = useState(
    () => localStorage.getItem("hm.scaleGradient") !== "false",
  );
  const [scaleZMax, setScaleZMax] = useState(() => {
    const v = localStorage.getItem("hm.scaleZMax");
    return v === null ? 1.0 : parseFloat(v);
  });
  const [colorScheme, setColorScheme] = useState(
    () => localStorage.getItem("hm.colorScheme") || "portland",
  );
  const [orientation, setOrientation] = useState(
    () => localStorage.getItem("hm.orientation") || "front",
  );

  const persist = (key: string, value: string) =>
    localStorage.setItem(key, value);

  // Dropdowns.
  const [schemeOpen, setSchemeOpen] = useState(false);
  const [orientationOpen, setOrientationOpen] = useState(false);
  const schemeRef = useRef<HTMLDivElement | null>(null);
  const orientationRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (schemeRef.current && !schemeRef.current.contains(event.target as Node)) {
        setSchemeOpen(false);
      }
      if (
        orientationRef.current &&
        !orientationRef.current.contains(event.target as Node)
      ) {
        setOrientationOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Re-render the chart when the theme (data-theme attribute) changes.
  const [themeTick, setThemeTick] = useState(0);
  useEffect(() => {
    const observer = new MutationObserver(() => setThemeTick((n) => n + 1));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  const bedMesh = printerState?.bed_mesh ?? null;
  const bedMeshConfig = (printerState as any)?.configfile?.settings?.bed_mesh;

  // A signature to memoise derived data without churning on every WS tick.
  const meshSignature = useMemo(
    () =>
      JSON.stringify({
        bm: bedMesh,
        axmin: printerState?.toolhead?.axis_minimum,
        axmax: printerState?.toolhead?.axis_maximum,
        cfg: bedMeshConfig,
      }),
    [
      bedMesh,
      printerState?.toolhead?.axis_minimum,
      printerState?.toolhead?.axis_maximum,
      bedMeshConfig,
    ],
  );

  const probedMatrix = useMemo(
    () => (isMatrix(bedMesh?.probed_matrix) ? bedMesh!.probed_matrix! : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [meshSignature],
  );
  const meshMatrix = useMemo(
    () => (isMatrix(bedMesh?.mesh_matrix) ? bedMesh!.mesh_matrix! : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [meshSignature],
  );

  const meshMin = bedMesh?.mesh_min ?? printerState?.toolhead?.axis_minimum ?? fallbackMin;
  const meshMax = bedMesh?.mesh_max ?? printerState?.toolhead?.axis_maximum ?? fallbackMax;
  const profileName = bedMesh?.profile_name || "-";

  const isActive = useMemo(() => {
    if (!bedMesh) return false;
    if (probedMatrix || meshMatrix) return true;
    if (bedMesh.profile_name && bedMesh.profile_name !== "") return true;
    const mn = bedMesh.mesh_min ?? [0, 0];
    const mx = bedMesh.mesh_max ?? [0, 0];
    return mn[0] !== 0 || mn[1] !== 0 || mx[0] !== 0 || mx[1] !== 0;
  }, [bedMesh, probedMatrix, meshMatrix]);

  // Stats from the probed matrix (fallback to mesh matrix).
  const stats = useMemo(() => {
    const source = probedMatrix ?? meshMatrix;
    if (!source) return null;
    const values = source.flat();
    if (values.length === 0) return null;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const avg = values.reduce((s, v) => s + v, 0) / values.length;
    const variance =
      values.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / values.length;
    return { min, max, range: max - min, rms: Math.sqrt(variance) };
  }, [probedMatrix, meshMatrix]);

  // Slider bounds for scaleZMax (Mainsail's heightmapRangeLimit).
  const zRangeLimit = useMemo(() => {
    if (!stats) return [0.5, 1];
    const minRange =
      Math.round(Math.max(Math.abs(stats.min), Math.abs(stats.max)) * 10) / 10;
    const maxRange = Math.max(minRange, 1);
    return [minRange || 0.1, maxRange];
  }, [stats]);

  const effectiveZMax = Math.min(
    zRangeLimit[1],
    Math.max(zRangeLimit[0], scaleZMax),
  );

  // Initialise / dispose the chart when the mesh becomes (in)active.
  useEffect(() => {
    const el = chartRef.current;
    if (!el || !isActive) return;

    const chart = echarts.init(el, undefined, { renderer: "canvas" });
    chartInstance.current = chart;
    const resizeObserver = new ResizeObserver(() => chart.resize());
    resizeObserver.observe(el);

    return () => {
      resizeObserver.disconnect();
      chart.dispose();
      chartInstance.current = null;
    };
  }, [isActive]);

  // Build & apply the chart option.
  useEffect(() => {
    const chart = chartInstance.current;
    if (!chart || !isActive) return;

    const textColor = cssVar("--text-primary", "#ffffff");
    const secondaryText = cssVar("--text-secondary", "#b3b3b3");
    const bgColor = cssVar("--surface-color", "#202020");
    const gridColor = cssVar("--border-color", "#313131");
    const isDark =
      document.documentElement.getAttribute("data-theme") !== "light";

    const rangeX = [
      printerState?.toolhead?.axis_minimum?.[0] ?? fallbackMin[0],
      printerState?.toolhead?.axis_maximum?.[0] ?? fallbackMax[0],
    ];
    const rangeY = [
      printerState?.toolhead?.axis_minimum?.[1] ?? fallbackMin[1],
      printerState?.toolhead?.axis_maximum?.[1] ?? fallbackMax[1],
    ];
    const absRangeX = rangeX[1] - rangeX[0] || 1;
    const absRangeY = rangeY[1] - rangeY[0] || 1;
    const minRangeXY = Math.min(absRangeX, absRangeY) || 1;
    const scaleX = absRangeX / minRangeXY;
    const scaleY = absRangeY / minRangeXY;

    const probed = probedMatrix
      ? buildSurface(probedMatrix, meshMin, meshMax)
      : { data: [], dataShape: [0, 0] };
    const mesh = meshMatrix
      ? buildSurface(meshMatrix, meshMin, meshMax)
      : { data: [], dataShape: [0, 0] };
    const flat = buildFlatSurface(bedMeshConfig) ?? {
      data: [],
      dataShape: [0, 0],
    };

    // visualMap range.
    let visualMapRange: number[] = [-0.1, 0.1];
    if (scaleGradient) {
      const points: number[] = [];
      if (showProbed && probedMatrix) for (const r of probedMatrix) points.push(...r);
      if (showMesh && meshMatrix) for (const r of meshMatrix) points.push(...r);
      visualMapRange = [
        Math.min(0, ...points),
        Math.max(0, ...points),
      ];
    }

    const visualMapSeriesIndex: number[] = [];
    if (showProbed) visualMapSeriesIndex.push(0);
    else if (showMesh) visualMapSeriesIndex.push(1);

    const orient = orientationMap[orientation] ?? orientationMap.rightFront;

    const option: any = {
      darkMode: isDark,
      animation: false,
      backgroundColor: "transparent",
      tooltip: {
        backgroundColor: bgColor,
        borderWidth: 0,
        padding: 12,
        textStyle: { color: textColor, fontSize: 14 },
        formatter: (data: any) => {
          const out: string[] = [`<b>${data.seriesName}</b>`];
          const [x, y, z] = data.value;
          out.push(`<b>X</b>: ${Number(x).toFixed(1)} mm`);
          out.push(`<b>Y</b>: ${Number(y).toFixed(1)} mm`);
          out.push(`<b>Z</b>: ${Number(z).toFixed(3)} mm`);
          return out.join("<br />");
        },
      },
      legend: {
        show: false,
        selected: { probed: showProbed, mesh: showMesh, flat: showFlat },
      },
      visualMap: {
        show: true,
        min: visualMapRange[0],
        max: visualMapRange[1],
        calculable: true,
        dimension: 2,
        seriesIndex: visualMapSeriesIndex,
        left: 10,
        top: 20,
        bottom: 20,
        itemWidth: 24,
        itemHeight: 480,
        precision: 3,
        inRange: { color: colorSchemes[colorScheme] ?? colorSchemes.portland },
        textStyle: { color: textColor, fontSize: 13 },
      },
      xAxis3D: {
        type: "value",
        name: "X",
        min: rangeX[0],
        max: rangeX[1],
        minInterval: 1,
        nameTextStyle: { color: secondaryText },
        axisLabel: { color: secondaryText },
        axisLine: { lineStyle: { color: gridColor } },
        splitLine: { lineStyle: { color: gridColor } },
      },
      yAxis3D: {
        type: "value",
        name: "Y",
        min: rangeY[0],
        max: rangeY[1],
        nameTextStyle: { color: secondaryText },
        axisLabel: { color: secondaryText },
        axisLine: { lineStyle: { color: gridColor } },
        splitLine: { lineStyle: { color: gridColor } },
      },
      zAxis3D: {
        type: "value",
        name: "Z",
        min: effectiveZMax * -1,
        max: effectiveZMax,
        nameTextStyle: { color: secondaryText },
        axisLabel: { color: secondaryText },
        axisLine: { lineStyle: { color: gridColor } },
        splitLine: { lineStyle: { color: gridColor } },
        axisPointer: {
          label: {
            formatter: (value: any) => {
              const val = typeof value === "string" ? parseFloat(value) : value;
              return Number(val).toFixed(2);
            },
          },
        },
      },
      grid3D: {
        boxWidth: 100 * scaleX,
        boxDepth: 100 * scaleY,
        axisLabel: { textStyle: { color: secondaryText } },
        axisLine: { lineStyle: { color: gridColor } },
        axisTick: { lineStyle: { color: gridColor } },
        splitLine: { lineStyle: { color: gridColor } },
        axisPointer: {
          lineStyle: { color: textColor },
          label: { textStyle: { color: textColor } },
        },
        viewControl: {
          projection: "perspective",
          distance: 200,
          alpha: orient.alpha,
          beta: orient.beta,
        },
        light: {
          main: { intensity: 1.1, shadow: true },
          ambient: { intensity: 0.45 },
        },
      },
      series: [
        {
          type: "surface",
          name: "probed",
          data: probed.data,
          dataShape: probed.dataShape,
          itemStyle: { opacity: 1 },
          wireframe: { show: wireframe },
        },
        {
          type: "surface",
          name: "mesh",
          data: mesh.data,
          dataShape: mesh.dataShape,
          itemStyle: { opacity: 1 },
          wireframe: { show: wireframe },
        },
        {
          type: "surface",
          name: "flat",
          data: flat.data,
          dataShape: flat.dataShape,
          itemStyle: { color: [1, 1, 1, 1], opacity: 0.5 },
          wireframe: { show: wireframe },
        },
      ],
    };

    chart.setOption(option, true);
    chart.resize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    meshSignature,
    isActive,
    showProbed,
    showMesh,
    showFlat,
    wireframe,
    scaleGradient,
    effectiveZMax,
    colorScheme,
    orientation,
    themeTick,
    lang,
  ]);

  const isOffline = printerState?.connection_state !== "connected";
  const isPrinting = printerState?.print_state === "printing";

  const runAction = async (key: string, gcode: string) => {
    setBusyAction(key);
    await sendGcode(gcode);
    setBusyAction(null);
  };

  const orientationLabel: Record<string, string> = {
    rightFront: t.hmOrientRightFront,
    leftFront: t.hmOrientLeftFront,
    front: t.hmOrientFront,
    top: t.hmOrientTop,
  };
  const schemeLabel: Record<string, string> = {
    portland: "Portland",
    hsv: "HSV",
    spring: "Spring",
    hot: "Hot",
    grayscale: t.hmSchemeGrayscale,
  };

  return (
    <div className="page-content visualizer-page">
      <div className="visualizer-page-header">
        <div>
          <h2>Heightmap</h2>
          <p>
            {t.hmMeshProfile}: {profileName}
          </p>
        </div>
        <div className="visualizer-toolbar">
          <button
            className="btn"
            onClick={() => runAction("home", "G28")}
            disabled={isOffline || isPrinting || busyAction === "home"}
            title={t.homeAll}
          >
            {busyAction === "home" ? (
              <RotateCw size={16} className="spin" />
            ) : (
              <Home size={16} />
            )}
            <span>{t.homeAll}</span>
          </button>
          {isActive && (
            <button
              className="btn"
              onClick={() => runAction("clear", "BED_MESH_CLEAR")}
              disabled={isOffline || busyAction === "clear"}
              title={t.hmClear}
            >
              {busyAction === "clear" ? (
                <RotateCw size={16} className="spin" />
              ) : (
                <Eraser size={16} />
              )}
              <span>{t.hmClear}</span>
            </button>
          )}
          <button
            className="btn btn-primary"
            onClick={() => runAction("calibrate", "BED_MESH_CALIBRATE")}
            disabled={isOffline || isPrinting || busyAction === "calibrate"}
            title={t.hmCalibrate}
          >
            {busyAction === "calibrate" ? (
              <RotateCw size={16} className="spin" />
            ) : (
              <Compass size={16} />
            )}
            <span>
              {busyAction === "calibrate" ? t.hmCalibrating : t.hmCalibrate}
            </span>
          </button>
        </div>
      </div>

      {stats && (
        <div className="visualizer-stat-grid">
          <div className="visualizer-stat">
            <span>{t.hmMax}</span>
            <strong className="stat-high">+{stats.max.toFixed(4)} mm</strong>
          </div>
          <div className="visualizer-stat">
            <span>{t.hmMin}</span>
            <strong className="stat-low">{stats.min.toFixed(4)} mm</strong>
          </div>
          <div className="visualizer-stat">
            <span>{t.hmRange}</span>
            <strong>{stats.range.toFixed(4)} mm</strong>
          </div>
          <div className="visualizer-stat">
            <span>RMS</span>
            <strong>{stats.rms.toFixed(4)} mm</strong>
          </div>
        </div>
      )}

      <div className="native-visualizer-shell">
        {isActive ? (
          <div ref={chartRef} className="heightmap-chart" />
        ) : (
          <div className="visualizer-empty-state">
            <h3>{t.hmNoMesh}</h3>
            <p>{t.hmNoMeshDesc}</p>
          </div>
        )}
      </div>

      {isActive && (
        <div className="heightmap-controls">
          <div className="heightmap-checks">
            <label className="heightmap-check">
              <input
                type="checkbox"
                checked={showProbed}
                onChange={(e) => {
                  setShowProbed(e.target.checked);
                  persist("hm.probed", String(e.target.checked));
                }}
              />
              {t.hmProbed}
            </label>
            <label className="heightmap-check">
              <input
                type="checkbox"
                checked={showMesh}
                onChange={(e) => {
                  setShowMesh(e.target.checked);
                  persist("hm.mesh", String(e.target.checked));
                }}
              />
              {t.hmMesh}
            </label>
            <label className="heightmap-check">
              <input
                type="checkbox"
                checked={showFlat}
                onChange={(e) => {
                  setShowFlat(e.target.checked);
                  persist("hm.flat", String(e.target.checked));
                }}
              />
              {t.hmFlat}
            </label>
            <label className="heightmap-check">
              <input
                type="checkbox"
                checked={wireframe}
                onChange={(e) => {
                  setWireframe(e.target.checked);
                  persist("hm.wireframe", String(e.target.checked));
                }}
              />
              {t.hmWireframe}
            </label>
            <label className="heightmap-check">
              <input
                type="checkbox"
                checked={scaleGradient}
                onChange={(e) => {
                  setScaleGradient(e.target.checked);
                  persist("hm.scaleGradient", String(e.target.checked));
                }}
              />
              {t.hmScaleGradient}
            </label>
          </div>

          <div className="heightmap-selects">
            {/* Color scheme */}
            <div ref={schemeRef} className="heightmap-select-wrap">
              <button
                type="button"
                className="preset-select-btn heightmap-select-btn"
                onClick={() => setSchemeOpen((o) => !o)}
                title={t.hmColorScheme}
              >
                <Palette size={14} />
                <span>{schemeLabel[colorScheme] ?? colorScheme}</span>
                <ChevronDown size={14} />
              </button>
              {schemeOpen && (
                <div className="preset-popup heightmap-popup">
                  {Object.keys(colorSchemes).map((key) => (
                    <button
                      key={key}
                      type="button"
                      className="preset-popup-item"
                      onClick={() => {
                        setColorScheme(key);
                        persist("hm.colorScheme", key);
                        setSchemeOpen(false);
                      }}
                    >
                      <span>{schemeLabel[key] ?? key}</span>
                      <span
                        className="heightmap-swatch"
                        style={{
                          background: `linear-gradient(90deg, ${colorSchemes[key].join(",")})`,
                        }}
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Orientation */}
            <div ref={orientationRef} className="heightmap-select-wrap">
              <button
                type="button"
                className="preset-select-btn heightmap-select-btn"
                onClick={() => setOrientationOpen((o) => !o)}
                title={t.hmOrientation}
              >
                <Compass size={14} />
                <span>{orientationLabel[orientation] ?? orientation}</span>
                <ChevronDown size={14} />
              </button>
              {orientationOpen && (
                <div className="preset-popup heightmap-popup">
                  {Object.keys(orientationMap).map((key) => (
                    <button
                      key={key}
                      type="button"
                      className="preset-popup-item"
                      onClick={() => {
                        setOrientation(key);
                        persist("hm.orientation", key);
                        setOrientationOpen(false);
                      }}
                    >
                      <span>{orientationLabel[key] ?? key}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="heightmap-slider-row">
            <span className="heightmap-slider-label">{t.hmScaleZMax}</span>
            <input
              type="range"
              min={zRangeLimit[0]}
              max={zRangeLimit[1]}
              step={0.1}
              value={effectiveZMax}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                setScaleZMax(v);
                persist("hm.scaleZMax", String(v));
              }}
            />
            <span className="heightmap-slider-value">
              {effectiveZMax.toFixed(1)} mm
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

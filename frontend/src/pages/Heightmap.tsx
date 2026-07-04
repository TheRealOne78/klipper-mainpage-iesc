import React, { useEffect, useMemo, useRef, useState } from "react";
import { Compass, RotateCw } from "lucide-react";
import * as echarts from "echarts";
import "echarts-gl";
import type { ECharts, EChartsOption } from "echarts";
import type { PrinterState } from "../usePrinterState";

interface HeightmapProps {
  lang: "ro" | "en";
  printerState: PrinterState | null;
  sendGcode: (gcode: string) => Promise<boolean>;
  config: any;
}

const fallbackMin = [0, 0, 0];
const fallbackMax = [220, 220, 250];

const cssVar = (name: string, fallback: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() ||
  fallback;

const isMatrix = (matrix?: number[][] | null): matrix is number[][] =>
  Array.isArray(matrix) &&
  matrix.length > 0 &&
  matrix.every((row) => Array.isArray(row) && row.length > 0);

const buildSeriesData = (
  matrix: number[][],
  meshMin: number[],
  meshMax: number[],
) => {
  const rows = matrix.length;
  const cols = Math.max(...matrix.map((row) => row.length));
  const minX = meshMin[0] ?? fallbackMin[0];
  const minY = meshMin[1] ?? fallbackMin[1];
  const maxX = meshMax[0] ?? fallbackMax[0];
  const maxY = meshMax[1] ?? fallbackMax[1];

  return matrix.flatMap((row, rowIndex) =>
    row.map((z, colIndex) => {
      const x = cols > 1 ? minX + (colIndex / (cols - 1)) * (maxX - minX) : minX;
      const y = rows > 1 ? minY + (rowIndex / (rows - 1)) * (maxY - minY) : minY;
      return [Number(x.toFixed(3)), Number(y.toFixed(3)), z];
    }),
  );
};

export const Heightmap: React.FC<HeightmapProps> = ({
  lang,
  printerState,
  sendGcode,
}) => {
  const chartRef = useRef<HTMLDivElement | null>(null);
  const chartInstance = useRef<ECharts | null>(null);
  const [calibrating, setCalibrating] = useState(false);

  const matrix = useMemo(() => {
    const probed = printerState?.bed_mesh?.probed_matrix;
    const mesh = printerState?.bed_mesh?.mesh_matrix;
    return isMatrix(probed) ? probed : isMatrix(mesh) ? mesh : null;
  }, [printerState?.bed_mesh?.mesh_matrix, printerState?.bed_mesh?.probed_matrix]);

  const meshMin = printerState?.bed_mesh?.mesh_min ?? printerState?.toolhead?.axis_minimum ?? fallbackMin;
  const meshMax = printerState?.bed_mesh?.mesh_max ?? printerState?.toolhead?.axis_maximum ?? fallbackMax;
  const profileName = printerState?.bed_mesh?.profile_name || "-";

  const stats = useMemo(() => {
    if (!matrix) return null;
    const values = matrix.flat();
    const min = Math.min(...values);
    const max = Math.max(...values);
    const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance =
      values.reduce((sum, value) => sum + Math.pow(value - avg, 2), 0) /
      values.length;

    return {
      min,
      max,
      range: max - min,
      rms: Math.sqrt(variance),
    };
  }, [matrix]);

  useEffect(() => {
    const el = chartRef.current;
    if (!el || !matrix || !stats) return;

    const chart = echarts.init(el, undefined, { renderer: "canvas" });
    chartInstance.current = chart;

    const resizeObserver = new ResizeObserver(() => chart.resize());
    resizeObserver.observe(el);

    return () => {
      resizeObserver.disconnect();
      chart.dispose();
      chartInstance.current = null;
    };
  }, [matrix, stats]);

  useEffect(() => {
    const chart = chartInstance.current;
    if (!chart || !matrix || !stats) return;

    const textColor = cssVar("--text-primary", "#ffffff");
    const secondaryText = cssVar("--text-secondary", "#b3b3b3");
    const bgColor = cssVar("--surface-color", "#202020");
    const gridColor = cssVar("--border-color", "#313131");
    const accentColor = cssVar("--accent-color", "#f09343");
    const data = buildSeriesData(matrix, meshMin, meshMax);

    const option: EChartsOption = {
      backgroundColor: bgColor,
      tooltip: {
        formatter: (params: any) => {
          const [x, y, z] = params.value;
          return `X ${x} mm<br/>Y ${y} mm<br/>Z ${Number(z).toFixed(4)} mm`;
        },
        borderColor: gridColor,
        backgroundColor: bgColor,
        textStyle: { color: textColor },
      },
      visualMap: {
        show: true,
        min: stats.min,
        max: stats.max,
        calculable: true,
        precision: 4,
        textStyle: { color: textColor },
        inRange: {
          color: ["#2563eb", "#22c55e", accentColor, "#ef4444"],
        },
      },
      xAxis3D: {
        type: "value",
        name: "X",
        min: meshMin[0] ?? fallbackMin[0],
        max: meshMax[0] ?? fallbackMax[0],
        nameTextStyle: { color: textColor },
        axisLabel: { color: secondaryText },
        axisLine: { lineStyle: { color: gridColor } },
        splitLine: { lineStyle: { color: gridColor } },
      },
      yAxis3D: {
        type: "value",
        name: "Y",
        min: meshMin[1] ?? fallbackMin[1],
        max: meshMax[1] ?? fallbackMax[1],
        nameTextStyle: { color: textColor },
        axisLabel: { color: secondaryText },
        axisLine: { lineStyle: { color: gridColor } },
        splitLine: { lineStyle: { color: gridColor } },
      },
      zAxis3D: {
        type: "value",
        name: "Z",
        nameTextStyle: { color: textColor },
        axisLabel: { color: secondaryText },
        axisLine: { lineStyle: { color: gridColor } },
        splitLine: { lineStyle: { color: gridColor } },
      },
      grid3D: {
        boxWidth: 120,
        boxDepth: 120,
        boxHeight: 32,
        environment: bgColor,
        axisPointer: { lineStyle: { color: accentColor } },
        viewControl: {
          projection: "perspective",
          alpha: 25,
          beta: 40,
          distance: 210,
          rotateSensitivity: 1,
          zoomSensitivity: 1,
          panSensitivity: 1,
        },
        light: {
          main: { intensity: 1.1, shadow: true },
          ambient: { intensity: 0.45 },
        },
      },
      series: [
        {
          type: "surface",
          data,
          wireframe: {
            show: true,
            lineStyle: { color: gridColor, width: 1 },
          },
          shading: "lambert",
        } as any,
      ],
    };

    chart.setOption(option, true);
    chart.resize();
  }, [matrix, meshMax, meshMin, stats]);

  const handleCalibrate = async () => {
    setCalibrating(true);
    const success = await sendGcode("BED_MESH_CALIBRATE");
    window.alert(
      success
        ? lang === "ro"
          ? "Calibrarea a început."
          : "Calibration started."
        : lang === "ro"
          ? "Nu se poate porni calibrarea."
          : "Could not start calibration.",
    );
    setCalibrating(false);
  };

  return (
    <div className="page-content visualizer-page">
      <div className="visualizer-page-header">
        <div>
          <h2>{lang === "ro" ? "Heightmap" : "Heightmap"}</h2>
          <p>
            {lang === "ro"
              ? `Profil mesh: ${profileName}`
              : `Mesh profile: ${profileName}`}
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={handleCalibrate}
          disabled={
            calibrating ||
            !printerState ||
            printerState.connection_state !== "connected" ||
            printerState.print_state === "printing"
          }
        >
          {calibrating ? <RotateCw size={16} /> : <Compass size={16} />}
          <span>
            {calibrating
              ? lang === "ro"
                ? "Calibrare..."
                : "Calibrating..."
              : lang === "ro"
                ? "Calibrează Pat"
                : "Calibrate Bed"}
          </span>
        </button>
      </div>

      {stats && (
        <div className="visualizer-stat-grid">
          <div className="visualizer-stat">
            <span>{lang === "ro" ? "Maxim" : "Max"}</span>
            <strong className="stat-high">+{stats.max.toFixed(4)} mm</strong>
          </div>
          <div className="visualizer-stat">
            <span>{lang === "ro" ? "Minim" : "Min"}</span>
            <strong className="stat-low">{stats.min.toFixed(4)} mm</strong>
          </div>
          <div className="visualizer-stat">
            <span>{lang === "ro" ? "Interval" : "Range"}</span>
            <strong>{stats.range.toFixed(4)} mm</strong>
          </div>
          <div className="visualizer-stat">
            <span>RMS</span>
            <strong>{stats.rms.toFixed(4)} mm</strong>
          </div>
        </div>
      )}

      <div className="native-visualizer-shell">
        {matrix ? (
          <div ref={chartRef} className="heightmap-chart" />
        ) : (
          <div className="visualizer-empty-state">
            <h3>{lang === "ro" ? "Nu există mesh activ" : "No active mesh"}</h3>
            <p>
              {lang === "ro"
                ? "Rulează calibrarea patului sau activează un profil bed mesh în Klipper."
                : "Run bed calibration or activate a Klipper bed mesh profile."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

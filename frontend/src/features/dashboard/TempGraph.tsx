import React, { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DatasetComponent,
} from "echarts/components";
import { SVGRenderer } from "echarts/renderers";

echarts.use([
  LineChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DatasetComponent,
  SVGRenderer,
]);

export interface TempDataPoint {
  time: number;
  hotend: number;
  hotendTarget: number;
  bed: number;
  bedTarget: number;
}

export const TempGraph: React.FC<{
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

import type { Translations } from "../translations";

/** Formats a non-negative duration in seconds as `HH:MM:SS`. */
export const formatTime = (secs: number): string => {
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

/** Like `formatTime`, but prefixes a `-` for negative durations (e.g. "ahead
 * of estimate") instead of clamping to zero, and returns "N/A" for non-finite
 * input. */
export const formatSignedTime = (secs: number): string => {
  if (!Number.isFinite(secs)) return "N/A";
  const sign = secs < 0 ? "-" : "";
  return `${sign}${formatTime(Math.abs(secs))}`;
};

/** Formats a byte count into the largest whole unit (B/KB/MB/GB) that keeps
 * the value readable, or "" when there's nothing meaningful to show. */
export const formatBytes = (bytes?: number): string => {
  if (!bytes || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
};

export const getStatusText = (status: string, t: Translations): string => {
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

export const getHeaterStateStr = (
  current: number,
  target: number,
  t: Translations,
): string => {
  if (target === 0) return t.heaterOff;
  if (Math.abs(current - target) < 2) return t.heaterHolding;
  return current < target ? t.heaterHeating : t.heaterCooling;
};

/** Looks up the configured min/max travel bounds for one toolhead axis from
 * Klipper's `toolhead.axis_minimum`/`axis_maximum` triples (indexed x/y/z). */
export const getAxisBounds = (
  axis: "x" | "y" | "z",
  axisMinimum: number[],
  axisMaximum: number[],
): { min: number | undefined; max: number | undefined } => {
  const index = axis === "x" ? 0 : axis === "y" ? 1 : 2;
  return {
    min: axisMinimum[index],
    max: axisMaximum[index],
  };
};

/** Coerces a loosely-typed Moonraker field to a finite number, or `d` (0 by
 * default) when it isn't one. */
export const num = (v: unknown, d = 0): number =>
  typeof v === "number" && Number.isFinite(v) ? v : d;

/** The Klipper object-type prefix of a dynamically-discovered aux object
 * name, e.g. "fan_generic exhaust" -> "fan_generic". */
export const auxType = (name: string): string => name.split(" ")[0];

/** The display label of a dynamically-discovered aux object name (the part
 * after the type prefix), e.g. "fan_generic exhaust" -> "exhaust". Falls
 * back to the full name if there's no suffix. */
export const auxLabel = (name: string): string =>
  name.split(" ").slice(1).join(" ") || name;

const rgbToHex = (r: number, g: number, b: number): string =>
  "#" +
  [r, g, b]
    .map((c) =>
      Math.round(Math.max(0, Math.min(1, c)) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");

/** Reads the first frame of an LED/neopixel's `color_data` (RGB, 0-1 floats)
 * off a Moonraker aux object and renders it as a `#rrggbb` hex string. */
export const ledColor = (info: Record<string, unknown>): string => {
  const cd = info?.color_data as number[][] | undefined;
  const first = Array.isArray(cd) && Array.isArray(cd[0]) ? cd[0] : [0, 0, 0];
  return rgbToHex(num(first[0]), num(first[1]), num(first[2]));
};

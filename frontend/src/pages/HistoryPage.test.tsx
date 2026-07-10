import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import {
  formatDate,
  formatFilament,
  formatTime,
  statusIcon,
} from "./HistoryPage";

describe("formatTime", () => {
  it("formats hours and minutes when >= 1h", () => {
    expect(formatTime(3661)).toBe("1h 1m");
    expect(formatTime(7200)).toBe("2h 0m");
  });

  it("formats minutes and seconds when under 1h but >= 1m", () => {
    expect(formatTime(125)).toBe("2m 5s");
  });

  it("formats seconds only when under 1m", () => {
    expect(formatTime(42)).toBe("42s");
  });

  it("returns an em dash for zero, negative, null, or undefined", () => {
    expect(formatTime(0)).toBe("–");
    expect(formatTime(-5)).toBe("–");
    expect(formatTime(null)).toBe("–");
    expect(formatTime(undefined)).toBe("–");
  });
});

describe("formatDate", () => {
  it("returns an em dash for falsy input", () => {
    expect(formatDate(0)).toBe("–");
    expect(formatDate(null)).toBe("–");
    expect(formatDate(undefined)).toBe("–");
  });

  it("formats a valid unix-seconds timestamp into a non-empty, locale-formatted string", () => {
    const result = formatDate(1700000000);
    expect(result).not.toBe("–");
    // Avoid asserting the exact locale/timezone-dependent string — just
    // confirm it round-trips through the same Date the implementation uses.
    expect(result).toContain(
      String(new Date(1700000000 * 1000).getFullYear()),
    );
  });
});

describe("formatFilament", () => {
  it("returns an em dash for falsy, zero, or negative input", () => {
    expect(formatFilament(0)).toBe("–");
    expect(formatFilament(-10)).toBe("–");
    expect(formatFilament(null)).toBe("–");
    expect(formatFilament(undefined)).toBe("–");
  });

  it("formats sub-1000mm lengths as rounded millimetres", () => {
    expect(formatFilament(456.7)).toBe("457 mm");
    expect(formatFilament(1)).toBe("1 mm");
  });

  it("formats lengths at/above 1000mm as metres with 2 decimals", () => {
    expect(formatFilament(1000)).toBe("1.00 m");
    expect(formatFilament(2345)).toBe("2.35 m");
  });
});

describe("statusIcon", () => {
  it("renders a distinct icon per known status, and a default for unknown ones", () => {
    const { container: completed } = render(<>{statusIcon("completed")}</>);
    const { container: cancelled } = render(<>{statusIcon("cancelled")}</>);
    const { container: error } = render(<>{statusIcon("error")}</>);
    const { container: fallback } = render(<>{statusIcon("klippy_shutdown")}</>);
    const { container: undef } = render(<>{statusIcon(undefined)}</>);

    const svgClass = (c: HTMLElement) => c.querySelector("svg")?.getAttribute("class");

    expect(svgClass(completed)).toContain("lucide-circle-check");
    expect(svgClass(cancelled)).toContain("lucide-circle-x");
    expect(svgClass(error)).toContain("lucide-triangle-alert");
    // Unrecognized/undefined statuses share the same default (Clock) icon.
    expect(svgClass(fallback)).toContain("lucide-clock");
    expect(svgClass(undef)).toContain("lucide-clock");
  });
});

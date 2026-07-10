import { describe, expect, it } from "vitest";
import {
  formatTime,
  formatSignedTime,
  formatBytes,
  getStatusText,
  getHeaterStateStr,
  getAxisBounds,
} from "./dashboardFormat";
import { translations } from "../translations";

const t = translations.en;

describe("formatTime", () => {
  it("formats seconds as HH:MM:SS, zero-padded", () => {
    expect(formatTime(0)).toBe("00:00:00");
    expect(formatTime(65)).toBe("00:01:05");
    expect(formatTime(3661)).toBe("01:01:01");
  });

  it("returns 00:00:00 for NaN or negative input", () => {
    expect(formatTime(NaN)).toBe("00:00:00");
    expect(formatTime(-5)).toBe("00:00:00");
  });
});

describe("formatSignedTime", () => {
  it("delegates to formatTime for non-negative durations", () => {
    expect(formatSignedTime(65)).toBe("00:01:05");
  });

  it("prefixes a minus sign for negative durations", () => {
    expect(formatSignedTime(-65)).toBe("-00:01:05");
  });

  it("returns N/A for non-finite input", () => {
    expect(formatSignedTime(Infinity)).toBe("N/A");
    expect(formatSignedTime(NaN)).toBe("N/A");
  });
});

describe("formatBytes", () => {
  it("returns an empty string for undefined/zero/negative", () => {
    expect(formatBytes(undefined)).toBe("");
    expect(formatBytes(0)).toBe("");
    expect(formatBytes(-1)).toBe("");
  });

  it("formats bytes below 1024 with no decimal", () => {
    expect(formatBytes(512)).toBe("512 B");
  });

  it("keeps one decimal place while the scaled value is under 10 units", () => {
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(1024 * 1024 * 1024 * 2.5)).toBe("2.5 GB");
  });

  it("drops the decimal once the scaled value reaches 10 units", () => {
    expect(formatBytes(1024 * 15)).toBe("15 KB");
    expect(formatBytes(1024 * 1024 * 5)).toBe("5.0 MB");
  });
});

describe("getStatusText", () => {
  it("maps each known Klipper status to its translated label", () => {
    expect(getStatusText("standby", t)).toBe(t.statusStandby);
    expect(getStatusText("disconnected", t)).toBe(t.statusOffline);
    expect(getStatusText("connecting", t)).toBe(t.statusConnecting);
    expect(getStatusText("printing", t)).toBe(t.statusPrinting);
    expect(getStatusText("busy", t)).toBe(t.statusBusy);
    expect(getStatusText("paused", t)).toBe(t.statusPaused);
    expect(getStatusText("error", t)).toBe(t.statusError);
  });

  it("returns the raw status string for anything unrecognized", () => {
    expect(getStatusText("some_unknown_state", t)).toBe("some_unknown_state");
  });
});

describe("getHeaterStateStr", () => {
  it("reports off when target is zero", () => {
    expect(getHeaterStateStr(20, 0, t)).toBe(t.heaterOff);
  });

  it("reports holding when within 2 degrees of target", () => {
    expect(getHeaterStateStr(199, 200, t)).toBe(t.heaterHolding);
    expect(getHeaterStateStr(200, 200, t)).toBe(t.heaterHolding);
  });

  it("reports heating when below target by more than 2 degrees", () => {
    expect(getHeaterStateStr(150, 200, t)).toBe(t.heaterHeating);
  });

  it("reports cooling when above target by more than 2 degrees", () => {
    expect(getHeaterStateStr(250, 200, t)).toBe(t.heaterCooling);
  });
});

describe("getAxisBounds", () => {
  const min = [0, 0, 0];
  const max = [220, 220, 250];

  it("looks up the min/max pair for each axis by index", () => {
    expect(getAxisBounds("x", min, max)).toEqual({ min: 0, max: 220 });
    expect(getAxisBounds("y", min, max)).toEqual({ min: 0, max: 220 });
    expect(getAxisBounds("z", min, max)).toEqual({ min: 0, max: 250 });
  });

  it("returns undefined bounds when the arrays are empty (not yet loaded)", () => {
    expect(getAxisBounds("x", [], [])).toEqual({
      min: undefined,
      max: undefined,
    });
  });
});

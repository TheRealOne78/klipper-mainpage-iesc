import { describe, expect, it } from "vitest";
import { statusLabel } from "./historyStatus";

describe("statusLabel", () => {
  it("translates a known status via the hist<Capitalized> locale key", () => {
    const t = { histCompleted: "Finalizat", histCancelled: "Anulat" };
    expect(statusLabel(t, "completed")).toBe("Finalizat");
    expect(statusLabel(t, "cancelled")).toBe("Anulat");
  });

  it("capitalizes only the first letter when building the lookup key (underscore preserved)", () => {
    const t = { histKlippy_shutdown: "Oprire Klipper" };
    expect(statusLabel(t, "klippy_shutdown")).toBe("Oprire Klipper");
  });

  it("falls back to the raw status string when no translation key matches", () => {
    const t = { histCompleted: "Finalizat" };
    expect(statusLabel(t, "totally_unknown_status")).toBe("totally_unknown_status");
  });

  it("falls back to the raw status when the matching key exists but isn't a string", () => {
    const t = { histCompleted: 123 };
    expect(statusLabel(t, "completed")).toBe("completed");
  });

  it("defaults to \"unknown\" when no status is given, translating that if available", () => {
    const t = { histUnknown: "Necunoscut" };
    expect(statusLabel(t, undefined)).toBe("Necunoscut");
  });

  it("returns the literal \"unknown\" when neither a status nor its translation exist", () => {
    expect(statusLabel({}, undefined)).toBe("unknown");
  });
});

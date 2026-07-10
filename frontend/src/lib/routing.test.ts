import { afterEach, describe, expect, it } from "vitest";
import { getHashTarget } from "./routing";

describe("getHashTarget", () => {
  afterEach(() => {
    window.location.hash = "";
  });

  it("defaults to the rules page when there is no hash", () => {
    window.location.hash = "";
    expect(getHashTarget()).toEqual({ page: "rules" });
  });

  it("resolves a known fixed page hash", () => {
    window.location.hash = "#dashboard";
    expect(getHashTarget()).toEqual({ page: "dashboard" });
  });

  it("resolves a hash that also carries a scroll target", () => {
    window.location.hash = "#proceduri-standard";
    expect(getHashTarget()).toEqual({
      page: "troubleshooting",
      target: "proceduri-standard",
    });
  });

  it("returns null for an unrecognized hash instead of falling back", () => {
    window.location.hash = "#some-dynamically-generated-heading-anchor";
    expect(getHashTarget()).toBeNull();
  });
});

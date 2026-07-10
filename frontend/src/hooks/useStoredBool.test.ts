import { afterEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useStoredBool } from "./useStoredBool";

afterEach(() => {
  localStorage.clear();
});

describe("useStoredBool", () => {
  it("falls back to defaultValue when nothing is stored", () => {
    const { result: falseDefault } = renderHook(() =>
      useStoredBool("missing-key-a", false),
    );
    expect(falseDefault.current[0]).toBe(false);

    const { result: trueDefault } = renderHook(() =>
      useStoredBool("missing-key-b", true),
    );
    expect(trueDefault.current[0]).toBe(true);
  });

  it("reads a stored 'true'/'false' value for a false-default key", () => {
    localStorage.setItem("collapsed-key", "true");
    const { result } = renderHook(() => useStoredBool("collapsed-key", false));
    expect(result.current[0]).toBe(true);
  });

  it("reads a stored 'true'/'false' value for a true-default key", () => {
    localStorage.setItem("show-key", "false");
    const { result } = renderHook(() => useStoredBool("show-key", true));
    expect(result.current[0]).toBe(false);
  });

  it("treats any non-'false' stored value as true when the default is true", () => {
    localStorage.setItem("show-key-2", "garbage");
    const { result } = renderHook(() => useStoredBool("show-key-2", true));
    expect(result.current[0]).toBe(true);
  });

  it("treats any non-'true' stored value as false when the default is false", () => {
    localStorage.setItem("collapsed-key-2", "garbage");
    const { result } = renderHook(() => useStoredBool("collapsed-key-2", false));
    expect(result.current[0]).toBe(false);
  });

  it("returns a working React state setter that does not itself persist", () => {
    const { result } = renderHook(() => useStoredBool("toggle-key", false));
    act(() => {
      result.current[1](true);
    });
    expect(result.current[0]).toBe(true);
    expect(localStorage.getItem("toggle-key")).toBeNull();
  });
});

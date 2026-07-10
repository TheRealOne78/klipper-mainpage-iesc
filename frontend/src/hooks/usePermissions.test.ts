import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { usePermissions } from "./usePermissions";
import type { Permissions, PortalConfig } from "../usePrinterState";

const allDenied: Permissions = {
  view_status: false,
  view_temps: false,
  view_temp_target: false,
  control_temps: false,
  view_webcam: false,
  view_toolhead: false,
  control_toolhead: false,
  view_macros: false,
  run_macros: false,
  view_console: false,
  send_console: false,
  view_speed: false,
  view_files: false,
  manage_files: false,
  view_power: false,
  control_power: false,
  control_machine: false,
  upload_gcode: false,
  control_print: false,
  view_gcode_viewer: false,
  view_heightmap: false,
  open_mainsail: false,
  open_fluidd: false,
  open_octoprint: false,
  allow_movement_while_printing: false,
  allow_home_for_guests: false,
  power_devices: {},
  allowed_macros: [],
};

const config = (permissions: Permissions): PortalConfig =>
  ({ permissions }) as PortalConfig;

describe("usePermissions", () => {
  it("grants everything for an admin regardless of config", () => {
    const { result } = renderHook(() => usePermissions(config(allDenied), "admin"));
    expect(result.current.isAdmin).toBe(true);
    expect(result.current.canControlMachine).toBe(true);
    expect(result.current.canControlPower).toBe(true);
    expect(result.current.canManageFiles).toBe(true);
    expect(result.current.canViewStatus).toBe(true);
  });

  it("denies everything for a non-admin when the group config denies it", () => {
    const { result } = renderHook(() => usePermissions(config(allDenied), "guest"));
    expect(result.current.isAdmin).toBe(false);
    expect(result.current.canViewStatus).toBe(false);
    expect(result.current.canControlMachine).toBe(false);
    expect(result.current.canControlPower).toBe(false);
    expect(result.current.canManageFiles).toBe(false);
  });

  it("grants exactly what the group config grants for a non-admin", () => {
    const { result } = renderHook(() =>
      usePermissions(config({ ...allDenied, view_power: true }), "guest"),
    );
    expect(result.current.canViewPower).toBe(true);
    expect(result.current.canControlPower).toBe(false);
  });

  it("derives canViewTempTarget from control_temps even without the explicit view permission", () => {
    const { result } = renderHook(() =>
      usePermissions(config({ ...allDenied, control_temps: true }), "guest"),
    );
    expect(result.current.canViewTempTarget).toBe(true);
  });

  it("uses restrictive defaults for control/manage permissions while config is still loading", () => {
    const { result } = renderHook(() => usePermissions(null, "guest"));
    expect(result.current.canControlMachine).toBe(false);
    expect(result.current.canControlPower).toBe(false);
    expect(result.current.canManageFiles).toBe(false);
  });

  it("uses permissive defaults for view/open permissions while config is still loading", () => {
    const { result } = renderHook(() => usePermissions(null, "guest"));
    expect(result.current.canViewStatus).toBe(true);
    expect(result.current.canViewPower).toBe(true);
    expect(result.current.canOpenMainsail).toBe(true);
    expect(result.current.canUpload).toBe(true);
    expect(result.current.canControlPrint).toBe(true);
  });

  it("treats a null role the same as any other non-admin role", () => {
    const { result } = renderHook(() => usePermissions(config(allDenied), null));
    expect(result.current.isAdmin).toBe(false);
    expect(result.current.canViewStatus).toBe(false);
  });
});

import type { Permissions, PortalConfig } from "../usePrinterState";

type PermissionKey = keyof {
  [K in keyof Permissions as Permissions[K] extends boolean ? K : never]: unknown;
};

/** Default to grant while `portalConfig` hasn't loaded yet, for anything
 * merely informational (view_*, open_*) or already print-oriented
 * (control_print, upload_gcode) — so the UI doesn't flash empty/disabled
 * before the first config fetch resolves. Anything that lets a guest
 * actually operate hardware or the filesystem (control_machine,
 * control_power, manage_files) defaults to deny instead, since briefly
 * showing (and possibly enabling) those controls is the wrong failure mode. */
const DEFAULT_WHILE_LOADING: Record<PermissionKey, boolean> = {
  view_status: true,
  view_temps: true,
  view_temp_target: true,
  control_temps: true,
  view_webcam: true,
  view_toolhead: true,
  control_toolhead: true,
  view_macros: true,
  run_macros: true,
  view_console: true,
  send_console: true,
  view_speed: true,
  view_files: true,
  manage_files: false,
  view_power: true,
  control_power: false,
  control_machine: false,
  upload_gcode: true,
  control_print: true,
  view_gcode_viewer: true,
  view_heightmap: true,
  open_mainsail: true,
  open_fluidd: true,
  open_octoprint: true,
  allow_movement_while_printing: true,
  allow_home_for_guests: true,
};

export interface PermissionFlags {
  isAdmin: boolean;
  canViewStatus: boolean;
  canViewTemps: boolean;
  canControlTemps: boolean;
  /** Controlling the target implies seeing it — true whenever either the
   * dedicated view permission or control_temps is granted. */
  canViewTempTarget: boolean;
  canViewWebcam: boolean;
  canViewToolhead: boolean;
  canControlToolhead: boolean;
  canViewMacros: boolean;
  canRunMacros: boolean;
  canViewConsole: boolean;
  canSendConsole: boolean;
  canViewSpeed: boolean;
  canViewFiles: boolean;
  canManageFiles: boolean;
  canViewPower: boolean;
  canControlPower: boolean;
  canControlMachine: boolean;
  canUpload: boolean;
  canControlPrint: boolean;
  canViewGcode: boolean;
  canViewHeightmap: boolean;
  canOpenMainsail: boolean;
  canOpenFluidd: boolean;
  canOpenOctoPrint: boolean;
}

/** Resolves every per-group capability flag from `portalConfig.permissions`,
 * with admins always bypassing the config, and a single well-known default
 * per key while `portalConfig` is still loading (see DEFAULT_WHILE_LOADING).
 * Replaces the two near-identical, subtly-diverging boolean derivations that
 * used to live separately in App.tsx and Dashboard.tsx. */
export function usePermissions(
  portalConfig: PortalConfig | null,
  role: string | null,
): PermissionFlags {
  const isAdmin = role === "admin";
  const perms = portalConfig?.permissions;
  const can = (key: PermissionKey): boolean =>
    isAdmin || (perms ? Boolean(perms[key]) : DEFAULT_WHILE_LOADING[key]);

  const canControlTemps = can("control_temps");

  return {
    isAdmin,
    canViewStatus: can("view_status"),
    canViewTemps: can("view_temps"),
    canControlTemps,
    canViewTempTarget: canControlTemps || can("view_temp_target"),
    canViewWebcam: can("view_webcam"),
    canViewToolhead: can("view_toolhead"),
    canControlToolhead: can("control_toolhead"),
    canViewMacros: can("view_macros"),
    canRunMacros: can("run_macros"),
    canViewConsole: can("view_console"),
    canSendConsole: can("send_console"),
    canViewSpeed: can("view_speed"),
    canViewFiles: can("view_files"),
    canManageFiles: can("manage_files"),
    canViewPower: can("view_power"),
    canControlPower: can("control_power"),
    canControlMachine: can("control_machine"),
    canUpload: can("upload_gcode"),
    canControlPrint: can("control_print"),
    canViewGcode: can("view_gcode_viewer"),
    canViewHeightmap: can("view_heightmap"),
    canOpenMainsail: can("open_mainsail"),
    canOpenFluidd: can("open_fluidd"),
    canOpenOctoPrint: can("open_octoprint"),
  };
}

import type { Translations } from "../../translations";

export const BRANDING_LANGS = ["default", "en", "ro", "pl"] as const;
export type BrandingLang = (typeof BRANDING_LANGS)[number];

/** "snake_case" -> "Snake Case", for config field names with no dedicated
 * translated label. */
export const toTitle = (key: string): string =>
  key.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

/** Parses a JSON-editor textarea's raw text into a plain object, rejecting
 * anything that isn't a JSON object (arrays, primitives, null). Both thrown
 * messages are stable strings registered in `lib/errorTranslations.ts` —
 * `JSON.parse`'s own SyntaxError text is engine-specific and always English,
 * so it's never shown directly. */
export const parseJson = (value: string): Record<string, unknown> => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Invalid JSON syntax");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Expected a JSON object");
  }
  return parsed as Record<string, unknown>;
};

/** Per-group permission checkboxes, grouped by feature/card for the groups
 * section's UI. */
export const permissionCategories = (
  t: Translations,
): { label: string; keys: string[] }[] => [
  { label: t.admPermCatStatus, keys: ["view_status", "view_speed"] },
  {
    label: t.admPermCatTemps,
    keys: ["view_temps", "view_temp_target", "control_temps"],
  },
  { label: t.admPermCatWebcam, keys: ["view_webcam"] },
  { label: t.admPermCatToolhead, keys: ["view_toolhead", "control_toolhead"] },
  { label: t.admPermCatMacros, keys: ["view_macros", "run_macros"] },
  { label: t.admPermCatConsole, keys: ["view_console", "send_console"] },
  {
    label: t.admPermCatFiles,
    keys: ["view_files", "manage_files", "upload_gcode"],
  },
  { label: t.admPermCatPower, keys: ["view_power", "control_power"] },
  { label: t.admPermCatMachine, keys: ["control_machine"] },
  { label: t.admPermCatPrint, keys: ["control_print"] },
  {
    label: t.admPermCatViewers,
    keys: ["view_gcode_viewer", "view_heightmap"],
  },
  {
    label: t.admPermCatExternalTools,
    keys: ["open_mainsail", "open_fluidd", "open_octoprint"],
  },
];

// Localized labels for permission keys, built from the central translations.
export const permissionLabels = (t: Translations): Record<string, string> => ({
  view_status: t.admPermViewStatus,
  view_temps: t.admPermViewTemps,
  view_temp_target: t.admPermViewTempTarget,
  control_temps: t.admPermControlTemps,
  view_webcam: t.admPermViewWebcam,
  view_toolhead: t.admPermViewToolhead,
  control_toolhead: t.admPermControlToolhead,
  view_macros: t.admPermViewMacros,
  run_macros: t.admPermRunMacros,
  view_console: t.admPermViewConsole,
  send_console: t.admPermSendConsole,
  view_speed: t.admPermViewSpeed,
  view_files: t.admPermViewFiles,
  manage_files: t.admPermManageFiles,
  view_power: t.admPermViewPower,
  control_power: t.admPermControlPower,
  control_machine: t.admPermControlMachine,
  upload_gcode: t.admPermUploadGcode,
  control_print: t.admPermControlPrint,
  view_gcode_viewer: t.admPermViewGcodeViewer,
  view_heightmap: t.admPermViewHeightmap,
  open_mainsail: t.admPermOpenMainsail,
  open_fluidd: t.admPermOpenFluidd,
  open_octoprint: t.admPermOpenOctoprint,
});

// Numeric limit fields, now per-group; `null`/absent means "unlimited".
export const groupLimitNumberKeys = [
  "max_speed_factor",
  "max_upload_mb",
  "max_jog_step",
] as const;
// Boolean limit fields, also per-group.
export const groupLimitBoolKeys = [
  "allow_movement_while_printing",
  "allow_home_for_guests",
] as const;

// Localized labels for limit keys, built from the central translations.
export const limitLabels = (t: Translations): Record<string, string> => ({
  max_speed_factor: t.admLimitMaxSpeedFactor,
  max_upload_mb: t.admLimitMaxUploadMb,
  allow_movement_while_printing: t.admLimitAllowMovementWhilePrinting,
  allow_home_for_guests: t.admLimitAllowHomeForGuests,
  max_jog_step: t.admLimitMaxJogStep,
});

export interface PrinterState {
  connection_state: string;
  state_message?: string;
  klipper_state: string;
  print_state: string;
  filename?: string;
  current_layer?: number | null;
  total_layer?: number | null;
  progress: number;
  elapsed_time: number;
  time_left?: number;
  hotend_temp: number;
  hotend_target: number;
  bed_temp: number;
  bed_target: number;
  speed_factor: number;
  fan?: {
    speed: number;
    rpm?: number | null;
  } | null;
  /** Dynamically-discovered aux objects, keyed by full Klipper object name. */
  auxiliary?: Record<string, Record<string, unknown>> | null;
  homed_axes: string;
  bed_mesh?: {
    profile_name?: string | null;
    mesh_min?: number[] | null;
    mesh_max?: number[] | null;
    probed_matrix?: number[][] | null;
    mesh_matrix?: number[][] | null;
    profiles?: unknown;
  } | null;
  configfile?: {
    settings?: {
      bed_mesh?: Record<string, unknown>;
      printer?: {
        kinematics?: string;
        [key: string]: unknown;
      };
      extruder?: {
        nozzle_diameter?: number | string;
        [key: string]: unknown;
      };
      [key: string]: unknown;
    } | null;
  } | null;
  toolhead?: {
    axis_minimum?: number[] | null;
    axis_maximum?: number[] | null;
    position?: number[] | null;
    homed_axes?: string | null;
    speed_factor?: number | null;
    max_velocity?: number | null;
    max_accel?: number | null;
    square_corner_velocity?: number | null;
    minimum_cruise_ratio?: number | null;
  } | null;
  virtual_sdcard?: {
    file_position?: number | null;
  } | null;
  motion_report?: {
    live_position?: number[] | null;
  } | null;
  gcode_move?: {
    homing_origin?: number[] | null;
    gcode_position?: number[] | null;
    speed_factor?: number | null;
    absolute_coordinates?: boolean | null;
    absolute_extrude?: boolean | null;
    extrude_factor?: number | null;
  } | null;
  exclude_object?: {
    objects?: unknown;
    excluded_objects?: string[] | null;
  } | null;
  webhooks?: {
    state?: string | null;
    state_message?: string | null;
  } | null;
  idle_timeout?: {
    state?: string | null;
    printing_time?: number | null;
  } | null;
  console_events?: Array<{
    time: number;
    message: string;
    event_type: "command" | "response" | "action" | "debug" | "error" | string;
  }>;
}

export interface WebcamConfig {
  name: string;
  service: string;
  stream_url: string;
  snapshot_url: string;
  enabled: boolean;
  flip_horizontal: boolean;
  flip_vertical: boolean;
  rotation: number;
  icon: string;
  source: string;
}

/** Per-group label + visibility/control for a Moonraker power device, keyed
 * by device name. The label is per-group, not shared. */
export interface DeviceAccess {
  label: string;
  visible: boolean;
  controllable: boolean;
}

export interface Permissions {
  view_status: boolean;
  view_temps: boolean;
  /** Read-only view of the target/setpoint column. Irrelevant once
   * control_temps is true (controlling implies seeing the target). */
  view_temp_target: boolean;
  control_temps: boolean;
  view_webcam: boolean;
  view_toolhead: boolean;
  control_toolhead: boolean;
  view_macros: boolean;
  run_macros: boolean;
  view_console: boolean;
  send_console: boolean;
  view_speed: boolean;
  view_files: boolean;
  manage_files: boolean;
  view_power: boolean;
  control_power: boolean;
  control_machine: boolean;
  upload_gcode: boolean;
  control_print: boolean;
  view_gcode_viewer: boolean;
  view_heightmap: boolean;
  /** Show the "Open Mainsail" / "Open Fluidd" / "Open OctoPrint" account-menu
   * links (each also requires its URL to be configured). */
  open_mainsail: boolean;
  open_fluidd: boolean;
  open_octoprint: boolean;
  /** `null`/absent = unlimited for this group. */
  max_speed_factor?: number | null;
  max_jog_step?: number | null;
  max_upload_mb?: number | null;
  allow_movement_while_printing: boolean;
  allow_home_for_guests: boolean;
  power_devices: Record<string, DeviceAccess>;
  /** Macro names (first word, case-insensitive) this group may run. Ignored
   * for admins. FIRMWARE_RESTART/RESTART are always allowed. */
  allowed_macros: string[];
}

/** Picks a per-language value out of a `{lang: value, default: value}` map
 * (as used by `PortalConfig.app_name`, `.logo_light`, etc.), falling back to
 * the "default" entry and then to `fallback`. */
export const pickLocalized = (
  map: Record<string, string> | undefined,
  lang: string,
  fallback = "",
): string => map?.[lang] ?? map?.["default"] ?? fallback;

export type AuthRole = string;

export interface AuthUser {
  role: AuthRole | null;
  email?: string | null;
  display_name?: string | null;
  auth_source?: string | null;
}

/** Anubis-style proof-of-work anti-spam challenge issued by
 * GET /api/auth/pow-challenge, solved client-side and echoed back on signup. */
export interface PowChallenge {
  token: string;
  seed: string;
  difficulty_bits: number;
}

export interface PortalConfig {
  /** Keyed by language code, plus a "default" fallback. */
  app_name: Record<string, string>;
  organization_name: Record<string, string>;
  logo_light: Record<string, string>;
  logo_dark: Record<string, string>;
  favicon: Record<string, string>;
  danger_image: Record<string, string>;
  moron_warning_text: Record<string, string>;
  theme: {
    font_family: string;
    font_url?: string | null;
  };
  limits: {
    max_speed_factor: number | null;
    max_upload_mb: number | null;
    allow_movement_while_printing: boolean;
    allow_home_for_guests: boolean;
    max_jog_step: number | null;
  };
  preheat_presets: Record<string, { hotend: number; bed: number }>;
  allowed_macros: string[];
  guest_auth_required: boolean;
  mainsail_url?: string | null;
  fluidd_url?: string | null;
  octoprint_url?: string | null;
  moonraker_url?: string | null;
  auth?: {
    signup_enabled?: boolean;
    signup_allowed_domains?: string[];
    signup_requires_pow?: boolean;
    [key: string]: unknown;
  } | null;
  webcams: WebcamConfig[];
  permissions: Permissions;
  footer_links: FooterLink[];
  [key: string]: unknown;
}

export type ConfigSection = Record<string, unknown>;

export interface GroupConfig {
  id: string;
  display_name: string;
  /** Emails that land a newly-signed-up local account in this group instead
   * of `signup.default_group` — lets an admin route specific people into a
   * custom group without touching anything but this list. */
  emails: string[];
  permissions: Permissions;
  /** True for the built-in "anonymous"/"guest"/"admin" groups. */
  built_in: boolean;
}

export interface AdminConfig {
  server: ConfigSection;
  auth: ConfigSection;
  moonraker: ConfigSection;
  mainsail: ConfigSection;
  /** Hardware safety ceilings only (hotend/bed max temp) — access-control
   * limits now live per-group in `groups[].permissions`. */
  safety: ConfigSection;
  branding: ConfigSection;
  theme: ConfigSection;
  preheat: ConfigSection;
  webcams: WebcamConfig[];
  /** Always contains the built-in "anonymous"/"guest"/"admin" groups. */
  groups: GroupConfig[];
  footer_links: FooterLink[];
  /** Local email/password self-signup settings. */
  signup: ConfigSection;
  /** Outbound SMTP server used for signup verification emails. */
  smtp: ConfigSection;
  /** Resend (resend.com) API credentials — an alternative to `smtp`, tried
   * first when configured (see `backend::mail::select_provider`). */
  resend: ConfigSection;
  /** Optional IP allow-list gating signup/local-account login. */
  geo_restriction: ConfigSection;
  [key: string]: unknown;
}

/** A local signup account, as listed in the admin Users section. Password
 * hash and verification token are never sent to the browser. */
export interface AdminUserEntry {
  email: string;
  group_id: string;
  verified: boolean;
  created_at: string;
}

/** A single footer icon+link. `icon_url` empty = use a generic fallback icon
 * (this replaces the old font-glyph icons that silently failed to render). */
export interface FooterLink {
  id: string;
  label: string;
  url: string;
  icon_url: string;
  order: number;
}

export interface PowerDevice {
  device: string;
  status: string; // "on" | "off" | "error" | "init"
  locked_while_printing?: boolean;
  type?: string;
}

export interface PrintHistoryJob {
  job_id?: string;
  filename?: string;
  status?: string; // "completed" | "cancelled" | "error" | "in_progress" | ...
  start_time?: number;
  end_time?: number;
  print_duration?: number;
  total_duration?: number;
  filament_used?: number;
  metadata?: GcodeFileMetadata | null;
}

export interface PrintHistoryTotals {
  total_jobs?: number;
  total_time?: number;
  total_print_time?: number;
  total_filament_used?: number;
  longest_job?: number;
  longest_print?: number;
}

export interface PrintHistory {
  jobs: PrintHistoryJob[];
  totals: PrintHistoryTotals | null;
}

export interface GcodeFile {
  path: string;
  modified?: number;
  size?: number;
}

export interface DirectoryDir {
  dirname: string;
  modified?: number;
  size?: number;
  permissions?: string;
}

export interface DirectoryFile {
  filename: string;
  modified?: number;
  size?: number;
  permissions?: string;
}

export interface DirectoryListing {
  dirs: DirectoryDir[];
  files: DirectoryFile[];
  disk_usage?: { total?: number; used?: number; free?: number } | null;
  root_info?: unknown;
}

export interface FileMovePayload {
  source_root?: string;
  source: string;
  dest_root?: string;
  dest: string;
}

export interface GcodeThumbnail {
  width?: number | null;
  height?: number | null;
  size?: number | null;
  relative_path?: string | null;
}

export interface GcodeFileMetadata {
  filename: string;
  thumbnails?: GcodeThumbnail[] | null;
  estimated_time?: number | null;
  filament_total?: number | null;
  filament_weight_total?: number | null;
  layer_count?: number | null;
  object_height?: number | null;
  size?: number | null;
  modified?: number | null;
  slicer?: string | null;
  slicer_version?: string | null;
  uuid?: string | null;
  first_layer_bed_temp?: number | null;
  first_layer_extr_temp?: number | null;
  first_layer_height?: number | null;
  gcode_start_byte?: number | null;
  gcode_end_byte?: number | null;
  job_id?: string | null;
}

export interface AnnouncementEntry {
  entry_id?: string;
  title?: string;
  description?: string;
  priority?: string;
  date?: number;
  url?: string;
}

/**
 * Combined system-load payload from GET /machine/system: Moonraker's
 * `machine.system_info` (host details), `machine.proc_stats` (CPU / memory /
 * temperature / network) and the printer `mcu` objects (per-MCU stats).
 * Shapes are kept loose (`any`) because Moonraker fields vary by host / MCU.
 */
export interface MachineSystem {
  system_info: Record<string, any> | null;
  proc_stats: Record<string, any> | null;
  mcus: Record<string, any>;
}

export interface UpdateComponent {
  name: string;
  version?: string;
  remote_version?: string;
  package_count?: number;
  configured_type?: string;
  is_valid?: boolean;
  is_dirty?: boolean;
  detached?: boolean;
  corrupt?: boolean;
  warnings?: string[];
  anomalies?: string[];
  commits_behind?: unknown[];
  package_list?: string[];
  full_version_string?: string;
  info_tags?: string[];
  recovery_url?: string;
  [key: string]: unknown;
}

export interface JobQueueEntry {
  filename: string;
  job_id: string;
  time_added?: number;
  time_in_queue?: number;
}

export interface JobQueueStatus {
  queued_jobs: JobQueueEntry[];
  queue_state: string; // "ready" | "loading" | "starting" | "paused"
}

export interface ServerInfo {
  components?: string[];
  registered_directories?: string[];
  warnings?: string[];
  moonraker_version?: string;
  [key: string]: unknown;
}

export interface PortalWsEnvelope {
  type:
    | "printer_state"
    | "filelist_changed"
    | "update_response"
    | "update_refreshed"
    | "config_changed";
  data: unknown;
}

/** Mirrors `backend::audit::AuditEntry` exactly (field-for-field, same
 * names) — `details_json` is a JSON-encoded string, not a parsed object;
 * parse it before reading fields out of it. */
export interface AdminAuditEntry {
  id: number;
  created_at: string;
  action: string;
  actor_role: string | null;
  /** The actual person, when known — a local account's email. `null` for
   * the shared admin/guest tiers (no individual identity exists for those)
   * and for pre-authentication failures. */
  actor_identity: string | null;
  success: boolean;
  details_json: string;
}

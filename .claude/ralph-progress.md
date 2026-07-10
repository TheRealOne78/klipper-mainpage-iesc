# Mainsail-LAYOUT reorganization (2026-07-07) — new plan phase

Codex/antigravity already did most of the layout reorg (builds green). Verified current state:
- Power = navbar (far right, after theme toggle), dynamic devices (visiblePowerDevices/
  powerDeviceLabel, NOT hardcoded), incl. Klipper actions + Services + Devices. DONE.
- Status card: N/A print fields gated by hasCurrentJob (hidden when idle). DONE.
  Recent-history strip + queue embedded in status card (status-history-panel). DONE.
- Account menu bottom of sidebar (ChatGPT-style) w/ settings/audit/login/Open Mainsail/
  Fluidd/OctoPrint. DONE. External URL config (fluidd_url/octoprint_url) exists.
- Pages: GcodeFilesPage, HistoryPage, MachinePage. AdminSettings has power + branding sections.

## This iteration (3 parallel sonnet agents + me), all tsc+build green:
- [x] HistoryPage: object THUMBNAILS per job (job.metadata already has thumbnails;
      buildMoonrakerThumbnailUrl) + hover-enlarge popover. (agent)
- [x] MachinePage update manager: up-to-date vs update-available states, force Refresh,
      Update-all, warning confirm, corrupt/dirty/detached badges + warnings. (agent)
- [x] AdminSettings branding: "Printer name" field + logo-light/dark/favicon/danger
      upload buttons (uploadAdminAsset) + explicit labels. (agent)
- [x] Console: re-added Clear button (clear marker) + Settings dropdown (hide temp
      replies filter). Command-list autocomplete already existed. (me, Dashboard.tsx)

## Iteration 2 (CodeMirror agent + backend fixes):
- [x] CodeMirror config editor DONE (agent): frontend/src/features/editor/ConfigEditor.tsx
      (CodeMirror 6, properties/INI highlight, Ctrl+S save, Ctrl+Shift+S save+restart,
      oneDark theme, search). MachinePage uses it: dirty marker, Save + Save&Restart
      (FIRMWARE_RESTART for .cfg). deps @codemirror/* added. tsc+build green.
- [x] FIXED branding upload bug: frontend called /admin/assets/{kind} but backend serves
      /admin/branding/{kind} -> fixed frontend URL. Backend now returns full redacted
      config (was {url}) so AdminSettings draft refreshes correctly. VERIFIED live:
      upload logo-light PNG -> full config w/ branding.logo_light=/api/branding/logo-light,
      hash redacted, anon->401.
- Backend already has: /server/info route, full version_info passthrough, [power] config
  with main_device + device_overrides (per-device power config structure exists).

## Iteration 3 (per-device power override ENFORCEMENT):
- [x] Backend now ENFORCES [power].device_overrides (was stored but ignored — security gap):
      get_power_devices filters out visible_to_guests=false devices for non-admins;
      set_power_device returns 403 if controllable_by_guests=false for non-admins.
      Both use unwrap_or(true) for no-override (matches frontend "allowed unless
      explicitly false"). Admin bypasses. VERIFIED live: Lights hidden override ->
      guest sees ['printer'] only, admin sees both, guest control Lights -> 403.
      (Frontend App.tsx already had canTogglePowerDevice/visiblePowerDevices override logic.)

## Iteration 4 (re-audit hide-not-disable + exceptions after reorg):
- [x] Sidebar nav links gated isAdmin||perm: Files/History (view_files), G-code Viewer
      (view_gcode_viewer), Machine (control_machine), Heightmap (view_heightmap). Admin sees all.
- [x] FIXED GcodeFilesPage regression: Print/Queue buttons were DISABLED without control_print,
      Delete DISABLED without manage_files -> now HIDDEN (conditional render). Download stays.
- [x] Verified still-correct: console input hidden if !send_console (Dashboard 2144);
      jog disabled unless homed (!canMove || !isHomed, line 1954); extrude needs min_extrude_temp;
      MachinePage fully page-gated by control_machine (sidebar link + route), so its inner
      !canControlMachine disables are page-level-hidden already (acceptable).
- Admin bypass (isAdmin || perm) confirmed throughout. tsc+build green.

## STILL TODO (Mainsail parity, next iterations):
- File browser: directory-based (breadcrumbs, folders, rename/move/upload) not just flat list.
- Backend: branding asset upload routes exist? verify /api/admin/assets/*. Full version_info
  passthrough for update manager. server/info components. favicon config field.
- Per-device power overrides (label/icon/visible_to_guests) admin UI + backend config.
- Verify live in browser (chromium-1223 IS installed at ~/.cache/ms-playwright — playwright
  MCP tried 'chrome' not chromium; could retry).

---
# Ralph task — Mainsail/Fluidd clone WITH permissions + admin (earlier phase)

Completion promise: **DONE** (only when genuinely at feature parity).

## The plan (user's words)
- Admin login: admin can access EVERYTHING; can configure permissions & everything.
- A Mainsail-style **Settings menu** to edit permissions, cameras, and basically
  everything in the config file. **Persistence = overwrite config.toml directly**
  (user accepted losing the hand-written comments).
- This project is now officially a **mainsail/fluidd clone, but with permissions**.
  Every functional Mainsail feature must be present: sending commands, power, etc.

## Architecture facts (verified)
- Backend: axum. `AppState.config: Config` (OWNED, 59 read sites). Live-reload of
  config at runtime needs interior mutability (Arc<RwLock<Config>> / ArcSwap) —
  NOT yet done; see Phase 2.
- Auth: `SessionManager` now has admin + guest sessions. `create_session` checks
  `admin_password_hash` first (bcrypt) → Admin; else guest. `check_authorized_action`
  returns the real role. `require_permission(&role, allowed)` → Admins bypass all
  `[permissions]` gates server-side. emergency_stop stays UNGATED.
- Frontend already routes on `role: "admin"|"guest"` with `isAdmin` bypass in the
  UI. Login modal opens via `setAuthModalOpen(true)` even when guest auth is off.
- **GOTCHA (fixed):** the shipped `admin_password_hash` did NOT match "admin123".
  Regenerated a valid bcrypt hash for admin123 in config.toml AND config.rs default.
- Moonraker re-subscribe on notify_klippy_ready is handled in moonraker.rs.

## Phase 1 — Admin auth foundation ✅ DONE (verified live)
- [x] UserRole::Admin; admin sessions; create_session admin check; validate/destroy.
- [x] check_authorized_action returns real role; require_permission(&role,..) admin bypass.
- [x] All 12 permission-gate sites pass &role (5 pattern-A converted, 7 pattern-B renamed).
- [x] login handler maps Admin→"admin".
- [x] Fixed bad admin bcrypt hash (config.toml + config.rs).
- [x] Frontend: LogIn/LogOut header button (opens auth modal / logout). translations.
- [x] Verified: admin123 login → role admin; admin bypasses control_temps=false (200);
      anon guest → 403. cargo build + npm run build green.

## Phase 2 — Config read/write API + live-reload (NEXT)
- [ ] AppState.config → Arc<ArcSwap<Config>> (or RwLock). Update 59 read sites.
- [ ] GET /api/admin/config (admin-only) → full Config as JSON.
- [ ] PUT /api/admin/config (admin-only) → validate, write config.toml via toml::to_string,
      swap in-memory config live. Re-init Moonraker client if url/api_key changed.
- [ ] Endpoint to change admin/guest password (hashes bcrypt, writes config).

## Phase 2.5 — Password management refinement ✅ DONE (curl-verified)
Codex shipped Phase 2 (ArcSwap live config, GET/PUT /api/admin/config, atomic
write, validation, audit) + Phase 3 skeleton + power/console/machine/file/keycloak/
audit routes. Refined the password handling that was missing/insecure:
- [x] GET /api/admin/config now REDACTS admin_password_hash ("") and guest hash
      (present -> "__set__" marker, else null). No bcrypt hash reaches the browser.
- [x] PUT /api/admin/config PRESERVES both password hashes from disk (passwords are
      never settable via the config editor -> a config save can't wipe them).
- [x] NEW: POST /api/admin/password { scope: admin|guest, current_password, new_password }.
      Re-verifies current admin pw (bcrypt) for every change; hashes plaintext
      server-side (DEFAULT_COST); scope=guest + empty new_password disables guest pw.
      Persists via atomic write + live ArcSwap store. Audited.
- [x] Frontend: usePrinterState.changeAdminPassword; threaded App -> AdminSettings.
      New password card in the auth section (current admin pw, new admin pw, new
      guest pw w/ "set"/"disable" affordance) + inline error/ok. Fixed a TDZ bug
      (submitPassword must be declared after loadConfig).
- [x] Verified live: redaction, wrong-current->403, short->400, change->200, login
      with new pw works, old pw->401, PUT preserves pw. cargo build + tsc --noEmit green.

## Phase 2.6 — Keycloak JWT auth-bypass fix ✅ DONE (curl-verified)
Security review flagged HIGH: keycloak_exchange minted admin sessions from an
UNVERIFIED (base64-only) JWT when `allow_unverified_jwt=true`. Fixed:
- [x] Removed `allow_unverified_jwt` entirely (config struct, Default, config.toml,
      get_default_config_content). Removed decode_unverified_jwt_claims.
- [x] New verify_keycloak_jwt(): fetches JWKS (reqwest), matches by kid, verifies
      RSA signature (jsonwebtoken crate), enforces iss/aud(client_id)/exp + rejects
      email_verified=false. Requires jwks_url+issuer_url+client_id or returns 501.
- [x] Verified: disabled->400; enabled w/o jwks->501; enabled+forged token->401 with
      NO session cookie set. cargo build green. Added jsonwebtoken="9" dep.

## Phase 3 — Settings UI (Mainsail-style) 
- [ ] New admin-only "Settings" page/route + sidebar entry (gated on isAdmin).
- [ ] Sections: Permissions (all 15 toggles), Cameras (CRUD; service/url/flip/rot),
      Limits, Preheat presets, Macros (guest_allowed), Branding/Theme, Moonraker url,
      Mainsail url, Auth (passwords). Save → PUT /api/admin/config.

## Phase 4 — Mainsail feature parity (each gated by a new permission)
- [x] Power devices: DASHBOARD CARD added (new "power" card id + default layout slot).
      usePrinterState.getPowerDevices (parses Moonraker {result:{devices}}) +
      setPowerDevice -> App -> Dashboard. Polls every 5s while visible; optimistic
      toggle switch; view_power/control_power gated; PowerDevice type; i18n ro/en; scss
      toggle. Verified: GET->502 (moonraker down, perm passed), empty/bad action->400,
      tsc+build green. (Live device list untested — printer offline.)
- [x] Full console: command INPUT added to console card (send_console perm gated;
      Enter to send, Up/Down history recall). Backend /console/send already existed.
      usePrinterState.sendConsole -> App onSendConsole -> Dashboard. i18n ro/en +
      scss. Verified: anon(perm off)->403, admin bypass->reaches printer, empty->400.
      Autocomplete NOT yet added (nice-to-have).
- [x] File manager: NEW "files" dashboard card. usePrinterState getGcodeFiles (parses
      Moonraker .result), deleteGcodeFile (per-segment encoded *path), jobQueueAdd.
      Card: search filter, sorted by modified desc, per-file Print (control_print),
      Add-to-queue (control_print), Download (moonraker link), Delete (manage_files,
      confirm). i18n+scss. Verified: list->502, anon delete->403, admin bypass->502,
      queue-add 502/403, tsc+build green. (rename/thumbnails deferred.)
- [x] Job queue: backend GET /api/job_queue (view_files) + POST /job_queue/add,
      /delete, /state (control_print). moonraker.rs get_job_queue/job_queue_add/
      job_queue_delete/job_queue_set_state. Frontend "queue" dashboard card: queue_state
      badge, pause/resume + clear-all (control_print), per-job delete, 5s poll. i18n+scss.
      Verified: view->502, admin action->502, empty delete->400, anon control->403,
      tsc+build green. (add-from-file-list UI deferred until file manager card exists.)
- [x] Print history + statistics: backend GET /api/history?limit= proxies Moonraker
      /server/history/list + /server/history/totals, returns {jobs, totals}, gated
      view_files. moonraker.rs get_history_list/get_history_totals. Frontend: "history"
      dashboard card (totals summary: jobs/print time/filament + recent job list w/
      status dots + duration). Refetches on print_state transition. i18n ro/en + scss.
      Verified: anon(view_files off)->403, admin bypass->502, tsc+build green.
- [x] Machine tools: NEW "machine" dashboard card (control_machine gated). Buttons:
      Firmware Restart, Klipper Restart, Save Config (via onRunMacro), Host Reboot,
      Host Shutdown (via /machine/reboot,shutdown w/ window.confirm). usePrinterState
      hostReboot/hostShutdown -> App -> Dashboard. Busy state, i18n ro/en, scss.
      Verified: anon reboot->403, admin bypass->502 (moonraker down), tsc+build green.
- [x] Update manager: backend GET /api/machine/update/status + POST /api/machine/update
      {component} (control_machine). moonraker get_update_status/update_component (core
      components -> /machine/update/<c>, else client ?name=). Frontend "updates" card:
      per-component version (current->remote or N packages), Update button when behind,
      "up to date" otherwise. i18n+scss. Verified: anon->403, admin status/update->502,
      empty->400, tsc+build green. (Live version data untested—printer offline.)
- [x] Service management: backend GET /api/machine/services (extracts
      system_info.available_services) + POST /api/machine/services/action
      {service, action:restart|start|stop} (control_machine). moonraker
      get_system_info/service_action. Frontend: service dropdown + Restart button in
      the machine card (fetched when card expanded). i18n+scss. Verified: anon->403,
      admin->502, bad action->400, tsc+build green.
- [ ] Machine tools REMAINING: endstop query (minor).
- [~] Part-cooling FAN: DONE. Additive subscribe "fan":["speed","rpm"] (safe—normalizer
      ignores unknown keys). NormalizedPrinterState.fan (FanState{speed,rpm}) merged on
      partial updates. Backend POST /api/fan {speed 0..1} -> M106 S(0-255), gated
      control_temps. Frontend: "fan" dashboard card (slider %, RPM readout, Off/50/100
      presets), setFanSpeed. Verified: anon->403, admin valid->502, speed 1.5->400,
      tsc+build green. (Live speed readout untested—printer offline.)
- [x] FIX: run_macro now lets ADMINS bypass the guest_allowed allowlist (was blocking
      admins from any non-allowlisted gcode incl. SAVE_CONFIG). Also reordered so macro
      authorization precedes the connection check. Verified: admin SAVE_CONFIG/QGL->400
      offline (auth passed), guest SAVE_CONFIG/QGL->403, guest PREHEAT(allowlisted)->400.
- [x] Calibration card: babystep Z offset (SET_GCODE_OFFSET Z_ADJUST, universal) w/
      live offset readout from gcode_move.homing_origin[2]; conditional buttons auto-
      detected from configfile.settings: QUAD_GANTRY_LEVEL, Z_TILT_ADJUST,
      BED_MESH_CALIBRATE, SCREWS_TILT_CALCULATE, BED_SCREWS_ADJUST. Gated control_toolhead,
      executed via onRunMacro. i18n+scss. Verified gcode path via macro endpoint; live
      detection/offset untested (printer offline).
- [x] GENERIC peripherals (multi-fan/output_pin/LED/sensors/filament): DONE (core-safe).
      Backend: printer.objects.list discovery on connect+klippy_ready (WsAction enum:
      None/Resubscribe/SubscribeAux). Enhanced subscribe = SUPERSET of core (core stream
      never lost). aux objects captured into NormalizedPrinterState.auxiliary (HashMap,
      shallow-merged, additive #[serde(default)]). Control endpoints POST /api/aux/fan
      (SET_FAN_SPEED, control_temps), /aux/pin (SET_PIN, control_toolhead), /aux/led
      (SET_LED, control_toolhead); aux_short_name strips type prefix. Frontend
      "peripherals" card: fan_generic sliders, output_pin sliders, LED color pickers,
      temperature_sensor readouts, filament sensor detected/enabled badges. i18n+scss.
      Verified: core status still serializes (no WS regression), anon->403, admin->502,
      bad speed->400, tsc+build green. LIVE peripheral data flow untested (printer offline).
- [x] Endstop query: GET /api/machine/endstops (view_toolhead) -> query_endstops. Button
      + x/y/z open/TRIGGERED display in machine card. Verified: perm->502, no-perm->403.
- [x] exclude_object: POST /api/exclude_object {name} -> EXCLUDE_OBJECT (control_print).
      "exclude" card lists print objects w/ Exclude buttons (excluded ones struck out),
      shown only while objects exist. Verified: anon->403, admin->502, empty->400.

## MOONRAKER IS BACK ONLINE (2026-07-06 ~09:5x) — but Klipper in "error"
- Moonraker reachable at 192.168.1.11:7125; connection_state=connected. Power devices
  return REAL data (printer, Lights). Config editor reads REAL printer.cfg.
- Klipper state = "error": mcu 'mcu' Unable to connect (printer power device is OFF).
  So aux objects (peripherals) still empty until printer powered + FIRMWARE_RESTART.
  DO NOT power on the printer unilaterally (physical hardware action) — needs user ok.

## NEW user requirements (current loop prompt) — HIGH PRIORITY
1. Admin sees EVERY card + full access. (mostly done: can()=isAdmin||perm; verify.)
2. HIDE (not disable) anything the user lacks permission for — incl. console input,
   jog controls, temp set, etc. Split permission(hide) vs transient-state(disable).
3. Mainsail EXCEPTION logic for transient-disable: jog needs homed axes (DONE via
   !isHomed), extrude needs min temp, disable during print unless allowed, etc.
   Treat ALL these exceptions like Mainsail.

## Config file editor — BACKEND DONE (verified w/ live moonraker)
- GET /api/config_files (list, control_machine), GET/PUT /api/config_files/*path
  (read/write, control_machine). safe_config_path rejects .. traversal. moonraker
  list_config_files/read_config_file/write_config_file (multipart root=config).
  Verified: anon->403, admin list->200 REAL, read printer.cfg->200 REAL, traversal->400.
  Frontend "configfile" card DONE (control_machine): file dropdown, monospace textarea,
  save. FULLY verified live: list real files (KAMP/*.cfg etc), write test file->200,
  read-back exact match, traversal write->400. (NOTE: left portal_write_test.cfg on the
  printer config dir from the round-trip test — harmless, not included by printer.cfg.)

## Requirement B (hide-not-disable) — FIRST PASS done
- [x] Console send input (already hidden if !send_console).
- [x] Toolhead: jog/home/unlock control grid hidden if !control_toolhead (readout stays).
- [x] Power: toggle hidden if !control_power (status stays).
- [x] Fan: slider+presets hidden if !control_temps (speed readout stays).
- [x] Speed: slider+presets hidden if !control_toolhead (value input stays).
- [x] Temps: extruder/bed target-set forms + header preheat-preset dropdown hidden if
      !control_temps (temp readouts + graph stay). Verified tsc+build.
- [x] Macros card now gated on run_macros (hidden entirely if can't run; default has both).
- [x] Extrude/Retract card ADDED (was missing). Backend POST /api/extrude {length,speed}
      -> M83 + G1 E (control_toolhead, length<=200, 0<speed<=100). Frontend "extruder"
      card: length/speed inputs, Extrude/Retract. EXCEPTION (req C): buttons disabled
      unless hotend >= min_extrude_temp (from configfile.settings.extruder, default 170),
      shows warning; card hidden if !control_toolhead. Verified anon->403, valid->502,
      range->400, speed->400, tsc+build green.
- [x] Print controls (pause/resume/cancel/start): hidden if !control_print (was disabled).
- [x] AUDIT COMPLETE. Hide-not-disable now covers: console send (send_console), toolhead
      jog (control_toolhead), power toggle (control_power), fan (control_temps), speed
      (control_toolhead), temps target+preset (control_temps), macros card (run_macros),
      extruder (control_toolhead), print controls (control_print), exclude (card-gated).
      Nav already hides: upload (upload_gcode), gcode viewer (view_gcode_viewer),
      heightmap (view_heightmap). Card-level control gates hide: machine/calibrate/
      updates/configfile (control_machine/toolhead). Admin bypass via can()=isAdmin||perm.
      Requirement B (hide-not-disable) DONE.

## SECURITY FIX (2026-07-06): G-code injection in aux/exclude endpoints
Review flagged HIGH: object `name` interpolated into SET_FAN_SPEED/SET_PIN/SET_LED/
EXCLUDE_OBJECT gcode w/o validation -> newline = 2nd gcode command injection. FIXED:
valid_object_name() allows only [A-Za-z0-9_-. space], len<=100; applied to fan/pin/led
(short name) + exclude_object. Verified: newline->400, semicolon->400, quote->400,
legit "cube_1"->502 (reaches printer). Test config file portal_write_test.cfg DELETED.
## Requirement C (Mainsail transient-state exceptions)
- [x] Jog disabled unless axis homed (existing !isHomed on jog buttons).
- [x] Extrude needs min_extrude_temp (done in extruder card).
- [x] Calibration routines (QGL/Z_TILT/mesh/screws) disabled during print; babystep
      stays ENABLED during print (Mainsail lets you tune Z offset mid-print).
- [x] Temp target changes now ALLOWED during print (removed erroneous isPrinting gate)
      — matches Mainsail (adjust temps while printing).
- [x] Existing: home disabled during print (canHome), jog needs homed (!isHomed),
      unlock-motors disabled during print, movement gated by allow_movement_while_printing.
      Requirement C (Mainsail transient exceptions) substantially DONE.

## G-code thumbnails + metadata — DONE (LIVE-verified)
- Backend GET /api/files/metadata?filename= (view_files) proxies Moonraker metadata,
  returns thumbnails/estimated_time/filament_total/layer_count/etc. moonraker
  get_file_metadata (uses .query()). Frontend file manager: lazy per-file metadata
  fetch (ref-guarded, capped 40), shows 34px thumbnail + size·time·filament per row.
  Thumb URL = {moonraker_url}/server/files/gcodes/{dir}{relative_path}. VERIFIED LIVE:
  real est_time=892/filament=1986/thumbs[32,48,300]; anon(view_files off)->403; build green.

## Firmware retraction — DONE
- firmware_retraction added to AUX_OBJECT_PREFIXES (discovered via objects.list, so
  only subscribed if the printer has it -> no regression; captured into auxiliary).
  Backend POST /api/retraction {retract_length,retract_speed,unretract_extra_length,
  unretract_speed} -> SET_RETRACTION (control_toolhead, ranges validated, numeric-only).
  Frontend "retraction" card: reads current from auxiliary.firmware_retraction, 4 inputs
  + apply; auto-hidden unless the printer has firmware_retraction AND control_toolhead.
  Verified: anon->403, valid->502, out-of-range->400, core status still OK, build green.
  (Live current-values readout needs printer ready.)

## Motion limits (velocity/accel) — DONE
- Toolhead subscription + ToolheadState extended with max_velocity/max_accel/
  square_corner_velocity/minimum_cruise_ratio (additive, safe). Backend POST /api/limits
  -> SET_VELOCITY_LIMIT (control_toolhead, ranges validated). Frontend "limits" card reads
  current from state.toolhead, 4 inputs + apply, gated control_toolhead. Verified:
  anon->403, valid->502, bad->400, core status still OK, build green.

## Extrusion flow factor (M221) — DONE
- gcode_move subscription + GcodeMoveState extended with extrude_factor (additive).
  Backend POST /api/flow {factor 50-200} -> M221 S (control_toolhead). Frontend "flow"
  card (slider %, -5/reset/+5, synced from gcode_move.extrude_factor), view=view_speed,
  control=control_toolhead. Verified anon->403, valid->502, range->400, core OK, build green.

## Console autocomplete — DONE (LIVE-verified)
- Backend GET /api/console/commands (view_console) proxies Moonraker /printer/gcode/help,
  returns sorted command names. moonraker get_gcode_help. Frontend: fetch once on console
  card, native <datalist> autocomplete on the console input. VERIFIED LIVE: 65 real
  commands returned; view_console off -> 403; build green.

## Generic heaters (heater_generic, e.g. chamber) — DONE
- heater_generic added to AUX_OBJECT_PREFIXES (discovered/captured). Backend POST
  /api/aux/heater {name,target 0-350} -> SET_HEATER_TEMPERATURE (control_temps, name
  validated via valid_object_name -> injection-safe). Frontend peripherals card renders
  heater_generic with temp/target readout + Enter-to-set target input (control_temps).
  Verified: anon->403, valid->502, range->400, newline-injection->400, core OK, build green.

## COHERENCE PASS (2026-07-06) — most features now LIVE-verified (200 real data)
Full backend+frontend build clean. Admin config GET/PUT round-trip 200 with full real
config. Endpoint smoke test (admin) ALL return live 200 REAL data now that Moonraker up:
/status /power/devices /files/gcodes /history /job_queue /machine/services
/machine/update/status /config_files /console/commands. Only /machine/endstops->502
(needs Klipper ready — printer MCU off). WS state serializes fan/auxiliary/toolhead
(+max_velocity/max_accel/sqv/min_cruise_ratio)/gcode_move. No regressions across ~40 routes.
Remaining unverified = ONLY the aux peripherals RENDER path (needs Klipper ready to
populate auxiliary{}), and gcode WRITE actions that Klipper rejects while in error.

## Admin Settings — cameras section completed (user's explicit "config cameras" ask)
AdminSettings cameras section was missing service(type) + flip H/V. Added: Type <select>
(mjpegstreamer/adaptive/uv4l/ipstream/hlsstream/iframe), Flip H, Flip V checkboxes.
Now covers name/type/stream_url/snapshot_url/rotation/enabled/flipH/flipV/add/remove =
full WebcamConfig (minus cosmetic icon). VERIFIED LIVE: round-trip service=hlsstream+
flips=true through PUT /admin/config, read back exact, restored. build green.
Note: audit config section (enabled/database_path) still not in Settings UI (minor).

## Admin Settings — System/Audit section added -> FULL config-file coverage
Added "system" SectionId + tab: audit.enabled toggle, audit.database_path, and
auth.session_ttl_minutes. AdminSettings now covers EVERY config section: permissions,
cameras(full), preheat, macros, limits, branding/URLs/server/theme, auth(pw/keycloak/
emails), system/audit. "basically everything in the config file" = DONE. Verified live:
audit + ttl=600 round-trip through PUT /admin/config, read back exact, restored. build green.

## TMC driver current tuning — DONE
- tmc2209/2208/2240/2130/5160/2660 added to AUX_OBJECT_PREFIXES. Backend POST /api/aux/tmc
  {stepper,current 0-5A} -> SET_TMC_CURRENT (control_machine, stepper validated ->
  injection-safe). Frontend peripherals: TMC rows show run_current (A) + Enter-to-set
  current (control_machine). Verified anon->403, valid->502, range->400, injection->400, build green.

## Announcements + component-coverage finding — DONE
- Moonraker /server/info: printer has components history/job_queue/machine/webcam/power/
  update_manager/announcements — ALL now covered in UI. SPOOLMAN + TIMELAPSE NOT installed
  -> not applicable (Mainsail wouldn't show them either). octoprint_compat = API shim, no UI.
- Announcements: backend GET /api/announcements (view_status) -> Moonraker announcements
  entries. Frontend "announcements" card auto-hides when empty (0 now). Verified: 200 real
  (0 entries), view_status off->403, build green.
- DATA-PATH FULLY VERIFIED: WS handler does setPrinterState(JSON.parse(msg)) — whole state
  passed through, so ALL added fields (auxiliary/fan/toolhead limits/gcode_move) reach the
  cards. Only the Klipper-populates-auxiliary step is hardware-gated (printer off).

## Card-system consistency audit (verified) + printer still off
- 24 dashboard cards; ALL have a cardNodes entry (no orphans) + all in DEFAULT_DASHBOARD_LAYOUT.
  loadDashboardLayout appends any missing so saved layouts still get new cards. Full build green.
- Printer STILL OFF: klipper now "shutdown" (was "error") but state_message still
  "mcu 'mcu': Unable to connect" -> MCU powered off. FIRMWARE_RESTART would be futile.
  Live aux peripheral rendering STILL the only unverified item; needs physical power-on.

## Layer progress (current/total layer) — DONE
- print_stats subscription + "info"; NormalizedPrinterState.current_layer/total_layer from
  print_stats.info (slicer emits SET_PRINT_STATS_INFO). Frontend status card shows
  "Layer X / Y" when total_layer present (during print). Verified: core status serializes
  new fields, connection ok (no regression), tsc+build green. Live values need a running print.

## Manual probe / Z-calibration dialog — DONE
- manual_probe added to AUX_OBJECT_PREFIXES. Backend POST /api/probe {action:
  testz|accept|abort, delta} -> TESTZ Z=±d / ACCEPT / ABORT (control_toolhead; action
  allowlisted + delta numeric -> injection-safe). Frontend "manualprobe" card auto-shows
  only when auxiliary.manual_probe.is_active: Z readout, +/-1/.1/.05/.01 TESTZ, Accept/Abort.
  Verified anon->403, testz/accept->502, zero-delta->400, bad-action->400, build green.

## *** AUX DATA PATH NOW LIVE-VERIFIED (2026-07-06) ***
Even in klipper "shutdown", objects.list returned manual_probe -> captured into auxiliary
with REAL data {is_active:false, z_position:null,...} matching coded shape EXACTLY. This
proves the WHOLE aux pipeline end-to-end with real printer data: discovery(objects.list)
-> is_aux_object filter -> auxiliary capture/merge -> WS broadcast -> frontend setPrinterState
-> conditional card render (manualprobe correctly HIDDEN since is_active=false). Only
manual_probe shows now b/c shutdown state limits enumeration (MCU-dependent fans/heaters/
steppers need "ready"); the MECHANISM is proven. When printer powered->ready, fans/leds/
pins/sensors/heaters/tmc populate via this SAME verified path. Remaining unverified = only
the exact render of those specific (documented-shape) objects, pipeline itself CONFIRMED.

## Input shaper / resonance testing — DONE (frontend-only)
- "inputshaper" card (control_machine + hasConfig("resonance_tester") -> auto-hides if no
  accelerometer). Buttons run TEST_RESONANCES AXIS=X/Y, SHAPER_CALIBRATE, MEASURE_AXES_NOISE,
  ACCELEROMETER_QUERY via onRunMacro (admin bypasses allowlist). Results -> console.
  Verified: admin TEST_RESONANCES->502 (reaches printer), guest->403 (allowlist), build green.
  (Mainsail's PNG resonance graphs = presentation-only; the FUNCTIONAL commands are all here.)

## Still NOT full Mainsail parity — remaining (do w/ live printer where noted)
- Live verification of peripherals card (fans/LED/pins/sensors) — printer offline all session.
- Config file text editor (Mainsail edits printer.cfg etc. directly). NOT done.
- G-code file thumbnails in file manager list. NOT done (metadata endpoint exists).
- Firmware retraction (SET_RETRACTION) UI, TMC current tuning, velocity/accel limits UI.
- Spoolman, timelapse, multi-printer, notifications — Mainsail extras, NOT done.
These keep "every single functional feature" from being unequivocally TRUE -> do NOT emit DONE.
- [ ] Limits/TMC, extrude/retract UI, temperature presets & chart already exist.

## Verify each iteration
- `cd backend && cargo build` ; `cd frontend && npm run build`.
- Live: run `backend/target/debug/backend` from backend/ (loads config.toml). Moonraker
  at 192.168.1.11:7125. Test admin flows with a cookie jar.
- Backend bg run pattern: Bash run_in_background with `exec ./target/debug/backend`.
  (Subshell `( ... & )` returns sandbox exit 144.)

## NOT done — do not output DONE until Phases 2–4 complete and verified.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;

#[derive(Debug, Deserialize, Clone, Serialize)]
pub struct Config {
    pub server: ServerConfig,
    pub auth: AuthConfig,
    pub moonraker: MoonrakerConfig,
    pub mainsail: Option<MainsailConfig>,
    #[serde(default)]
    pub fluidd: Option<FluiddConfig>,
    #[serde(default)]
    pub octoprint: Option<OctoPrintConfig>,
    /// Hardware safety ceilings only (hotend/bed max temp). Access-control limits
    /// (speed factor, jog step, upload size, ...) now live per-group in `groups`.
    #[serde(alias = "limits")]
    pub safety: SafetyConfig,
    pub branding: BrandingConfig,
    pub theme: ThemeConfig,
    pub preheat: HashMap<String, PreheatPreset>,
    #[serde(default)]
    pub webcams: Vec<WebcamConfig>,
    /// Named groups with their own permission/limit sets. Always contains the
    /// built-in "anonymous", "guest", and "admin" groups (seeded on load if
    /// missing); custom groups are assigned via each group's `emails`
    /// allow-list at signup time, or manually by an admin.
    #[serde(default)]
    pub groups: Vec<GroupConfig>,
    /// Local email/password self-signup (domain-restricted, email-verified).
    #[serde(default)]
    pub signup: SignupConfig,
    /// Outbound mail server used to send signup verification emails. Empty
    /// `host` = unconfigured; verification links are logged instead of
    /// emailed (dev/first-run fallback).
    #[serde(default)]
    pub smtp: SmtpConfig,
    /// Resend (resend.com) as an alternative to raw SMTP for outbound
    /// verification emails — a plain HTTPS API call authenticated with a
    /// single API key, so it needs no host/port/TLS configuration and isn't
    /// affected by campus/institutional networks that block outbound SMTP
    /// ports. Takes priority over `smtp` when `api_key` is set (see
    /// `mail::send_verification_email`).
    #[serde(default)]
    pub resend: ResendConfig,
    /// Optional IP allow-list gating signup/local-account login (e.g.
    /// restrict to a campus network). `allowed_country`/`allowed_city` are
    /// admin-facing labels only — actual enforcement is by CIDR, since this
    /// app ships no GeoIP database.
    #[serde(default)]
    pub geo_restriction: GeoRestrictionConfig,
    #[serde(default)]
    pub audit: AuditConfig,
    /// Footer link/icon list (e.g. GitHub, institution links), fully
    /// admin-managed — order controls display order.
    #[serde(default = "default_footer_links")]
    pub footer_links: Vec<FooterLink>,
}

/// A single footer icon+link, e.g. the GitHub repository link. `icon_url` is
/// either an admin-uploaded icon (served from `/api/footer-link-icon/{id}`)
/// or empty, in which case the frontend renders a generic fallback icon —
/// this replaces the old font-glyph icons that silently failed to render
/// when the custom font didn't load.
#[derive(Debug, Deserialize, Clone, Serialize, utoipa::ToSchema)]
#[serde(default)]
pub struct FooterLink {
    pub id: String,
    pub label: String,
    pub url: String,
    pub icon_url: String,
    pub order: i32,
}

impl Default for FooterLink {
    fn default() -> Self {
        Self {
            id: String::new(),
            label: String::new(),
            url: String::new(),
            icon_url: String::new(),
            order: 0,
        }
    }
}

fn default_footer_links() -> Vec<FooterLink> {
    vec![FooterLink {
        id: "github".to_string(),
        label: "GitHub Repository".to_string(),
        url: "https://github.com/Ariimeow78/klipper-mainpage-iesc".to_string(),
        // "icon:github" selects the bundled GitHub mark (see
        // frontend/src/lib/footerIcons.ts) instead of requiring an upload.
        icon_url: "icon:github".to_string(),
        order: 0,
    }]
}

/// A named user group with its own permission/limit set. Membership comes from
/// local signup accounts (see `SignupConfig`), not a password — the three
/// built-in groups ("anonymous", "guest", "admin") are the exception: they're
/// reached via the existing no-session / guest-password / admin-password flows
/// respectively.
///
/// `#[serde(default)]` at the struct level lets pre-migration TOML entries (old
/// schema: `name`/`password_hash`, no `id`) deserialize without error instead of
/// failing the whole config load; `Config::migrate_legacy_groups` then drops any
/// entry left with an empty `id` since only the new schema is meaningful.
#[derive(Debug, Default, Deserialize, Clone, Serialize, utoipa::ToSchema)]
#[serde(default)]
pub struct GroupConfig {
    /// Stable, machine-readable identifier (used as the role string). Immutable
    /// after creation to avoid the old "rename loses password" class of bug.
    pub id: String,
    /// Human-readable label shown in the UI.
    pub display_name: String,
    /// Emails (matched case-insensitively) that land a newly-signed-up local
    /// account in this group instead of `SignupConfig::default_group` — lets
    /// an admin route specific people into a custom group without touching
    /// anything but this list. Ignored for the built-in groups.
    #[serde(default)]
    pub emails: Vec<String>,
    /// Capabilities, limits, and per-device power access granted to this group.
    pub permissions: PermissionsConfig,
    /// True for the "anonymous"/"guest"/"admin" groups: cannot be deleted or
    /// have their id changed via the admin API.
    pub built_in: bool,
}

/// Granular, guest-facing capability toggles. Admins always bypass these.
/// Every field defaults so older config files keep working (see `Default`).
#[derive(Debug, Deserialize, Clone, Serialize, utoipa::ToSchema)]
#[serde(default)]
pub struct PermissionsConfig {
    /// See the printer/job status card at all.
    pub view_status: bool,
    /// See the temperature card (current temps, graph).
    pub view_temps: bool,
    /// See the target/setpoint column in the temperature table, read-only.
    /// Irrelevant (and the column hidden) when `control_temps` is also true,
    /// since controlling implies seeing the target.
    pub view_temp_target: bool,
    /// Change hotend/bed target temperatures & presets.
    pub control_temps: bool,
    /// See the webcam card.
    pub view_webcam: bool,
    /// See the toolhead/position card.
    pub view_toolhead: bool,
    /// Jog / home / move / disable-motors / set speed factor.
    pub control_toolhead: bool,
    /// See the macros card.
    pub view_macros: bool,
    /// Execute macros.
    pub run_macros: bool,
    /// See the console card.
    pub view_console: bool,
    /// Send console commands (reserved; console is read-only today).
    pub send_console: bool,
    /// See the speed-factor control.
    pub view_speed: bool,
    /// See the G-code file manager.
    pub view_files: bool,
    /// Delete/manage G-code files.
    pub manage_files: bool,
    /// See Moonraker power devices.
    pub view_power: bool,
    /// Toggle Moonraker power devices.
    pub control_power: bool,
    /// Reboot or shut down the host through Moonraker.
    pub control_machine: bool,
    /// Upload G-code files.
    pub upload_gcode: bool,
    /// Start / pause / resume / cancel prints.
    pub control_print: bool,
    /// See the G-code viewer / heightmap pages.
    pub view_gcode_viewer: bool,
    pub view_heightmap: bool,
    /// Show the "Open Mainsail" / "Open Fluidd" / "Open OctoPrint" links in
    /// the account menu (each only appears if its URL is also configured).
    pub open_mainsail: bool,
    pub open_fluidd: bool,
    pub open_octoprint: bool,

    /// Max speed factor (%) this group may set. `None` = unlimited.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_speed_factor: Option<f64>,
    /// Max mm this group may jog in a single command. `None` = unlimited.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_jog_step: Option<f64>,
    /// Max G-code upload size in MB. `None` = unlimited.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_upload_mb: Option<u64>,
    /// Allow jog/move commands while a print is in progress.
    pub allow_movement_while_printing: bool,
    /// Allow homing (not just jogging) for this group.
    pub allow_home_for_guests: bool,
    /// Per-device visibility/control override, keyed by Moonraker device name.
    /// A device absent from this map is visible AND controllable by default
    /// (matches the historical global default before this became per-group).
    pub power_devices: HashMap<String, DeviceAccess>,
    /// Macro names (uppercased, first word only) this group may run. Ignored
    /// for admins, who bypass this check entirely. FIRMWARE_RESTART/RESTART
    /// are always allowed regardless of this list (recovery actions).
    pub allowed_macros: Vec<String>,
}

impl Default for PermissionsConfig {
    fn default() -> Self {
        // Safe defaults: guests can see everything but only perform the
        // low-risk controls. Tighten per-deployment in config.toml.
        Self {
            view_status: true,
            view_temps: true,
            view_temp_target: true,
            control_temps: false,
            view_webcam: true,
            view_toolhead: true,
            control_toolhead: false,
            view_macros: true,
            run_macros: true,
            view_console: true,
            send_console: false,
            view_speed: true,
            view_files: true,
            manage_files: false,
            view_power: true,
            control_power: false,
            control_machine: false,
            upload_gcode: true,
            control_print: false,
            view_gcode_viewer: true,
            view_heightmap: true,
            open_mainsail: true,
            open_fluidd: true,
            open_octoprint: true,
            max_speed_factor: Some(200.0),
            max_jog_step: Some(10.0),
            max_upload_mb: Some(250),
            allow_movement_while_printing: false,
            allow_home_for_guests: false,
            power_devices: HashMap::new(),
            allowed_macros: default_allowed_macros(),
        }
    }
}

fn default_allowed_macros() -> Vec<String> {
    [
        "LOAD_FILAMENT",
        "UNLOAD_FILAMENT",
        "FILAMENT_CHANGE",
        "LINE_PURGE",
        "PREHEAT",
        "BED_MESH_CALIBRATE",
    ]
    .into_iter()
    .map(String::from)
    .collect()
}

impl PermissionsConfig {
    /// Every capability granted, every limit unlimited. Used to seed the
    /// built-in "admin" group's stored permissions (display/consistency only —
    /// `UserRole::Admin` already bypasses every permission check at runtime).
    pub fn unlimited() -> Self {
        Self {
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
            manage_files: true,
            view_power: true,
            control_power: true,
            control_machine: true,
            upload_gcode: true,
            control_print: true,
            view_gcode_viewer: true,
            view_heightmap: true,
            open_mainsail: true,
            open_fluidd: true,
            open_octoprint: true,
            max_speed_factor: None,
            max_jog_step: None,
            max_upload_mb: None,
            allow_movement_while_printing: true,
            allow_home_for_guests: true,
            power_devices: HashMap::new(),
            allowed_macros: Vec::new(),
        }
    }
}

/// Per-group label and visibility/control for a single Moonraker power
/// device. The label is per-group (not shared) so e.g. a guest group can see
/// a friendlier name than the admin group for the same physical device.
#[derive(Debug, Deserialize, Clone, Serialize, utoipa::ToSchema)]
#[serde(default)]
pub struct DeviceAccess {
    pub label: String,
    pub visible: bool,
    pub controllable: bool,
}

impl Default for DeviceAccess {
    fn default() -> Self {
        Self {
            label: String::new(),
            visible: true,
            controllable: false,
        }
    }
}

#[derive(Debug, Deserialize, Clone, Serialize)]
pub struct MainsailConfig {
    pub url: String,
}

#[derive(Debug, Deserialize, Clone, Serialize)]
pub struct FluiddConfig {
    pub url: String,
}

#[derive(Debug, Deserialize, Clone, Serialize)]
pub struct OctoPrintConfig {
    pub url: String,
}

#[derive(Debug, Deserialize, Clone, Serialize)]
pub struct ServerConfig {
    pub host: String,
    pub port: u16,
}

#[derive(Debug, Deserialize, Clone, Serialize)]
pub struct AuthConfig {
    pub admin_password_hash: String,
    pub guest_password_hash: Option<String>,
    #[serde(default = "default_session_ttl_minutes")]
    pub session_ttl_minutes: u64,
}

fn default_session_ttl_minutes() -> u64 {
    12 * 60
}

/// Local email/password self-signup. Disabled by default — a fresh install
/// shouldn't expose an open signup form until an admin has configured at
/// least one allowed email domain.
#[derive(Debug, Deserialize, Clone, Serialize, utoipa::ToSchema)]
#[serde(default)]
pub struct SignupConfig {
    pub enabled: bool,
    /// Domains allowed to sign up, e.g. `"example.com"` (also matches
    /// subdomains like `mail.example.com`). Empty = signup rejects every
    /// address — an admin must configure at least one domain first.
    pub allowed_domains: Vec<String>,
    /// Group a newly-verified account is placed into, unless the email
    /// matches a custom group's own `emails` allow-list (see `GroupConfig`).
    pub default_group: String,
    /// Require the signup email to be confirmed (via a mailed link) before
    /// the account can log in. Strongly recommended to keep enabled.
    pub require_email_verification: bool,
    /// How long a verification link stays valid.
    pub verification_ttl_minutes: u64,
    /// Require a proof-of-work anti-spam challenge (Anubis-style) to be
    /// solved before a signup request is accepted.
    pub require_pow_challenge: bool,
    /// Leading zero *bits* the PoW hash must have. Each extra bit roughly
    /// doubles solve time; 18-22 is a few hundred ms to a couple seconds on
    /// typical hardware.
    pub pow_difficulty_bits: u32,
    /// SQLite database file (relative to the backend working directory)
    /// storing local accounts.
    pub database_path: String,
    /// Origin used to build the verification link sent by email (e.g.
    /// `"https://print.example.com"`). Empty = fall back to
    /// `http://localhost:{server.port}`, which only works for local testing
    /// — the request's `Host` header is deliberately never used for this
    /// (an attacker-controlled header building a security-sensitive link is
    /// a classic host-header-injection vector). Set this explicitly for any
    /// real deployment.
    pub public_base_url: String,
}

impl Default for SignupConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            allowed_domains: Vec::new(),
            default_group: "guest".to_string(),
            require_email_verification: true,
            verification_ttl_minutes: 24 * 60,
            require_pow_challenge: true,
            pow_difficulty_bits: 20,
            database_path: "data/users.sqlite".to_string(),
            public_base_url: String::new(),
        }
    }
}

/// Outbound SMTP server for signup verification emails.
#[derive(Debug, Deserialize, Clone, Serialize, utoipa::ToSchema)]
#[serde(default)]
pub struct SmtpConfig {
    /// Empty = unconfigured; verification links are logged server-side
    /// instead of emailed (safe dev/first-run fallback, never used to bypass
    /// verification — the account still isn't usable until the link is
    /// visited).
    pub host: String,
    pub port: u16,
    pub username: String,
    pub password: String,
    pub from_address: String,
    pub use_starttls: bool,
}

impl Default for SmtpConfig {
    fn default() -> Self {
        Self {
            host: String::new(),
            port: 587,
            username: String::new(),
            password: String::new(),
            from_address: String::new(),
            use_starttls: true,
        }
    }
}

/// Resend (resend.com) API credentials — see the field on `Config::resend`
/// for why this exists alongside `SmtpConfig`.
#[derive(Debug, Default, Deserialize, Clone, Serialize, utoipa::ToSchema)]
#[serde(default)]
pub struct ResendConfig {
    /// Empty = unconfigured (falls through to `smtp`, then the console-log
    /// fallback). Found in the Resend dashboard under API Keys.
    pub api_key: String,
    /// Must be on a domain verified in the Resend dashboard — Resend
    /// rejects the send otherwise. Separate from `smtp.from_address` since a
    /// deployment using both might verify different sending domains with
    /// each.
    pub from_address: String,
}

/// One entry in the region allow-list: a country (ISO 3166-1 alpha-2 code,
/// e.g. `"RO"`), optionally narrowed to a single city within it. `city:
/// None` allows the whole country; `city: Some(name)` only allows that city
/// — matched case-insensitively against the name the GeoIP database reports
/// for the caller's IP.
#[derive(Debug, Deserialize, Clone, Serialize, PartialEq, utoipa::ToSchema)]
#[serde(default)]
pub struct GeoRegion {
    pub country: String,
    #[serde(default)]
    pub city: Option<String>,
}

impl Default for GeoRegion {
    fn default() -> Self {
        Self {
            country: String::new(),
            city: None,
        }
    }
}

/// Whether the region/CIDR lists in `GeoRestrictionConfig` describe who's
/// let *in* or who's kept *out*.
#[derive(Debug, Deserialize, Clone, Serialize, PartialEq, utoipa::ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum GeoRestrictionMode {
    /// Only callers matching a listed region/CIDR are allowed; an empty list
    /// rejects everyone (fail closed).
    Whitelist,
    /// Callers matching a listed region/CIDR are rejected; everyone else is
    /// allowed. An empty list allows everyone (nothing to block).
    Blacklist,
}

impl Default for GeoRestrictionMode {
    fn default() -> Self {
        Self::Whitelist
    }
}

/// Optional IP allow/block-list gating signup and local-account login. The
/// two mechanisms (exact CIDR ranges vs. GeoIP-resolved country/city) are
/// independently toggled — an admin may want only one, e.g. campus CIDR
/// ranges without any GeoIP dependency, or "only Romania" without also
/// hand-listing IP ranges. Both disabled by default.
#[derive(Debug, Deserialize, Clone, Serialize, utoipa::ToSchema)]
#[serde(default)]
pub struct GeoRestrictionConfig {
    /// Enables enforcement of `allowed_cidrs`.
    #[serde(default)]
    pub ip_enabled: bool,
    /// Enables enforcement of `allowed_regions` (requires `mmdb_path`).
    #[serde(default)]
    pub location_enabled: bool,
    /// Whitelist ("only these are allowed") or blacklist ("these are
    /// blocked, everyone else allowed").
    pub mode: GeoRestrictionMode,
    /// Country/city list, resolved via the GeoIP database at `mmdb_path`
    /// (ignored entirely if that's empty — there's nothing to resolve an
    /// IP's location against).
    pub allowed_regions: Vec<GeoRegion>,
    /// Path to a GeoLite2-City.mmdb file (MaxMind's format; both an official
    /// MaxMind account download and community mirrors of it work, since it's
    /// just the standard MMDB binary format). Empty = `allowed_regions` is
    /// never enforced, only `allowed_cidrs` is.
    pub mmdb_path: String,
    /// CIDR ranges (IPv4 or IPv6, e.g. "193.226.0.0/16") that are always
    /// checked regardless of GeoIP — a caller matches this config if it
    /// matches EITHER a CIDR range OR a resolved region (then `mode` decides
    /// whether matching means "let in" or "keep out"). Works standalone (no
    /// mmdb needed) or alongside the region picker for exact ranges a
    /// country/city match wouldn't capture (e.g. a VPN exit node).
    pub allowed_cidrs: Vec<String>,
    /// Trust the first hop of `X-Forwarded-For` as the caller's real IP.
    /// Only enable this if the backend sits behind a reverse proxy that sets
    /// this header itself — otherwise a caller can spoof it to bypass the
    /// allow-list entirely.
    pub trust_x_forwarded_for: bool,
}

impl Default for GeoRestrictionConfig {
    fn default() -> Self {
        Self {
            ip_enabled: false,
            location_enabled: false,
            mode: GeoRestrictionMode::Whitelist,
            allowed_regions: Vec::new(),
            mmdb_path: String::new(),
            allowed_cidrs: Vec::new(),
            trust_x_forwarded_for: false,
        }
    }
}

#[derive(Debug, Deserialize, Clone, Serialize, utoipa::ToSchema)]
#[serde(default)]
pub struct AuditConfig {
    pub enabled: bool,
    pub database_path: String,
}

impl Default for AuditConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            database_path: "data/audit.sqlite".to_string(),
        }
    }
}

#[derive(Debug, Deserialize, Clone, Serialize)]
pub struct MoonrakerConfig {
    pub url: String,
    pub api_key: Option<String>,
}

/// Hardware safety ceilings enforced regardless of caller/group — these are
/// physical limits, not access control, so they stay global.
#[derive(Debug, Deserialize, Clone, Serialize)]
pub struct SafetyConfig {
    pub max_hotend_temp: f64,
    pub max_bed_temp: f64,
}

#[derive(Debug, Deserialize, Clone, Serialize)]
pub struct BrandingConfig {
    /// Keyed by language code, plus a `"default"` fallback used when the
    /// active UI language has no entry of its own. Deserializes a legacy
    /// plain-string value (pre-per-language config) as `{"default": <value>}`.
    #[serde(deserialize_with = "deserialize_localized_field", default)]
    pub app_name: HashMap<String, String>,
    #[serde(
        alias = "faculty_name",
        deserialize_with = "deserialize_localized_field",
        default
    )]
    pub organization_name: HashMap<String, String>,
    #[serde(deserialize_with = "deserialize_localized_field", default)]
    pub logo_light: HashMap<String, String>,
    #[serde(deserialize_with = "deserialize_localized_field", default)]
    pub logo_dark: HashMap<String, String>,
    #[serde(
        deserialize_with = "deserialize_localized_field",
        default = "default_favicon_map"
    )]
    pub favicon: HashMap<String, String>,
    #[serde(deserialize_with = "deserialize_localized_field", default)]
    pub danger_image: HashMap<String, String>,
    #[serde(deserialize_with = "deserialize_localized_field", default)]
    pub moron_warning_text: HashMap<String, String>,
}

fn default_favicon_map() -> HashMap<String, String> {
    let mut m = HashMap::new();
    m.insert("default".to_string(), "assets/favicon.svg".to_string());
    m
}

/// Accepts either a legacy plain string (single global value: image path or
/// text) or a `{lang: value}` map (per-language), normalizing both to the map
/// form. Used for every branding field that can vary per UI language.
fn deserialize_localized_field<'de, D>(
    deserializer: D,
) -> Result<HashMap<String, String>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum StringOrMap {
        Legacy(String),
        Map(HashMap<String, String>),
    }
    match StringOrMap::deserialize(deserializer)? {
        StringOrMap::Legacy(s) => {
            let mut m = HashMap::new();
            if !s.is_empty() {
                m.insert("default".to_string(), s);
            }
            Ok(m)
        }
        StringOrMap::Map(m) => Ok(m),
    }
}

#[derive(Debug, Deserialize, Clone, Serialize)]
pub struct ThemeConfig {
    pub font_family: String,
    /// URL path to a custom uploaded font file (e.g. "/api/branding/font").
    /// If set, the frontend injects an @font-face rule loading this URL.
    #[serde(default)]
    pub font_url: Option<String>,
}

#[derive(Debug, Deserialize, Clone, Serialize, utoipa::ToSchema)]
pub struct PreheatPreset {
    pub hotend: f64,
    pub bed: f64,
}

#[derive(Debug, Deserialize, Clone, Serialize, utoipa::ToSchema)]
pub struct WebcamConfig {
    pub name: String,
    /// Stream type: "mjpegstreamer", "hlsstream", "iframe"
    #[serde(default = "default_service")]
    pub service: String,
    pub stream_url: String,
    #[serde(default)]
    pub snapshot_url: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default)]
    pub flip_horizontal: bool,
    #[serde(default)]
    pub flip_vertical: bool,
    #[serde(default)]
    pub rotation: i32,
    #[serde(default)]
    pub icon: String,
    /// Where this config came from: "config" (config.toml) or "moonraker"
    #[serde(default = "default_source_config")]
    pub source: String,
}

fn default_service() -> String {
    "mjpegstreamer".to_string()
}

fn default_true() -> bool {
    true
}

fn default_source_config() -> String {
    "config".to_string()
}

impl Config {
    pub async fn load_from_file<P: AsRef<Path>>(
        path: P,
    ) -> Result<Self, Box<dyn std::error::Error>> {
        let content = tokio::fs::read_to_string(path).await?;
        let raw: toml::Value = toml::from_str(&content)?;
        let mut config: Config = toml::from_str(&content)?;
        config.migrate_legacy_groups(&raw);
        Ok(config)
    }

    /// Seeds the built-in "anonymous"/"guest"/"admin" groups if they aren't
    /// already present, carrying over values from the old top-level
    /// `[permissions]`/`[limits]` tables when this is the first load after the
    /// groups-based permission model landed. Idempotent: safe to run on every
    /// load. Also drops any pre-migration group entries (old schema: `name`/
    /// `password_hash`, no `id`) that `GroupConfig`'s struct-level
    /// `#[serde(default)]` let through without erroring, since they have no
    /// meaningful `id` in the new schema.
    fn migrate_legacy_groups(&mut self, raw: &toml::Value) {
        self.groups.retain(|g| !g.id.is_empty());

        let has = |groups: &[GroupConfig], id: &str| groups.iter().any(|g| g.id == id);

        if !has(&self.groups, "anonymous") || !has(&self.groups, "guest") {
            let mut perms: PermissionsConfig = raw
                .get("permissions")
                .and_then(|v| toml::to_string(v).ok())
                .and_then(|s| toml::from_str(&s).ok())
                .unwrap_or_default();

            if let Some(limits) = raw.get("limits") {
                if let Some(v) = limits.get("max_speed_factor").and_then(|v| v.as_float()) {
                    perms.max_speed_factor = Some(v);
                }
                if let Some(v) = limits.get("max_jog_step").and_then(|v| v.as_float()) {
                    perms.max_jog_step = Some(v);
                }
                if let Some(v) = limits.get("max_upload_mb").and_then(|v| v.as_integer()) {
                    perms.max_upload_mb = Some(v as u64);
                }
                if let Some(v) = limits
                    .get("allow_movement_while_printing")
                    .and_then(|v| v.as_bool())
                {
                    perms.allow_movement_while_printing = v;
                }
                if let Some(v) = limits
                    .get("allow_home_for_guests")
                    .and_then(|v| v.as_bool())
                {
                    perms.allow_home_for_guests = v;
                }
            }

            // Legacy top-level [macros].guest_allowed, now per-group.
            if let Some(list) = raw
                .get("macros")
                .and_then(|v| v.get("guest_allowed"))
                .and_then(|v| v.as_array())
            {
                perms.allowed_macros = list
                    .iter()
                    .filter_map(|v| v.as_str().map(str::to_string))
                    .collect();
            }

            if !has(&self.groups, "anonymous") {
                self.groups.push(GroupConfig {
                    id: "anonymous".to_string(),
                    display_name: "Anonymous".to_string(),
                    emails: Vec::new(),
                    permissions: perms.clone(),
                    built_in: true,
                });
            }
            if !has(&self.groups, "guest") {
                self.groups.push(GroupConfig {
                    id: "guest".to_string(),
                    display_name: "Guest".to_string(),
                    emails: Vec::new(),
                    permissions: perms,
                    built_in: true,
                });
            }
        }

        if !has(&self.groups, "admin") {
            self.groups.push(GroupConfig {
                id: "admin".to_string(),
                display_name: "Administrator".to_string(),
                emails: Vec::new(),
                permissions: PermissionsConfig::unlimited(),
                built_in: true,
            });
        }
    }

    pub fn get_default_config_content() -> &'static str {
        r#"[server]
host = "127.0.0.1"
port = 8080

[auth]
# bcrypt hash for password "admin123" (change this from Settings or regenerate)
admin_password_hash = "$2b$12$tKPmCnU7yGwtXG6GK6a2l.NLk5smTREHvrw9QrFS4Tbqnr8tpumKO"
guest_password_hash = ""
session_ttl_minutes = 720

[signup]
enabled = false
allowed_domains = []
default_group = "guest"
require_email_verification = true
verification_ttl_minutes = 1440
require_pow_challenge = true
pow_difficulty_bits = 20
database_path = "data/users.sqlite"
public_base_url = ""

[smtp]
host = ""
port = 587
username = ""
password = ""
from_address = ""
use_starttls = true

[resend]
api_key = ""
from_address = ""

[geo_restriction]
ip_enabled = false
location_enabled = false
mode = "whitelist"
allowed_regions = []
mmdb_path = ""
allowed_cidrs = []
trust_x_forwarded_for = false

[audit]
enabled = true
database_path = "data/audit.sqlite"

[moonraker]
url = "http://127.0.0.1:7125"
api_key = ""

[mainsail]
url = ""

[fluidd]
url = ""

[octoprint]
url = ""

[safety]
max_hotend_temp = 260.0
max_bed_temp = 110.0

[branding]
app_name = "3D Print Portal"
organization_name = ""
logo_light = "assets/logo/Logo-UT-NEGRU-RO.png"
logo_dark = "assets/logo/Logo-UT-ALB-RO.png"
favicon = "assets/favicon.svg"
danger_image = "assets/danger.svg"
moron_warning_text = "Please read the rules before printing and be responsible!"

[theme]
font_family = "UT Sans"

[preheat.pla]
hotend = 200.0
bed = 60.0

[preheat.petg]
hotend = 240.0
bed = 80.0

[preheat.tpu]
hotend = 220.0
bed = 50.0

[preheat.abs]
hotend = 245.0
bed = 100.0
"#
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Parses TOML the same way `Config::load_from_file` does (raw value +
    /// typed struct, then migration), without touching the filesystem.
    fn migrate_from_toml(content: &str) -> Config {
        let raw: toml::Value = toml::from_str(content).expect("raw parse");
        let mut config: Config = toml::from_str(content).expect("typed parse");
        config.migrate_legacy_groups(&raw);
        config
    }

    /// A full pre-migration config: old top-level `[permissions]` + `[limits]`
    /// (not `[safety]`), plus two old-schema `[[groups]]` entries that use
    /// `name`/`password_hash` instead of `id`/`emails`/`built_in`.
    fn legacy_config_toml() -> String {
        // The base template already has a [safety] section (new schema); a
        // genuinely old config would have called it [limits] with extra
        // access-control fields alongside the two that now live in [safety].
        // `#[serde(alias = "limits")]` means both names can't be present at
        // once, so swap the header AND splice the extra fields in right after
        // it (appending at the end would land them inside [macros] instead,
        // since [safety] isn't the last section in the base template).
        let base = Config::get_default_config_content().replacen(
            "[safety]\n",
            "[limits]\nmax_speed_factor = 321.0\nmax_upload_mb = 111\nallow_movement_while_printing = true\nallow_home_for_guests = true\nmax_jog_step = 7.5\n",
            1,
        );
        format!(
            r#"{base}
[permissions]
view_status = true
view_temps = true
control_temps = false
view_webcam = true
view_toolhead = true
control_toolhead = false
view_macros = true
run_macros = true
view_console = true
send_console = false
view_speed = true
view_files = true
manage_files = false
view_power = true
control_power = false
control_machine = false
upload_gcode = true
control_print = false
view_gcode_viewer = true
view_heightmap = true

[[groups]]
name = "old-group-1"
display_name = ""
password_hash = "$2b$12$deadbeef"

[groups.permissions]
view_status = true
view_temps = true
control_temps = false
view_webcam = true
view_toolhead = true
control_toolhead = false
view_macros = true
run_macros = false
view_console = false
send_console = false
view_speed = true
view_files = true
manage_files = false
view_power = true
control_power = false
control_machine = false
upload_gcode = false
control_print = true
view_gcode_viewer = true
view_heightmap = true

[macros]
guest_allowed = ["PREHEAT", "LINE_PURGE"]
"#
        )
    }

    #[test]
    fn seeds_builtin_groups_from_legacy_top_level_config() {
        let config = migrate_from_toml(&legacy_config_toml());

        assert_eq!(
            config.groups.len(),
            3,
            "old password-based group must be dropped, only the 3 built-ins remain"
        );
        for id in ["anonymous", "guest", "admin"] {
            assert!(
                config.groups.iter().any(|g| g.id == id && g.built_in),
                "missing built-in group {id}"
            );
        }
    }

    #[test]
    fn carries_over_legacy_limits_into_anonymous_and_guest() {
        let config = migrate_from_toml(&legacy_config_toml());
        for id in ["anonymous", "guest"] {
            let group = config.groups.iter().find(|g| g.id == id).unwrap();
            assert_eq!(group.permissions.max_speed_factor, Some(321.0));
            assert_eq!(group.permissions.max_jog_step, Some(7.5));
            assert_eq!(group.permissions.max_upload_mb, Some(111));
            assert!(group.permissions.allow_movement_while_printing);
            assert!(group.permissions.allow_home_for_guests);
            // Carried over from [permissions].
            assert!(group.permissions.view_status);
            assert!(!group.permissions.control_temps);
        }
    }

    #[test]
    fn carries_over_legacy_macros_into_anonymous_and_guest() {
        let config = migrate_from_toml(&legacy_config_toml());
        for id in ["anonymous", "guest"] {
            let group = config.groups.iter().find(|g| g.id == id).unwrap();
            assert_eq!(
                group.permissions.allowed_macros,
                vec!["PREHEAT".to_string(), "LINE_PURGE".to_string()],
            );
        }
    }

    #[test]
    fn admin_group_is_seeded_unlimited_regardless_of_legacy_limits() {
        let config = migrate_from_toml(&legacy_config_toml());
        let admin = config.groups.iter().find(|g| g.id == "admin").unwrap();
        assert_eq!(admin.permissions.max_speed_factor, None);
        assert_eq!(admin.permissions.max_jog_step, None);
        assert_eq!(admin.permissions.max_upload_mb, None);
        assert!(admin.permissions.control_machine);
        assert!(admin.permissions.allow_home_for_guests);
    }

    #[test]
    fn migration_is_idempotent_on_new_schema_config() {
        // A config that already has the 3 built-ins must not be touched or
        // duplicated on a second migration pass.
        let once = migrate_from_toml(&legacy_config_toml());
        let raw: toml::Value =
            toml::from_str(&toml::to_string(&once).unwrap()).unwrap();
        let mut twice = once.clone();
        twice.migrate_legacy_groups(&raw);
        assert_eq!(twice.groups.len(), 3);
        assert_eq!(
            twice
                .groups
                .iter()
                .find(|g| g.id == "anonymous")
                .unwrap()
                .permissions
                .max_speed_factor,
            once.groups
                .iter()
                .find(|g| g.id == "anonymous")
                .unwrap()
                .permissions
                .max_speed_factor,
        );
    }

    #[test]
    fn unlimited_permissions_has_no_numeric_limits() {
        let perms = PermissionsConfig::unlimited();
        assert_eq!(perms.max_speed_factor, None);
        assert_eq!(perms.max_jog_step, None);
        assert_eq!(perms.max_upload_mb, None);
        assert!(perms.control_machine);
        assert!(perms.control_power);
        assert!(perms.allow_movement_while_printing);
        assert!(perms.allow_home_for_guests);
    }

    #[test]
    fn default_config_content_parses_and_migrates_cleanly() {
        // The fresh-install template has no [permissions]/[[groups]] at all —
        // migration must still produce sane built-ins from PermissionsConfig
        // defaults rather than erroring.
        let config = migrate_from_toml(Config::get_default_config_content());
        assert_eq!(config.groups.len(), 3);
        // No legacy [macros] section either — falls back to the built-in
        // default allow-list baked into PermissionsConfig::default().
        let guest = config.groups.iter().find(|g| g.id == "guest").unwrap();
        assert!(guest.permissions.allowed_macros.contains(&"PREHEAT".to_string()));
    }
}

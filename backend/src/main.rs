use arc_swap::ArcSwap;
use axum::{
    extract::{
        ws::{Message as WsMessage, WebSocket, WebSocketUpgrade}, State,
    },
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{delete, get, post},
    Json, Router,
};
use axum_extra::extract::cookie::CookieJar;
use pulldown_cmark::{html, Options, Parser};
use serde_json::json;
use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use time::Duration;
use tokio::fs;
use tower_http::services::{ServeDir, ServeFile};
use tracing::{error, info, warn};
use tracing_subscriber::{fmt, prelude::*, EnvFilter};
use utoipa::OpenApi;

/// Resolves every runtime path this app reads/writes (`config.toml`,
/// `content/`, `data/`, `assets/`) relative to a single root — everything
/// this process owns lives under one directory, never scattered across the
/// `backend`/`frontend` source trees.
///
/// - If `KLIPPER_PORTAL_HOME` is set, that's the root, full stop — this is
///   the production path: point it at e.g. `/etc/klipper-portal` (or
///   `/var/lib/klipper-portal`, your call) and this checkout no longer needs
///   to exist on disk at runtime, only the compiled binary + this directory.
/// - Otherwise, falls back to the existing dev-checkout heuristic (repo root
///   or `backend/`, whichever has these files) so `cargo run`/`make dev`
///   keep working with zero configuration.
///
/// (Named `KLIPPER_PORTAL_*`, not just `KLIPPER_*`, to avoid any chance of
/// colliding with Klipper firmware's own environment — this app runs
/// alongside Klipper/Moonraker on the same host.)
/// The actual resolution logic, taking the env var's value as a plain
/// parameter instead of reading it internally — keeps this testable without
/// mutating real process-global env vars (which would race against every
/// other test running in the same process).
fn resolve_project_file_path(
    home_override: Option<&std::ffi::OsStr>,
    relative_path: impl AsRef<Path>,
) -> PathBuf {
    if let Some(home) = home_override {
        return PathBuf::from(home).join(relative_path);
    }
    let mut dir = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    if dir.join("backend").is_dir() {
        dir.push("backend");
    }
    dir.join(relative_path)
}

fn get_project_file_path(relative_path: impl AsRef<Path>) -> PathBuf {
    resolve_project_file_path(
        std::env::var_os("KLIPPER_PORTAL_HOME").as_deref(),
        relative_path,
    )
}

/// Where the built frontend SPA (`frontend/dist`) is served from. Separate
/// from `KLIPPER_PORTAL_HOME` (which is config/content/data, not the
/// compiled frontend) — set `KLIPPER_PORTAL_FRONTEND_DIST` in a production
/// deployment that ships the `dist/` build alongside the backend binary
/// rather than inside a full source checkout.
fn resolve_frontend_dist_path(dist_override: Option<&std::ffi::OsStr>) -> PathBuf {
    if let Some(dist) = dist_override {
        return PathBuf::from(dist);
    }
    let current_dir = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    if current_dir.join("frontend/dist").is_dir() {
        current_dir.join("frontend/dist")
    } else if current_dir.join("../frontend/dist").is_dir() {
        current_dir.join("../frontend/dist")
    } else {
        PathBuf::from("frontend/dist")
    }
}

fn detect_frontend_dist_path() -> PathBuf {
    resolve_frontend_dist_path(std::env::var_os("KLIPPER_PORTAL_FRONTEND_DIST").as_deref())
}

mod audit;
mod config;
mod geo;
mod handlers;
mod mail;
mod moonraker;
mod passwords;
mod pending_uploads;
mod pow;
mod security;
mod users;

pub(crate) use audit::{detail as audit_detail, AuditLogger};
pub(crate) use config::Config;
pub(crate) use handlers::*;
pub(crate) use moonraker::{BackendWsEvent, MoonrakerClient, NormalizedPrinterState};
pub(crate) use pending_uploads::PendingUploadQueue;
pub(crate) use security::{Identity, SafetyManager, SessionManager, UserRole};
pub(crate) use users::UserStore;

struct AppState {
    /// Swappable so the admin Settings API can apply config.toml edits live
    /// without a restart. Read with `config.load()`.
    config: Arc<ArcSwap<Config>>,
    moonraker: Arc<MoonrakerClient>,
    sessions: SessionManager,
    audit: Arc<AuditLogger>,
    config_path: String,
    /// Local signup accounts (separate from the shared admin/guest passwords).
    users: UserStore,
    /// Process-local secret signing proof-of-work challenges — see `pow.rs`.
    pow_secret: pow::PowSecret,
    /// GeoIP database backing `geo_restriction.allowed_regions`, reloaded
    /// whenever the admin changes `geo_restriction.mmdb_path` and saves.
    geo_db: geo::GeoIpDatabase,
    /// Files uploaded via the OctoPrint-compat shim, awaiting a human to
    /// confirm the print through the web UI — see `pending_uploads.rs`.
    pending_uploads: PendingUploadQueue,
}

#[tokio::main]
async fn main() {
    // Initialize logging
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    tracing_subscriber::registry()
        .with(fmt::layer())
        .with(filter)
        .init();

    info!("Starting Klipper Guest Access Portal backend...");

    // Load or create config
    let config_path_buf = get_project_file_path("config.toml");
    let config_path = config_path_buf.to_str().unwrap_or("config.toml").to_string();
    let config = match Config::load_from_file(&config_path_buf).await {
        Ok(c) => {
            info!("Configuration loaded successfully from {}", config_path);
            c
        }
        Err(e) => {
            warn!(
                "Failed to load {}, creating default config: {:?}",
                config_path, e
            );
            let default_content = Config::get_default_config_content();
            if let Err(write_err) = fs::write(&config_path_buf, default_content).await {
                error!("Failed to write default config: {:?}", write_err);
            }
            Config::load_from_file(&config_path_buf)
                .await
                .expect("Failed to load default config")
        }
    };

    // Make sure content directory exists
    let content_dir = get_project_file_path("content");
    let _ = fs::create_dir_all(&content_dir).await;
    let rules_path = content_dir.join("rules.md");
    if !fs::try_exists(&rules_path).await.unwrap_or(false) {
        let default_rules = r#"# Regulament printare 3D

> [!WARNING]
> Cititi regulile inainte de a printa si nu fiti iresponsabili! Orice defectiune cauzata de utilizarea necorespunzatoare va fi suportata de utilizator.

## Reguli generale
1. **Verificati patul:** Asigurati-va ca patul este curat si nu contine resturi de la printuri anterioare.
2. **Nu lasati nesupravegheat:** Primele 3 straturi trebuie supravegheate obligatoriu.
3. **Nu modificati setarile fizice:** Nu atingeti curelele, suruburile sau axele imprimantei in timpul functionarii.
4. **Raportati erorile:** Daca auziti zgomote ciudate sau observati probleme de aderenta, dati **PAUSE** sau **CANCEL** si anuntati un administrator.
"#;
        let _ = fs::write(&rules_path, default_rules).await;
    }

    let troubleshooting_path = content_dir.join("troubleshooting.md");
    if !fs::try_exists(&troubleshooting_path).await.unwrap_or(false) {
        let default_troubleshooting = r#"# Instructiuni si depanare imprimanta 3D

## Cum se incarca un print
1. Pregatiti fisierul G-code folosind slicer-ul agreat (ex. PrusaSlicer / Cura).
2. Mergeti la tab-ul **Dashboard** si folositi zona de incarcare fisier.
3. Odata incarcat fisierul, puteti porni printarea.

## Ce fac in caz de...
* **Filamentul nu adera la pat:** Dati pause, curatati patul cu alcool izopropilic si reluati printarea.
* **Filamentul nu curge:** Verificati daca temperatura este corespunzatoare materialului folosit.
* **Eroare conexiune:** Verificati daca imprimanta este pornita si conectata la reteaua locala.
"#;
        let _ = fs::write(&troubleshooting_path, default_troubleshooting).await;
    }

    // Initialize Moonraker client
    let moonraker = Arc::new(MoonrakerClient::new(
        config.moonraker.url.clone(),
        config.moonraker.api_key.clone(),
    ));

    // Start background WebSocket connection to Moonraker
    moonraker.clone().start_monitoring();

    let audit_path = std::env::var_os("KLIPPER_AUDIT_DB_PATH")
        .filter(|value| !value.is_empty())
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| get_project_file_path(config.audit.database_path.clone()));
    let audit = Arc::new(AuditLogger::new(audit_path));
    match audit.init().await {
        Ok(()) => info!("Audit logging initialized at {}", audit.db_path().display()),
        Err(e) => error!("Audit logging disabled: {e}"),
    }

    let users_path = get_project_file_path(config.signup.database_path.clone());
    let users = UserStore::new(users_path);
    match users.init().await {
        Ok(()) => info!("Local signup accounts initialized at {}", users.db_path().display()),
        Err(e) => error!("Local signup account store disabled: {e}"),
    }

    let geo_db = geo::GeoIpDatabase::empty();
    if !config.geo_restriction.mmdb_path.trim().is_empty() {
        geo_db.reload(&config.geo_restriction.mmdb_path);
    }

    let pending_uploads_path = get_project_file_path("data/pending_uploads.sqlite");
    let pending_uploads = PendingUploadQueue::new(pending_uploads_path);
    match pending_uploads.init().await {
        Ok(()) => info!(
            "Pending-uploads queue initialized at {}",
            pending_uploads.db_path().display()
        ),
        Err(e) => error!("Pending-uploads queue disabled: {e}"),
    }

    let state = Arc::new(AppState {
        config: Arc::new(ArcSwap::from_pointee(config)),
        moonraker,
        sessions: SessionManager::new(),
        audit,
        config_path,
        users,
        pow_secret: pow::PowSecret::generate(),
        geo_db,
        pending_uploads,
    });

    // Build routes with explicit state type
    let api_routes: Router<Arc<AppState>> = Router::new()
        .route("/config", get(get_portal_config))
        .route("/health", get(get_health))
        .route("/logo/light", get(serve_logo_light))
        .route("/logo/dark", get(serve_logo_dark))
        .route("/branding/logo-light", get(serve_branding_logo_light))
        .route("/branding/logo-dark", get(serve_branding_logo_dark))
        .route("/branding/favicon", get(serve_branding_favicon))
        .route("/branding/danger-image", get(serve_branding_danger_image))
        .route("/branding/:kind/:lang", get(serve_branding_asset_lang))
        .route("/footer-link-icon/:id", get(serve_footer_link_icon))
        .route(
            "/admin/footer-link-icon/:id",
            post(upload_footer_link_icon),
        )
        .route("/status", get(get_status))
        .route("/server/info", get(get_server_info))
        .route(
            "/admin/config",
            get(get_admin_config).put(save_admin_config),
        )
        .route(
            "/admin/branding/logo-light",
            post(upload_branding_logo_light),
        )
        .route("/admin/branding/logo-dark", post(upload_branding_logo_dark))
        .route("/admin/branding/favicon", post(upload_branding_favicon))
        .route(
            "/admin/branding/danger-image",
            post(upload_branding_danger_image),
        )
        .route("/admin/branding/font", post(upload_branding_font))
        .route("/branding/font", get(serve_branding_font))
        .route(
            "/admin/branding/:kind/:lang",
            post(upload_branding_asset_lang),
        )
        .route("/admin/password", post(change_admin_password))
        .route("/admin/audit", get(get_admin_audit))
        .route("/admin/macros", get(get_admin_macros))
        .route("/auth/login", post(login))
        .route("/auth/signup", post(signup))
        .route("/auth/verify-email", get(verify_email))
        .route("/auth/pow-challenge", get(get_pow_challenge))
        .route("/auth/me", get(auth_me))
        .route("/auth/logout", post(logout))
        .route("/admin/users", get(admin_list_users).post(admin_create_user))
        .route("/admin/users/:email", delete(admin_delete_user))
        .route("/admin/users/:email/group", post(admin_set_user_group))
        .route(
            "/admin/users/:email/resend-verification",
            post(admin_resend_verification),
        )
        .route("/content/rules", get(get_rules))
        .route("/content/troubleshooting", get(get_troubleshooting))
        .route("/print/upload", post(upload_gcode))
        .route("/files/list", get(list_files))
        .route(
            "/files/directory",
            get(list_directory)
                .post(create_directory)
                .delete(delete_directory),
        )
        .route("/files/raw/*path", get(read_file_raw))
        .route("/files/download/*path", get(download_file))
        .route("/files/thumbnail/*path", get(serve_thumbnail))
        .route("/files/upload", post(upload_file))
        .route("/files/move", post(move_file))
        .route("/files/copy", post(copy_file))
        .route("/files/file/*path", delete(delete_file))
        .route("/files/zip", post(zip_files))
        .route("/files/gcodes", get(list_gcode_files))
        .route("/files/metadata", get(get_file_metadata))
        .route(
            "/files/gcodes/*path",
            get(get_gcode_file).delete(delete_gcode_file),
        )
        .route("/print/start", post(start_print))
        .route("/print/pause", post(pause_print))
        .route("/print/resume", post(resume_print))
        .route("/print/cancel", post(cancel_print))
        .route("/print/emergency_stop", post(emergency_stop))
        .route("/console/send", post(send_console_command))
        .route("/console/commands", get(get_console_commands))
        .route("/announcements", get(get_announcements))
        .route("/power/devices", get(get_power_devices))
        .route("/power/device", post(set_power_device))
        .route("/machine/reboot", post(machine_reboot))
        .route("/machine/shutdown", post(machine_shutdown))
        .route("/machine/update/status", get(get_update_status))
        .route("/machine/update", post(machine_update))
        .route("/machine/services", get(get_services))
        .route("/machine/services/action", post(service_action))
        .route("/machine/endstops", get(query_endstops))
        .route("/machine/system", get(get_machine_system))
        .route("/history", get(get_print_history))
        .route("/job_queue", get(get_job_queue))
        .route("/job_queue/add", post(job_queue_add))
        .route("/job_queue/delete", post(job_queue_delete))
        .route("/job_queue/state", post(job_queue_state))
        .route("/fan", post(set_fan_speed))
        .route("/extrude", post(extrude))
        .route("/probe", post(manual_probe))
        .route("/retraction", post(set_retraction))
        .route("/limits", post(set_velocity_limits))
        .route("/flow", post(set_flow_factor))
        .route("/aux/fan", post(set_aux_fan))
        .route("/aux/pin", post(set_aux_pin))
        .route("/aux/led", post(set_aux_led))
        .route("/aux/heater", post(set_aux_heater))
        .route("/aux/tmc", post(set_tmc_current))
        .route("/exclude_object", post(exclude_object))
        .route("/config_files", get(list_config_files))
        .route(
            "/config_files/*path",
            get(read_config_file).put(write_config_file),
        )
        .route("/macro/run", post(run_macro))
        .route("/preheat", post(preheat))
        .route("/move", post(move_jog))
        .route("/move_to", post(move_to))
        .route("/motors/disable", post(disable_motors))
        .route("/target_temp", post(set_target_temp))
        .route("/speed_factor", post(set_speed_factor))
        .route("/temperature_store", get(get_temperature_store))
        .route("/ws", get(ws_handler))
        // OctoPrint-compatible shim for slicers' "Print Host Upload" feature
        // (OrcaSlicer, PrusaSlicer, Cura) — see handlers/octoprint_compat.rs.
        .route("/version", get(octoprint_version))
        .route("/files/local", post(octoprint_upload_file))
        // Web-UI-facing pending-uploads queue — see handlers/pending_uploads.rs.
        // Confirming a queued file uses the existing /print/start above, not
        // a dedicated endpoint.
        .route("/pending-uploads", get(list_pending_uploads))
        .route("/pending-uploads/:id/cancel", post(cancel_pending_upload))
        .route("/pending-uploads/:id/thumbnail", get(pending_upload_thumbnail))
        // Hard safety ceiling, not the real limit — each group's
        // `max_upload_mb` (default 250MB, `None` = unlimited) is enforced
        // per-request by `SafetyManager::validate_upload` afterwards. axum
        // has no default body-size limit at all: without this, a multipart
        // upload of any size gets fully buffered into memory (via
        // `field.bytes()`) before that check ever runs, which is an
        // unbounded-memory DoS vector open to anyone who can reach the
        // upload endpoints. 2GB comfortably covers even large multi-plate
        // G-code files while still bounding the worst case.
        .layer(axum::extract::DefaultBodyLimit::max(2 * 1024 * 1024 * 1024));

    // No CORS layer: the frontend is always served from this same axum app
    // (production: SPA fallback below; dev: Vite's server-side proxy at
    // vite.config.ts, itself same-origin from the browser's perspective) —
    // there's no legitimate cross-origin browser caller. Omitting the layer
    // means the browser's default same-origin policy applies, rather than
    // opting every response into `Access-Control-Allow-Origin: *`.
    let app = Router::new()
        .merge(
            utoipa_swagger_ui::SwaggerUi::new("/swagger-ui")
                .url("/api-docs/openapi.json", ApiDoc::openapi()),
        )
        .nest("/api", api_routes)
        .fallback_service(
            ServeDir::new(detect_frontend_dist_path()).fallback(ServeFile::new(detect_frontend_dist_path().join("index.html"))),
        )
        .with_state(state.clone());

    let runtime_config = state.config.load();
    let addr = SocketAddr::new(
        runtime_config
            .server
            .host
            .parse()
            .unwrap_or([127, 0, 0, 1].into()),
        runtime_config.server.port,
    );

    info!("Listening on http://{}", addr);
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .await
    .unwrap();
}

// Helpers for Auth/Role validation from Cookies

/// Resolves the caller's `Identity` from their session cookie, the entry
/// point nearly every handler starts with. Precedence: (1) a valid
/// `session_token` cookie always wins, regardless of what role it carries;
/// (2) `requires_admin=true` with no valid admin session is a hard reject
/// (`FORBIDDEN` if the session exists but isn't admin, `UNAUTHORIZED` if
/// there's no session at all — the two are deliberately different so a
/// logged-in non-admin gets a different signal than a logged-out caller);
/// (3) otherwise, no session falls back to `anonymous_identity()`. `_config`
/// is currently unused but kept in the signature so every call site already
/// has it in scope for when per-deployment auth policy needs it here.
///
/// Most handlers should use the `AuthedIdentity`/`AdminIdentity` extractors
/// instead of calling this directly — they wrap exactly this logic. The
/// handlers that still call it directly do so because they can't use a
/// plain extractor: `get_admin_config`/`save_admin_config`/
/// `change_admin_password` record a failed-auth audit entry (with the
/// rejected status code) before returning, which an extractor's rejection
/// path has no handler-specific context to do; `file_transfer` and
/// `upload_branding_asset` are plain helper functions shared by several
/// route handlers, not routes themselves, so axum never runs extractors
/// against them at all.
async fn check_authorized_action(
    cookies: &CookieJar,
    sessions: &SessionManager,
    _config: &Config,
    _requires_admin: bool,
) -> Result<Identity, StatusCode> {
    // A valid session cookie determines the caller's identity.
    if let Some(token) = cookies.get("session_token").map(|c| c.value()) {
        if let Some(identity) = sessions.validate_session(token).await {
            if _requires_admin && !matches!(identity.role, UserRole::Admin) {
                return Err(StatusCode::FORBIDDEN);
            }
            return Ok(identity);
        }
    }

    if _requires_admin {
        return Err(StatusCode::UNAUTHORIZED);
    }

    Ok(anonymous_identity())
}

/// Axum extractor form of `check_authorized_action(.., requires_admin=false)`
/// — resolves the caller's identity (or falls back to `anonymous_identity()`)
/// without requiring any particular role. Declare `identity: AuthedIdentity`
/// as a handler parameter instead of the old boilerplate:
/// ```ignore
/// let config = state.config.load();
/// let role = match check_authorized_action(&jar, &state.sessions, &config, false).await {
///     Ok(r) => r,
///     Err(s) => return s.into_response(),
/// };
/// ```
/// `Deref<Target = Identity>` means `identity.role`/`&identity` work exactly
/// like the old local `role: Identity` did — no `.0` needed at call sites.
struct AuthedIdentity(Identity);

impl std::ops::Deref for AuthedIdentity {
    type Target = Identity;
    fn deref(&self) -> &Identity {
        &self.0
    }
}

#[axum::async_trait]
impl axum::extract::FromRequestParts<Arc<AppState>> for AuthedIdentity {
    type Rejection = Response;

    async fn from_request_parts(
        parts: &mut axum::http::request::Parts,
        state: &Arc<AppState>,
    ) -> Result<Self, Self::Rejection> {
        let jar = CookieJar::from_headers(&parts.headers);
        let config = state.config.load();
        match check_authorized_action(&jar, &state.sessions, &config, false).await {
            Ok(identity) => Ok(AuthedIdentity(identity)),
            Err(status) => Err(status.into_response()),
        }
    }
}

/// Axum extractor form of `check_authorized_action(.., requires_admin=true)`
/// — rejects with 401/403 (see `check_authorized_action`'s doc comment for
/// which) unless the caller has a valid admin session. Declare
/// `admin: AdminIdentity` as a handler parameter for any admin-only route.
struct AdminIdentity(Identity);

impl std::ops::Deref for AdminIdentity {
    type Target = Identity;
    fn deref(&self) -> &Identity {
        &self.0
    }
}

#[axum::async_trait]
impl axum::extract::FromRequestParts<Arc<AppState>> for AdminIdentity {
    type Rejection = Response;

    async fn from_request_parts(
        parts: &mut axum::http::request::Parts,
        state: &Arc<AppState>,
    ) -> Result<Self, Self::Rejection> {
        let jar = CookieJar::from_headers(&parts.headers);
        let config = state.config.load();
        match check_authorized_action(&jar, &state.sessions, &config, true).await {
            Ok(identity) => Ok(AdminIdentity(identity)),
            Err(status) => Err(status.into_response()),
        }
    }
}

/// The identity for a caller with no session cookie at all. A guest password
/// no longer implies a locked portal on its own — the "anonymous" group's
/// permissions (editable in the admin panel) now control what an anonymous
/// caller can see/do. Deployments that want a fully locked portal should zero
/// out the anonymous group's permissions rather than relying on this identity.
///
/// Every anonymous-fallback call site must go through this function rather
/// than constructing an `Identity` inline — `Identity::guest(..)` sets
/// `role: UserRole::Guest`, which `resolve_permissions` maps to the *"guest"*
/// group, not "anonymous"; using it here previously made unauthenticated
/// visitors silently inherit the guest-password group's permissions instead.
fn anonymous_identity() -> Identity {
    Identity {
        role: UserRole::Group("anonymous".to_string()),
        email: None,
        display_name: None,
        auth_source: "anonymous".to_string(),
    }
}

/// Returns the Identity from the session cookie, or None if no valid session exists.
async fn get_session_identity(cookies: &CookieJar, sessions: &SessionManager) -> Option<Identity> {
    let token = cookies.get("session_token")?.value();
    sessions.validate_session(token).await
}

/// Returns the effective permissions for an identity by looking up their
/// resolved group id in `config.groups` (which always contains the built-in
/// "anonymous"/"guest"/"admin" groups — seeded by `Config::migrate_legacy_groups`
/// if missing). `UserRole::Guest` (the guest-password login flow) and
/// `UserRole::Group("anonymous"|"guest"|...)` all resolve through this same path;
/// an unmatched/deleted group id falls back to "anonymous" rather than panicking.
fn resolve_permissions<'a>(identity: &Identity, config: &'a Config) -> &'a config::PermissionsConfig {
    let id = match identity.role {
        UserRole::Group(ref name) => name.as_str(),
        UserRole::Guest => "guest",
        UserRole::Admin => "admin",
        UserRole::User => "guest",
    };
    if let Some(g) = config.groups.iter().find(|g| g.id == id) {
        return &g.permissions;
    }
    config
        .groups
        .iter()
        .find(|g| g.id == "anonymous")
        .map(|g| &g.permissions)
        .unwrap_or_else(|| {
            config
                .groups
                .first()
                .map(|g| &g.permissions)
                .expect("Config::migrate_legacy_groups guarantees at least one group")
        })
}

/// Gates a single action behind a permission predicate. `UserRole::Admin`
/// always bypasses `allowed_fn` entirely (admins are never subject to
/// per-group limits, even ones stored on the "admin" group for display
/// purposes) — everyone else is checked against their resolved group's
/// `PermissionsConfig` via `resolve_permissions`.
fn require_permission(identity: &Identity, config: &Config, allowed_fn: impl Fn(&config::PermissionsConfig) -> bool) -> Result<(), Response> {
    if matches!(identity.role, UserRole::Admin) || allowed_fn(resolve_permissions(identity, config)) {
        Ok(())
    } else {
        Err((
            StatusCode::FORBIDDEN,
            "Această acțiune nu este permisă de configurație",
        )
            .into_response())
    }
}

fn audit_role(identity: &Identity) -> String {
    identity.role.as_str().to_string()
}

/// The actual person behind an audit entry, when one exists — a local
/// signup account's email. `None` for the shared admin/guest passwords
/// (there's no individual identity beyond the role itself for those) and
/// `anonymous_identity()`. Pass alongside `audit_role` to every
/// `state.audit.record(...)` call so the admin audit log can show who did
/// something, not just what role they were acting as.
fn audit_identity(identity: &Identity) -> Option<String> {
    identity.email.clone()
}

/// Fetches the current printer state and rejects with 400 if Klipper/Moonraker
/// isn't connected. Used by every handler that needs to talk to the printer
/// (jog, home, print control, ...) — was 14 verbatim-duplicated call sites.
async fn require_printer_connected(
    state: &AppState,
) -> Result<NormalizedPrinterState, Response> {
    let st = state.moonraker.get_state().read().await.clone();
    if st.connection_state != "connected" {
        return Err((
            StatusCode::BAD_REQUEST,
            "Imprimanta este oprită sau deconectată",
        )
            .into_response());
    }
    Ok(st)
}

// --- Route Handlers ---

#[utoipa::path(
    get,
    path = "/api/config",
    responses(
        (status = 200, description = "Configurare portal incarcata cu succes", body = PortalConfigResponse)
    )
)]
async fn get_portal_config(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
) -> Json<PortalConfigResponse> {
    let config = state.config.load();
    let guest_auth_required = config.auth.guest_password_hash.is_some()
        && !config.auth.guest_password_hash.as_ref().unwrap().is_empty();

    // Resolve session so we can return the caller's effective permissions.
    let identity = get_session_identity(&jar, &state.sessions).await;
    let effective_permissions = if let Some(ref id) = identity {
        resolve_permissions(id, &config).clone()
    } else {
        resolve_permissions(&anonymous_identity(), &config).clone()
    };

    let mut webcams = config.webcams.clone();
    if let Ok(mut moonraker_cams) = state.moonraker.get_webcams().await {
        webcams.append(&mut moonraker_cams);
    }

    Json(PortalConfigResponse {
        app_name: config.branding.app_name.clone(),
        organization_name: config.branding.organization_name.clone(),
        logo_light: config.branding.logo_light.clone(),
        logo_dark: config.branding.logo_dark.clone(),
        favicon: config.branding.favicon.clone(),
        danger_image: config.branding.danger_image.clone(),
        moron_warning_text: config.branding.moron_warning_text.clone(),
        theme: ThemeConfigResponse {
            font_family: config.theme.font_family.clone(),
            font_url: config.theme.font_url.clone(),
        },
        limits: LimitsConfigResponse {
            max_speed_factor: effective_permissions.max_speed_factor,
            max_upload_mb: effective_permissions.max_upload_mb,
            allow_movement_while_printing: effective_permissions.allow_movement_while_printing,
            allow_home_for_guests: effective_permissions.allow_home_for_guests,
            max_jog_step: effective_permissions.max_jog_step,
        },
        preheat_presets: config.preheat.clone(),
        allowed_macros: effective_permissions.allowed_macros.clone(),
        guest_auth_required,
        mainsail_url: config.mainsail.as_ref().map(|m| m.url.clone()),
        fluidd_url: config.fluidd.as_ref().map(|service| service.url.clone()),
        octoprint_url: config.octoprint.as_ref().map(|service| service.url.clone()),
        moonraker_url: Some(config.moonraker.url.clone()),
        webcams,
        permissions: effective_permissions,
        footer_links: {
            let mut links = config.footer_links.clone();
            links.sort_by_key(|l| l.order);
            links
        },
        auth: PublicAuthConfigResponse {
            signup_enabled: config.signup.enabled,
            signup_allowed_domains: config.signup.allowed_domains.clone(),
            signup_requires_pow: config.signup.require_pow_challenge,
        },
    })
}

async fn get_health(State(state): State<Arc<AppState>>) -> Response {
    let config = state.config.load();
    Json(HealthResponse {
        status: "ok".to_string(),
        app: "klipper-mainpage".to_string(),
        api_version: env!("CARGO_PKG_VERSION").to_string(),
        admin_config_route: true,
        signup_enabled: config.signup.enabled,
    })
    .into_response()
}

#[utoipa::path(
    get,
    path = "/api/status",
    responses(
        (status = 200, description = "Status imprimantă curent", body = NormalizedPrinterState)
    )
)]
async fn get_status(State(state): State<Arc<AppState>>, jar: CookieJar) -> Response {
    let config = state.config.load();
    let identity = get_session_identity(&jar, &state.sessions)
        .await
        .unwrap_or_else(anonymous_identity);
    if let Err(r) = require_permission(&identity, &config, |p| p.view_status) {
        return r;
    }
    let st = state.moonraker.get_state().read().await.clone();
    Json(st).into_response()
}

/// Proxy Moonraker server/info metadata for components and registered roots.
async fn get_server_info(State(state): State<Arc<AppState>>, identity: AuthedIdentity) -> Response {
    let config = state.config.load();
    let role = identity.0;
    if let Err(r) = require_permission(&role, &config, |p| p.view_status) {
        return r;
    }

    match state.moonraker.get_server_info().await {
        Ok(body) => {
            let result = body.get("result").cloned().unwrap_or(body);
            Json(json!({
                "components": result.get("components").cloned().unwrap_or(serde_json::Value::Array(vec![])),
                "registered_directories": result.get("registered_directories").cloned().unwrap_or(serde_json::Value::Array(vec![])),
                "warnings": result.get("warnings").cloned().unwrap_or(serde_json::Value::Array(vec![])),
                "version": result.get("version").cloned().unwrap_or(serde_json::Value::Null),
                "moonraker_version": result.get("moonraker_version").cloned().unwrap_or(serde_json::Value::Null),
            }))
            .into_response()
        }
        Err(e) => (StatusCode::BAD_GATEWAY, e.to_string()).into_response(),
    }
}


/// Marker returned in place of a stored password hash. The frontend treats this
/// as "a password is configured" and never sends it back as a real credential.
const SECRET_PLACEHOLDER: &str = "__set__";



#[derive(serde::Deserialize)]
struct PasswordChangeRequest {
    /// Which credential to change: "admin" or "guest".
    scope: String,
    /// The admin's current password, re-verified for every change (defends
    /// against a walk-up on an unlocked admin session).
    #[serde(default)]
    current_password: String,
    /// New password. Empty is only valid for scope="guest" and disables the
    /// guest password (portal becomes open to anonymous guests).
    #[serde(default)]
    new_password: String,
}


#[derive(serde::Deserialize)]
struct AuditQuery {
    limit: Option<u32>,
}



#[derive(serde::Deserialize, utoipa::ToSchema)]
struct LoginPayload {
    /// The reserved names "admin"/"guest" (case-insensitive) and the empty
    /// string all resolve through the shared admin/guest password login
    /// (password alone determines which, same as before this field existed).
    /// Any other value is looked up as a local signup account's email.
    #[serde(default)]
    username: Option<String>,
    password: String,
}







#[derive(serde::Deserialize, utoipa::IntoParams)]
struct ContentQuery {
    /// Language code (ro / en)
    lang: Option<String>,
}





/// Reject path traversal / absolute paths in config file names.
#[derive(serde::Deserialize)]
struct FileRootQuery {
    root: Option<String>,
    path: Option<String>,
}

#[derive(serde::Deserialize)]
struct FileDeleteQuery {
    root: Option<String>,
    path: Option<String>,
    force: Option<bool>,
}











#[derive(serde::Deserialize)]
struct DirectoryPayload {
    root: Option<String>,
    path: String,
}


#[derive(serde::Deserialize)]
struct FileMovePayload {
    source_root: Option<String>,
    source: String,
    dest_root: Option<String>,
    dest: String,
}






#[derive(serde::Deserialize)]
struct ZipPayload {
    root: Option<String>,
    items: Vec<String>,
    destination: Option<String>,
    store_only: Option<bool>,
}




#[derive(serde::Deserialize)]
struct ConfigFileWritePayload {
    content: String,
}


#[derive(serde::Deserialize)]
struct MetadataQuery {
    filename: String,
}





#[derive(serde::Deserialize, serde::Serialize, utoipa::ToSchema)]
struct FilePayload {
    filename: String,
}






#[derive(serde::Deserialize, utoipa::ToSchema)]
struct MacroPayload {
    macro_name: String,
}

#[derive(serde::Deserialize, utoipa::ToSchema)]
struct ConsoleCommandPayload {
    command: String,
}





#[derive(serde::Deserialize, utoipa::ToSchema)]
struct PowerDevicePayload {
    device: String,
    action: String,
}








#[derive(serde::Deserialize)]
struct ServiceActionPayload {
    service: String,
    action: String,
}


/// Update-manager status (component versions + update availability). Gated by
/// control_machine.
#[derive(serde::Deserialize)]
struct UpdateStatusQuery {
    refresh: Option<bool>,
}


#[derive(serde::Deserialize)]
struct UpdatePayload {
    component: Option<String>,
    name: Option<String>,
    client: Option<String>,
    action: Option<String>,
    hard: Option<bool>,
}


#[derive(serde::Deserialize)]
struct HistoryQuery {
    limit: Option<u32>,
}



#[derive(serde::Deserialize)]
struct JobQueueAddPayload {
    filenames: Vec<String>,
}

#[derive(serde::Deserialize)]
struct JobQueueDeletePayload {
    #[serde(default)]
    job_ids: Vec<String>,
    #[serde(default)]
    all: bool,
}

#[derive(serde::Deserialize)]
struct JobQueueStatePayload {
    pause: bool,
}




#[derive(serde::Deserialize)]
struct FanSpeedPayload {
    /// Target part-cooling fan speed, 0.0–1.0.
    speed: f64,
}


#[derive(serde::Deserialize)]
struct ProbePayload {
    /// "testz", "accept", or "abort".
    action: String,
    #[serde(default)]
    delta: f64,
}


#[derive(serde::Deserialize)]
struct ExtrudePayload {
    /// Filament length in mm. Positive = extrude, negative = retract.
    length: f64,
    /// Feedrate in mm/s.
    speed: f64,
}


#[derive(serde::Deserialize)]
struct FlowPayload {
    /// Extrusion factor as a percentage (e.g. 100.0).
    factor: f64,
}


#[derive(serde::Deserialize)]
struct LimitsPayload {
    velocity: f64,
    accel: f64,
    square_corner_velocity: f64,
    minimum_cruise_ratio: f64,
}


#[derive(serde::Deserialize)]
struct RetractionPayload {
    retract_length: f64,
    retract_speed: f64,
    unretract_extra_length: f64,
    unretract_speed: f64,
}




#[derive(serde::Deserialize)]
struct ExcludeObjectPayload {
    name: String,
}


#[derive(serde::Deserialize)]
struct TmcCurrentPayload {
    /// The stepper name (e.g. "stepper_x").
    stepper: String,
    current: f64,
}


#[derive(serde::Deserialize)]
struct AuxHeaterPayload {
    name: String,
    target: f64,
}


#[derive(serde::Deserialize)]
struct AuxFanPayload {
    name: String,
    speed: f64,
}


#[derive(serde::Deserialize)]
struct AuxPinPayload {
    name: String,
    value: f64,
}


#[derive(serde::Deserialize)]
struct AuxLedPayload {
    name: String,
    red: f64,
    green: f64,
    blue: f64,
    #[serde(default)]
    white: f64,
}



#[derive(serde::Deserialize, utoipa::ToSchema)]
struct PreheatPayload {
    preset: String,
}


#[derive(serde::Deserialize, utoipa::ToSchema)]
struct TargetTempPayload {
    heater: String,
    target: f64,
}


#[derive(serde::Deserialize, utoipa::ToSchema)]
struct JogPayload {
    axis: String,
    distance: f64,
}


#[derive(serde::Deserialize, utoipa::ToSchema)]
struct MoveToPayload {
    axis: String,
    position: f64,
}



#[derive(serde::Deserialize, utoipa::ToSchema)]
struct SpeedFactorPayload {
    factor: f64,
}

async fn get_temperature_store(State(state): State<Arc<AppState>>) -> Response {
    match state.moonraker.get_temperature_store().await {
        Ok(body) => (StatusCode::OK, [("content-type", "application/json")], body).into_response(),
        Err(e) => (StatusCode::BAD_GATEWAY, e.to_string()).into_response(),
    }
}

async fn ws_handler(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
    ws: WebSocketUpgrade,
) -> impl IntoResponse {
    // Resolved once at upgrade time, same as any REST request's permission
    // check — this used to be skipped entirely, so a group with view_status
    // turned off in the admin panel still received every PrinterState update
    // over the WS channel regardless (REST's /api/status enforces it; WS
    // didn't, which was the actual enforcement gap, not just an inconsistency).
    let config = state.config.load();
    let identity = get_session_identity(&jar, &state.sessions)
        .await
        .unwrap_or_else(anonymous_identity);
    let can_view_status = require_permission(&identity, &config, |p| p.view_status).is_ok();
    ws.on_upgrade(move |socket| handle_frontend_ws(socket, state, can_view_status))
}

async fn handle_frontend_ws(mut socket: WebSocket, state: Arc<AppState>, can_view_status: bool) {
    let mut rx = state.moonraker.subscribe_updates();

    if can_view_status {
        let initial_state = state.moonraker.get_state().read().await.clone();
        if let Ok(txt) = serde_json::to_string(&BackendWsEvent::PrinterState(initial_state)) {
            if socket.send(WsMessage::Text(txt)).await.is_err() {
                return;
            }
        }
    }

    loop {
        tokio::select! {
            update_res = rx.recv() => {
                match update_res {
                    Ok(event) => {
                        // Every other event (file list / update-manager / config
                        // changed) carries no printer telemetry and stays
                        // ungated; only PrinterState is behind view_status.
                        if !can_view_status && matches!(event, BackendWsEvent::PrinterState(_)) {
                            continue;
                        }
                        if let Ok(txt) = serde_json::to_string(&event) {
                            if socket.send(WsMessage::Text(txt)).await.is_err() {
                                break;
                            }
                        }
                    }
                    Err(e) => {
                        error!("WS broadcast channel lag/error: {:?}", e);
                    }
                }
            }
            msg = socket.recv() => {
                if msg.is_none() {
                    break;
                }
            }
        }
    }
}

/// Known UI languages plus the "default" fallback slot.
const BRANDING_LANGS: [&str; 4] = ["default", "en", "ro", "pl"];









/// Serves a branding value that's either a bundled asset's relative disk path
/// (the pre-upload default, e.g. "assets/logo/Foo.png") or one of our own
/// uploaded-asset stable URLs (translated back to its disk path).






const BRANDING_DIR: &str = "assets/branding";
const BRANDING_FONT_PATH: &str = "assets/branding/font";
const BRANDING_FONT_URL: &str = "/api/branding/font";
const FOOTER_LINK_ICON_DIR: &str = "assets/footer-links";














#[derive(serde::Serialize, utoipa::ToSchema)]
struct PortalConfigResponse {
    /// Keyed by language code + "default" fallback.
    app_name: std::collections::HashMap<String, String>,
    organization_name: std::collections::HashMap<String, String>,
    logo_light: std::collections::HashMap<String, String>,
    logo_dark: std::collections::HashMap<String, String>,
    favicon: std::collections::HashMap<String, String>,
    danger_image: std::collections::HashMap<String, String>,
    moron_warning_text: std::collections::HashMap<String, String>,
    theme: ThemeConfigResponse,
    limits: LimitsConfigResponse,
    preheat_presets: std::collections::HashMap<String, config::PreheatPreset>,
    allowed_macros: Vec<String>,
    guest_auth_required: bool,
    mainsail_url: Option<String>,
    fluidd_url: Option<String>,
    octoprint_url: Option<String>,
    moonraker_url: Option<String>,
    webcams: Vec<config::WebcamConfig>,
    permissions: config::PermissionsConfig,
    auth: PublicAuthConfigResponse,
    footer_links: Vec<config::FooterLink>,
}

#[derive(serde::Serialize, utoipa::ToSchema)]
struct PublicAuthConfigResponse {
    signup_enabled: bool,
    signup_allowed_domains: Vec<String>,
    signup_requires_pow: bool,
}

#[derive(serde::Serialize, utoipa::ToSchema)]
struct HealthResponse {
    status: String,
    app: String,
    api_version: String,
    admin_config_route: bool,
    signup_enabled: bool,
}

#[derive(serde::Serialize, utoipa::ToSchema)]
struct ThemeConfigResponse {
    font_family: String,
    font_url: Option<String>,
}

#[derive(serde::Serialize, utoipa::ToSchema)]
struct LimitsConfigResponse {
    /// `null` = unlimited for the caller's resolved group.
    max_speed_factor: Option<f64>,
    max_upload_mb: Option<u64>,
    allow_movement_while_printing: bool,
    allow_home_for_guests: bool,
    max_jog_step: Option<f64>,
}

#[derive(serde::Serialize, utoipa::ToSchema)]
struct LoginResponse {
    role: String,
    email: Option<String>,
    display_name: Option<String>,
    auth_source: String,
}

#[derive(serde::Serialize, utoipa::ToSchema)]
struct AuthMeResponse {
    role: Option<String>,
    roles: Vec<String>,
    authenticated: bool,
    email: Option<String>,
    display_name: Option<String>,
    auth_source: Option<String>,
}

impl AuthMeResponse {
    fn from_identity(identity: Option<&Identity>) -> Self {
        match identity {
            Some(identity) => Self {
                role: Some(identity.role.as_str().to_string()),
                roles: vec![identity.role.as_str().to_string()],
                authenticated: !matches!(identity.role, UserRole::Guest),
                email: identity.email.clone(),
                display_name: identity.display_name.clone(),
                auth_source: Some(identity.auth_source.clone()),
            },
            None => Self {
                role: None,
                roles: Vec::new(),
                authenticated: false,
                email: None,
                display_name: None,
                auth_source: None,
            },
        }
    }
}

#[derive(serde::Serialize, utoipa::ToSchema)]
struct StatusResponse {
    status: String,
}

#[derive(serde::Serialize, utoipa::ToSchema)]
struct ContentResponse {
    html: String,
}

#[derive(OpenApi)]
#[openapi(
    paths(
        get_portal_config,
        get_status,
        login,
        logout,
        get_rules,
        get_troubleshooting,
        upload_gcode,
        get_gcode_file,
        start_print,
        pause_print,
        resume_print,
        cancel_print,
        emergency_stop,
        run_macro,
        preheat,
        move_jog,
        move_to,
        set_speed_factor,
    ),
    components(
        schemas(
            PortalConfigResponse,
            ThemeConfigResponse,
            LimitsConfigResponse,
            config::PreheatPreset,
            NormalizedPrinterState,
            LoginPayload,
            LoginResponse,
            StatusResponse,
            ContentResponse,
            FilePayload,
            MacroPayload,
            PreheatPayload,
            JogPayload,
            MoveToPayload,
            SpeedFactorPayload,
        )
    ),
    tags(
        (name = "Klipper Portal API", description = "Endpoints securizate pentru Klipper Guest Print Portal")
    )
)]
struct ApiDoc;

#[cfg(test)]
mod tests {
    use super::*;

    // ------------------------------------------------------------------
    // KLIPPER_PORTAL_HOME / KLIPPER_PORTAL_FRONTEND_DIST resolution — pure
    // functions taking the "env var value" as a parameter (see their doc
    // comments), so these never touch a real process-global env var and
    // can't race against other tests.
    // ------------------------------------------------------------------

    #[test]
    fn project_file_path_uses_the_override_root_when_given() {
        let home = std::ffi::OsStr::new("/etc/klipper-portal");
        let resolved = resolve_project_file_path(Some(home), "config.toml");
        assert_eq!(resolved, PathBuf::from("/etc/klipper-portal/config.toml"));
    }

    #[test]
    fn project_file_path_joins_nested_relative_paths_under_the_override_root() {
        let home = std::ffi::OsStr::new("/var/lib/klipper-portal");
        let resolved = resolve_project_file_path(Some(home), "content/rules.md");
        assert_eq!(
            resolved,
            PathBuf::from("/var/lib/klipper-portal/content/rules.md")
        );
    }

    #[test]
    fn project_file_path_falls_back_to_cwd_detection_without_an_override() {
        // No override: falls back to the existing CWD-based heuristic
        // (joins onto the current directory, descending into `backend/` if
        // present) rather than the bare relative path.
        let resolved = resolve_project_file_path(None, "config.toml");
        assert!(resolved.ends_with("config.toml"));
        assert_ne!(resolved, PathBuf::from("config.toml"));
    }

    #[test]
    fn frontend_dist_path_uses_the_override_when_given() {
        let dist = std::ffi::OsStr::new("/opt/klipper-portal/dist");
        let resolved = resolve_frontend_dist_path(Some(dist));
        assert_eq!(resolved, PathBuf::from("/opt/klipper-portal/dist"));
    }

    #[test]
    fn frontend_dist_path_falls_back_to_cwd_detection_without_an_override() {
        let resolved = resolve_frontend_dist_path(None);
        assert!(resolved.ends_with("dist") || resolved.ends_with("frontend/dist"));
    }

    fn valid_config() -> Config {
        let mut config: Config = toml::from_str(Config::get_default_config_content())
            .expect("default template must parse");
        config.groups = vec![
            config::GroupConfig {
                id: "anonymous".to_string(),
                display_name: "Anonymous".to_string(),
                emails: Vec::new(),
                permissions: config::PermissionsConfig::default(),
                built_in: true,
            },
            config::GroupConfig {
                id: "guest".to_string(),
                display_name: "Guest".to_string(),
                emails: Vec::new(),
                permissions: config::PermissionsConfig::default(),
                built_in: true,
            },
            config::GroupConfig {
                id: "admin".to_string(),
                display_name: "Administrator".to_string(),
                emails: Vec::new(),
                permissions: config::PermissionsConfig::unlimited(),
                built_in: true,
            },
        ];
        config
    }

    #[test]
    fn sanitize_footer_link_id_accepts_alnum_dash_underscore() {
        assert_eq!(
            sanitize_footer_link_id("github"),
            Some("github".to_string())
        );
        assert_eq!(
            sanitize_footer_link_id("my-link_1"),
            Some("my-link_1".to_string())
        );
    }

    #[test]
    fn sanitize_footer_link_id_rejects_empty_and_bad_chars() {
        assert_eq!(sanitize_footer_link_id(""), None);
        assert_eq!(sanitize_footer_link_id("../../etc/passwd"), None);
        assert_eq!(sanitize_footer_link_id("has space"), None);
        assert_eq!(sanitize_footer_link_id("has/slash"), None);
        assert_eq!(sanitize_footer_link_id(&"a".repeat(65)), None);
        assert_eq!(sanitize_footer_link_id(&"a".repeat(64)).is_some(), true);
    }

    #[test]
    fn validate_admin_config_accepts_valid_config() {
        assert!(validate_admin_config(&valid_config()).is_ok());
    }

    #[test]
    fn validate_admin_config_rejects_missing_builtin_group() {
        let mut config = valid_config();
        config.groups.retain(|g| g.id != "admin");
        assert!(validate_admin_config(&config).is_err());
    }

    #[test]
    fn validate_admin_config_rejects_anonymous_as_signup_default_group() {
        let mut config = valid_config();
        config.signup.default_group = "anonymous".to_string();
        assert!(validate_admin_config(&config).is_err());
    }

    #[test]
    fn validate_admin_config_rejects_duplicate_group_ids() {
        let mut config = valid_config();
        let mut dup = config.groups[0].clone();
        dup.display_name = "Duplicate".to_string();
        config.groups.push(dup);
        assert!(validate_admin_config(&config).is_err());
    }

    #[test]
    fn validate_admin_config_rejects_out_of_range_group_speed_factor() {
        let mut config = valid_config();
        config.groups[0].permissions.max_speed_factor = Some(9999.0);
        assert!(validate_admin_config(&config).is_err());
    }

    #[test]
    fn validate_admin_config_accepts_unlimited_group_speed_factor() {
        let mut config = valid_config();
        config.groups[0].permissions.max_speed_factor = None;
        assert!(validate_admin_config(&config).is_ok());
    }

    #[test]
    fn validate_admin_config_rejects_invalid_footer_link_id() {
        let mut config = valid_config();
        config.footer_links.push(config::FooterLink {
            id: "has space".to_string(),
            label: "Test".to_string(),
            url: "https://example.com".to_string(),
            icon_url: String::new(),
            order: 0,
        });
        assert!(validate_admin_config(&config).is_err());
    }

    #[test]
    fn validate_admin_config_rejects_footer_link_missing_url() {
        let mut config = valid_config();
        config.footer_links.push(config::FooterLink {
            id: "test".to_string(),
            label: "Test".to_string(),
            url: String::new(),
            icon_url: String::new(),
            order: 0,
        });
        assert!(validate_admin_config(&config).is_err());
    }

    #[test]
    fn validate_admin_config_rejects_duplicate_footer_link_ids() {
        let mut config = valid_config();
        for _ in 0..2 {
            config.footer_links.push(config::FooterLink {
                id: "dup".to_string(),
                label: "Test".to_string(),
                url: "https://example.com".to_string(),
                icon_url: String::new(),
                order: 0,
            });
        }
        assert!(validate_admin_config(&config).is_err());
    }

    #[test]
    fn resolve_permissions_falls_back_to_anonymous_for_unmatched_group() {
        let config = valid_config();
        let identity = Identity {
            role: UserRole::Group("deleted-group".to_string()),
            email: None,
            display_name: None,
            auth_source: "local".to_string(),
        };
        let perms = resolve_permissions(&identity, &config);
        let anon = config.groups.iter().find(|g| g.id == "anonymous").unwrap();
        assert_eq!(perms.view_status, anon.permissions.view_status);
    }

    #[test]
    fn resolve_permissions_guest_role_resolves_to_guest_group() {
        let mut config = valid_config();
        config
            .groups
            .iter_mut()
            .find(|g| g.id == "guest")
            .unwrap()
            .permissions
            .control_print = true;
        let identity = Identity {
            role: UserRole::Guest,
            email: None,
            display_name: None,
            auth_source: "local".to_string(),
        };
        let perms = resolve_permissions(&identity, &config);
        assert!(perms.control_print);
    }

    fn add_custom_group(config: &mut Config, id: &str, emails: &[&str]) {
        config.groups.push(config::GroupConfig {
            id: id.to_string(),
            display_name: id.to_string(),
            emails: emails.iter().map(|e| e.to_string()).collect(),
            permissions: config::PermissionsConfig::default(),
            built_in: false,
        });
    }

    #[test]
    fn resolve_permissions_matches_custom_group_by_id() {
        let mut config = valid_config();
        add_custom_group(&mut config, "lab-advanced", &["someone@uni.edu"]);
        config
            .groups
            .iter_mut()
            .find(|g| g.id == "lab-advanced")
            .unwrap()
            .permissions
            .control_print = true;

        let identity = Identity {
            role: UserRole::Group("lab-advanced".to_string()),
            email: Some("someone@uni.edu".to_string()),
            display_name: None,
            auth_source: "local_signup".to_string(),
        };
        let perms = resolve_permissions(&identity, &config);
        assert!(perms.control_print);
    }
}

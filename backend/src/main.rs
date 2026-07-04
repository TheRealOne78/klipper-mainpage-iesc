use axum::{
    extract::{
        ws::{Message as WsMessage, WebSocket, WebSocketUpgrade},
        Multipart, Path as AxumPath, Query, State,
    },
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use axum_extra::extract::cookie::{Cookie, CookieJar};
use pulldown_cmark::{html, Options, Parser};
use std::net::SocketAddr;
use std::path::Path;
use std::sync::Arc;
use time::Duration;
use tokio::fs;
use tower_http::cors::CorsLayer;
use tower_http::services::{ServeDir, ServeFile};
use tracing::{error, info, warn};
use tracing_subscriber::{fmt, prelude::*, EnvFilter};
use utoipa::OpenApi;

mod config;
mod moonraker;
mod security;

use config::Config;
use moonraker::{MoonrakerClient, NormalizedPrinterState};
use security::{SafetyManager, SessionManager, UserRole};

struct AppState {
    config: Config,
    moonraker: Arc<MoonrakerClient>,
    sessions: SessionManager,
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
    let config_path = "config.toml";
    let config = match Config::load_from_file(config_path).await {
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
            if let Err(write_err) = fs::write(config_path, default_content).await {
                error!("Failed to write default config: {:?}", write_err);
            }
            Config::load_from_file(config_path)
                .await
                .expect("Failed to load default config")
        }
    };

    // Make sure content directory exists
    let _ = fs::create_dir_all("content").await;
    let rules_path = Path::new("content/rules.md");
    if !fs::try_exists(rules_path).await.unwrap_or(false) {
        let default_rules = r#"# Regulament printare 3D

> [!WARNING]
> Cititi regulile inainte de a printa si nu fiti iresponsabili! Orice defectiune cauzata de utilizarea necorespunzatoare va fi suportata de utilizator.

## Reguli generale
1. **Verificati patul:** Asigurati-va ca patul este curat si nu contine resturi de la printuri anterioare.
2. **Nu lasati nesupravegheat:** Primele 3 straturi trebuie supravegheate obligatoriu.
3. **Nu modificati setarile fizice:** Nu atingeti curelele, suruburile sau axele imprimantei in timpul functionarii.
4. **Raportati erorile:** Daca auziti zgomote ciudate sau observati probleme de aderenta, dati **PAUSE** sau **CANCEL** si anuntati un administrator.
"#;
        let _ = fs::write(rules_path, default_rules).await;
    }

    let troubleshooting_path = Path::new("content/troubleshooting.md");
    if !fs::try_exists(troubleshooting_path).await.unwrap_or(false) {
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
        let _ = fs::write(troubleshooting_path, default_troubleshooting).await;
    }

    // Initialize Moonraker client
    let moonraker = Arc::new(MoonrakerClient::new(
        config.moonraker.url.clone(),
        config.moonraker.api_key.clone(),
    ));

    // Start background WebSocket connection to Moonraker
    moonraker.clone().start_monitoring();

    let state = Arc::new(AppState {
        config,
        moonraker,
        sessions: SessionManager::new(),
    });

    // Build routes with explicit state type
    let api_routes: Router<Arc<AppState>> = Router::new()
        .route("/config", get(get_portal_config))
        .route("/logo/light", get(serve_logo_light))
        .route("/logo/dark", get(serve_logo_dark))
        .route("/status", get(get_status))
        .route("/auth/login", post(login))
        .route("/auth/logout", post(logout))
        .route("/content/rules", get(get_rules))
        .route("/content/troubleshooting", get(get_troubleshooting))
        .route("/print/upload", post(upload_gcode))
        .route("/files/gcodes/*path", get(get_gcode_file))
        .route("/print/start", post(start_print))
        .route("/print/pause", post(pause_print))
        .route("/print/resume", post(resume_print))
        .route("/print/cancel", post(cancel_print))
        .route("/print/emergency_stop", post(emergency_stop))
        .route("/macro/run", post(run_macro))
        .route("/preheat", post(preheat))
        .route("/move", post(move_jog))
        .route("/speed_factor", post(set_speed_factor))
        .route("/ws", get(ws_handler));

    // CORS and middleware
    let cors = CorsLayer::permissive();

    // Serve SPA from frontend/dist
    let app = Router::new()
        .merge(
            utoipa_swagger_ui::SwaggerUi::new("/swagger-ui")
                .url("/api-docs/openapi.json", ApiDoc::openapi()),
        )
        .nest("/api", api_routes)
        .fallback_service(
            ServeDir::new("frontend/dist").fallback(ServeFile::new("frontend/dist/index.html")),
        )
        .layer(cors)
        .with_state(state.clone());

    let addr = SocketAddr::new(
        state
            .config
            .server
            .host
            .parse()
            .unwrap_or([127, 0, 0, 1].into()),
        state.config.server.port,
    );

    info!("Listening on http://{}", addr);
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

// Helpers for Auth/Role validation from Cookies

async fn check_authorized_action(
    cookies: &CookieJar,
    sessions: &SessionManager,
    config: &Config,
    _requires_admin: bool,
) -> Result<UserRole, StatusCode> {
    // If guest password is required, check session presence
    if let Some(ref hash) = config.auth.guest_password_hash {
        if !hash.is_empty() {
            let token = cookies.get("session_token").map(|c| c.value());
            if token.is_none() || sessions.validate_session(token.unwrap()).await.is_none() {
                return Err(StatusCode::UNAUTHORIZED);
            }
        }
    }

    Ok(UserRole::Guest)
}

// --- Route Handlers ---

#[utoipa::path(
    get,
    path = "/api/config",
    responses(
        (status = 200, description = "Configurare portal incarcata cu succes", body = PortalConfigResponse)
    )
)]
async fn get_portal_config(State(state): State<Arc<AppState>>) -> Json<PortalConfigResponse> {
    let guest_auth_required = state.config.auth.guest_password_hash.is_some()
        && !state
            .config
            .auth
            .guest_password_hash
            .as_ref()
            .unwrap()
            .is_empty();

    Json(PortalConfigResponse {
        app_name: state.config.branding.app_name.clone(),
        faculty_name: state.config.branding.faculty_name.clone(),
        logo_light: state.config.branding.logo_light.clone(),
        logo_dark: state.config.branding.logo_dark.clone(),
        danger_image: state.config.branding.danger_image.clone(),
        moron_warning_text: state.config.branding.moron_warning_text.clone(),
        theme: ThemeConfigResponse {
            font_family: state.config.theme.font_family.clone(),
        },
        limits: LimitsConfigResponse {
            max_speed_factor: state.config.limits.max_speed_factor,
            max_upload_mb: state.config.limits.max_upload_mb,
            allow_movement_while_printing: state.config.limits.allow_movement_while_printing,
            allow_home_for_guests: state.config.limits.allow_home_for_guests,
            max_jog_step: state.config.limits.max_jog_step,
        },
        preheat_presets: state.config.preheat.clone(),
        allowed_macros: state.config.macros.guest_allowed.clone(),
        guest_auth_required,
        mainsail_url: state.config.mainsail.as_ref().map(|m| m.url.clone()),
    })
}

#[utoipa::path(
    get,
    path = "/api/status",
    responses(
        (status = 200, description = "Status imprimanta curent", body = NormalizedPrinterState)
    )
)]
async fn get_status(State(state): State<Arc<AppState>>) -> Json<NormalizedPrinterState> {
    let st = state.moonraker.get_state().read().await.clone();
    Json(st)
}

#[derive(serde::Deserialize, utoipa::ToSchema)]
struct LoginPayload {
    password: String,
}

#[utoipa::path(
    post,
    path = "/api/auth/login",
    request_body = LoginPayload,
    responses(
        (status = 200, description = "Autentificare reusita", body = LoginResponse),
        (status = 401, description = "Parola incorecta sau neautorizat")
    )
)]
async fn login(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
    Json(payload): Json<LoginPayload>,
) -> Response {
    match state
        .sessions
        .create_session(&payload.password, &state.config)
        .await
    {
        Ok(session) => {
            let cookie = Cookie::build(("session_token", session.token.clone()))
                .path("/")
                .http_only(true)
                .same_site(axum_extra::extract::cookie::SameSite::Lax)
                .build();
            let role_str = match session.role {
                UserRole::Guest => "guest",
            };
            (
                jar.add(cookie),
                Json(LoginResponse {
                    role: role_str.to_string(),
                }),
            )
                .into_response()
        }
        Err(e) => (
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({ "error": e })),
        )
            .into_response(),
    }
}

#[utoipa::path(
    post,
    path = "/api/auth/logout",
    responses(
        (status = 200, description = "Deconectare reusita", body = StatusResponse)
    )
)]
async fn logout(State(state): State<Arc<AppState>>, jar: CookieJar) -> Response {
    if let Some(cookie) = jar.get("session_token") {
        state.sessions.destroy_session(cookie.value()).await;
    }
    let cookie = Cookie::build(("session_token", ""))
        .path("/")
        .max_age(Duration::ZERO)
        .build();
    (
        jar.add(cookie),
        Json(StatusResponse {
            status: "ok".to_string(),
        }),
    )
        .into_response()
}

async fn render_markdown_file(path: &Path) -> Result<String, std::io::Error> {
    let content = fs::read_to_string(path).await?;
    let mut options = Options::empty();
    options.insert(Options::ENABLE_TABLES);
    let parser = Parser::new_ext(&content, options);
    let mut html_output = String::new();
    html::push_html(&mut html_output, parser);
    Ok(html_output)
}

#[derive(serde::Deserialize, utoipa::IntoParams)]
struct ContentQuery {
    /// Language code (ro / en)
    lang: Option<String>,
}

#[utoipa::path(
    get,
    path = "/api/content/rules",
    params(
        ContentQuery
    ),
    responses(
        (status = 200, description = "Regulament printare in format HTML", body = ContentResponse)
    )
)]
async fn get_rules(Query(query): Query<ContentQuery>) -> Response {
    let filename = match query.lang.as_deref() {
        Some("en") => "content/rules_en.md",
        _ => "content/rules.md",
    };
    match render_markdown_file(Path::new(filename)).await {
        Ok(html) => Json(ContentResponse { html }).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

#[utoipa::path(
    get,
    path = "/api/content/troubleshooting",
    params(
        ContentQuery
    ),
    responses(
        (status = 200, description = "Instructiuni de depanare in format HTML", body = ContentResponse)
    )
)]
async fn get_troubleshooting(Query(query): Query<ContentQuery>) -> Response {
    let filename = match query.lang.as_deref() {
        Some("en") => "content/troubleshooting_en.md",
        _ => "content/troubleshooting.md",
    };
    match render_markdown_file(Path::new(filename)).await {
        Ok(html) => Json(ContentResponse { html }).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

#[utoipa::path(
    post,
    path = "/api/print/upload",
    responses(
        (status = 200, description = "Fisier incarcat cu succes", body = FilePayload),
        (status = 400, description = "Fisier invalid sau limita depasita"),
        (status = 403, description = "Neautorizat")
    )
)]
async fn upload_gcode(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
    mut multipart: Multipart,
) -> Response {
    if let Err(status) = check_authorized_action(&jar, &state.sessions, &state.config, false).await
    {
        return status.into_response();
    }

    let st = state.moonraker.get_state().read().await.clone();
    if st.connection_state != "connected" {
        return (
            StatusCode::BAD_REQUEST,
            "Imprimanta este oprita sau deconectata",
        )
            .into_response();
    }

    while let Ok(Some(field)) = multipart.next_field().await {
        let name = field.name().unwrap_or("").to_string();
        if name == "file" {
            let filename = field.file_name().unwrap_or("print.gcode").to_string();
            let data = match field.bytes().await {
                Ok(b) => b,
                Err(e) => return (StatusCode::BAD_REQUEST, e.to_string()).into_response(),
            };

            let clean_filename =
                match SafetyManager::validate_upload(&filename, data.len() as u64, &state.config) {
                    Ok(f) => f,
                    Err(e) => return (StatusCode::BAD_REQUEST, e).into_response(),
                };

            info!("Uploading safe G-code file: {}", clean_filename);
            match state
                .moonraker
                .upload_gcode(&clean_filename, data.to_vec())
                .await
            {
                Ok(_) => {
                    return Json(FilePayload {
                        filename: clean_filename,
                    })
                    .into_response()
                }
                Err(e) => {
                    return (StatusCode::BAD_GATEWAY, format!("Moonraker error: {:?}", e))
                        .into_response()
                }
            }
        }
    }

    (StatusCode::BAD_REQUEST, "Lipseste fisierul").into_response()
}

#[utoipa::path(
    get,
    path = "/api/files/gcodes/{path}",
    params(
        ("path" = String, Path, description = "G-code path relative to Moonraker gcodes root")
    ),
    responses(
        (status = 200, description = "G-code file content"),
        (status = 400, description = "Invalid G-code path"),
        (status = 502, description = "Moonraker proxy error")
    )
)]
async fn get_gcode_file(
    State(state): State<Arc<AppState>>,
    AxumPath(path): AxumPath<String>,
) -> Response {
    let clean_path = match validate_gcode_proxy_path(&path) {
        Ok(path) => path,
        Err(message) => return (StatusCode::BAD_REQUEST, message).into_response(),
    };

    match state.moonraker.get_gcode_file(&clean_path).await {
        Ok(content) => (
            StatusCode::OK,
            [(
                axum::http::header::CONTENT_TYPE,
                "text/plain; charset=utf-8",
            )],
            content,
        )
            .into_response(),
        Err(e) => (StatusCode::BAD_GATEWAY, format!("Moonraker error: {e}")).into_response(),
    }
}

fn validate_gcode_proxy_path(path: &str) -> Result<String, &'static str> {
    let path = path.trim();
    if path.is_empty() || path.starts_with('/') {
        return Err("Invalid G-code path");
    }

    if path.chars().any(|ch| ch == '\\' || ch.is_control()) {
        return Err("Invalid G-code path");
    }

    if path
        .split('/')
        .any(|segment| segment.is_empty() || segment == "." || segment == "..")
    {
        return Err("Invalid G-code path");
    }

    let lower = path.to_ascii_lowercase();
    let is_gcode = lower.ends_with(".gcode") || lower.ends_with(".gco") || lower.ends_with(".g");
    if !is_gcode {
        return Err("Only G-code files can be fetched");
    }

    Ok(path.to_string())
}

#[derive(serde::Deserialize, serde::Serialize, utoipa::ToSchema)]
struct FilePayload {
    filename: String,
}

#[utoipa::path(
    post,
    path = "/api/print/start",
    request_body = FilePayload,
    responses(
        (status = 200, description = "Printare pornita cu succes", body = StatusResponse),
        (status = 403, description = "Actiune interzisa sau limita depasita")
    )
)]
async fn start_print(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
    Json(payload): Json<FilePayload>,
) -> Response {
    if let Err(status) = check_authorized_action(&jar, &state.sessions, &state.config, false).await
    {
        return status.into_response();
    }

    let st = state.moonraker.get_state().read().await.clone();
    if st.connection_state != "connected" {
        return (
            StatusCode::BAD_REQUEST,
            "Imprimanta este oprita sau deconectata",
        )
            .into_response();
    }

    let clean_filename = match SafetyManager::validate_upload(&payload.filename, 0, &state.config) {
        Ok(f) => f,
        Err(e) => return (StatusCode::BAD_REQUEST, e).into_response(),
    };

    match state.moonraker.start_print(&clean_filename).await {
        Ok(_) => Json(StatusResponse {
            status: "ok".to_string(),
        })
        .into_response(),
        Err(e) => (StatusCode::BAD_GATEWAY, e.to_string()).into_response(),
    }
}

#[utoipa::path(
    post,
    path = "/api/print/pause",
    responses(
        (status = 200, description = "Printare pusa in pauza", body = StatusResponse)
    )
)]
async fn pause_print(State(state): State<Arc<AppState>>, jar: CookieJar) -> Response {
    if let Err(status) = check_authorized_action(&jar, &state.sessions, &state.config, false).await
    {
        return status.into_response();
    }

    let st = state.moonraker.get_state().read().await.clone();
    if st.connection_state != "connected" {
        return (
            StatusCode::BAD_REQUEST,
            "Imprimanta este oprita sau deconectata",
        )
            .into_response();
    }

    match state.moonraker.pause_print().await {
        Ok(_) => Json(StatusResponse {
            status: "ok".to_string(),
        })
        .into_response(),
        Err(e) => (StatusCode::BAD_GATEWAY, e.to_string()).into_response(),
    }
}

#[utoipa::path(
    post,
    path = "/api/print/emergency_stop",
    responses(
        (status = 200, description = "OPRIRE DE URGENTA trimisa", body = StatusResponse)
    )
)]
async fn emergency_stop(State(state): State<Arc<AppState>>, jar: CookieJar) -> Response {
    if let Err(status) = check_authorized_action(&jar, &state.sessions, &state.config, false).await
    {
        return status.into_response();
    }

    let st = state.moonraker.get_state().read().await.clone();
    if st.connection_state != "connected" {
        return (
            StatusCode::BAD_REQUEST,
            "Imprimanta este oprita sau deconectata",
        )
            .into_response();
    }

    match state.moonraker.emergency_stop().await {
        Ok(_) => Json(StatusResponse {
            status: "ok".to_string(),
        })
        .into_response(),
        Err(e) => (StatusCode::BAD_GATEWAY, e.to_string()).into_response(),
    }
}

#[utoipa::path(
    post,
    path = "/api/print/cancel",
    responses(
        (status = 200, description = "Printare anulata", body = StatusResponse)
    )
)]
async fn cancel_print(State(state): State<Arc<AppState>>, jar: CookieJar) -> Response {
    if let Err(status) = check_authorized_action(&jar, &state.sessions, &state.config, false).await
    {
        return status.into_response();
    }

    let st = state.moonraker.get_state().read().await.clone();
    if st.connection_state != "connected" {
        return (
            StatusCode::BAD_REQUEST,
            "Imprimanta este oprita sau deconectata",
        )
            .into_response();
    }

    match state.moonraker.cancel_print().await {
        Ok(_) => Json(StatusResponse {
            status: "ok".to_string(),
        })
        .into_response(),
        Err(e) => (StatusCode::BAD_GATEWAY, e.to_string()).into_response(),
    }
}

#[utoipa::path(
    post,
    path = "/api/print/resume",
    responses(
        (status = 200, description = "Printare reluata", body = StatusResponse)
    )
)]
async fn resume_print(State(state): State<Arc<AppState>>, jar: CookieJar) -> Response {
    if let Err(status) = check_authorized_action(&jar, &state.sessions, &state.config, false).await
    {
        return status.into_response();
    }

    let st = state.moonraker.get_state().read().await.clone();
    if st.connection_state != "connected" {
        return (
            StatusCode::BAD_REQUEST,
            "Imprimanta este oprita sau deconectata",
        )
            .into_response();
    }

    match state.moonraker.resume_print().await {
        Ok(_) => Json(StatusResponse {
            status: "ok".to_string(),
        })
        .into_response(),
        Err(e) => (StatusCode::BAD_GATEWAY, e.to_string()).into_response(),
    }
}

#[derive(serde::Deserialize, utoipa::ToSchema)]
struct MacroPayload {
    macro_name: String,
}

#[utoipa::path(
    post,
    path = "/api/macro/run",
    request_body = MacroPayload,
    responses(
        (status = 200, description = "Macro pornit cu succes", body = StatusResponse),
        (status = 403, description = "Macro-ul nu este in whitelist")
    )
)]
async fn run_macro(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
    Json(payload): Json<MacroPayload>,
) -> Response {
    let _role = match check_authorized_action(&jar, &state.sessions, &state.config, false).await {
        Ok(r) => r,
        Err(s) => return s.into_response(),
    };

    let st = state.moonraker.get_state().read().await.clone();
    if st.connection_state != "connected" {
        return (
            StatusCode::BAD_REQUEST,
            "Imprimanta este oprita sau deconectata",
        )
            .into_response();
    }

    if let Err(e) = SafetyManager::validate_macro(&payload.macro_name, &state.config) {
        return (StatusCode::FORBIDDEN, e).into_response();
    }

    match state
        .moonraker
        .run_gcode(&payload.macro_name.to_uppercase())
        .await
    {
        Ok(_) => Json(StatusResponse {
            status: "ok".to_string(),
        })
        .into_response(),
        Err(e) => (StatusCode::BAD_GATEWAY, e.to_string()).into_response(),
    }
}

#[derive(serde::Deserialize, utoipa::ToSchema)]
struct PreheatPayload {
    preset: String,
}

#[utoipa::path(
    post,
    path = "/api/preheat",
    request_body = PreheatPayload,
    responses(
        (status = 200, description = "Preincalzire pornita", body = StatusResponse),
        (status = 403, description = "Valori de temperatura in afara limitelor de siguranta")
    )
)]
async fn preheat(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
    Json(payload): Json<PreheatPayload>,
) -> Response {
    let _role = match check_authorized_action(&jar, &state.sessions, &state.config, false).await {
        Ok(r) => r,
        Err(s) => return s.into_response(),
    };

    let st = state.moonraker.get_state().read().await.clone();
    if st.connection_state != "connected" {
        return (
            StatusCode::BAD_REQUEST,
            "Imprimanta este oprita sau deconectata",
        )
            .into_response();
    }

    let (hotend_t, bed_t) = match payload.preset.to_lowercase().as_str() {
        "cooldown" => (0.0, 0.0),
        p => {
            if let Some(preset) = state.config.preheat.get(p) {
                (preset.hotend, preset.bed)
            } else {
                return (StatusCode::BAD_REQUEST, "Preset preincalzire invalid").into_response();
            }
        }
    };

    if let Err(e) = SafetyManager::validate_preheat(hotend_t, bed_t, &state.config) {
        return (StatusCode::FORBIDDEN, e).into_response();
    }

    let gcode = format!("M104 S{:.0}\nM140 S{:.0}", hotend_t, bed_t);
    match state.moonraker.run_gcode(&gcode).await {
        Ok(_) => Json(StatusResponse {
            status: "ok".to_string(),
        })
        .into_response(),
        Err(e) => (StatusCode::BAD_GATEWAY, e.to_string()).into_response(),
    }
}

#[derive(serde::Deserialize, utoipa::ToSchema)]
struct JogPayload {
    axis: String,
    distance: f64,
}

#[utoipa::path(
    post,
    path = "/api/move",
    request_body = JogPayload,
    responses(
        (status = 200, description = "Jog efectuat", body = StatusResponse),
        (status = 403, description = "Miscarea depaseste pasul maxim sau este blocata")
    )
)]
async fn move_jog(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
    Json(payload): Json<JogPayload>,
) -> Response {
    let _role = match check_authorized_action(&jar, &state.sessions, &state.config, false).await {
        Ok(r) => r,
        Err(s) => return s.into_response(),
    };

    let st = state.moonraker.get_state().read().await.clone();
    if st.connection_state != "connected" {
        return (
            StatusCode::BAD_REQUEST,
            "Imprimanta este oprita sau deconectata",
        )
            .into_response();
    }
    let is_printing = st.print_state == "printing";

    if let Err(e) =
        SafetyManager::validate_jog(&payload.axis, payload.distance, is_printing, &state.config)
    {
        return (StatusCode::FORBIDDEN, e).into_response();
    }

    if payload.axis.to_lowercase() == "home" {
        if let Err(e) = SafetyManager::validate_home(&state.config) {
            return (StatusCode::FORBIDDEN, e).into_response();
        }
        match state.moonraker.run_gcode("G28").await {
            Ok(_) => {
                return Json(StatusResponse {
                    status: "ok".to_string(),
                })
                .into_response()
            }
            Err(e) => return (StatusCode::BAD_GATEWAY, e.to_string()).into_response(),
        }
    }

    let gcode = format!(
        "G91\nG1 {} {:.2} F1500\nG90",
        payload.axis.to_uppercase(),
        payload.distance
    );
    match state.moonraker.run_gcode(&gcode).await {
        Ok(_) => Json(StatusResponse {
            status: "ok".to_string(),
        })
        .into_response(),
        Err(e) => (StatusCode::BAD_GATEWAY, e.to_string()).into_response(),
    }
}

#[derive(serde::Deserialize, utoipa::ToSchema)]
struct SpeedFactorPayload {
    factor: f64,
}

#[utoipa::path(
    post,
    path = "/api/speed_factor",
    request_body = SpeedFactorPayload,
    responses(
        (status = 200, description = "Multiplicator viteza modificat", body = StatusResponse),
        (status = 403, description = "Multiplicator depaseste limita configurata")
    )
)]
async fn set_speed_factor(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
    Json(payload): Json<SpeedFactorPayload>,
) -> Response {
    let _role = match check_authorized_action(&jar, &state.sessions, &state.config, false).await {
        Ok(r) => r,
        Err(s) => return s.into_response(),
    };

    let st = state.moonraker.get_state().read().await.clone();
    if st.connection_state != "connected" {
        return (
            StatusCode::BAD_REQUEST,
            "Imprimanta este oprita sau deconectata",
        )
            .into_response();
    }

    let validated_factor = match SafetyManager::validate_speed_factor(payload.factor, &state.config)
    {
        Ok(f) => f,
        Err(e) => return (StatusCode::FORBIDDEN, e).into_response(),
    };

    let gcode = format!("M220 S{:.0}", validated_factor);
    match state.moonraker.run_gcode(&gcode).await {
        Ok(_) => Json(StatusResponse {
            status: "ok".to_string(),
        })
        .into_response(),
        Err(e) => (StatusCode::BAD_GATEWAY, e.to_string()).into_response(),
    }
}

async fn ws_handler(State(state): State<Arc<AppState>>, ws: WebSocketUpgrade) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_frontend_ws(socket, state))
}

async fn handle_frontend_ws(mut socket: WebSocket, state: Arc<AppState>) {
    let mut rx = state.moonraker.subscribe_updates();

    let initial_state = state.moonraker.get_state().read().await.clone();
    if let Ok(txt) = serde_json::to_string(&initial_state) {
        if socket.send(WsMessage::Text(txt)).await.is_err() {
            return;
        }
    }

    loop {
        tokio::select! {
            update_res = rx.recv() => {
                match update_res {
                    Ok(state_val) => {
                        if let Ok(txt) = serde_json::to_string(&state_val) {
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

async fn serve_logo_light(State(state): State<Arc<AppState>>) -> Response {
    serve_logo_file(&state.config.branding.logo_light).await
}

async fn serve_logo_dark(State(state): State<Arc<AppState>>) -> Response {
    serve_logo_file(&state.config.branding.logo_dark).await
}

async fn serve_logo_file(path_str: &str) -> Response {
    match fs::read(path_str).await {
        Ok(bytes) => {
            let content_type = if path_str.ends_with(".png") {
                "image/png"
            } else if path_str.ends_with(".svg") {
                "image/svg+xml"
            } else if path_str.ends_with(".jpg") || path_str.ends_with(".jpeg") {
                "image/jpeg"
            } else {
                "application/octet-stream"
            };
            (
                StatusCode::OK,
                [(axum::http::header::CONTENT_TYPE, content_type)],
                bytes,
            )
                .into_response()
        }
        Err(_) => (StatusCode::NOT_FOUND, "Logo not found").into_response(),
    }
}

#[derive(serde::Serialize, utoipa::ToSchema)]
struct PortalConfigResponse {
    app_name: String,
    faculty_name: String,
    logo_light: String,
    logo_dark: String,
    danger_image: String,
    moron_warning_text: String,
    theme: ThemeConfigResponse,
    limits: LimitsConfigResponse,
    preheat_presets: std::collections::HashMap<String, config::PreheatPreset>,
    allowed_macros: Vec<String>,
    guest_auth_required: bool,
    mainsail_url: Option<String>,
}

#[derive(serde::Serialize, utoipa::ToSchema)]
struct ThemeConfigResponse {
    font_family: String,
}

#[derive(serde::Serialize, utoipa::ToSchema)]
struct LimitsConfigResponse {
    max_speed_factor: f64,
    max_upload_mb: u64,
    allow_movement_while_printing: bool,
    allow_home_for_guests: bool,
    max_jog_step: f64,
}

#[derive(serde::Serialize, utoipa::ToSchema)]
struct LoginResponse {
    role: String,
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
            SpeedFactorPayload,
        )
    ),
    tags(
        (name = "Klipper Portal API", description = "Endpoints securizate pentru Klipper Guest Print Portal")
    )
)]
struct ApiDoc;

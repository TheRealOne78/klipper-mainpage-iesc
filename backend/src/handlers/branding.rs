use crate::*;
use axum::extract::{Multipart, Path as AxumPath, Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use axum_extra::extract::cookie::CookieJar;
use std::sync::Arc;
use tokio::fs;

/// `GET /api/branding/{kind}/{lang}` — per-language variant of an uploaded
/// branding image. Falls back to the "default" slot if this language's file
/// doesn't exist (e.g. an admin only uploaded a default logo).
pub(crate) async fn serve_logo_light(
    State(state): State<Arc<AppState>>,
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> Response {
    let config = state.config.load();
    let lang = params.get("lang").map(String::as_str).unwrap_or("default");
    let value = config
        .branding
        .logo_light
        .get(lang)
        .or_else(|| config.branding.logo_light.get("default"))
        .cloned()
        .unwrap_or_default();
    serve_logo_value(&value).await
}

pub(crate) async fn serve_logo_dark(
    State(state): State<Arc<AppState>>,
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> Response {
    let config = state.config.load();
    let lang = params.get("lang").map(String::as_str).unwrap_or("default");
    let value = config
        .branding
        .logo_dark
        .get(lang)
        .or_else(|| config.branding.logo_dark.get("default"))
        .cloned()
        .unwrap_or_default();
    serve_logo_value(&value).await
}

pub(crate) async fn serve_branding_logo_light() -> Response {
    serve_branding_asset_impl(BrandingAsset::LogoLight, "default").await
}

pub(crate) async fn serve_branding_logo_dark() -> Response {
    serve_branding_asset_impl(BrandingAsset::LogoDark, "default").await
}

pub(crate) async fn serve_branding_favicon() -> Response {
    serve_branding_asset_impl(BrandingAsset::Favicon, "default").await
}

pub(crate) async fn serve_branding_danger_image() -> Response {
    serve_branding_asset_impl(BrandingAsset::DangerImage, "default").await
}

pub(crate) async fn serve_branding_asset_lang(AxumPath((kind, lang)): AxumPath<(String, String)>) -> Response {
    // Same allow-list the upload path already enforces — `lang` otherwise
    // feeds straight into a disk path (`BrandingAsset::disk_path`) with no
    // other sanitization, so an unchecked value here is a path-traversal
    // vector even though the fixed `logo-light-`-style prefix on non-default
    // languages makes a *bare* ".." traversal not resolve on its own.
    if !BRANDING_LANGS.contains(&lang.as_str()) {
        return (StatusCode::BAD_REQUEST, "Unknown language").into_response();
    }
    match BrandingAsset::from_kind(&kind) {
        Some(asset) => serve_branding_asset_impl(asset, &lang).await,
        None => (StatusCode::NOT_FOUND, "Unknown branding asset").into_response(),
    }
}

pub(crate) async fn serve_branding_asset_impl(asset: BrandingAsset, lang: &str) -> Response {
    let disk_path = asset.disk_path(lang);
    let full_path = get_project_file_path(&disk_path);
    match fs::read(&full_path).await {
        Ok(bytes) => respond_with_image(bytes, &disk_path),
        Err(_) if lang != "default" => {
            // No per-language upload for this lang — fall back to the default.
            let fallback_path = asset.disk_path("default");
            match fs::read(&get_project_file_path(&fallback_path)).await {
                Ok(bytes) => respond_with_image(bytes, &fallback_path),
                Err(_) => (StatusCode::NOT_FOUND, "Logo not found").into_response(),
            }
        }
        Err(_) => (StatusCode::NOT_FOUND, "Logo not found").into_response(),
    }
}

pub(crate) async fn serve_logo_value(value: &str) -> Response {
    if let Some((asset, lang)) = BrandingAsset::from_url(value) {
        return serve_branding_asset_impl(asset, &lang).await;
    }
    let full_path = get_project_file_path(value);
    match fs::read(&full_path).await {
        Ok(bytes) => respond_with_image(bytes, value),
        Err(_) => (StatusCode::NOT_FOUND, "Logo not found").into_response(),
    }
}

pub(crate) fn respond_with_image(bytes: Vec<u8>, path: &str) -> Response {
    let content_type = if is_png(&bytes, path) {
        "image/png"
    } else if is_svg(&bytes, path) {
        "image/svg+xml"
    } else if is_jpeg(&bytes, path) {
        "image/jpeg"
    } else if is_ico(&bytes, path) {
        "image/x-icon"
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

pub(crate) fn is_png(bytes: &[u8], path: &str) -> bool {
    path.ends_with(".png") || bytes.starts_with(b"\x89PNG\r\n\x1a\n")
}

pub(crate) fn is_svg(bytes: &[u8], path: &str) -> bool {
    path.ends_with(".svg") || bytes.starts_with(b"<svg") || bytes.starts_with(b"<?xml")
}

pub(crate) fn is_jpeg(bytes: &[u8], path: &str) -> bool {
    path.ends_with(".jpg") || path.ends_with(".jpeg") || bytes.starts_with(&[0xff, 0xd8, 0xff])
}

pub(crate) fn is_ico(bytes: &[u8], path: &str) -> bool {
    path.ends_with(".ico") || bytes.starts_with(&[0x00, 0x00, 0x01, 0x00])
}

/// Filesystem-safe footer-link id: only alphanumerics, dash, underscore.
pub(crate) fn sanitize_footer_link_id(id: &str) -> Option<String> {
    if id.is_empty() || id.len() > 64 {
        return None;
    }
    if id
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        Some(id.to_string())
    } else {
        None
    }
}

/// `GET /api/footer-link-icon/{id}` — serves an admin-uploaded footer link
/// icon. Public (footer renders for anonymous visitors too).
pub(crate) async fn serve_footer_link_icon(AxumPath(id): AxumPath<String>) -> Response {
    let Some(safe_id) = sanitize_footer_link_id(&id) else {
        return (StatusCode::BAD_REQUEST, "Invalid id").into_response();
    };
    let disk_path = format!("{}/{}", FOOTER_LINK_ICON_DIR, safe_id);
    let full_path = get_project_file_path(&disk_path);
    match fs::read(&full_path).await {
        Ok(bytes) => respond_with_image(bytes, &disk_path),
        Err(_) => (StatusCode::NOT_FOUND, "Icon not found").into_response(),
    }
}

/// `POST /api/admin/footer-link-icon/{id}` — upload a footer link's icon.
/// The `id` must already exist in `config.footer_links` (add the link first
/// via the config PUT, then upload its icon).
pub(crate) async fn upload_footer_link_icon(
    AxumPath(id): AxumPath<String>,
    State(state): State<Arc<AppState>>,
    admin: AdminIdentity,
    mut multipart: Multipart,
) -> Response {
    let Some(safe_id) = sanitize_footer_link_id(&id) else {
        return (StatusCode::BAD_REQUEST, "Invalid id").into_response();
    };
    let current_config = state.config.load();
    let role = admin.0;

    let mut bytes = None;
    while let Ok(Some(field)) = multipart.next_field().await {
        if field.name() == Some("file") {
            match field.bytes().await {
                Ok(data) => bytes = Some(data.to_vec()),
                Err(e) => return (StatusCode::BAD_REQUEST, e.to_string()).into_response(),
            }
        }
    }
    let bytes = match bytes {
        Some(bytes) if !bytes.is_empty() => bytes,
        _ => return (StatusCode::BAD_REQUEST, "Missing file").into_response(),
    };
    if !(is_png(&bytes, "") || is_svg(&bytes, "") || is_jpeg(&bytes, "") || is_ico(&bytes, "")) {
        return (StatusCode::BAD_REQUEST, "Unsupported image type").into_response();
    }

    let icon_dir = get_project_file_path(FOOTER_LINK_ICON_DIR);
    if let Err(e) = fs::create_dir_all(&icon_dir).await {
        return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
    }
    let disk_path = get_project_file_path(format!("{}/{}", FOOTER_LINK_ICON_DIR, safe_id));
    if let Err(e) = fs::write(&disk_path, bytes).await {
        return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
    }

    let mut next_config = (**current_config).clone();
    let icon_url = format!("/api/footer-link-icon/{}", safe_id);
    match next_config.footer_links.iter_mut().find(|l| l.id == safe_id) {
        Some(link) => link.icon_url = icon_url.clone(),
        None => return (StatusCode::NOT_FOUND, "Footer link not found").into_response(),
    }
    if let Err(e) = save_config_to_file(&next_config, &state.config_path).await {
        return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
    }
    state.config.store(Arc::new(next_config.clone()));
    state
        .moonraker
        .broadcast_event(BackendWsEvent::ConfigChanged);
    state
        .audit
        .record(
            "footer_link.upload_icon",
            Some(audit_role(&role)), audit_identity(&role),
            true,
            audit_detail("id", safe_id),
        )
        .await;
    Json(redact_admin_config(next_config)).into_response()
}

/// Store an uploaded branding image asset (not the font — see
/// `upload_branding_font`) under backend-managed stable URLs, for a given
/// language slot.
pub(crate) async fn upload_branding_logo_light(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
    multipart: Multipart,
) -> Response {
    upload_branding_asset(state, jar, multipart, BrandingAsset::LogoLight, "default").await
}

/// Strips password hashes from a full `Config` before it's sent to the browser.
pub(crate) async fn upload_branding_logo_dark(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
    multipart: Multipart,
) -> Response {
    upload_branding_asset(state, jar, multipart, BrandingAsset::LogoDark, "default").await
}

pub(crate) async fn upload_branding_favicon(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
    multipart: Multipart,
) -> Response {
    upload_branding_asset(state, jar, multipart, BrandingAsset::Favicon, "default").await
}

pub(crate) async fn upload_branding_danger_image(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
    multipart: Multipart,
) -> Response {
    upload_branding_asset(state, jar, multipart, BrandingAsset::DangerImage, "default").await
}

pub(crate) async fn upload_branding_asset_lang(
    AxumPath((kind, lang)): AxumPath<(String, String)>,
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
    multipart: Multipart,
) -> Response {
    let asset = match BrandingAsset::from_kind(&kind) {
        Some(a) => a,
        None => return (StatusCode::NOT_FOUND, "Unknown branding asset").into_response(),
    };
    if !BRANDING_LANGS.contains(&lang.as_str()) {
        return (StatusCode::BAD_REQUEST, "Unknown language").into_response();
    }
    upload_branding_asset(state, jar, multipart, asset, &lang).await
}

pub(crate) async fn upload_branding_font(
    State(state): State<Arc<AppState>>,
    admin: AdminIdentity,
    mut multipart: Multipart,
) -> Response {
    let current_config = state.config.load();
    let role = admin.0;

    let mut bytes = None;
    while let Ok(Some(field)) = multipart.next_field().await {
        if field.name() == Some("file") {
            match field.bytes().await {
                Ok(data) => bytes = Some(data.to_vec()),
                Err(e) => return (StatusCode::BAD_REQUEST, e.to_string()).into_response(),
            }
        }
    }
    let bytes = match bytes {
        Some(bytes) if !bytes.is_empty() => bytes,
        _ => return (StatusCode::BAD_REQUEST, "Missing file").into_response(),
    };
    let is_valid_font = bytes.starts_with(b"wOFF")
        || bytes.starts_with(b"wOF2")
        || bytes.starts_with(b"\x00\x01\x00\x00") // TTF
        || bytes.starts_with(b"OTTO"); // OTF
    if !is_valid_font {
        return (
            StatusCode::BAD_REQUEST,
            "Unsupported font type (use OTF, TTF, WOFF, WOFF2)",
        )
            .into_response();
    }

    let branding_dir = get_project_file_path(BRANDING_DIR);
    if let Err(e) = fs::create_dir_all(&branding_dir).await {
        return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
    }
    let disk_path = get_project_file_path(BRANDING_FONT_PATH);
    if let Err(e) = fs::write(&disk_path, bytes).await {
        return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
    }

    let mut next_config = (**current_config).clone();
    next_config.theme.font_url = Some(BRANDING_FONT_URL.to_string());
    if let Err(e) = save_config_to_file(&next_config, &state.config_path).await {
        return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
    }
    state.config.store(Arc::new(next_config.clone()));
    state
        .moonraker
        .broadcast_event(BackendWsEvent::ConfigChanged);
    state
        .audit
        .record(
            "branding.upload",
            Some(audit_role(&role)), audit_identity(&role),
            true,
            audit_detail("url", BRANDING_FONT_URL.to_string()),
        )
        .await;
    Json(redact_admin_config(next_config)).into_response()
}

pub(crate) async fn serve_branding_font(State(state): State<Arc<AppState>>) -> Response {
    let config = state.config.load();
    if config.theme.font_url.as_deref() != Some(BRANDING_FONT_URL) {
        return (StatusCode::NOT_FOUND, "No custom font uploaded").into_response();
    }
    let full_path = get_project_file_path(BRANDING_FONT_PATH);
    match fs::read(&full_path).await {
        Ok(bytes) => {
            let content_type = if bytes.starts_with(b"wOFF") { "font/woff" }
                else if bytes.starts_with(b"wOF2") { "font/woff2" }
                else { "font/otf" };
            (StatusCode::OK, [(axum::http::header::CONTENT_TYPE, content_type)], bytes).into_response()
        }
        Err(_) => (StatusCode::NOT_FOUND, "Font file not found").into_response(),
    }
}

pub(crate) async fn upload_branding_asset(
    state: Arc<AppState>,
    jar: CookieJar,
    mut multipart: Multipart,
    asset: BrandingAsset,
    lang: &str,
) -> Response {
    let current_config = state.config.load();
    let role = match check_authorized_action(&jar, &state.sessions, &current_config, true).await {
        Ok(r) => r,
        Err(s) => return s.into_response(),
    };

    let mut bytes = None;
    while let Ok(Some(field)) = multipart.next_field().await {
        if field.name() == Some("file") {
            match field.bytes().await {
                Ok(data) => bytes = Some(data.to_vec()),
                Err(e) => return (StatusCode::BAD_REQUEST, e.to_string()).into_response(),
            }
        }
    }
    let bytes = match bytes {
        Some(bytes) if !bytes.is_empty() => bytes,
        _ => return (StatusCode::BAD_REQUEST, "Missing file").into_response(),
    };
    if !(is_png(&bytes, "") || is_svg(&bytes, "") || is_jpeg(&bytes, "") || is_ico(&bytes, "")) {
        return (StatusCode::BAD_REQUEST, "Unsupported image type").into_response();
    }
    let branding_dir = get_project_file_path(BRANDING_DIR);
    if let Err(e) = fs::create_dir_all(&branding_dir).await {
        return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
    }
    let disk_path = get_project_file_path(asset.disk_path(lang));
    if let Err(e) = fs::write(&disk_path, bytes).await {
        return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
    }

    let mut next_config = (**current_config).clone();
    asset.set_config_path(&mut next_config, lang);
    if let Err(e) = save_config_to_file(&next_config, &state.config_path).await {
        return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
    }
    state.config.store(Arc::new(next_config.clone()));
    state
        .moonraker
        .broadcast_event(BackendWsEvent::ConfigChanged);
    state
        .audit
        .record(
            "branding.upload",
            Some(audit_role(&role)), audit_identity(&role),
            true,
            audit_detail("url", asset.stable_url(lang)),
        )
        .await;
    Json(redact_admin_config(next_config)).into_response()
}

/// One of the four admin-uploadable branding images. Each variant can have a
/// different file per UI language plus a `"default"` fallback slot (see
/// `disk_path`) — "default" is stored at the original unsuffixed path so
/// deployments that only ever uploaded one image (pre-per-language config)
/// keep working with zero migration. `kind_slug`/`from_kind` round-trip the
/// variant through the `{kind}` path segment used by the
/// `/api/branding/{kind}/{lang}` and `/api/admin/branding/{kind}/{lang}`
/// routes.
pub(crate) enum BrandingAsset {
    LogoLight,
    LogoDark,
    Favicon,
    DangerImage,
}

impl BrandingAsset {
    fn kind_slug(&self) -> &'static str {
        match self {
            Self::LogoLight => "logo-light",
            Self::LogoDark => "logo-dark",
            Self::Favicon => "favicon",
            Self::DangerImage => "danger-image",
        }
    }

    fn from_kind(kind: &str) -> Option<Self> {
        match kind {
            "logo-light" => Some(Self::LogoLight),
            "logo-dark" => Some(Self::LogoDark),
            "favicon" => Some(Self::Favicon),
            "danger-image" => Some(Self::DangerImage),
            _ => None,
        }
    }

    /// Disk path for a given language. "default" reuses the original
    /// (pre-per-language) unsuffixed path so existing uploads keep working.
    fn disk_path(&self, lang: &str) -> String {
        if lang == "default" {
            format!("{}/{}", BRANDING_DIR, self.kind_slug())
        } else {
            format!("{}/{}-{}", BRANDING_DIR, self.kind_slug(), lang)
        }
    }

    /// Stable URL for a given language. "default" reuses the original flat
    /// `/api/branding/{kind}` URL; other languages use the parameterized route.
    fn stable_url(&self, lang: &str) -> String {
        if lang == "default" {
            format!("/api/branding/{}", self.kind_slug())
        } else {
            format!("/api/branding/{}/{}", self.kind_slug(), lang)
        }
    }

    /// Reverse-lookup: does this URL belong to one of our own uploaded assets?
    fn from_url(url: &str) -> Option<(Self, String)> {
        for kind in ["logo-light", "logo-dark", "favicon", "danger-image"] {
            let asset = Self::from_kind(kind)?;
            for lang in BRANDING_LANGS {
                if url == asset.stable_url(lang) {
                    return Some((Self::from_kind(kind)?, lang.to_string()));
                }
            }
        }
        None
    }

    fn set_config_path(&self, config: &mut Config, lang: &str) {
        let url = self.stable_url(lang);
        let map = match self {
            Self::LogoLight => &mut config.branding.logo_light,
            Self::LogoDark => &mut config.branding.logo_dark,
            Self::Favicon => &mut config.branding.favicon,
            Self::DangerImage => &mut config.branding.danger_image,
        };
        map.insert(lang.to_string(), url);
    }
}


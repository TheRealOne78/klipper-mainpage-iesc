use crate::*;
use axum::extract::{Multipart, Path as AxumPath, Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use axum_extra::extract::cookie::CookieJar;
use serde_json::json;
use std::sync::Arc;
use tracing::info;

#[utoipa::path(
    post,
    path = "/api/print/upload",
    responses(
        (status = 200, description = "Fișier încărcat cu succes", body = FilePayload),
        (status = 400, description = "Fișier invalid sau limită depășită"),
        (status = 403, description = "Neautorizat")
    )
)]
pub(crate) async fn upload_gcode(
    State(state): State<Arc<AppState>>,
    identity: AuthedIdentity,
    mut multipart: Multipart,
) -> Response {
    let config = state.config.load();
    let role = identity.0;

    if let Err(r) = require_permission(&role, &config, |p| p.upload_gcode) {
        return r;
    }

    let _st = match require_printer_connected(&state).await {
        Ok(s) => s,
        Err(r) => return r,
    };

    while let Ok(Some(field)) = multipart.next_field().await {
        let name = field.name().unwrap_or("").to_string();
        if name == "file" {
            let filename = field.file_name().unwrap_or("print.gcode").to_string();
            let data = match field.bytes().await {
                Ok(b) => b,
                Err(e) => return (StatusCode::BAD_REQUEST, e.to_string()).into_response(),
            };

            let clean_filename = match SafetyManager::validate_upload(
                &filename,
                data.len() as u64,
                resolve_permissions(&role, &config),
            ) {
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
                    state
                        .audit
                        .record(
                            "upload",
                            Some(audit_role(&role)), audit_identity(&role),
                            true,
                            json!({ "filename": clean_filename, "bytes": data.len() }),
                        )
                        .await;
                    return Json(FilePayload {
                        filename: clean_filename,
                    })
                    .into_response();
                }
                Err(e) => {
                    state
                        .audit
                        .record(
                            "upload",
                            Some(audit_role(&role)), audit_identity(&role),
                            false,
                            json!({ "filename": clean_filename, "reason": "moonraker_error" }),
                        )
                        .await;
                    return (StatusCode::BAD_GATEWAY, format!("Moonraker error: {:?}", e))
                        .into_response();
                }
            }
        }
    }

    (StatusCode::BAD_REQUEST, "Lipsește fișierul").into_response()
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
pub(crate) async fn get_gcode_file(
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

/// Validates a Moonraker file-root name (`gcodes`/`config`/`logs`/...).
/// Guarantee callers rely on: the returned string is a single path segment
/// with no separators, traversal (`..`), or control characters — safe to use
/// directly as one directory-name component without further checks.
pub(crate) fn safe_file_root(root: Option<&str>) -> Result<String, &'static str> {
    let root = root.unwrap_or("gcodes").trim();
    if root.is_empty()
        || root.contains('/')
        || root.contains('\\')
        || root.contains("..")
        || root.chars().any(|ch| ch.is_control())
    {
        return Err("Invalid file root");
    }
    Ok(root.to_string())
}

/// Validates a relative file path within a file root. Guarantee callers rely
/// on: the returned string has no leading `/`, no `\`, no control characters,
/// and no `.`/`..`/empty path segments — safe to join onto a root directory
/// with a plain `/` and pass to the filesystem without further sanitization.
/// `allow_empty` controls whether an empty path is itself acceptable (e.g.
/// "the root directory itself") or an error.
pub(crate) fn safe_file_path(path: &str, allow_empty: bool) -> Result<String, &'static str> {
    let path = path.trim().trim_start_matches('/');
    if path.is_empty() {
        return if allow_empty {
            Ok(String::new())
        } else {
            Err("Invalid file path")
        };
    }
    if path.chars().any(|ch| ch == '\\' || ch.is_control()) {
        return Err("Invalid file path");
    }
    if path
        .split('/')
        .any(|segment| segment.is_empty() || segment == "." || segment == "..")
    {
        return Err("Invalid file path");
    }
    Ok(path.to_string())
}

/// List files under any Moonraker registered root. Gated by view_files.
pub(crate) fn file_response_name(path: &str, fallback: &str) -> String {
    path.rsplit('/')
        .next()
        .filter(|name| !name.is_empty())
        .unwrap_or(fallback)
        .to_string()
}

/// List one Moonraker directory with extended metadata. Gated by view_files.
pub(crate) fn moonraker_result(body: serde_json::Value) -> serde_json::Value {
    body.get("result").cloned().unwrap_or(body)
}

/// Read a raw text file from any Moonraker registered root. Gated by view_files.
pub(crate) async fn list_files(
    State(state): State<Arc<AppState>>,
    identity: AuthedIdentity,
    Query(query): Query<FileRootQuery>,
) -> Response {
    let config = state.config.load();
    let role = identity.0;
    if let Err(r) = require_permission(&role, &config, |p| p.view_files) {
        return r;
    }
    let root = match safe_file_root(query.root.as_deref()) {
        Ok(root) => root,
        Err(message) => return (StatusCode::BAD_REQUEST, message).into_response(),
    };
    let path = match query.path.as_deref() {
        Some(path) => match safe_file_path(path, true) {
            Ok(path) => Some(path),
            Err(message) => return (StatusCode::BAD_REQUEST, message).into_response(),
        },
        None => None,
    };
    match state.moonraker.list_files(&root, path.as_deref()).await {
        Ok(body) => Json(moonraker_result(body)).into_response(),
        Err(e) => (StatusCode::BAD_GATEWAY, e.to_string()).into_response(),
    }
}

/// Download a file from any Moonraker registered root. Gated by view_files.
pub(crate) async fn list_directory(
    State(state): State<Arc<AppState>>,
    identity: AuthedIdentity,
    Query(query): Query<FileRootQuery>,
) -> Response {
    let config = state.config.load();
    let role = identity.0;
    if let Err(r) = require_permission(&role, &config, |p| p.view_files) {
        return r;
    }
    let root = match safe_file_root(query.root.as_deref()) {
        Ok(root) => root,
        Err(message) => return (StatusCode::BAD_REQUEST, message).into_response(),
    };
    let path = match query.path.as_deref() {
        Some(path) => match safe_file_path(path, true) {
            Ok(path) => Some(path),
            Err(message) => return (StatusCode::BAD_REQUEST, message).into_response(),
        },
        None => None,
    };
    match state.moonraker.list_directory(&root, path.as_deref()).await {
        Ok(body) => Json(moonraker_result(body)).into_response(),
        Err(e) => (StatusCode::BAD_GATEWAY, e.to_string()).into_response(),
    }
}

/// Serve a G-code thumbnail image through the portal (permission-checked) so the
/// browser never needs direct access to Moonraker. Returned inline with the
/// right image content-type so it renders in an <img>. Gated by view_files.
pub(crate) async fn read_file_raw(
    State(state): State<Arc<AppState>>,
    identity: AuthedIdentity,
    Query(query): Query<FileRootQuery>,
    AxumPath(path): AxumPath<String>,
) -> Response {
    let config = state.config.load();
    let role = identity.0;
    if let Err(r) = require_permission(&role, &config, |p| p.view_files) {
        return r;
    }
    let root = match safe_file_root(query.root.as_deref()) {
        Ok(root) => root,
        Err(message) => return (StatusCode::BAD_REQUEST, message).into_response(),
    };
    let clean = match safe_file_path(&path, false) {
        Ok(path) => path,
        Err(message) => return (StatusCode::BAD_REQUEST, message).into_response(),
    };
    match state.moonraker.read_file(&root, &clean).await {
        Ok(content) => (
            StatusCode::OK,
            [(
                axum::http::header::CONTENT_TYPE,
                "text/plain; charset=utf-8",
            )],
            content,
        )
            .into_response(),
        Err(e) => (StatusCode::BAD_GATEWAY, e.to_string()).into_response(),
    }
}

/// Upload a multipart file to any Moonraker registered root. Gated by upload_gcode/manage_files.
pub(crate) async fn download_file(
    State(state): State<Arc<AppState>>,
    identity: AuthedIdentity,
    Query(query): Query<FileRootQuery>,
    AxumPath(path): AxumPath<String>,
) -> Response {
    let config = state.config.load();
    let role = identity.0;
    if let Err(r) = require_permission(&role, &config, |p| p.view_files) {
        return r;
    }
    let root = match safe_file_root(query.root.as_deref()) {
        Ok(root) => root,
        Err(message) => return (StatusCode::BAD_REQUEST, message).into_response(),
    };
    let clean = match safe_file_path(&path, false) {
        Ok(path) => path,
        Err(message) => return (StatusCode::BAD_REQUEST, message).into_response(),
    };
    match state.moonraker.download_file(&root, &clean).await {
        Ok(bytes) => (
            StatusCode::OK,
            [
                (axum::http::header::CONTENT_TYPE, "application/octet-stream"),
                (
                    axum::http::header::CONTENT_DISPOSITION,
                    &format!(
                        "attachment; filename=\"{}\"",
                        file_response_name(&clean, "download")
                    ),
                ),
            ],
            bytes,
        )
            .into_response(),
        Err(e) => (StatusCode::BAD_GATEWAY, e.to_string()).into_response(),
    }
}

pub(crate) async fn serve_thumbnail(
    State(state): State<Arc<AppState>>,
    identity: AuthedIdentity,
    Query(query): Query<FileRootQuery>,
    AxumPath(path): AxumPath<String>,
) -> Response {
    let config = state.config.load();
    let role = identity.0;
    if let Err(r) = require_permission(&role, &config, |p| p.view_files) {
        return r;
    }
    let root = match safe_file_root(query.root.as_deref()) {
        Ok(root) => root,
        Err(message) => return (StatusCode::BAD_REQUEST, message).into_response(),
    };
    let clean = match safe_file_path(&path, false) {
        Ok(path) => path,
        Err(message) => return (StatusCode::BAD_REQUEST, message).into_response(),
    };
    let content_type = if clean.ends_with(".png") {
        "image/png"
    } else if clean.ends_with(".jpg") || clean.ends_with(".jpeg") {
        "image/jpeg"
    } else if clean.ends_with(".gif") {
        "image/gif"
    } else if clean.ends_with(".svg") {
        "image/svg+xml"
    } else {
        "application/octet-stream"
    };
    match state.moonraker.download_file(&root, &clean).await {
        Ok(bytes) => (
            StatusCode::OK,
            [
                (axum::http::header::CONTENT_TYPE, content_type),
                (axum::http::header::CACHE_CONTROL, "public, max-age=86400"),
            ],
            bytes,
        )
            .into_response(),
        Err(e) => (StatusCode::BAD_GATEWAY, e.to_string()).into_response(),
    }
}

pub(crate) async fn upload_file(
    State(state): State<Arc<AppState>>,
    identity: AuthedIdentity,
    mut multipart: Multipart,
) -> Response {
    let config = state.config.load();
    let role = identity.0;

    let mut root = "gcodes".to_string();
    let mut path: Option<String> = None;
    let mut file_name: Option<String> = None;
    let mut file_bytes: Option<Vec<u8>> = None;

    while let Ok(Some(field)) = multipart.next_field().await {
        let name = field.name().unwrap_or("").to_string();
        match name.as_str() {
            "root" => match field.text().await {
                Ok(value) => root = value,
                Err(e) => return (StatusCode::BAD_REQUEST, e.to_string()).into_response(),
            },
            "path" => match field.text().await {
                Ok(value) => path = Some(value),
                Err(e) => return (StatusCode::BAD_REQUEST, e.to_string()).into_response(),
            },
            "file" => {
                file_name = Some(field.file_name().unwrap_or("upload.bin").to_string());
                match field.bytes().await {
                    Ok(bytes) => file_bytes = Some(bytes.to_vec()),
                    Err(e) => return (StatusCode::BAD_REQUEST, e.to_string()).into_response(),
                }
            }
            _ => {}
        }
    }

    let root = match safe_file_root(Some(&root)) {
        Ok(root) => root,
        Err(message) => return (StatusCode::BAD_REQUEST, message).into_response(),
    };
    if root == "gcodes" {
        if let Err(r) = require_permission(&role, &config, |p| p.upload_gcode) {
            return r;
        }
    } else if let Err(r) = require_permission(&role, &config, |p| p.manage_files) {
        return r;
    }
    let path = match path.as_deref() {
        Some(path) => match safe_file_path(path, true) {
            Ok(path) if path.is_empty() => None,
            Ok(path) => Some(path),
            Err(message) => return (StatusCode::BAD_REQUEST, message).into_response(),
        },
        None => None,
    };
    let file_name = match file_name {
        Some(name) => match safe_file_path(&name, false) {
            Ok(name) => name,
            Err(message) => return (StatusCode::BAD_REQUEST, message).into_response(),
        },
        None => return (StatusCode::BAD_REQUEST, "Missing file").into_response(),
    };
    let file_bytes = match file_bytes {
        Some(bytes) => bytes,
        None => return (StatusCode::BAD_REQUEST, "Missing file").into_response(),
    };
    if root == "gcodes" {
        if let Err(e) = SafetyManager::validate_upload(
            &file_name,
            file_bytes.len() as u64,
            resolve_permissions(&role, &config),
        ) {
            return (StatusCode::BAD_REQUEST, e).into_response();
        }
    }

    match state
        .moonraker
        .upload_file(&root, path.as_deref(), &file_name, file_bytes)
        .await
    {
        Ok(body) => Json(moonraker_result(body)).into_response(),
        Err(e) => (StatusCode::BAD_GATEWAY, e.to_string()).into_response(),
    }
}

/// Create a directory under any Moonraker registered root. Gated by manage_files.
pub(crate) async fn create_directory(
    State(state): State<Arc<AppState>>,
    identity: AuthedIdentity,
    Json(payload): Json<DirectoryPayload>,
) -> Response {
    let config = state.config.load();
    let role = identity.0;
    if let Err(r) = require_permission(&role, &config, |p| p.manage_files) {
        return r;
    }
    let root = match safe_file_root(payload.root.as_deref()) {
        Ok(root) => root,
        Err(message) => return (StatusCode::BAD_REQUEST, message).into_response(),
    };
    let path = match safe_file_path(&payload.path, false) {
        Ok(path) => path,
        Err(message) => return (StatusCode::BAD_REQUEST, message).into_response(),
    };
    match state.moonraker.create_directory(&root, &path).await {
        Ok(body) => Json(moonraker_result(body)).into_response(),
        Err(e) => (StatusCode::BAD_GATEWAY, e.to_string()).into_response(),
    }
}

/// Move or rename a file/directory. Gated by manage_files.
pub(crate) async fn move_file(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
    Json(payload): Json<FileMovePayload>,
) -> Response {
    file_transfer(state, jar, payload, true).await
}

/// Copy a file/directory. Gated by manage_files.
pub(crate) async fn copy_file(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
    Json(payload): Json<FileMovePayload>,
) -> Response {
    file_transfer(state, jar, payload, false).await
}

/// Delete a file from any Moonraker registered root. Gated by manage_files.
pub(crate) async fn file_transfer(
    state: Arc<AppState>,
    jar: CookieJar,
    payload: FileMovePayload,
    is_move: bool,
) -> Response {
    let config = state.config.load();
    let role = match check_authorized_action(&jar, &state.sessions, &config, false).await {
        Ok(r) => r,
        Err(s) => return s.into_response(),
    };
    if let Err(r) = require_permission(&role, &config, |p| p.manage_files) {
        return r;
    }
    let source_root = match safe_file_root(payload.source_root.as_deref()) {
        Ok(root) => root,
        Err(message) => return (StatusCode::BAD_REQUEST, message).into_response(),
    };
    let dest_root = match safe_file_root(payload.dest_root.as_deref().or(Some(&source_root))) {
        Ok(root) => root,
        Err(message) => return (StatusCode::BAD_REQUEST, message).into_response(),
    };
    let source = match safe_file_path(&payload.source, false) {
        Ok(path) => path,
        Err(message) => return (StatusCode::BAD_REQUEST, message).into_response(),
    };
    let dest = match safe_file_path(&payload.dest, false) {
        Ok(path) => path,
        Err(message) => return (StatusCode::BAD_REQUEST, message).into_response(),
    };
    let result = if is_move {
        state
            .moonraker
            .move_file(&source_root, &source, &dest_root, &dest)
            .await
    } else {
        state
            .moonraker
            .copy_file(&source_root, &source, &dest_root, &dest)
            .await
    };
    match result {
        Ok(body) => Json(moonraker_result(body)).into_response(),
        Err(e) => (StatusCode::BAD_GATEWAY, e.to_string()).into_response(),
    }
}

/// Delete a directory from any Moonraker registered root. Gated by manage_files.
pub(crate) async fn delete_file(
    State(state): State<Arc<AppState>>,
    identity: AuthedIdentity,
    Query(query): Query<FileDeleteQuery>,
    AxumPath(path): AxumPath<String>,
) -> Response {
    let config = state.config.load();
    let role = identity.0;
    if let Err(r) = require_permission(&role, &config, |p| p.manage_files) {
        return r;
    }
    let root = match safe_file_root(query.root.as_deref()) {
        Ok(root) => root,
        Err(message) => return (StatusCode::BAD_REQUEST, message).into_response(),
    };
    let clean = match safe_file_path(&path, false) {
        Ok(path) => path,
        Err(message) => return (StatusCode::BAD_REQUEST, message).into_response(),
    };
    match state.moonraker.delete_file(&root, &clean).await {
        Ok(body) => Json(moonraker_result(body)).into_response(),
        Err(e) => (StatusCode::BAD_GATEWAY, e.to_string()).into_response(),
    }
}

pub(crate) async fn delete_directory(
    State(state): State<Arc<AppState>>,
    identity: AuthedIdentity,
    Query(query): Query<FileDeleteQuery>,
) -> Response {
    let config = state.config.load();
    let role = identity.0;
    if let Err(r) = require_permission(&role, &config, |p| p.manage_files) {
        return r;
    }
    let root = match safe_file_root(query.root.as_deref()) {
        Ok(root) => root,
        Err(message) => return (StatusCode::BAD_REQUEST, message).into_response(),
    };
    let path = match query.path.as_deref() {
        Some(path) => match safe_file_path(path, false) {
            Ok(path) => path,
            Err(message) => return (StatusCode::BAD_REQUEST, message).into_response(),
        },
        None => return (StatusCode::BAD_REQUEST, "Missing directory path").into_response(),
    };
    match state
        .moonraker
        .delete_directory(&root, &path, query.force.unwrap_or(false))
        .await
    {
        Ok(body) => Json(moonraker_result(body)).into_response(),
        Err(e) => (StatusCode::BAD_GATEWAY, e.to_string()).into_response(),
    }
}

/// Zip selected files/directories with Moonraker. Gated by view_files.
pub(crate) async fn zip_files(
    State(state): State<Arc<AppState>>,
    identity: AuthedIdentity,
    Json(payload): Json<ZipPayload>,
) -> Response {
    let config = state.config.load();
    let role = identity.0;
    if let Err(r) = require_permission(&role, &config, |p| p.view_files) {
        return r;
    }
    let root = match safe_file_root(payload.root.as_deref()) {
        Ok(root) => root,
        Err(message) => return (StatusCode::BAD_REQUEST, message).into_response(),
    };
    if payload.items.is_empty() {
        return (StatusCode::BAD_REQUEST, "No files selected").into_response();
    }
    let mut items = Vec::with_capacity(payload.items.len());
    for item in payload.items {
        match safe_file_path(&item, false) {
            Ok(path) => items.push(path),
            Err(message) => return (StatusCode::BAD_REQUEST, message).into_response(),
        }
    }
    let destination = match payload.destination.as_deref() {
        Some(dest) => match safe_file_path(dest, false) {
            Ok(path) => Some(path),
            Err(message) => return (StatusCode::BAD_REQUEST, message).into_response(),
        },
        None => None,
    };
    match state
        .moonraker
        .zip_files(
            &root,
            &items,
            destination.as_deref(),
            payload.store_only.unwrap_or(false),
        )
        .await
    {
        Ok(bytes) => (
            StatusCode::OK,
            [
                (axum::http::header::CONTENT_TYPE, "application/zip"),
                (
                    axum::http::header::CONTENT_DISPOSITION,
                    "attachment; filename=\"files.zip\"",
                ),
            ],
            bytes,
        )
            .into_response(),
        Err(e) => (StatusCode::BAD_GATEWAY, e.to_string()).into_response(),
    }
}

/// G-code file metadata (thumbnails, estimated time, filament...). Gated by
/// view_files. Returns a trimmed subset the UI needs.
pub(crate) async fn get_file_metadata(
    State(state): State<Arc<AppState>>,
    identity: AuthedIdentity,
    Query(query): Query<MetadataQuery>,
) -> Response {
    let config = state.config.load();
    let role = identity.0;
    if let Err(r) = require_permission(&role, &config, |p| p.view_files) {
        return r;
    }
    match state.moonraker.get_file_metadata(&query.filename).await {
        Ok(body) => {
            let m = body.get("result").cloned().unwrap_or(body);
            let pick = |k: &str| m.get(k).cloned().unwrap_or(serde_json::Value::Null);
            Json(json!({
                "filename": query.filename,
                "thumbnails": pick("thumbnails"),
                "estimated_time": pick("estimated_time"),
                "filament_total": pick("filament_total"),
                "filament_weight_total": pick("filament_weight_total"),
                "layer_count": pick("layer_count"),
                "object_height": pick("object_height"),
                "size": pick("size"),
                "modified": pick("modified"),
            }))
            .into_response()
        }
        Err(e) => (StatusCode::BAD_GATEWAY, e.to_string()).into_response(),
    }
}

pub(crate) async fn list_gcode_files(State(state): State<Arc<AppState>>, identity: AuthedIdentity) -> Response {
    let config = state.config.load();
    let role = identity.0;

    if let Err(r) = require_permission(&role, &config, |p| p.view_files) {
        return r;
    }

    match state.moonraker.list_gcode_files().await {
        Ok(body) => Json(body).into_response(),
        Err(e) => (StatusCode::BAD_GATEWAY, e.to_string()).into_response(),
    }
}

pub(crate) async fn delete_gcode_file(
    State(state): State<Arc<AppState>>,
    identity: AuthedIdentity,
    AxumPath(path): AxumPath<String>,
) -> Response {
    let config = state.config.load();
    let role = identity.0;

    if let Err(r) = require_permission(&role, &config, |p| p.manage_files) {
        return r;
    }

    let clean_path = match validate_gcode_proxy_path(&path) {
        Ok(path) => path,
        Err(message) => return (StatusCode::BAD_REQUEST, message).into_response(),
    };

    match state.moonraker.delete_gcode_file(&clean_path).await {
        Ok(body) => {
            state
                .audit
                .record(
                    "files.delete",
                    Some(audit_role(&role)), audit_identity(&role),
                    true,
                    audit_detail("path", clean_path),
                )
                .await;
            Json(body).into_response()
        }
        Err(e) => {
            state
                .audit
                .record(
                    "files.delete",
                    Some(audit_role(&role)), audit_identity(&role),
                    false,
                    json!({ "path": clean_path, "reason": "moonraker_error" }),
                )
                .await;
            (StatusCode::BAD_GATEWAY, e.to_string()).into_response()
        }
    }
}

pub(crate) fn validate_gcode_proxy_path(path: &str) -> Result<String, &'static str> {
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


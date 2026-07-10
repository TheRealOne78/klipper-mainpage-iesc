//! Web-UI-facing endpoints for the pending-uploads queue (see
//! `pending_uploads.rs` for what the queue is and why it exists). Confirming
//! a queued file happens through the *existing* `POST /api/print/start`
//! (`print_control.rs::start_print`), not a dedicated endpoint here — that
//! handler already clears any matching queue entry once a print actually
//! begins, so the web UI's normal "start print" button works unmodified for
//! a queued file too.

use crate::*;
use axum::extract::{Path as AxumPath, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;
use std::sync::Arc;

/// `GET /api/pending-uploads` — lists files uploaded via the OctoPrint-compat
/// shim awaiting confirmation. Gated on `view_status` (not a stricter
/// permission) since the whole point is that even an anonymous visitor who
/// isn't logged in yet needs to see that a file is waiting, in order to
/// decide whether to log in and print it.
#[utoipa::path(
    get,
    path = "/api/pending-uploads",
    responses((status = 200, description = "Fișiere încărcate prin slicer, în așteptarea confirmării"))
)]
pub(crate) async fn list_pending_uploads(
    State(state): State<Arc<AppState>>,
    identity: AuthedIdentity,
) -> Response {
    let config = state.config.load();
    if let Err(r) = require_permission(&identity, &config, |p| p.view_status) {
        return r;
    }
    Json(state.pending_uploads.list().await).into_response()
}

/// `POST /api/pending-uploads/{id}/cancel` — discards a queued file without
/// printing it: deletes the underlying G-code file and removes it from the
/// queue. Any resolvable identity (anonymous included) may cancel — unlike
/// confirming (which starts a real print and is gated on `control_print`),
/// discarding an unstarted upload is low-stakes, and requiring a login just
/// to dismiss an unwanted file would be needless friction.
#[utoipa::path(
    post,
    path = "/api/pending-uploads/{id}/cancel",
    responses(
        (status = 200, description = "Fișier șters din coadă"),
        (status = 404, description = "Nu există în coadă")
    )
)]
pub(crate) async fn cancel_pending_upload(
    State(state): State<Arc<AppState>>,
    identity: AuthedIdentity,
    AxumPath(id): AxumPath<String>,
) -> Response {
    let Some(entry) = state.pending_uploads.remove_by_id(&id).await else {
        return (StatusCode::NOT_FOUND, Json(json!({ "error": "Nu există în coadă" })))
            .into_response();
    };

    let _ = state.moonraker.delete_file("gcodes", &entry.filename).await;

    state
        .audit
        .record(
            "upload.cancel",
            Some(audit_role(&identity)), audit_identity(&identity),
            true,
            json!({ "filename": entry.filename, "uploaded_by": entry.uploaded_by }),
        )
        .await;

    Json(json!({ "status": "ok" })).into_response()
}

/// `GET /api/pending-uploads/{id}/thumbnail` — proxies the queued file's
/// largest embedded thumbnail image. Deliberately gated on `view_status`
/// (matching `list_pending_uploads`), not the stricter `view_files` the
/// general file-manager thumbnail/metadata endpoints require: an anonymous
/// visitor who can already see *that* a file is queued (that's the whole
/// point of this feature — surfacing it before login) should be able to see
/// what it looks like too, without needing full file-manager access.
#[utoipa::path(
    get,
    path = "/api/pending-uploads/{id}/thumbnail",
    responses(
        (status = 200, description = "Imagine thumbnail"),
        (status = 404, description = "Nu există în coadă sau nu are previzualizare")
    )
)]
pub(crate) async fn pending_upload_thumbnail(
    State(state): State<Arc<AppState>>,
    identity: AuthedIdentity,
    AxumPath(id): AxumPath<String>,
) -> Response {
    let config = state.config.load();
    if let Err(r) = require_permission(&identity, &config, |p| p.view_status) {
        return r;
    }

    let no_preview = || (StatusCode::NOT_FOUND, "Fără previzualizare").into_response();

    let Some(filename) = state
        .pending_uploads
        .list()
        .await
        .into_iter()
        .find(|entry| entry.id == id)
        .map(|entry| entry.filename)
    else {
        return (StatusCode::NOT_FOUND, "Nu există în coadă").into_response();
    };

    let Ok(metadata) = state.moonraker.get_file_metadata(&filename).await else {
        return no_preview();
    };

    let Some(thumb_path) = resolve_best_thumbnail_path(&filename, &metadata) else {
        return no_preview();
    };

    let content_type = if thumb_path.ends_with(".png") {
        "image/png"
    } else if thumb_path.ends_with(".jpg") || thumb_path.ends_with(".jpeg") {
        "image/jpeg"
    } else {
        "application/octet-stream"
    };

    match state.moonraker.download_file("gcodes", &thumb_path).await {
        Ok(bytes) => (
            StatusCode::OK,
            [
                (axum::http::header::CONTENT_TYPE, content_type),
                (axum::http::header::CACHE_CONTROL, "public, max-age=86400"),
            ],
            bytes,
        )
            .into_response(),
        Err(_) => no_preview(),
    }
}

/// Picks the largest (by width) embedded thumbnail from a Moonraker
/// `server/files/metadata` response and resolves it to a path relative to
/// `gcodes` root, ready for `MoonrakerClient::download_file`. `None` when
/// there's no usable thumbnail entry. Pulled out of `pending_upload_thumbnail`
/// so this JSON-shape-dependent logic is unit-testable without a live
/// Moonraker connection — mirrors `lib/gcodeThumbnails.ts`'s
/// `pickGcodeThumbnail`/`buildMoonrakerThumbnailUrl` (the "big" variant) on
/// the frontend exactly, so both land on the same image.
fn resolve_best_thumbnail_path(filename: &str, metadata: &serde_json::Value) -> Option<String> {
    let result = metadata.get("result").unwrap_or(metadata);
    let thumbnails = result.get("thumbnails")?.as_array()?;

    let best = thumbnails
        .iter()
        .filter(|t| t.get("relative_path").and_then(|v| v.as_str()).is_some())
        .max_by_key(|t| t.get("width").and_then(|v| v.as_u64()).unwrap_or(0))?;
    let relative_path = best.get("relative_path")?.as_str()?;

    let directory = filename.rfind('/').map(|i| &filename[..=i]).unwrap_or("");
    Some(format!("{directory}{relative_path}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn picks_the_widest_thumbnail() {
        let metadata = json!({
            "thumbnails": [
                { "relative_path": ".thumbs/small.png", "width": 32 },
                { "relative_path": ".thumbs/big.png", "width": 300 },
                { "relative_path": ".thumbs/medium.png", "width": 100 },
            ]
        });
        let path = resolve_best_thumbnail_path("Cube.gcode", &metadata).unwrap();
        assert_eq!(path, ".thumbs/big.png");
    }

    #[test]
    fn resolves_relative_to_the_gcode_files_own_directory() {
        let metadata = json!({
            "thumbnails": [{ "relative_path": ".thumbs/big.png", "width": 300 }]
        });
        let path = resolve_best_thumbnail_path("projects/Cube.gcode", &metadata).unwrap();
        assert_eq!(path, "projects/.thumbs/big.png");
    }

    #[test]
    fn unwraps_a_moonraker_style_result_envelope() {
        let metadata = json!({
            "result": {
                "thumbnails": [{ "relative_path": ".thumbs/big.png", "width": 300 }]
            }
        });
        let path = resolve_best_thumbnail_path("Cube.gcode", &metadata).unwrap();
        assert_eq!(path, ".thumbs/big.png");
    }

    #[test]
    fn returns_none_when_thumbnails_is_missing() {
        assert!(resolve_best_thumbnail_path("Cube.gcode", &json!({})).is_none());
    }

    #[test]
    fn returns_none_when_thumbnails_is_an_empty_array() {
        assert!(resolve_best_thumbnail_path("Cube.gcode", &json!({ "thumbnails": [] })).is_none());
    }

    #[test]
    fn skips_entries_missing_a_relative_path() {
        let metadata = json!({
            "thumbnails": [
                { "width": 300 },
                { "relative_path": ".thumbs/ok.png", "width": 50 },
            ]
        });
        let path = resolve_best_thumbnail_path("Cube.gcode", &metadata).unwrap();
        assert_eq!(path, ".thumbs/ok.png");
    }

    #[test]
    fn treats_a_missing_width_as_zero_rather_than_erroring() {
        let metadata = json!({
            "thumbnails": [
                { "relative_path": ".thumbs/no-width.png" },
                { "relative_path": ".thumbs/has-width.png", "width": 10 },
            ]
        });
        let path = resolve_best_thumbnail_path("Cube.gcode", &metadata).unwrap();
        assert_eq!(path, ".thumbs/has-width.png");
    }
}

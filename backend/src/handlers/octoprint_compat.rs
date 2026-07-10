//! Minimal shim of OctoPrint's REST API (docs.octoprint.org) — just enough
//! for a slicer's "Print Host Upload" feature (OrcaSlicer, PrusaSlicer,
//! Cura's OctoPrint plugin) to upload a file through this app rather than
//! needing Moonraker's own `octoprint_compat` component or direct
//! unauthenticated access to Moonraker itself.
//!
//! A slicer's "upload and print" is deliberately *not* wired to actually
//! start a print here — the file always lands in the pending-uploads queue
//! (`pending_uploads.rs`) instead, and a human confirms it through the web
//! UI, which is exactly the existing `POST /api/print/start` a normal
//! web-upload's "start print" button already calls (see
//! `handlers/print_control.rs::start_print`, which clears the matching
//! queue entry once a print actually begins). That's the permission gate:
//! not the upload itself, but the confirm step, through the same
//! `control_print` check every other print-start path already uses. A
//! slicer blindly triggering a live print with no one watching is exactly
//! what this indirection exists to prevent.
//!
//! The `X-Api-Key` header, if a slicer sends one, is still resolved the same
//! way any other login is — a bare value against the shared admin/guest
//! passwords, or an `email:password` value against a local signup account —
//! but purely for *attribution* (`PendingUpload::uploaded_by`), not as a
//! gate: a missing or invalid key still queues the upload, just without
//! knowing who to credit until someone confirms it.

use crate::*;
use axum::extract::{Multipart, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;
use std::sync::Arc;
use tracing::info;

/// `GET /api/version` — the connection-test probe every OctoPrint-compatible
/// slicer calls first. Unauthenticated, matching real OctoPrint's default —
/// and the upload endpoint below doesn't enforce `X-Api-Key` either (see its
/// doc comment), so there was never a check to gate this behind anyway.
#[utoipa::path(
    get,
    path = "/api/version",
    responses((status = 200, description = "OctoPrint-compatible version probe"))
)]
pub(crate) async fn octoprint_version() -> Response {
    Json(json!({
        "api": "0.1",
        "server": "1.9.3",
        "text": "OctoPrint 1.9.3 (klipper-portal compat)",
    }))
    .into_response()
}

/// Resolves an `X-Api-Key` value to an `Identity`, trying both credential
/// shapes the header might hold — pulled out of `octoprint_identity` so it's
/// testable against cheaply-constructed dependencies instead of a full
/// `AppState` (which would otherwise require a live Moonraker connection to
/// exercise at all).
async fn resolve_api_key(
    users: &UserStore,
    sessions: &SessionManager,
    config: &Config,
    api_key: &str,
) -> Option<Identity> {
    if api_key.is_empty() {
        return None;
    }

    // "email:password" addresses a local signup account (any custom group),
    // not just the two shared admin/guest tiers below. A colon can't appear
    // in an email's local/domain parts outside a quoted string, so splitting
    // on the first one is unambiguous for real addresses.
    if let Some((email, password)) = api_key.split_once(':') {
        if let Ok(identity) = resolve_local_account_identity(users, email, password).await {
            return Some(identity);
        }
    }

    sessions
        .resolve_identity_for_password(api_key, config)
        .await
        .ok()
}

/// Resolves the optional `X-Api-Key` header to an `Identity` purely for
/// attribution — see the module doc comment for why a missing/invalid key
/// doesn't reject the request.
async fn octoprint_attribution(state: &AppState, headers: &HeaderMap, config: &Config) -> Option<Identity> {
    let api_key = headers
        .get("x-api-key")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .trim();
    resolve_api_key(&state.users, &state.sessions, config, api_key).await
}

/// `POST /api/files/local` — uploads a G-code file (multipart `file` field)
/// into the pending-uploads queue. Never starts a print itself, regardless
/// of the slicer's `print`/`select` fields — see the module doc comment.
#[utoipa::path(
    post,
    path = "/api/files/local",
    responses(
        (status = 201, description = "Fișier încărcat (compat OctoPrint), în coadă de confirmare"),
        (status = 400, description = "Fișier invalid sau limită depășită"),
        (status = 503, description = "Coada de fișiere în așteptare este plină")
    )
)]
pub(crate) async fn octoprint_upload_file(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    mut multipart: Multipart,
) -> Response {
    let config = state.config.load();
    let identity = octoprint_attribution(&state, &headers, &config).await;
    let uploaded_by = identity
        .as_ref()
        .map(|id| id.email.clone().unwrap_or_else(|| id.role.as_str().to_string()));
    let actor_role = identity.as_ref().map(audit_role);
    let actor_identity = identity.as_ref().and_then(audit_identity);
    // Only used to resolve the extension/size limits that still apply to an
    // anonymous upload — not an authorization check (see module doc comment).
    let limits_identity = identity.clone().unwrap_or_else(anonymous_identity);

    let mut clean_filename: Option<String> = None;
    let mut file_bytes: Option<Vec<u8>> = None;

    while let Ok(Some(field)) = multipart.next_field().await {
        let name = field.name().unwrap_or("").to_string();
        if name == "file" {
            let filename = field.file_name().unwrap_or("print.gcode").to_string();
            let data = match field.bytes().await {
                Ok(b) => b,
                Err(e) => return (StatusCode::BAD_REQUEST, e.to_string()).into_response(),
            };
            let safe = match SafetyManager::validate_upload(
                &filename,
                data.len() as u64,
                resolve_permissions(&limits_identity, &config),
            ) {
                Ok(f) => f,
                Err(e) => {
                    return (StatusCode::BAD_REQUEST, Json(json!({ "error": e })))
                        .into_response()
                }
            };
            clean_filename = Some(safe);
            file_bytes = Some(data.to_vec());
        } else {
            // Ignore fields we don't act on ("print", "select", "path",
            // slicer-specific userdata) — printing is never triggered from
            // here regardless of what the slicer requested (module doc
            // comment) rather than rejecting the whole upload over an
            // unrecognized extra field.
            let _ = field.bytes().await;
        }
    }

    let (filename, data) = match (clean_filename, file_bytes) {
        (Some(f), Some(d)) => (f, d),
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": "Lipsește fișierul" })),
            )
                .into_response()
        }
    };

    info!("OctoPrint-compat upload (queued): {}", filename);
    if let Err(e) = state.moonraker.upload_gcode(&filename, data.clone()).await {
        state
            .audit
            .record(
                "upload",
                actor_role,
                actor_identity.clone(),
                false,
                json!({ "filename": filename, "reason": "moonraker_error", "via": "octoprint_compat" }),
            )
            .await;
        return (
            StatusCode::BAD_GATEWAY,
            Json(json!({ "error": format!("Moonraker error: {:?}", e) })),
        )
            .into_response();
    }

    let queued = match state.pending_uploads.push(filename.clone(), uploaded_by).await {
        Ok(entry) => entry,
        Err(err) => {
            // The upload itself succeeded but the queue is full (or the
            // sqlite write failed) — clean up the now-orphaned file instead
            // of leaving it in the file list with nothing tracking it.
            let _ = state.moonraker.delete_file("gcodes", &filename).await;
            state
                .audit
                .record(
                    "upload",
                    actor_role,
                    actor_identity.clone(),
                    false,
                    json!({ "filename": filename, "reason": "queue_full", "via": "octoprint_compat" }),
                )
                .await;
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(json!({ "error": err.to_string() })),
            )
                .into_response();
        }
    };

    state
        .audit
        .record(
            "upload",
            actor_role,
            actor_identity.clone(),
            true,
            json!({
                "filename": filename,
                "bytes": data.len(),
                "via": "octoprint_compat",
                "queued": true,
                "pending_id": queued.id,
            }),
        )
        .await;

    (
        StatusCode::CREATED,
        [("Location", format!("/api/files/local/{filename}"))],
        Json(json!({
            "files": {
                "local": {
                    "name": filename,
                    "path": filename,
                    "origin": "local",
                }
            },
            "done": true,
        })),
    )
        .into_response()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn low_cost_hash(password: &str) -> String {
        bcrypt::hash(password, 4).expect("bcrypt hash")
    }

    fn config_with_passwords(admin_password: &str, guest_password: Option<&str>) -> Config {
        let mut config: Config = toml::from_str(Config::get_default_config_content())
            .expect("default template must parse");
        config.auth.admin_password_hash = low_cost_hash(admin_password);
        config.auth.guest_password_hash = guest_password.map(low_cost_hash);
        config
    }

    fn temp_store() -> UserStore {
        let mut path = std::env::temp_dir();
        path.push(format!("klipper-octoprint-test-{}.sqlite", uuid::Uuid::new_v4()));
        UserStore::new(path)
    }

    async fn store_with_verified_user(email: &str, password: &str, group: &str) -> UserStore {
        let store = temp_store();
        store.init().await.expect("init");
        store
            .create_verified(email, &low_cost_hash(password), group)
            .await
            .expect("create_verified");
        store
    }

    #[tokio::test]
    async fn empty_api_key_is_rejected() {
        let users = temp_store();
        let sessions = SessionManager::new();
        let config = config_with_passwords("admin123", None);
        assert!(resolve_api_key(&users, &sessions, &config, "")
            .await
            .is_none());
    }

    #[tokio::test]
    async fn bare_admin_password_resolves_to_admin() {
        let users = temp_store();
        let sessions = SessionManager::new();
        let config = config_with_passwords("admin123", None);
        let identity = resolve_api_key(&users, &sessions, &config, "admin123")
            .await
            .expect("should resolve");
        assert_eq!(identity.role, UserRole::Admin);
    }

    #[tokio::test]
    async fn bare_guest_password_resolves_to_guest() {
        let users = temp_store();
        let sessions = SessionManager::new();
        let config = config_with_passwords("admin123", Some("guest123"));
        let identity = resolve_api_key(&users, &sessions, &config, "guest123")
            .await
            .expect("should resolve");
        assert_eq!(identity.role, UserRole::Guest);
    }

    #[tokio::test]
    async fn wrong_bare_password_is_rejected() {
        let users = temp_store();
        let sessions = SessionManager::new();
        let config = config_with_passwords("admin123", None);
        assert!(resolve_api_key(&users, &sessions, &config, "nope")
            .await
            .is_none());
    }

    #[tokio::test]
    async fn email_password_form_resolves_to_the_accounts_own_group() {
        let users = store_with_verified_user("student@unitbv.ro", "hunter22", "lab-members").await;
        let sessions = SessionManager::new();
        let config = config_with_passwords("admin123", None);
        let identity = resolve_api_key(&users, &sessions, &config, "student@unitbv.ro:hunter22")
            .await
            .expect("should resolve via local account");
        assert_eq!(identity.role, UserRole::Group("lab-members".to_string()));
        assert_eq!(identity.email, Some("student@unitbv.ro".to_string()));
    }

    #[tokio::test]
    async fn wrong_password_in_email_password_form_is_rejected() {
        let users = store_with_verified_user("student@unitbv.ro", "hunter22", "guest").await;
        let sessions = SessionManager::new();
        // Admin/guest passwords deliberately don't collide with the raw
        // "student@unitbv.ro:wrongpass" string, so the fallback bare-password
        // check below can't accidentally let this through either.
        let config = config_with_passwords("admin123", None);
        assert!(resolve_api_key(
            &users,
            &sessions,
            &config,
            "student@unitbv.ro:wrongpass"
        )
        .await
        .is_none());
    }

    #[tokio::test]
    async fn unknown_email_in_email_password_form_is_rejected() {
        let users = temp_store();
        users.init().await.expect("init");
        let sessions = SessionManager::new();
        let config = config_with_passwords("admin123", None);
        assert!(
            resolve_api_key(&users, &sessions, &config, "nobody@unitbv.ro:whatever")
                .await
                .is_none()
        );
    }

    #[tokio::test]
    async fn a_colon_containing_admin_password_still_works_via_the_bare_fallback() {
        // If the local-account interpretation of "email:password" doesn't
        // pan out, the full original string must still be tried as a bare
        // shared password — otherwise an admin whose password happens to
        // contain a colon would be locked out of the OctoPrint-compat API.
        let users = temp_store();
        users.init().await.expect("init");
        let sessions = SessionManager::new();
        let config = config_with_passwords("adm:in123", None);
        let identity = resolve_api_key(&users, &sessions, &config, "adm:in123")
            .await
            .expect("should fall back to the bare shared password");
        assert_eq!(identity.role, UserRole::Admin);
    }

    #[tokio::test]
    async fn unverified_local_account_cannot_authenticate_via_api_key() {
        let store = temp_store();
        store.init().await.expect("init");
        store
            .create_pending(
                "pending@unitbv.ro",
                &low_cost_hash("hunter22"),
                "guest",
                "sometoken",
                "2999-01-01T00:00:00Z",
            )
            .await
            .expect("create_pending");
        let sessions = SessionManager::new();
        let config = config_with_passwords("admin123", None);
        assert!(resolve_api_key(
            &store,
            &sessions,
            &config,
            "pending@unitbv.ro:hunter22"
        )
        .await
        .is_none());
    }
}

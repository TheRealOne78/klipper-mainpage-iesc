use crate::*;
use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;
use std::sync::Arc;

#[utoipa::path(
    post,
    path = "/api/print/start",
    request_body = FilePayload,
    responses(
        (status = 200, description = "Printare pornita cu succes", body = StatusResponse),
        (status = 403, description = "Acțiune interzisă sau limită depășită")
    )
)]
pub(crate) async fn start_print(
    State(state): State<Arc<AppState>>,
    identity: AuthedIdentity,
    Json(payload): Json<FilePayload>,
) -> Response {
    let config = state.config.load();
    let role = identity.0;

    if let Err(r) = require_permission(&role, &config, |p| p.control_print) {
        return r;
    }

    let _st = match require_printer_connected(&state).await {
        Ok(s) => s,
        Err(r) => return r,
    };

    let clean_filename = match SafetyManager::validate_upload(
        &payload.filename,
        0,
        resolve_permissions(&role, &config),
    ) {
        Ok(f) => f,
        Err(e) => return (StatusCode::BAD_REQUEST, e).into_response(),
    };

    match state.moonraker.start_print(&clean_filename).await {
        Ok(_) => {
            // Clears the file from the OctoPrint-compat pending queue (see
            // pending_uploads.rs) if it came from a slicer upload — this is
            // the "confirm" step for that flow, reusing this same endpoint
            // rather than needing a dedicated one. `uploaded_by` is `None`
            // for a normal web-upload-started print (never queued) or a
            // slicer upload nobody was identified for.
            let queued = state.pending_uploads.remove_by_filename(&clean_filename).await;
            state
                .audit
                .record(
                    "print.start",
                    Some(audit_role(&role)), audit_identity(&role),
                    true,
                    json!({
                        "filename": clean_filename,
                        "uploaded_by": queued.and_then(|q| q.uploaded_by),
                    }),
                )
                .await;
            Json(StatusResponse {
                status: "ok".to_string(),
            })
            .into_response()
        }
        Err(e) => {
            state
                .audit
                .record(
                    "print.start",
                    Some(audit_role(&role)), audit_identity(&role),
                    false,
                    json!({ "filename": clean_filename, "reason": "moonraker_error" }),
                )
                .await;
            (StatusCode::BAD_GATEWAY, e.to_string()).into_response()
        }
    }
}

#[utoipa::path(
    post,
    path = "/api/print/pause",
    responses(
        (status = 200, description = "Printare pusa in pauza", body = StatusResponse)
    )
)]
pub(crate) async fn pause_print(State(state): State<Arc<AppState>>, identity: AuthedIdentity) -> Response {
    let config = state.config.load();
    let role = identity.0;

    if let Err(r) = require_permission(&role, &config, |p| p.control_print) {
        return r;
    }

    let _st = match require_printer_connected(&state).await {
        Ok(s) => s,
        Err(r) => return r,
    };

    match state.moonraker.pause_print().await {
        Ok(_) => {
            state
                .audit
                .record("print.pause", Some(audit_role(&role)), audit_identity(&role), true, json!({}))
                .await;
            Json(StatusResponse {
                status: "ok".to_string(),
            })
            .into_response()
        }
        Err(e) => {
            state
                .audit
                .record(
                    "print.pause",
                    Some(audit_role(&role)), audit_identity(&role),
                    false,
                    audit_detail("reason", "moonraker_error"),
                )
                .await;
            (StatusCode::BAD_GATEWAY, e.to_string()).into_response()
        }
    }
}

#[utoipa::path(
    post,
    path = "/api/print/emergency_stop",
    responses(
        (status = 200, description = "OPRIRE DE URGENTA trimisa", body = StatusResponse)
    )
)]
pub(crate) async fn emergency_stop(State(state): State<Arc<AppState>>, identity: AuthedIdentity) -> Response {
    let role = identity.0;

    let _st = match require_printer_connected(&state).await {
        Ok(s) => s,
        Err(r) => return r,
    };

    match state.moonraker.emergency_stop().await {
        Ok(_) => {
            state
                .audit
                .record(
                    "print.emergency_stop",
                    Some(audit_role(&role)), audit_identity(&role),
                    true,
                    json!({}),
                )
                .await;
            Json(StatusResponse {
                status: "ok".to_string(),
            })
            .into_response()
        }
        Err(e) => {
            state
                .audit
                .record(
                    "print.emergency_stop",
                    Some(audit_role(&role)), audit_identity(&role),
                    false,
                    audit_detail("reason", "moonraker_error"),
                )
                .await;
            (StatusCode::BAD_GATEWAY, e.to_string()).into_response()
        }
    }
}

#[utoipa::path(
    post,
    path = "/api/print/cancel",
    responses(
        (status = 200, description = "Printare anulata", body = StatusResponse)
    )
)]
pub(crate) async fn cancel_print(State(state): State<Arc<AppState>>, identity: AuthedIdentity) -> Response {
    let config = state.config.load();
    let role = identity.0;

    if let Err(r) = require_permission(&role, &config, |p| p.control_print) {
        return r;
    }

    let _st = match require_printer_connected(&state).await {
        Ok(s) => s,
        Err(r) => return r,
    };

    match state.moonraker.cancel_print().await {
        Ok(_) => {
            state
                .audit
                .record("print.cancel", Some(audit_role(&role)), audit_identity(&role), true, json!({}))
                .await;
            Json(StatusResponse {
                status: "ok".to_string(),
            })
            .into_response()
        }
        Err(e) => {
            state
                .audit
                .record(
                    "print.cancel",
                    Some(audit_role(&role)), audit_identity(&role),
                    false,
                    audit_detail("reason", "moonraker_error"),
                )
                .await;
            (StatusCode::BAD_GATEWAY, e.to_string()).into_response()
        }
    }
}

#[utoipa::path(
    post,
    path = "/api/print/resume",
    responses(
        (status = 200, description = "Printare reluata", body = StatusResponse)
    )
)]
pub(crate) async fn resume_print(State(state): State<Arc<AppState>>, identity: AuthedIdentity) -> Response {
    let config = state.config.load();
    let role = identity.0;

    if let Err(r) = require_permission(&role, &config, |p| p.control_print) {
        return r;
    }

    let _st = match require_printer_connected(&state).await {
        Ok(s) => s,
        Err(r) => return r,
    };

    match state.moonraker.resume_print().await {
        Ok(_) => {
            state
                .audit
                .record("print.resume", Some(audit_role(&role)), audit_identity(&role), true, json!({}))
                .await;
            Json(StatusResponse {
                status: "ok".to_string(),
            })
            .into_response()
        }
        Err(e) => {
            state
                .audit
                .record(
                    "print.resume",
                    Some(audit_role(&role)), audit_identity(&role),
                    false,
                    audit_detail("reason", "moonraker_error"),
                )
                .await;
            (StatusCode::BAD_GATEWAY, e.to_string()).into_response()
        }
    }
}

/// Moonraker announcements (notification bell). Gated view_status.
pub(crate) async fn get_announcements(State(state): State<Arc<AppState>>, identity: AuthedIdentity) -> Response {
    let config = state.config.load();
    let role = identity.0;
    if let Err(r) = require_permission(&role, &config, |p| p.view_status) {
        return r;
    }
    match state.moonraker.get_announcements().await {
        Ok(body) => {
            let entries = body
                .get("result")
                .and_then(|r| r.get("entries"))
                .cloned()
                .unwrap_or(serde_json::Value::Array(vec![]));
            Json(json!({ "entries": entries })).into_response()
        }
        Err(e) => (StatusCode::BAD_GATEWAY, e.to_string()).into_response(),
    }
}

/// Available G-code command names for console autocomplete. Gated view_console.
pub(crate) async fn get_console_commands(State(state): State<Arc<AppState>>, identity: AuthedIdentity) -> Response {
    let config = state.config.load();
    let role = identity.0;
    if let Err(r) = require_permission(&role, &config, |p| p.view_console) {
        return r;
    }
    match state.moonraker.get_gcode_help().await {
        Ok(body) => {
            let mut cmds: Vec<String> = body
                .get("result")
                .and_then(|r| r.as_object())
                .map(|m| m.keys().cloned().collect())
                .unwrap_or_default();
            cmds.sort();
            Json(json!({ "commands": cmds })).into_response()
        }
        Err(e) => (StatusCode::BAD_GATEWAY, e.to_string()).into_response(),
    }
}

pub(crate) async fn send_console_command(
    State(state): State<Arc<AppState>>,
    identity: AuthedIdentity,
    Json(payload): Json<ConsoleCommandPayload>,
) -> Response {
    let config = state.config.load();
    let role = identity.0;

    if let Err(r) = require_permission(&role, &config, |p| p.send_console) {
        return r;
    }

    let command = payload.command.trim();
    if command.is_empty() {
        return (StatusCode::BAD_REQUEST, "Command cannot be empty").into_response();
    }

    let _st = match require_printer_connected(&state).await {
        Ok(s) => s,
        Err(r) => return r,
    };

    match state.moonraker.run_gcode(command).await {
        Ok(_) => {
            state
                .audit
                .record(
                    "console.send",
                    Some(audit_role(&role)), audit_identity(&role),
                    true,
                    audit_detail("command", command.to_string()),
                )
                .await;
            Json(StatusResponse {
                status: "ok".to_string(),
            })
            .into_response()
        }
        Err(e) => {
            state
                .audit
                .record(
                    "console.send",
                    Some(audit_role(&role)), audit_identity(&role),
                    false,
                    json!({ "command": command, "reason": "moonraker_error" }),
                )
                .await;
            (StatusCode::BAD_GATEWAY, e.to_string()).into_response()
        }
    }
}

/// Print history + aggregate statistics, proxied from Moonraker. Read-only,
/// gated by `view_files` (jobs are file-scoped). Returns { jobs, totals }.
pub(crate) async fn get_print_history(
    State(state): State<Arc<AppState>>,
    identity: AuthedIdentity,
    Query(query): Query<HistoryQuery>,
) -> Response {
    let config = state.config.load();
    let role = identity.0;

    if let Err(r) = require_permission(&role, &config, |p| p.view_files) {
        return r;
    }

    let limit = query.limit.unwrap_or(50).clamp(1, 200);
    let list = match state.moonraker.get_history_list(limit).await {
        Ok(body) => body,
        Err(e) => return (StatusCode::BAD_GATEWAY, e.to_string()).into_response(),
    };
    let totals = match state.moonraker.get_history_totals().await {
        Ok(body) => body,
        Err(e) => return (StatusCode::BAD_GATEWAY, e.to_string()).into_response(),
    };

    let jobs = list
        .get("result")
        .and_then(|r| r.get("jobs"))
        .cloned()
        .unwrap_or(serde_json::Value::Array(vec![]));
    let job_totals = totals
        .get("result")
        .and_then(|r| r.get("job_totals"))
        .cloned()
        .unwrap_or(serde_json::Value::Null);

    Json(json!({ "jobs": jobs, "totals": job_totals })).into_response()
}

/// Job queue status (queued jobs + queue state). Read-only, gated by view_files.
pub(crate) async fn get_job_queue(State(state): State<Arc<AppState>>, identity: AuthedIdentity) -> Response {
    let config = state.config.load();
    let role = identity.0;
    if let Err(r) = require_permission(&role, &config, |p| p.view_files) {
        return r;
    }
    match state.moonraker.get_job_queue().await {
        Ok(body) => {
            let result = body.get("result").cloned().unwrap_or(body);
            Json(result).into_response()
        }
        Err(e) => (StatusCode::BAD_GATEWAY, e.to_string()).into_response(),
    }
}

/// Append G-code files to the job queue. Gated by control_print.
pub(crate) async fn job_queue_add(
    State(state): State<Arc<AppState>>,
    identity: AuthedIdentity,
    Json(payload): Json<JobQueueAddPayload>,
) -> Response {
    let config = state.config.load();
    let role = identity.0;
    if let Err(r) = require_permission(&role, &config, |p| p.control_print) {
        return r;
    }
    if payload.filenames.is_empty() {
        return (StatusCode::BAD_REQUEST, "No filenames provided").into_response();
    }
    match state.moonraker.job_queue_add(&payload.filenames).await {
        Ok(body) => {
            state
                .audit
                .record(
                    "job_queue.add",
                    Some(audit_role(&role)), audit_identity(&role),
                    true,
                    json!({ "filenames": payload.filenames }),
                )
                .await;
            Json(body).into_response()
        }
        Err(e) => (StatusCode::BAD_GATEWAY, e.to_string()).into_response(),
    }
}

/// Remove queued jobs (by id, or all). Gated by control_print.
pub(crate) async fn job_queue_delete(
    State(state): State<Arc<AppState>>,
    identity: AuthedIdentity,
    Json(payload): Json<JobQueueDeletePayload>,
) -> Response {
    let config = state.config.load();
    let role = identity.0;
    if let Err(r) = require_permission(&role, &config, |p| p.control_print) {
        return r;
    }
    if !payload.all && payload.job_ids.is_empty() {
        return (StatusCode::BAD_REQUEST, "No job ids provided").into_response();
    }
    match state
        .moonraker
        .job_queue_delete(&payload.job_ids, payload.all)
        .await
    {
        Ok(body) => {
            state
                .audit
                .record(
                    "job_queue.delete",
                    Some(audit_role(&role)), audit_identity(&role),
                    true,
                    json!({ "job_ids": payload.job_ids, "all": payload.all }),
                )
                .await;
            Json(body).into_response()
        }
        Err(e) => (StatusCode::BAD_GATEWAY, e.to_string()).into_response(),
    }
}

/// Pause or start/resume the job queue. Gated by control_print.
pub(crate) async fn job_queue_state(
    State(state): State<Arc<AppState>>,
    identity: AuthedIdentity,
    Json(payload): Json<JobQueueStatePayload>,
) -> Response {
    let config = state.config.load();
    let role = identity.0;
    if let Err(r) = require_permission(&role, &config, |p| p.control_print) {
        return r;
    }
    match state.moonraker.job_queue_set_state(payload.pause).await {
        Ok(body) => {
            state
                .audit
                .record(
                    "job_queue.state",
                    Some(audit_role(&role)), audit_identity(&role),
                    true,
                    audit_detail("pause", payload.pause),
                )
                .await;
            Json(body).into_response()
        }
        Err(e) => (StatusCode::BAD_GATEWAY, e.to_string()).into_response(),
    }
}


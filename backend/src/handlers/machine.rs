use crate::*;
use axum::extract::{Path as AxumPath, Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;
use std::sync::Arc;

/// The list of Moonraker-managed services. Gated by control_machine.
pub(crate) async fn machine_reboot(State(state): State<Arc<AppState>>, identity: AuthedIdentity) -> Response {
    let config = state.config.load();
    let role = identity.0;

    if let Err(r) = require_permission(&role, &config, |p| p.control_machine) {
        return r;
    }

    match state.moonraker.machine_reboot().await {
        Ok(body) => {
            state
                .audit
                .record("machine.reboot", Some(audit_role(&role)), audit_identity(&role), true, json!({}))
                .await;
            Json(body).into_response()
        }
        Err(e) => {
            state
                .audit
                .record(
                    "machine.reboot",
                    Some(audit_role(&role)), audit_identity(&role),
                    false,
                    audit_detail("reason", "moonraker_error"),
                )
                .await;
            (StatusCode::BAD_GATEWAY, e.to_string()).into_response()
        }
    }
}

/// System loads for the Machine page: host details (`machine.system_info`),
/// resource stats (`machine.proc_stats`) and per-MCU stats (printer `mcu`
/// objects). Gated by control_machine. Each source is fetched independently and
/// degrades to null/empty on error so a single failing call never 502s the card.
pub(crate) async fn machine_shutdown(State(state): State<Arc<AppState>>, identity: AuthedIdentity) -> Response {
    let config = state.config.load();
    let role = identity.0;

    if let Err(r) = require_permission(&role, &config, |p| p.control_machine) {
        return r;
    }

    match state.moonraker.machine_shutdown().await {
        Ok(body) => {
            state
                .audit
                .record("machine.shutdown", Some(audit_role(&role)), audit_identity(&role), true, json!({}))
                .await;
            Json(body).into_response()
        }
        Err(e) => {
            state
                .audit
                .record(
                    "machine.shutdown",
                    Some(audit_role(&role)), audit_identity(&role),
                    false,
                    audit_detail("reason", "moonraker_error"),
                )
                .await;
            (StatusCode::BAD_GATEWAY, e.to_string()).into_response()
        }
    }
}

/// `GET /api/admin/macros` — live list of gcode_macro names known to Klipper,
/// for the admin panel's guest-macro checklist (replaces manual JSON editing).
/// Admin-only, since it reflects the live printer config, not portal config.
pub(crate) async fn query_endstops(State(state): State<Arc<AppState>>, identity: AuthedIdentity) -> Response {
    let config = state.config.load();
    let role = identity.0;
    if let Err(r) = require_permission(&role, &config, |p| p.view_toolhead) {
        return r;
    }
    match state.moonraker.query_endstops().await {
        Ok(body) => {
            let result = body.get("result").cloned().unwrap_or(body);
            Json(result).into_response()
        }
        Err(e) => (StatusCode::BAD_GATEWAY, e.to_string()).into_response(),
    }
}

pub(crate) async fn get_services(State(state): State<Arc<AppState>>, identity: AuthedIdentity) -> Response {
    let config = state.config.load();
    let role = identity.0;
    if let Err(r) = require_permission(&role, &config, |p| p.control_machine) {
        return r;
    }
    match state.moonraker.get_system_info().await {
        Ok(body) => {
            let services = body
                .get("result")
                .and_then(|r| r.get("system_info"))
                .and_then(|s| s.get("available_services"))
                .cloned()
                .unwrap_or(serde_json::Value::Array(vec![]));
            Json(json!({ "services": services })).into_response()
        }
        Err(e) => (StatusCode::BAD_GATEWAY, e.to_string()).into_response(),
    }
}

pub(crate) async fn get_machine_system(State(state): State<Arc<AppState>>, identity: AuthedIdentity) -> Response {
    let config = state.config.load();
    let role = identity.0;
    if let Err(r) = require_permission(&role, &config, |p| p.control_machine) {
        return r;
    }

    let system_info = match state.moonraker.get_system_info().await {
        Ok(body) => moonraker_result(body)
            .get("system_info")
            .cloned()
            .unwrap_or(serde_json::Value::Null),
        Err(_) => serde_json::Value::Null,
    };

    let proc_stats = match state.moonraker.get_proc_stats().await {
        Ok(body) => moonraker_result(body),
        Err(_) => serde_json::Value::Null,
    };

    // Discover MCU object names, then query them for version / freq / load stats.
    let mcus = match state.moonraker.list_printer_objects().await {
        Ok(body) => {
            let names: Vec<String> = moonraker_result(body)
                .get("objects")
                .and_then(|o| o.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str())
                        .filter(|n| *n == "mcu" || n.starts_with("mcu "))
                        .map(|s| s.to_string())
                        .collect()
                })
                .unwrap_or_default();
            if names.is_empty() {
                serde_json::Value::Object(Default::default())
            } else {
                let query = names
                    .iter()
                    .map(|n| n.replace(' ', "%20"))
                    .collect::<Vec<_>>()
                    .join("&");
                match state.moonraker.query_printer_objects(&query).await {
                    Ok(b) => moonraker_result(b)
                        .get("status")
                        .cloned()
                        .unwrap_or(serde_json::Value::Object(Default::default())),
                    Err(_) => serde_json::Value::Object(Default::default()),
                }
            }
        }
        Err(_) => serde_json::Value::Object(Default::default()),
    };

    Json(json!({
        "system_info": system_info,
        "proc_stats": proc_stats,
        "mcus": mcus,
    }))
    .into_response()
}

/// Restart/start/stop a managed service. Gated by control_machine.
pub(crate) async fn service_action(
    State(state): State<Arc<AppState>>,
    identity: AuthedIdentity,
    Json(payload): Json<ServiceActionPayload>,
) -> Response {
    let config = state.config.load();
    let role = identity.0;
    if let Err(r) = require_permission(&role, &config, |p| p.control_machine) {
        return r;
    }
    let action = payload.action.trim().to_ascii_lowercase();
    if action != "restart" && action != "start" && action != "stop" {
        return (
            StatusCode::BAD_REQUEST,
            "Action must be restart, start, or stop",
        )
            .into_response();
    }
    let service = payload.service.trim();
    if service.is_empty() {
        return (StatusCode::BAD_REQUEST, "Service cannot be empty").into_response();
    }
    match state.moonraker.service_action(service, &action).await {
        Ok(body) => {
            state
                .audit
                .record(
                    "machine.service",
                    Some(audit_role(&role)), audit_identity(&role),
                    true,
                    json!({ "service": service, "action": action }),
                )
                .await;
            Json(body).into_response()
        }
        Err(e) => (StatusCode::BAD_GATEWAY, e.to_string()).into_response(),
    }
}

pub(crate) async fn get_update_status(
    State(state): State<Arc<AppState>>,
    identity: AuthedIdentity,
    Query(query): Query<UpdateStatusQuery>,
) -> Response {
    let config = state.config.load();
    let role = identity.0;
    if let Err(r) = require_permission(&role, &config, |p| p.control_machine) {
        return r;
    }
    match state
        .moonraker
        .get_update_status(query.refresh.unwrap_or(false))
        .await
    {
        Ok(body) => {
            let result = body.get("result").cloned().unwrap_or(body);
            Json(result).into_response()
        }
        Err(e) => (StatusCode::BAD_GATEWAY, e.to_string()).into_response(),
    }
}

/// Trigger or recover a software update component. Gated by control_machine.
pub(crate) async fn machine_update(
    State(state): State<Arc<AppState>>,
    identity: AuthedIdentity,
    Json(payload): Json<UpdatePayload>,
) -> Response {
    let config = state.config.load();
    let role = identity.0;
    if let Err(r) = require_permission(&role, &config, |p| p.control_machine) {
        return r;
    }
    let component_value = payload
        .component
        .as_deref()
        .or(payload.name.as_deref())
        .or(payload.client.as_deref())
        .unwrap_or("");
    let component = component_value.trim();
    if component.is_empty() {
        return (StatusCode::BAD_REQUEST, "Component cannot be empty").into_response();
    }
    let action = payload
        .action
        .as_deref()
        .unwrap_or("update")
        .trim()
        .to_ascii_lowercase();
    let result = if action == "recover" {
        state
            .moonraker
            .recover_update(component, payload.hard.unwrap_or(false))
            .await
    } else if action == "update" {
        state.moonraker.update_component(component).await
    } else {
        return (StatusCode::BAD_REQUEST, "Action must be update or recover").into_response();
    };
    match result {
        Ok(body) => {
            state
                .audit
                .record(
                    if action == "recover" {
                        "machine.update.recover"
                    } else {
                        "machine.update"
                    },
                    Some(audit_role(&role)), audit_identity(&role),
                    true,
                    audit_detail("component", component.to_string()),
                )
                .await;
            Json(body).into_response()
        }
        Err(e) => (StatusCode::BAD_GATEWAY, e.to_string()).into_response(),
    }
}

/// List printer config files (printer.cfg, includes, backups). Gated by
/// control_machine (editing printer config is an admin-level operation).
pub(crate) async fn list_config_files(State(state): State<Arc<AppState>>, identity: AuthedIdentity) -> Response {
    let config = state.config.load();
    let role = identity.0;
    if let Err(r) = require_permission(&role, &config, |p| p.control_machine) {
        return r;
    }
    match state.moonraker.list_config_files().await {
        Ok(body) => {
            let files = body.get("result").cloned().unwrap_or(body);
            Json(files).into_response()
        }
        Err(e) => (StatusCode::BAD_GATEWAY, e.to_string()).into_response(),
    }
}

/// Read a printer config file's raw text. Gated by control_machine.
pub(crate) async fn read_config_file(
    State(state): State<Arc<AppState>>,
    identity: AuthedIdentity,
    AxumPath(path): AxumPath<String>,
) -> Response {
    let config = state.config.load();
    let role = identity.0;
    if let Err(r) = require_permission(&role, &config, |p| p.control_machine) {
        return r;
    }
    let clean = match safe_file_path(&path, false) {
        Ok(p) => p,
        Err(e) => return (StatusCode::BAD_REQUEST, e).into_response(),
    };
    match state.moonraker.read_config_file(&clean).await {
        Ok(content) => Json(json!({ "path": clean, "content": content })).into_response(),
        Err(e) => (StatusCode::BAD_GATEWAY, e.to_string()).into_response(),
    }
}

/// Write a printer config file. Gated by control_machine.
pub(crate) async fn write_config_file(
    State(state): State<Arc<AppState>>,
    identity: AuthedIdentity,
    AxumPath(path): AxumPath<String>,
    Json(payload): Json<ConfigFileWritePayload>,
) -> Response {
    let config = state.config.load();
    let role = identity.0;
    if let Err(r) = require_permission(&role, &config, |p| p.control_machine) {
        return r;
    }
    let clean = match safe_file_path(&path, false) {
        Ok(p) => p,
        Err(e) => return (StatusCode::BAD_REQUEST, e).into_response(),
    };
    match state
        .moonraker
        .write_config_file(&clean, payload.content)
        .await
    {
        Ok(_) => {
            state
                .audit
                .record(
                    "config.write",
                    Some(audit_role(&role)), audit_identity(&role),
                    true,
                    audit_detail("path", clean.clone()),
                )
                .await;
            Json(StatusResponse {
                status: "ok".to_string(),
            })
            .into_response()
        }
        Err(e) => (StatusCode::BAD_GATEWAY, e.to_string()).into_response(),
    }
}


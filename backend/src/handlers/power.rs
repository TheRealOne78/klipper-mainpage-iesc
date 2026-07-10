use crate::*;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;
use std::sync::Arc;

pub(crate) async fn get_power_devices(State(state): State<Arc<AppState>>, identity: AuthedIdentity) -> Response {
    let config = state.config.load();
    let role = identity.0;

    if let Err(r) = require_permission(&role, &config, |p| p.view_power) {
        return r;
    }

    match state.moonraker.get_power_devices().await {
        Ok(mut body) => {
            // Non-admins only see devices whose per-device override allows guest
            // visibility (admins see everything).
            if !matches!(role.role, UserRole::Admin) {
                if let Some(devices) = body
                    .get_mut("result")
                    .and_then(|r| r.get_mut("devices"))
                    .and_then(|d| d.as_array_mut())
                {
                    let perms = resolve_permissions(&role, &config);
                    devices.retain(|dev| {
                        let name = dev.get("device").and_then(|n| n.as_str()).unwrap_or("");
                        perms
                            .power_devices
                            .get(name)
                            .map(|d| d.visible)
                            .unwrap_or(true)
                    });
                }
            }
            Json(body).into_response()
        }
        Err(e) => (StatusCode::BAD_GATEWAY, e.to_string()).into_response(),
    }
}

/// Query endstop states (x/y/z open|TRIGGERED). Gated by view_toolhead.
pub(crate) async fn set_power_device(
    State(state): State<Arc<AppState>>,
    identity: AuthedIdentity,
    Json(payload): Json<PowerDevicePayload>,
) -> Response {
    let config = state.config.load();
    let role = identity.0;

    if let Err(r) = require_permission(&role, &config, |p| p.control_power) {
        return r;
    }

    let action = payload.action.trim().to_ascii_lowercase();
    if action != "on" && action != "off" && action != "toggle" {
        return (
            StatusCode::BAD_REQUEST,
            "Power action must be on, off, or toggle",
        )
            .into_response();
    }
    if payload.device.trim().is_empty() {
        return (StatusCode::BAD_REQUEST, "Power device cannot be empty").into_response();
    }

    // Per-device group policy: a non-admin may only toggle a device that's
    // absent from their group's power_devices map (open by default) or
    // explicitly marked controllable.
    if !matches!(role.role, UserRole::Admin) {
        let allowed = resolve_permissions(&role, &config)
            .power_devices
            .get(payload.device.trim())
            .map(|d| d.controllable)
            .unwrap_or(true);
        if !allowed {
            return (
                StatusCode::FORBIDDEN,
                "This power device is not guest-controllable",
            )
                .into_response();
        }
    }

    match state
        .moonraker
        .set_power_device(payload.device.trim(), &action)
        .await
    {
        Ok(body) => {
            state
                .audit
                .record(
                    "power.set",
                    Some(audit_role(&role)), audit_identity(&role),
                    true,
                    json!({ "device": payload.device.trim(), "action": action }),
                )
                .await;
            Json(body).into_response()
        }
        Err(e) => {
            state
                .audit
                .record(
                    "power.set",
                    Some(audit_role(&role)), audit_identity(&role),
                    false,
                    json!({ "device": payload.device.trim(), "action": action, "reason": "moonraker_error" }),
                )
                .await;
            (StatusCode::BAD_GATEWAY, e.to_string()).into_response()
        }
    }
}


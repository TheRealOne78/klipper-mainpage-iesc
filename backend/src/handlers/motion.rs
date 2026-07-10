use crate::*;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;
use std::sync::Arc;

/// Set the part-cooling fan speed (M106). Gated by control_temps.
pub(crate) async fn set_fan_speed(
    State(state): State<Arc<AppState>>,
    identity: AuthedIdentity,
    Json(payload): Json<FanSpeedPayload>,
) -> Response {
    let config = state.config.load();
    let role = identity.0;
    if let Err(r) = require_permission(&role, &config, |p| p.control_temps) {
        return r;
    }
    if !payload.speed.is_finite() || payload.speed < 0.0 || payload.speed > 1.0 {
        return (StatusCode::BAD_REQUEST, "Speed must be between 0 and 1").into_response();
    }
    let pwm = (payload.speed * 255.0).round() as i64;
    match state.moonraker.run_gcode(&format!("M106 S{pwm}")).await {
        Ok(_) => {
            state
                .audit
                .record(
                    "fan.set",
                    Some(audit_role(&role)), audit_identity(&role),
                    true,
                    audit_detail("speed", payload.speed),
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

/// Manual probe / Z-calibration actions (TESTZ / ACCEPT / ABORT). Gated by
/// control_toolhead. Only meaningful while Klipper is in a manual-probe session.
pub(crate) async fn manual_probe(
    State(state): State<Arc<AppState>>,
    identity: AuthedIdentity,
    Json(p): Json<ProbePayload>,
) -> Response {
    let config = state.config.load();
    let role = identity.0;
    if let Err(r) = require_permission(&role, &config, |p| p.control_toolhead) {
        return r;
    }
    let gcode = match p.action.as_str() {
        "accept" => "ACCEPT".to_string(),
        "abort" => "ABORT".to_string(),
        "testz" => {
            if !p.delta.is_finite() || p.delta.abs() > 5.0 || p.delta == 0.0 {
                return (StatusCode::BAD_REQUEST, "Invalid Z delta").into_response();
            }
            format!("TESTZ Z={:+}", p.delta)
        }
        _ => return (StatusCode::BAD_REQUEST, "Invalid action").into_response(),
    };
    match state.moonraker.run_gcode(&gcode).await {
        Ok(_) => {
            state
                .audit
                .record(
                    "manual_probe",
                    Some(audit_role(&role)), audit_identity(&role),
                    true,
                    audit_detail("action", p.action),
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

/// Manually extrude/retract filament (M83 + G1 E). Gated by control_toolhead.
/// Klipper itself refuses to extrude below min_extrude_temp; the UI mirrors that.
pub(crate) async fn extrude(
    State(state): State<Arc<AppState>>,
    identity: AuthedIdentity,
    Json(payload): Json<ExtrudePayload>,
) -> Response {
    let config = state.config.load();
    let role = identity.0;
    if let Err(r) = require_permission(&role, &config, |p| p.control_toolhead) {
        return r;
    }
    if !payload.length.is_finite() || payload.length.abs() > 200.0 {
        return (StatusCode::BAD_REQUEST, "Length out of range").into_response();
    }
    if !payload.speed.is_finite() || payload.speed <= 0.0 || payload.speed > 100.0 {
        return (StatusCode::BAD_REQUEST, "Speed out of range").into_response();
    }
    let gcode = format!(
        "M83\nG1 E{:.3} F{:.0}",
        payload.length,
        payload.speed * 60.0
    );
    match state.moonraker.run_gcode(&gcode).await {
        Ok(_) => {
            state
                .audit
                .record(
                    "extrude",
                    Some(audit_role(&role)), audit_identity(&role),
                    true,
                    audit_detail("length", payload.length),
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

/// Set the extrusion (flow) factor (M221). Gated by control_toolhead.
pub(crate) async fn set_flow_factor(
    State(state): State<Arc<AppState>>,
    identity: AuthedIdentity,
    Json(p): Json<FlowPayload>,
) -> Response {
    let config = state.config.load();
    let role = identity.0;
    if let Err(r) = require_permission(&role, &config, |p| p.control_toolhead) {
        return r;
    }
    if !p.factor.is_finite() || p.factor < 50.0 || p.factor > 200.0 {
        return (StatusCode::BAD_REQUEST, "Flow must be between 50 and 200").into_response();
    }
    match state
        .moonraker
        .run_gcode(&format!("M221 S{:.0}", p.factor))
        .await
    {
        Ok(_) => {
            state
                .audit
                .record(
                    "flow.set",
                    Some(audit_role(&role)), audit_identity(&role),
                    true,
                    audit_detail("factor", p.factor),
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

/// Set motion limits (SET_VELOCITY_LIMIT). Gated by control_toolhead.
pub(crate) async fn set_velocity_limits(
    State(state): State<Arc<AppState>>,
    identity: AuthedIdentity,
    Json(p): Json<LimitsPayload>,
) -> Response {
    let config = state.config.load();
    let role = identity.0;
    if let Err(r) = require_permission(&role, &config, |p| p.control_toolhead) {
        return r;
    }
    let ok = |v: f64, lo: f64, hi: f64| v.is_finite() && v >= lo && v <= hi;
    if !ok(p.velocity, 1.0, 100000.0)
        || !ok(p.accel, 1.0, 1000000.0)
        || !ok(p.square_corner_velocity, 0.0, 1000.0)
        || !ok(p.minimum_cruise_ratio, 0.0, 1.0)
    {
        return (StatusCode::BAD_REQUEST, "Limit value out of range").into_response();
    }
    let gcode = format!(
        "SET_VELOCITY_LIMIT VELOCITY={:.1} ACCEL={:.1} SQUARE_CORNER_VELOCITY={:.2} MINIMUM_CRUISE_RATIO={:.3}",
        p.velocity, p.accel, p.square_corner_velocity, p.minimum_cruise_ratio
    );
    match state.moonraker.run_gcode(&gcode).await {
        Ok(_) => {
            state
                .audit
                .record("limits.set", Some(audit_role(&role)), audit_identity(&role), true, json!({}))
                .await;
            Json(StatusResponse {
                status: "ok".to_string(),
            })
            .into_response()
        }
        Err(e) => (StatusCode::BAD_GATEWAY, e.to_string()).into_response(),
    }
}

/// Configure firmware retraction (SET_RETRACTION). Gated by control_toolhead.
pub(crate) async fn set_retraction(
    State(state): State<Arc<AppState>>,
    identity: AuthedIdentity,
    Json(p): Json<RetractionPayload>,
) -> Response {
    let config = state.config.load();
    let role = identity.0;
    if let Err(r) = require_permission(&role, &config, |p| p.control_toolhead) {
        return r;
    }
    let in_range = |v: f64, max: f64| v.is_finite() && v >= 0.0 && v <= max;
    if !in_range(p.retract_length, 20.0)
        || !in_range(p.unretract_extra_length, 20.0)
        || !in_range(p.retract_speed, 200.0)
        || !in_range(p.unretract_speed, 200.0)
    {
        return (StatusCode::BAD_REQUEST, "Retraction value out of range").into_response();
    }
    let gcode = format!(
        "SET_RETRACTION RETRACT_LENGTH={:.3} RETRACT_SPEED={:.1} UNRETRACT_EXTRA_LENGTH={:.3} UNRETRACT_SPEED={:.1}",
        p.retract_length, p.retract_speed, p.unretract_extra_length, p.unretract_speed
    );
    match state.moonraker.run_gcode(&gcode).await {
        Ok(_) => {
            state
                .audit
                .record("retraction.set", Some(audit_role(&role)), audit_identity(&role), true, json!({}))
                .await;
            Json(StatusResponse {
                status: "ok".to_string(),
            })
            .into_response()
        }
        Err(e) => (StatusCode::BAD_GATEWAY, e.to_string()).into_response(),
    }
}

/// The bare Klipper object name (after the type prefix): "fan_generic exhaust"
/// -> "exhaust". Used to target SET_FAN_SPEED/SET_PIN/SET_LED.
pub(crate) fn aux_short_name(name: &str) -> &str {
    name.splitn(2, ' ').nth(1).unwrap_or(name).trim()
}

/// Guard against G-code injection: object names are interpolated into G-code
/// sinks (SET_FAN_SPEED/SET_PIN/SET_LED/EXCLUDE_OBJECT), so reject anything that
/// isn't a legal Klipper object name. In particular this blocks newlines (which
/// would start a second G-code command), quotes, `#`, `;`, and backslashes.
pub(crate) fn valid_object_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 100
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-' | '.' | ' '))
}

/// Exclude (cancel) an object from the current print via EXCLUDE_OBJECT. Gated
/// by control_print.
pub(crate) async fn exclude_object(
    State(state): State<Arc<AppState>>,
    identity: AuthedIdentity,
    Json(payload): Json<ExcludeObjectPayload>,
) -> Response {
    let config = state.config.load();
    let role = identity.0;
    if let Err(r) = require_permission(&role, &config, |p| p.control_print) {
        return r;
    }
    let name = payload.name.trim();
    if !valid_object_name(name) {
        return (StatusCode::BAD_REQUEST, "Invalid object name").into_response();
    }
    let gcode = format!("EXCLUDE_OBJECT NAME={}", name);
    match state.moonraker.run_gcode(&gcode).await {
        Ok(_) => {
            state
                .audit
                .record(
                    "exclude_object",
                    Some(audit_role(&role)), audit_identity(&role),
                    true,
                    audit_detail("name", name.to_string()),
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

/// Set a TMC stepper driver's run current (SET_TMC_CURRENT). Gated by
/// control_machine (advanced tuning).
pub(crate) async fn set_tmc_current(
    State(state): State<Arc<AppState>>,
    identity: AuthedIdentity,
    Json(p): Json<TmcCurrentPayload>,
) -> Response {
    let config = state.config.load();
    let role = identity.0;
    if let Err(r) = require_permission(&role, &config, |p| p.control_machine) {
        return r;
    }
    if !p.current.is_finite() || p.current <= 0.0 || p.current > 5.0 {
        return (StatusCode::BAD_REQUEST, "Current out of range").into_response();
    }
    // The stepper may arrive as the full object name ("tmc2209 stepper_x").
    let stepper = aux_short_name(&p.stepper);
    if !valid_object_name(stepper) {
        return (StatusCode::BAD_REQUEST, "Invalid stepper name").into_response();
    }
    let gcode = format!(
        "SET_TMC_CURRENT STEPPER={} CURRENT={:.3}",
        stepper, p.current
    );
    match state.moonraker.run_gcode(&gcode).await {
        Ok(_) => {
            state
                .audit
                .record(
                    "tmc.current",
                    Some(audit_role(&role)), audit_identity(&role),
                    true,
                    audit_detail("stepper", stepper.to_string()),
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

/// Set a generic heater (heater_generic, e.g. chamber) target temperature.
/// Gated by control_temps.
pub(crate) async fn set_aux_heater(
    State(state): State<Arc<AppState>>,
    identity: AuthedIdentity,
    Json(payload): Json<AuxHeaterPayload>,
) -> Response {
    let config = state.config.load();
    let role = identity.0;
    if let Err(r) = require_permission(&role, &config, |p| p.control_temps) {
        return r;
    }
    if !payload.target.is_finite() || payload.target < 0.0 || payload.target > 350.0 {
        return (StatusCode::BAD_REQUEST, "Target out of range").into_response();
    }
    let heater = aux_short_name(&payload.name);
    if !valid_object_name(heater) {
        return (StatusCode::BAD_REQUEST, "Invalid heater name").into_response();
    }
    let gcode = format!(
        "SET_HEATER_TEMPERATURE HEATER=\"{}\" TARGET={:.1}",
        heater, payload.target
    );
    match state.moonraker.run_gcode(&gcode).await {
        Ok(_) => {
            state
                .audit
                .record(
                    "aux.heater",
                    Some(audit_role(&role)), audit_identity(&role),
                    true,
                    audit_detail("heater", heater.to_string()),
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

/// Set a generic fan (fan_generic) speed via SET_FAN_SPEED. Gated control_temps.
pub(crate) async fn set_aux_fan(
    State(state): State<Arc<AppState>>,
    identity: AuthedIdentity,
    Json(payload): Json<AuxFanPayload>,
) -> Response {
    let config = state.config.load();
    let role = identity.0;
    if let Err(r) = require_permission(&role, &config, |p| p.control_temps) {
        return r;
    }
    if !payload.speed.is_finite() || payload.speed < 0.0 || payload.speed > 1.0 {
        return (StatusCode::BAD_REQUEST, "Speed must be between 0 and 1").into_response();
    }
    let fan = aux_short_name(&payload.name);
    if !valid_object_name(fan) {
        return (StatusCode::BAD_REQUEST, "Invalid fan name").into_response();
    }
    let gcode = format!("SET_FAN_SPEED FAN=\"{}\" SPEED={:.3}", fan, payload.speed);
    match state.moonraker.run_gcode(&gcode).await {
        Ok(_) => {
            state
                .audit
                .record(
                    "aux.fan",
                    Some(audit_role(&role)), audit_identity(&role),
                    true,
                    audit_detail("fan", fan.to_string()),
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

/// Set an output_pin value via SET_PIN. Gated control_toolhead.
pub(crate) async fn set_aux_pin(
    State(state): State<Arc<AppState>>,
    identity: AuthedIdentity,
    Json(payload): Json<AuxPinPayload>,
) -> Response {
    let config = state.config.load();
    let role = identity.0;
    if let Err(r) = require_permission(&role, &config, |p| p.control_toolhead) {
        return r;
    }
    if !payload.value.is_finite() || payload.value < 0.0 || payload.value > 1.0 {
        return (StatusCode::BAD_REQUEST, "Value must be between 0 and 1").into_response();
    }
    let pin = aux_short_name(&payload.name);
    if !valid_object_name(pin) {
        return (StatusCode::BAD_REQUEST, "Invalid pin name").into_response();
    }
    let gcode = format!("SET_PIN PIN={} VALUE={:.3}", pin, payload.value);
    match state.moonraker.run_gcode(&gcode).await {
        Ok(_) => {
            state
                .audit
                .record(
                    "aux.pin",
                    Some(audit_role(&role)), audit_identity(&role),
                    true,
                    audit_detail("pin", pin.to_string()),
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

/// Set an LED/neopixel colour via SET_LED. Gated control_toolhead.
pub(crate) async fn set_aux_led(
    State(state): State<Arc<AppState>>,
    identity: AuthedIdentity,
    Json(payload): Json<AuxLedPayload>,
) -> Response {
    let config = state.config.load();
    let role = identity.0;
    if let Err(r) = require_permission(&role, &config, |p| p.control_toolhead) {
        return r;
    }
    let clamp = |v: f64| v.clamp(0.0, 1.0);
    let led = aux_short_name(&payload.name);
    if !valid_object_name(led) {
        return (StatusCode::BAD_REQUEST, "Invalid LED name").into_response();
    }
    let gcode = format!(
        "SET_LED LED={} RED={:.3} GREEN={:.3} BLUE={:.3} WHITE={:.3}",
        led,
        clamp(payload.red),
        clamp(payload.green),
        clamp(payload.blue),
        clamp(payload.white),
    );
    match state.moonraker.run_gcode(&gcode).await {
        Ok(_) => {
            state
                .audit
                .record(
                    "aux.led",
                    Some(audit_role(&role)), audit_identity(&role),
                    true,
                    audit_detail("led", led.to_string()),
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

#[utoipa::path(
    post,
    path = "/api/macro/run",
    request_body = MacroPayload,
    responses(
        (status = 200, description = "Macro pornit cu succes", body = StatusResponse),
        (status = 403, description = "Macro-ul nu este in whitelist")
    )
)]
pub(crate) async fn run_macro(
    State(state): State<Arc<AppState>>,
    identity: AuthedIdentity,
    Json(payload): Json<MacroPayload>,
) -> Response {
    let config = state.config.load();
    let role = identity.0;

    // Macros require a real session — even a permissive "anonymous" group
    // config can't expose macro execution to a caller with no session at
    // all, unlike the guest-password tier which counts as authenticated.
    if matches!(&role.role, UserRole::Group(id) if id == "anonymous") {
        return (StatusCode::FORBIDDEN, "Macrourile necesită autentificare").into_response();
    }

    // FIRMWARE_RESTART / RESTART are recovery actions and stay allowed even
    // when general macro execution is disabled; everything else needs the
    // run_macros permission.
    let macro_upper = payload
        .macro_name
        .split_whitespace()
        .next()
        .unwrap_or("")
        .to_uppercase();
    let is_restart = macro_upper == "FIRMWARE_RESTART" || macro_upper == "RESTART";
    if !is_restart {
        if let Err(r) = require_permission(&role, &config, |p| p.run_macros) {
            return r;
        }
    }

    // Authorize the specific macro before checking availability. Admins can run
    // any G-code (full access); everyone else is restricted to their
    // resolved group's allowed_macros list.
    if !matches!(role.role, UserRole::Admin) {
        if let Err(e) =
            SafetyManager::validate_macro(&payload.macro_name, resolve_permissions(&role, &config))
        {
            return (StatusCode::FORBIDDEN, e).into_response();
        }
    }

    let _st = match require_printer_connected(&state).await {
        Ok(s) => s,
        Err(r) => return r,
    };

    match state.moonraker.run_gcode(&payload.macro_name).await {
        Ok(_) => {
            state
                .audit
                .record(
                    "macro.run",
                    Some(audit_role(&role)), audit_identity(&role),
                    true,
                    audit_detail("macro", payload.macro_name),
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
                    "macro.run",
                    Some(audit_role(&role)), audit_identity(&role),
                    false,
                    json!({ "macro": payload.macro_name, "reason": "moonraker_error" }),
                )
                .await;
            (StatusCode::BAD_GATEWAY, e.to_string()).into_response()
        }
    }
}

#[utoipa::path(
    post,
    path = "/api/preheat",
    request_body = PreheatPayload,
    responses(
        (status = 200, description = "Preîncălzire pornită", body = StatusResponse),
        (status = 403, description = "Valori de temperatură în afara limitelor de siguranță")
    )
)]
pub(crate) async fn preheat(
    State(state): State<Arc<AppState>>,
    identity: AuthedIdentity,
    Json(payload): Json<PreheatPayload>,
) -> Response {
    let config = state.config.load();
    let role = identity.0;

    if let Err(r) = require_permission(&role, &config, |p| p.control_temps) {
        return r;
    }

    let _st = match require_printer_connected(&state).await {
        Ok(s) => s,
        Err(r) => return r,
    };

    let (hotend_t, bed_t) = match payload.preset.to_lowercase().as_str() {
        "cooldown" => (0.0, 0.0),
        p => {
            if let Some(preset) = config.preheat.get(p) {
                (preset.hotend, preset.bed)
            } else {
                return (StatusCode::BAD_REQUEST, "Preset preîncălzire invalid").into_response();
            }
        }
    };

    if let Err(e) = SafetyManager::validate_preheat(hotend_t, bed_t, &config.safety) {
        return (StatusCode::FORBIDDEN, e).into_response();
    }

    let gcode = format!("M104 S{:.0}\nM140 S{:.0}", hotend_t, bed_t);
    match state.moonraker.run_gcode(&gcode).await {
        Ok(_) => {
            state
                .audit
                .record(
                    "preheat",
                    Some(audit_role(&role)), audit_identity(&role),
                    true,
                    json!({ "preset": payload.preset, "hotend": hotend_t, "bed": bed_t }),
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
                    "preheat",
                    Some(audit_role(&role)), audit_identity(&role),
                    false,
                    json!({ "preset": payload.preset, "hotend": hotend_t, "bed": bed_t, "reason": "moonraker_error" }),
                )
                .await;
            (StatusCode::BAD_GATEWAY, e.to_string()).into_response()
        }
    }
}

#[utoipa::path(
    post,
    path = "/api/target_temp",
    request_body = TargetTempPayload,
    responses(
        (status = 200, description = "Temperatura țintă setată cu succes", body = StatusResponse),
        (status = 403, description = "Temperatura în afara limitelor de siguranță")
    )
)]
pub(crate) async fn set_target_temp(
    State(state): State<Arc<AppState>>,
    identity: AuthedIdentity,
    Json(payload): Json<TargetTempPayload>,
) -> Response {
    let config = state.config.load();
    let role = identity.0;

    if let Err(r) = require_permission(&role, &config, |p| p.control_temps) {
        return r;
    }

    let _st = match require_printer_connected(&state).await {
        Ok(s) => s,
        Err(r) => return r,
    };

    let heater_lower = payload.heater.to_lowercase();
    if heater_lower == "extruder" {
        if let Err(e) = SafetyManager::validate_preheat(payload.target, 0.0, &config.safety) {
            return (StatusCode::FORBIDDEN, e).into_response();
        }
        let gcode = format!("M104 S{:.0}", payload.target);
        match state.moonraker.run_gcode(&gcode).await {
            Ok(_) => {
                state
                    .audit
                    .record(
                        "target_temp",
                        Some(audit_role(&role)), audit_identity(&role),
                        true,
                        json!({ "heater": heater_lower, "target": payload.target }),
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
                        "target_temp",
                        Some(audit_role(&role)), audit_identity(&role),
                        false,
                        json!({ "heater": heater_lower, "target": payload.target, "reason": "moonraker_error" }),
                    )
                    .await;
                (StatusCode::BAD_GATEWAY, e.to_string()).into_response()
            }
        }
    } else if heater_lower == "heater_bed" || heater_lower == "bed" {
        if let Err(e) = SafetyManager::validate_preheat(0.0, payload.target, &config.safety) {
            return (StatusCode::FORBIDDEN, e).into_response();
        }
        let gcode = format!("M140 S{:.0}", payload.target);
        match state.moonraker.run_gcode(&gcode).await {
            Ok(_) => {
                state
                    .audit
                    .record(
                        "target_temp",
                        Some(audit_role(&role)), audit_identity(&role),
                        true,
                        json!({ "heater": heater_lower, "target": payload.target }),
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
                        "target_temp",
                        Some(audit_role(&role)), audit_identity(&role),
                        false,
                        json!({ "heater": heater_lower, "target": payload.target, "reason": "moonraker_error" }),
                    )
                    .await;
                (StatusCode::BAD_GATEWAY, e.to_string()).into_response()
            }
        }
    } else {
        (StatusCode::BAD_REQUEST, "Heater invalid").into_response()
    }
}

#[utoipa::path(
    post,
    path = "/api/move",
    request_body = JogPayload,
    responses(
        (status = 200, description = "Jog efectuat", body = StatusResponse),
        (status = 403, description = "Mișcarea depășește pasul maxim sau este blocată")
    )
)]
pub(crate) async fn move_jog(
    State(state): State<Arc<AppState>>,
    identity: AuthedIdentity,
    Json(payload): Json<JogPayload>,
) -> Response {
    let config = state.config.load();
    let role = identity.0;

    if let Err(r) = require_permission(&role, &config, |p| p.control_toolhead) {
        return r;
    }

    let st = match require_printer_connected(&state).await {
        Ok(s) => s,
        Err(r) => return r,
    };
    let is_printing = st.print_state == "printing";

    let axis_lower = payload.axis.to_lowercase();

    // 1. Handle homing operations
    if axis_lower == "home"
        || axis_lower == "homex"
        || axis_lower == "homey"
        || axis_lower == "homez"
    {
        if let Err(e) = SafetyManager::validate_home(resolve_permissions(&role, &config)) {
            return (StatusCode::FORBIDDEN, e).into_response();
        }
        let gcode = match axis_lower.as_str() {
            "home" => {
                let has_macro = st
                    .configfile
                    .as_ref()
                    .and_then(|cf| cf.settings.as_ref())
                    .and_then(|s| s.as_object())
                    .map(|obj| {
                        obj.contains_key("gcode_macro HOME_YXZ")
                            || obj.contains_key("gcode_macro home_yxz")
                    })
                    .unwrap_or(false);
                if has_macro {
                    "HOME_YXZ"
                } else {
                    "G28"
                }
            }
            "homex" => "G28 X",
            "homey" => "G28 Y",
            "homez" => "G28 Z",
            _ => {
                let has_macro = st
                    .configfile
                    .as_ref()
                    .and_then(|cf| cf.settings.as_ref())
                    .and_then(|s| s.as_object())
                    .map(|obj| {
                        obj.contains_key("gcode_macro HOME_YXZ")
                            || obj.contains_key("gcode_macro home_yxz")
                    })
                    .unwrap_or(false);
                if has_macro {
                    "HOME_YXZ"
                } else {
                    "G28"
                }
            }
        };
        match state.moonraker.run_gcode(gcode).await {
            Ok(_) => {
                state
                    .audit
                    .record(
                        "move",
                        Some(audit_role(&role)), audit_identity(&role),
                        true,
                        json!({ "axis": axis_lower, "kind": "home" }),
                    )
                    .await;
                return Json(StatusResponse {
                    status: "ok".to_string(),
                })
                .into_response();
            }
            Err(e) => {
                state
                    .audit
                    .record(
                        "move",
                        Some(audit_role(&role)), audit_identity(&role),
                        false,
                        json!({ "axis": axis_lower, "kind": "home", "reason": "moonraker_error" }),
                    )
                    .await;
                return (StatusCode::BAD_GATEWAY, e.to_string()).into_response();
            }
        }
    }

    // 2. Handle Z-offset adjustments
    if axis_lower == "z_offset" {
        // limit Z-offset adjust value per click to a safe amount (e.g. max 1.0mm)
        if payload.distance.abs() > 1.0 {
            return (
                StatusCode::FORBIDDEN,
                "Ajustarea offset-ului Z depășește limita de siguranță",
            )
                .into_response();
        }
        let gcode = format!("SET_GCODE_OFFSET Z_ADJUST={:.4} MOVE=1", payload.distance);
        match state.moonraker.run_gcode(&gcode).await {
            Ok(_) => {
                state
                    .audit
                    .record(
                        "move",
                        Some(audit_role(&role)), audit_identity(&role),
                        true,
                        json!({ "axis": "z_offset", "distance": payload.distance }),
                    )
                    .await;
                return Json(StatusResponse {
                    status: "ok".to_string(),
                })
                .into_response();
            }
            Err(e) => {
                state
                    .audit
                    .record(
                        "move",
                        Some(audit_role(&role)), audit_identity(&role),
                        false,
                        json!({ "axis": "z_offset", "distance": payload.distance, "reason": "moonraker_error" }),
                    )
                    .await;
                return (StatusCode::BAD_GATEWAY, e.to_string()).into_response();
            }
        }
    }

    // 3. Regular Jog axes (X, Y, Z)
    if let Err(e) = SafetyManager::validate_jog(
        &payload.axis,
        payload.distance,
        is_printing,
        resolve_permissions(&role, &config),
    ) {
        return (StatusCode::FORBIDDEN, e).into_response();
    }

    let gcode = format!(
        "G91\nG1 {} {:.2} F1500\nG90",
        payload.axis.to_uppercase(),
        payload.distance
    );
    match state.moonraker.run_gcode(&gcode).await {
        Ok(_) => {
            state
                .audit
                .record(
                    "move",
                    Some(audit_role(&role)), audit_identity(&role),
                    true,
                    json!({ "axis": payload.axis.to_uppercase(), "distance": payload.distance }),
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
                    "move",
                    Some(audit_role(&role)), audit_identity(&role),
                    false,
                    json!({ "axis": payload.axis.to_uppercase(), "distance": payload.distance, "reason": "moonraker_error" }),
                )
                .await;
            (StatusCode::BAD_GATEWAY, e.to_string()).into_response()
        }
    }
}

#[utoipa::path(
    post,
    path = "/api/move_to",
    request_body = MoveToPayload,
    responses(
        (status = 200, description = "Mutare absoluta efectuata", body = StatusResponse),
        (status = 403, description = "Poziția depășește limitele axei sau mișcarea este blocată")
    )
)]
pub(crate) async fn move_to(
    State(state): State<Arc<AppState>>,
    identity: AuthedIdentity,
    Json(payload): Json<MoveToPayload>,
) -> Response {
    let config = state.config.load();
    let role = identity.0;

    if let Err(r) = require_permission(&role, &config, |p| p.control_toolhead) {
        return r;
    }

    let st = match require_printer_connected(&state).await {
        Ok(s) => s,
        Err(r) => return r,
    };

    let is_printing = st.print_state == "printing";
    if is_printing && !resolve_permissions(&role, &config).allow_movement_while_printing {
        return (
            StatusCode::FORBIDDEN,
            "Mișcarea este dezactivată în timpul printării",
        )
            .into_response();
    }

    let axis_lower = payload.axis.to_lowercase();
    let axis_index = match axis_lower.as_str() {
        "x" => 0,
        "y" => 1,
        "z" => 2,
        _ => return (StatusCode::BAD_REQUEST, "Axă invalidă").into_response(),
    };

    let homed_axes = st.homed_axes.to_lowercase();
    if !homed_axes.contains(&axis_lower) {
        return (StatusCode::FORBIDDEN, "Axa nu este homed").into_response();
    }

    let axis_minimum = st
        .toolhead
        .as_ref()
        .and_then(|toolhead| toolhead.axis_minimum.as_ref())
        .and_then(|bounds| bounds.get(axis_index))
        .copied();
    let axis_maximum = st
        .toolhead
        .as_ref()
        .and_then(|toolhead| toolhead.axis_maximum.as_ref())
        .and_then(|bounds| bounds.get(axis_index))
        .copied();

    let (axis_minimum, axis_maximum) = match (axis_minimum, axis_maximum) {
        (Some(min), Some(max)) => (min, max),
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                "Limitele axei nu sunt disponibile in Moonraker",
            )
                .into_response()
        }
    };

    if payload.position < axis_minimum || payload.position > axis_maximum {
        return (
            StatusCode::FORBIDDEN,
            format!(
                "Poziția {}={:.3} depășește limitele [{:.3}, {:.3}]",
                axis_lower.to_uppercase(),
                payload.position,
                axis_minimum,
                axis_maximum
            ),
        )
            .into_response();
    }

    let feedrate = if axis_lower == "z" { 300 } else { 3000 };
    let gcode = format!(
        "SAVE_GCODE_STATE NAME=_ui_movement\nG90\nG1 {}{:.3} F{}\nRESTORE_GCODE_STATE NAME=_ui_movement",
        axis_lower.to_uppercase(),
        payload.position,
        feedrate
    );

    match state.moonraker.run_gcode(&gcode).await {
        Ok(_) => {
            state
                .audit
                .record(
                    "move_to",
                    Some(audit_role(&role)), audit_identity(&role),
                    true,
                    json!({ "axis": axis_lower, "position": payload.position }),
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
                    "move_to",
                    Some(audit_role(&role)), audit_identity(&role),
                    false,
                    json!({ "axis": axis_lower, "position": payload.position, "reason": "moonraker_error" }),
                )
                .await;
            (StatusCode::BAD_GATEWAY, e.to_string()).into_response()
        }
    }
}

#[utoipa::path(
    post,
    path = "/api/motors/disable",
    responses(
        (status = 200, description = "Motoare oprite cu succes", body = StatusResponse),
        (status = 403, description = "Neautorizat")
    )
)]
pub(crate) async fn disable_motors(State(state): State<Arc<AppState>>, identity: AuthedIdentity) -> Response {
    let config = state.config.load();
    let role = identity.0;

    if let Err(r) = require_permission(&role, &config, |p| p.control_toolhead) {
        return r;
    }

    let _st = match require_printer_connected(&state).await {
        Ok(s) => s,
        Err(r) => return r,
    };

    match state.moonraker.run_gcode("M18").await {
        Ok(_) => {
            state
                .audit
                .record("motors.disable", Some(audit_role(&role)), audit_identity(&role), true, json!({}))
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
                    "motors.disable",
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
    path = "/api/speed_factor",
    request_body = SpeedFactorPayload,
    responses(
        (status = 200, description = "Multiplicator viteză modificat", body = StatusResponse),
        (status = 403, description = "Multiplicator depășește limita configurată")
    )
)]
pub(crate) async fn set_speed_factor(
    State(state): State<Arc<AppState>>,
    identity: AuthedIdentity,
    Json(payload): Json<SpeedFactorPayload>,
) -> Response {
    let config = state.config.load();
    let role = identity.0;

    if let Err(r) = require_permission(&role, &config, |p| p.control_toolhead) {
        return r;
    }

    let _st = match require_printer_connected(&state).await {
        Ok(s) => s,
        Err(r) => return r,
    };

    let validated_factor = match SafetyManager::validate_speed_factor(
        payload.factor,
        resolve_permissions(&role, &config),
    ) {
        Ok(f) => f,
        Err(e) => return (StatusCode::FORBIDDEN, e).into_response(),
    };

    let gcode = format!("M220 S{:.0}", validated_factor);
    match state.moonraker.run_gcode(&gcode).await {
        Ok(_) => {
            state
                .audit
                .record(
                    "speed.set",
                    Some(audit_role(&role)), audit_identity(&role),
                    true,
                    audit_detail("factor", validated_factor),
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
                    "speed.set",
                    Some(audit_role(&role)), audit_identity(&role),
                    false,
                    json!({ "factor": validated_factor, "reason": "moonraker_error" }),
                )
                .await;
            (StatusCode::BAD_GATEWAY, e.to_string()).into_response()
        }
    }
}


use crate::*;
use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use axum_extra::extract::cookie::CookieJar;
use serde_json::json;
use std::path::Path;
use std::sync::Arc;
use tokio::fs;

pub(crate) async fn get_admin_config(State(state): State<Arc<AppState>>, jar: CookieJar) -> Response {
    let config = state.config.load();
    if let Err(status) = check_authorized_action(&jar, &state.sessions, &config, true).await {
        state
            .audit
            .record(
                "admin.config.get",
                None, None,
                false,
                audit_detail("status", status.as_u16()),
            )
            .await;
        return status.into_response();
    }

    state
        .audit
        .record("admin.config.get", Some("admin".to_string()), None, true, json!({}))
        .await;

    // Never ship real credentials to the browser — see redact_admin_config's
    // doc comment. The admin password is edited through POST
    // /api/admin/password (plaintext -> bcrypt server-side); the SMTP
    // password/Resend API key have no such dedicated endpoint, so the config
    // PUT preserves them via preserve_secret_unless_changed below instead.
    Json(redact_admin_config((**config).clone())).into_response()
}

/// Preserves a secret-like field (SMTP password, Resend API key) across a
/// config save unless the admin actually typed a new value. Unlike the
/// admin/guest passwords, these have no dedicated change-password-style
/// endpoint — the general config editor is their only entry point — so
/// "blank, or still the redacted placeholder from GET" has to mean "leave
/// it alone" rather than "clear it", or every save that doesn't touch these
/// fields would silently corrupt them with the placeholder string.
fn preserve_secret_unless_changed(current: &str, incoming: &str) -> String {
    if incoming.trim().is_empty() || incoming == SECRET_PLACEHOLDER {
        current.to_string()
    } else {
        incoming.to_string()
    }
}

pub(crate) async fn save_admin_config(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
    Json(mut payload): Json<Config>,
) -> Response {
    let current_config = state.config.load();
    if let Err(status) = check_authorized_action(&jar, &state.sessions, &current_config, true).await
    {
        state
            .audit
            .record(
                "admin.config.put",
                None, None,
                false,
                audit_detail("status", status.as_u16()),
            )
            .await;
        return status.into_response();
    }

    // Password hashes are managed exclusively through POST /api/admin/password;
    // the config editor never carries real credentials (it only ever sees the
    // redacted placeholders from GET). Preserve whatever is already on disk so a
    // config save can never wipe or corrupt the stored passwords.
    payload.auth.admin_password_hash = current_config.auth.admin_password_hash.clone();
    payload.auth.guest_password_hash = current_config.auth.guest_password_hash.clone();
    payload.smtp.password = preserve_secret_unless_changed(
        &current_config.smtp.password,
        &payload.smtp.password,
    );
    payload.resend.api_key = preserve_secret_unless_changed(
        &current_config.resend.api_key,
        &payload.resend.api_key,
    );

    if let Err(message) = validate_admin_config(&payload) {
        state
            .audit
            .record(
                "admin.config.put",
                Some("admin".to_string()), None,
                false,
                audit_detail("reason", message),
            )
            .await;
        return (StatusCode::BAD_REQUEST, message).into_response();
    }

    if let Err(e) = save_config_to_file(&payload, &state.config_path).await {
        let message = e.to_string();
        state
            .audit
            .record(
                "admin.config.put",
                Some("admin".to_string()), None,
                false,
                audit_detail("reason", "save_failed"),
            )
            .await;
        return (StatusCode::INTERNAL_SERVER_ERROR, message).into_response();
    }

    // Reload the GeoIP database from disk whenever the configured path
    // changes — the reader memory-maps the file once at load time, so a
    // changed path wouldn't otherwise take effect until a restart.
    if payload.geo_restriction.mmdb_path != current_config.geo_restriction.mmdb_path {
        state.geo_db.reload(&payload.geo_restriction.mmdb_path);
    }

    state.config.store(Arc::new(payload.clone()));
    state
        .moonraker
        .broadcast_event(BackendWsEvent::ConfigChanged);
    state
        .audit
        .record("admin.config.put", Some("admin".to_string()), None, true, json!({}))
        .await;
    // Same reasoning as GET: never echo real credentials back over the
    // wire, even in a same-origin admin-only response — the saved (real)
    // config is already on disk and in state.config, only the HTTP
    // response itself needs the placeholder treatment.
    Json(redact_admin_config(payload)).into_response()
}

pub(crate) async fn save_config_to_file(
    config: &Config,
    path: &str,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let path = Path::new(path);
    let tmp_path = path.with_extension("toml.tmp");
    let content = toml::to_string_pretty(config)?;
    fs::write(&tmp_path, content).await?;
    fs::rename(&tmp_path, path).await?;
    Ok(())
}

/// Change the admin or guest password. Admin-only; hashes plaintext with
/// Argon2id server-side (see `passwords.rs`) and swaps the live config so no
/// restart is needed.
pub(crate) async fn change_admin_password(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
    Json(req): Json<PasswordChangeRequest>,
) -> Response {
    let current = state.config.load();
    if let Err(status) = check_authorized_action(&jar, &state.sessions, &current, true).await {
        state
            .audit
            .record(
                "admin.password",
                None, None,
                false,
                audit_detail("status", status.as_u16()),
            )
            .await;
        return status.into_response();
    }

    // Re-verify the admin's current password for any credential change.
    if !passwords::verify_password(
        req.current_password.clone(),
        current.auth.admin_password_hash.clone(),
    )
    .await
    {
        state
            .audit
            .record(
                "admin.password",
                Some("admin".to_string()), None,
                false,
                audit_detail("reason", "bad_current_password"),
            )
            .await;
        return (StatusCode::FORBIDDEN, "Parola actuală este incorectă").into_response();
    }

    if req.new_password.len() > passwords::MAX_PASSWORD_BYTES {
        return (StatusCode::BAD_REQUEST, "Parola nouă este prea lungă").into_response();
    }

    let mut new_config = (**current).clone();
    match req.scope.as_str() {
        "admin" => {
            if req.new_password.len() < 4 {
                return (
                    StatusCode::BAD_REQUEST,
                    "Parola nouă trebuie să aibă cel puțin 4 caractere",
                )
                    .into_response();
            }
            match passwords::hash_password(req.new_password.clone()).await {
                Ok(hash) => new_config.auth.admin_password_hash = hash,
                Err(_) => {
                    return (StatusCode::INTERNAL_SERVER_ERROR, "Hashing failed").into_response()
                }
            }
        }
        "guest" => {
            if req.new_password.is_empty() {
                // Disable the guest password: portal is open to anonymous guests.
                new_config.auth.guest_password_hash = None;
            } else {
                match passwords::hash_password(req.new_password.clone()).await {
                    Ok(hash) => new_config.auth.guest_password_hash = Some(hash),
                    Err(_) => {
                        return (StatusCode::INTERNAL_SERVER_ERROR, "Hashing failed")
                            .into_response()
                    }
                }
            }
        }
        // Custom groups no longer have shared passwords — membership comes
        // from local signup accounts, edited via the config PUT (group
        // email allow-lists) or the admin Users API like any other field.
        _ => return (StatusCode::BAD_REQUEST, "Scope invalid").into_response(),
    }

    if let Err(e) = save_config_to_file(&new_config, &state.config_path).await {
        let message = e.to_string();
        state
            .audit
            .record(
                "admin.password",
                Some("admin".to_string()), None,
                false,
                audit_detail("reason", "save_failed"),
            )
            .await;
        return (StatusCode::INTERNAL_SERVER_ERROR, message).into_response();
    }

    state.config.store(Arc::new(new_config));
    state
        .moonraker
        .broadcast_event(BackendWsEvent::ConfigChanged);
    state
        .audit
        .record(
            "admin.password",
            Some("admin".to_string()), None,
            true,
            audit_detail("scope", req.scope),
        )
        .await;
    Json(json!({ "ok": true })).into_response()
}

pub(crate) async fn get_admin_audit(
    State(state): State<Arc<AppState>>,
    _admin: AdminIdentity,
    Query(query): Query<AuditQuery>,
) -> Response {
    match state.audit.list_recent(query.limit.unwrap_or(100)).await {
        Ok(entries) => Json(entries).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

pub(crate) fn validate_admin_config(config: &Config) -> Result<(), &'static str> {
    if config.auth.admin_password_hash.trim().is_empty() {
        return Err("Admin password hash cannot be empty");
    }

    if config.server.port == 0 {
        return Err("Server port must be greater than zero");
    }

    if config.moonraker.url.trim().is_empty() {
        return Err("Moonraker URL cannot be empty");
    }

    if config.safety.max_hotend_temp < 0.0 || config.safety.max_bed_temp < 0.0 {
        return Err("Temperature limits cannot be negative");
    }

    for (name, preset) in &config.preheat {
        if name.trim().is_empty() {
            return Err("Preheat preset names cannot be empty");
        }
        if preset.hotend < 0.0 || preset.hotend > config.safety.max_hotend_temp {
            return Err("Preheat hotend value is outside configured limits");
        }
        if preset.bed < 0.0 || preset.bed > config.safety.max_bed_temp {
            return Err("Preheat bed value is outside configured limits");
        }
    }

    for webcam in &config.webcams {
        if webcam.name.trim().is_empty() {
            return Err("Webcam names cannot be empty");
        }
        if webcam.enabled && webcam.stream_url.trim().is_empty() {
            return Err("Enabled webcams need a stream URL");
        }
    }

    for region in &config.geo_restriction.allowed_regions {
        if region.country.trim().is_empty() {
            return Err("Geo-restriction region entries need a country code");
        }
    }

    const BUILT_IN_GROUP_IDS: [&str; 3] = ["anonymous", "guest", "admin"];
    for id in BUILT_IN_GROUP_IDS {
        if !config.groups.iter().any(|g| g.id == id) {
            return Err("Missing a required built-in group (anonymous/guest/admin)");
        }
    }
    // "anonymous" represents having no session at all — a signed-up account
    // always has one, so it can never legitimately land there.
    if config.signup.default_group == "anonymous" {
        return Err("Signup default group cannot be \"anonymous\" (that group is for sessionless visitors only)");
    }
    for group in &config.groups {
        if group.id.trim().is_empty() {
            return Err("Group id cannot be empty");
        }
        if config.groups.iter().filter(|g| g.id == group.id).count() > 1 {
            return Err("Group ids must be unique");
        }
        if group.display_name.trim().is_empty() {
            return Err("Group display name cannot be empty");
        }
        if let Some(v) = group.permissions.max_speed_factor {
            if !(1.0..=500.0).contains(&v) {
                return Err("Group max speed factor must be between 1 and 500");
            }
        }
        if let Some(v) = group.permissions.max_jog_step {
            if v <= 0.0 {
                return Err("Group max jog step must be greater than zero");
            }
        }
        if let Some(v) = group.permissions.max_upload_mb {
            if v == 0 {
                return Err("Group max upload size must be greater than zero");
            }
        }
    }

    for link in &config.footer_links {
        if sanitize_footer_link_id(&link.id).is_none() {
            return Err("Footer link id must be non-empty alphanumeric/dash/underscore, max 64 chars");
        }
        if config
            .footer_links
            .iter()
            .filter(|l| l.id == link.id)
            .count()
            > 1
        {
            return Err("Footer link ids must be unique");
        }
        if link.label.trim().is_empty() {
            return Err("Footer link label cannot be empty");
        }
        if link.url.trim().is_empty() {
            return Err("Footer link URL cannot be empty");
        }
    }

    Ok(())
}

pub(crate) async fn get_admin_macros(State(state): State<Arc<AppState>>, _admin: AdminIdentity) -> Response {
    match state.moonraker.list_printer_objects().await {
        Ok(body) => {
            let names: Vec<String> = moonraker_result(body)
                .get("objects")
                .and_then(|o| o.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str())
                        .filter_map(|n| n.strip_prefix("gcode_macro "))
                        .map(|s| s.to_string())
                        .collect()
                })
                .unwrap_or_default();
            Json(names).into_response()
        }
        Err(e) => (StatusCode::BAD_GATEWAY, e.to_string()).into_response(),
    }
}

/// Strips every real credential from a `Config` before it's ever allowed
/// into an HTTP response — the one function every handler that returns a
/// `Config` (the admin config GET, and the branding-upload handlers that
/// echo back the updated config) must route through, so a credential can't
/// leak just because a new response happened to skip the redaction this
/// used to duplicate inline at each call site.
pub(crate) fn redact_admin_config(mut config: Config) -> Config {
    config.auth.admin_password_hash = String::new();
    config.auth.guest_password_hash = match &config.auth.guest_password_hash {
        Some(h) if !h.is_empty() => Some(SECRET_PLACEHOLDER.to_string()),
        _ => None,
    };
    if !config.smtp.password.is_empty() {
        config.smtp.password = SECRET_PLACEHOLDER.to_string();
    }
    if !config.resend.api_key.is_empty() {
        config.resend.api_key = SECRET_PLACEHOLDER.to_string();
    }
    config
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config_with_secrets() -> Config {
        let mut config: Config = toml::from_str(Config::get_default_config_content())
            .expect("default template must parse");
        config.auth.admin_password_hash = "hashed-admin-password".to_string();
        config.auth.guest_password_hash = Some("hashed-guest-password".to_string());
        config.smtp.password = "smtp-secret".to_string();
        config.resend.api_key = "re_live_secret_key".to_string();
        config
    }

    #[test]
    fn redact_admin_config_clears_the_admin_password_hash_entirely() {
        let redacted = redact_admin_config(config_with_secrets());
        assert_eq!(redacted.auth.admin_password_hash, "");
    }

    #[test]
    fn redact_admin_config_replaces_a_set_guest_password_with_the_placeholder() {
        let redacted = redact_admin_config(config_with_secrets());
        assert_eq!(
            redacted.auth.guest_password_hash,
            Some(SECRET_PLACEHOLDER.to_string())
        );
    }

    #[test]
    fn redact_admin_config_leaves_an_unset_guest_password_as_none() {
        let mut config = config_with_secrets();
        config.auth.guest_password_hash = None;
        let redacted = redact_admin_config(config);
        assert_eq!(redacted.auth.guest_password_hash, None);
    }

    #[test]
    fn redact_admin_config_replaces_a_set_smtp_password_with_the_placeholder() {
        let redacted = redact_admin_config(config_with_secrets());
        assert_eq!(redacted.smtp.password, SECRET_PLACEHOLDER);
    }

    #[test]
    fn redact_admin_config_replaces_a_set_resend_api_key_with_the_placeholder() {
        let redacted = redact_admin_config(config_with_secrets());
        assert_eq!(redacted.resend.api_key, SECRET_PLACEHOLDER);
    }

    #[test]
    fn redact_admin_config_leaves_an_unset_smtp_password_empty_not_placeholder() {
        let mut config = config_with_secrets();
        config.smtp.password = String::new();
        let redacted = redact_admin_config(config);
        // An empty field must stay empty, not become the placeholder — that
        // would make the UI claim a password is set when none is.
        assert_eq!(redacted.smtp.password, "");
    }

    #[test]
    fn redact_admin_config_leaves_an_unset_resend_api_key_empty_not_placeholder() {
        let mut config = config_with_secrets();
        config.resend.api_key = String::new();
        let redacted = redact_admin_config(config);
        assert_eq!(redacted.resend.api_key, "");
    }

    // ------------------------------------------------------------------
    // preserve_secret_unless_changed
    // ------------------------------------------------------------------

    #[test]
    fn preserve_secret_keeps_the_current_value_when_incoming_is_blank() {
        assert_eq!(preserve_secret_unless_changed("real-secret", ""), "real-secret");
    }

    #[test]
    fn preserve_secret_keeps_the_current_value_when_incoming_is_whitespace_only() {
        assert_eq!(preserve_secret_unless_changed("real-secret", "   "), "real-secret");
    }

    #[test]
    fn preserve_secret_keeps_the_current_value_when_incoming_is_the_placeholder() {
        assert_eq!(
            preserve_secret_unless_changed("real-secret", SECRET_PLACEHOLDER),
            "real-secret"
        );
    }

    #[test]
    fn preserve_secret_adopts_a_genuinely_new_value() {
        assert_eq!(
            preserve_secret_unless_changed("old-secret", "new-secret"),
            "new-secret"
        );
    }

    #[test]
    fn preserve_secret_adopts_a_new_value_even_when_nothing_was_set_before() {
        assert_eq!(preserve_secret_unless_changed("", "new-secret"), "new-secret");
    }
}


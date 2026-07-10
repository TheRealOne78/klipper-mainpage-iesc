//! Local email/password signup: domain allow-list, proof-of-work anti-spam,
//! IP allow-list, email verification, plus admin account management. See
//! `crate::users` (storage), `crate::pow` (anti-spam), `crate::geo` (IP
//! allow-list), and `crate::mail` (verification email delivery).

use crate::*;
use axum::extract::{ConnectInfo, Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Redirect, Response};
use axum::Json;
use rand::RngCore;
use sha2::{Digest, Sha256};
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;

const MIN_PASSWORD_LENGTH: usize = 8;

/// True once a signup email passes the configured domain allow-list. An
/// empty allow-list allows nothing — an admin must opt in explicitly. A
/// pattern without `*` matches itself and any subdomain (`"example.com"`
/// matches `example.com` and `mail.example.com`); a pattern containing `*`
/// is a glob matched against the whole domain instead (`"*.example.com"`
/// matches only subdomains, not `example.com` itself; `"*.edu"` matches any
/// domain ending in `.edu` at any depth; a bare `"*"` matches everything).
pub(crate) fn email_domain_allowed(email: &str, allowed_domains: &[String]) -> bool {
    let Some(domain) = email.rsplit('@').next().filter(|_| email.contains('@')) else {
        return false;
    };
    let domain = domain.to_lowercase();
    allowed_domains.iter().any(|pattern| domain_matches_pattern(&domain, pattern))
}

fn domain_matches_pattern(domain: &str, pattern: &str) -> bool {
    let pattern = pattern.trim().trim_start_matches('@').to_lowercase();
    if pattern.is_empty() {
        return false;
    }
    if pattern.contains('*') {
        return glob_match(&pattern, domain);
    }
    domain == pattern || domain.ends_with(&format!(".{pattern}"))
}

/// Minimal `*`-only glob match (no `?`, no character classes — domain
/// patterns don't need more than that): `*` matches any run of characters,
/// including none. All boundaries used for slicing come from `find`/
/// `starts_with`/`ends_with`, which only ever return valid UTF-8 char
/// boundaries, so this never panics on non-ASCII input.
fn glob_match(pattern: &str, text: &str) -> bool {
    let parts: Vec<&str> = pattern.split('*').collect();
    if parts.len() == 1 {
        return pattern == text;
    }

    let mut pos = 0;
    for (i, part) in parts.iter().enumerate() {
        if part.is_empty() {
            continue;
        }
        if i == 0 {
            if !text[pos..].starts_with(part) {
                return false;
            }
            pos += part.len();
        } else if i == parts.len() - 1 {
            return text[pos..].ends_with(part);
        } else {
            match text[pos..].find(part) {
                Some(offset) => pos += offset + part.len(),
                None => return false,
            }
        }
    }
    true
}

/// Minimal shape check (not full RFC 5322): exactly one `@`, non-empty local
/// part, domain containing at least one `.`.
fn is_plausible_email(email: &str) -> bool {
    let Some((local, domain)) = email.split_once('@') else {
        return false;
    };
    !local.is_empty() && !domain.is_empty() && domain.contains('.') && !email.contains(char::is_whitespace)
}

/// No upper bound on length or restriction on character set beyond the
/// shared `passwords::MAX_PASSWORD_BYTES` DoS ceiling — any Unicode letter
/// (any script) and any Unicode digit both satisfy the complexity check, not
/// just ASCII a-z/0-9. Length is counted in characters, not bytes, so this
/// doesn't unfairly demand more actual characters from non-Latin scripts
/// (whose characters are often more than one byte in UTF-8).
fn password_meets_policy(password: &str) -> bool {
    password.len() <= passwords::MAX_PASSWORD_BYTES
        && password.chars().count() >= MIN_PASSWORD_LENGTH
        && password.chars().any(|c| c.is_alphabetic())
        && password.chars().any(|c| c.is_numeric())
}

/// True for any real, assignable group — everything except "anonymous",
/// which is a pseudo-group representing "no session at all" rather than a
/// membership an actual account can hold. A local account (however it was
/// created) always has a session, so it can never legitimately be
/// "anonymous"; letting that slip through here would let it inherit
/// anonymous's (deliberately maximally-restrictive) permissions and be
/// indistinguishable from a logged-out visitor.
pub(crate) fn is_assignable_group(config: &Config, group_id: &str) -> bool {
    group_id != "anonymous" && config.groups.iter().any(|g| g.id == group_id)
}

/// Which group a newly-verified signup lands in: a custom group's own
/// `emails` allow-list takes precedence over the configured default.
pub(crate) fn resolve_signup_group(email: &str, config: &Config) -> String {
    for group in &config.groups {
        if group.built_in {
            continue;
        }
        if group.emails.iter().any(|allowed| allowed.eq_ignore_ascii_case(email)) {
            return group.id.clone();
        }
    }
    // Defense-in-depth: `validate_admin_config` already refuses to save a
    // config with `default_group == "anonymous"`, but a hand-edited
    // config.toml bypasses that — never actually place a signed-up account
    // into the pseudo-group meant for sessionless visitors.
    if config.signup.default_group == "anonymous" {
        return "guest".to_string();
    }
    config.signup.default_group.clone()
}

fn random_token_hex() -> String {
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn hash_token(token: &str) -> String {
    let digest = Sha256::digest(token.as_bytes());
    digest.iter().map(|b| format!("{b:02x}")).collect()
}

/// Never derived from the request's `Host` header — that's attacker-controlled
/// (any caller can send an arbitrary `Host:` value) and would let a signup
/// request poison the verification link mailed to someone else's address, a
/// classic host-header-injection account-takeover vector. Only admin-set
/// config feeds this: the explicit `public_base_url`, or a `localhost` link
/// built from the equally admin-controlled listen port — safe, if only
/// useful for local testing, which is the point (it nudges a real deployment
/// toward setting `public_base_url` rather than silently trusting a header).
fn verification_base_url(config: &Config) -> String {
    let configured = config.signup.public_base_url.trim();
    if !configured.is_empty() {
        return configured.trim_end_matches('/').to_string();
    }
    format!("http://localhost:{}", config.server.port)
}

#[derive(serde::Deserialize)]
pub(crate) struct SignupPayload {
    email: String,
    password: String,
    #[serde(default)]
    pow_token: String,
    #[serde(default)]
    pow_nonce: String,
}

pub(crate) async fn get_pow_challenge(State(state): State<Arc<AppState>>) -> Response {
    let config = state.config.load();
    if !config.signup.enabled {
        return (StatusCode::NOT_FOUND, "Înregistrarea nu este activată").into_response();
    }
    let challenge = pow::issue_challenge(&state.pow_secret, config.signup.pow_difficulty_bits);
    Json(challenge).into_response()
}

pub(crate) async fn signup(
    State(state): State<Arc<AppState>>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(payload): Json<SignupPayload>,
) -> Response {
    let config = state.config.load();

    if !config.signup.enabled {
        return (StatusCode::NOT_FOUND, "Înregistrarea nu este activată").into_response();
    }

    let email = payload.email.trim().to_lowercase();
    if !is_plausible_email(&email) {
        return (StatusCode::BAD_REQUEST, "Adresă de email invalidă").into_response();
    }
    if !email_domain_allowed(&email, &config.signup.allowed_domains) {
        state
            .audit
            .record(
                "auth.signup",
                None,
                Some(email.clone()),
                false,
                audit_detail("reason", "domain_not_allowed"),
            )
            .await;
        return (
            StatusCode::FORBIDDEN,
            "Acest domeniu de email nu are voie să se înregistreze",
        )
            .into_response();
    }
    if payload.password.len() > passwords::MAX_PASSWORD_BYTES {
        return (StatusCode::BAD_REQUEST, "Parola este prea lungă").into_response();
    }
    if !password_meets_policy(&payload.password) {
        return (
            StatusCode::BAD_REQUEST,
            "Parola trebuie să aibă minim 8 caractere, cu cel puțin o literă și o cifră",
        )
            .into_response();
    }

    let client_ip = geo::resolve_client_ip(&config.geo_restriction, &headers, peer);
    if let Err(message) = geo::check_ip_allowed(&config.geo_restriction, &state.geo_db, client_ip) {
        state
            .audit
            .record(
                "auth.signup",
                None,
                Some(email.clone()),
                false,
                audit_detail("reason", "ip_not_allowed"),
            )
            .await;
        return (StatusCode::FORBIDDEN, message).into_response();
    }

    if config.signup.require_pow_challenge {
        if let Err(message) = pow::verify_solution(&state.pow_secret, &payload.pow_token, &payload.pow_nonce) {
            state
                .audit
                .record(
                    "auth.signup",
                    None,
                    Some(email.clone()),
                    false,
                    audit_detail("reason", "pow_failed"),
                )
                .await;
            return (StatusCode::FORBIDDEN, message).into_response();
        }
    }

    let password_hash = match passwords::hash_password(payload.password.clone()).await {
        Ok(hash) => hash,
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "Hashing failed").into_response(),
    };
    let group_id = resolve_signup_group(&email, &config);

    if !config.signup.require_email_verification {
        return match state.users.create_verified(&email, &password_hash, &group_id).await {
            Ok(()) => {
                state
                    .audit
                    .record(
                        "auth.signup",
                        None,
                        Some(email.clone()),
                        true,
                        audit_detail("email", email),
                    )
                    .await;
                Json(json!({ "status": "verified" })).into_response()
            }
            Err(users::UserStoreError::EmailTaken) => {
                (StatusCode::CONFLICT, "Există deja un cont cu acest email").into_response()
            }
            Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
        };
    }

    let raw_token = random_token_hex();
    let token_hash = hash_token(&raw_token);
    let expires_at = (time::OffsetDateTime::now_utc()
        + Duration::from_secs(config.signup.verification_ttl_minutes * 60))
    .format(&time::format_description::well_known::Rfc3339)
    .unwrap_or_default();

    if let Err(e) = state
        .users
        .create_pending(&email, &password_hash, &group_id, &token_hash, &expires_at)
        .await
    {
        return match e {
            users::UserStoreError::EmailTaken => {
                (StatusCode::CONFLICT, "Există deja un cont cu acest email").into_response()
            }
            e => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
        };
    }

    let verify_url = format!(
        "{}/api/auth/verify-email?token={raw_token}",
        verification_base_url(&config)
    );
    if let Err(e) = mail::send_verification_email(&config.resend, &config.smtp, &email, &verify_url).await {
        tracing::error!("Failed to send verification email to {email}: {e}");
    }

    state
        .audit
        .record(
            "auth.signup",
            None,
            Some(email.clone()),
            true,
            audit_detail("email", email),
        )
        .await;
    Json(json!({ "status": "pending_verification" })).into_response()
}

#[derive(serde::Deserialize)]
pub(crate) struct VerifyEmailQuery {
    token: String,
}

pub(crate) async fn verify_email(
    State(state): State<Arc<AppState>>,
    axum::extract::Query(query): axum::extract::Query<VerifyEmailQuery>,
) -> Response {
    let token_hash = hash_token(&query.token);
    match state.users.verify_by_token_hash(&token_hash).await {
        Ok(Some(email)) => {
            state
                .audit
                .record(
                    "auth.verify_email",
                    None,
                    Some(email.clone()),
                    true,
                    audit_detail("email", email),
                )
                .await;
            Redirect::to("/?verified=1").into_response()
        }
        Ok(None) => {
            state
                .audit
                .record("auth.verify_email", None, None, false, json!({}))
                .await;
            Redirect::to("/?verify_failed=1").into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

// --- Admin account management ---

#[derive(serde::Serialize)]
pub(crate) struct AdminUserListEntry {
    email: String,
    group_id: String,
    verified: bool,
    created_at: String,
}

pub(crate) async fn admin_list_users(
    State(state): State<Arc<AppState>>,
    _admin: AdminIdentity,
) -> Response {
    match state.users.list_all().await {
        Ok(users) => Json(
            users
                .into_iter()
                .map(|u| AdminUserListEntry {
                    email: u.email,
                    group_id: u.group_id,
                    verified: u.verified,
                    created_at: u.created_at,
                })
                .collect::<Vec<_>>(),
        )
        .into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

#[derive(serde::Deserialize)]
pub(crate) struct AdminCreateUserPayload {
    email: String,
    password: String,
    #[serde(default)]
    group_id: String,
}

/// Admin-provisioned account: verified immediately, no email round trip, and
/// deliberately not subject to the signup domain allow-list — an admin
/// adding someone by hand is the explicit override for that restriction.
pub(crate) async fn admin_create_user(
    State(state): State<Arc<AppState>>,
    admin: AdminIdentity,
    Json(payload): Json<AdminCreateUserPayload>,
) -> Response {
    let config = state.config.load();
    let email = payload.email.trim().to_lowercase();
    if !is_plausible_email(&email) {
        return (StatusCode::BAD_REQUEST, "Adresă de email invalidă").into_response();
    }
    if payload.password.len() > passwords::MAX_PASSWORD_BYTES {
        return (StatusCode::BAD_REQUEST, "Parola este prea lungă").into_response();
    }
    if !password_meets_policy(&payload.password) {
        return (
            StatusCode::BAD_REQUEST,
            "Parola trebuie să aibă minim 8 caractere, cu cel puțin o literă și o cifră",
        )
            .into_response();
    }
    let group_id = if payload.group_id.trim().is_empty() {
        resolve_signup_group(&email, &config)
    } else {
        payload.group_id.trim().to_string()
    };
    if !is_assignable_group(&config, &group_id) {
        return (StatusCode::BAD_REQUEST, "Grup necunoscut").into_response();
    }

    let password_hash = match passwords::hash_password(payload.password.clone()).await {
        Ok(hash) => hash,
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "Hashing failed").into_response(),
    };

    match state.users.create_verified(&email, &password_hash, &group_id).await {
        Ok(()) => {
            state
                .audit
                .record(
                    "admin.users.create",
                    Some(audit_role(&admin.0)), audit_identity(&admin.0),
                    true,
                    audit_detail("email", email),
                )
                .await;
            Json(json!({ "ok": true })).into_response()
        }
        Err(users::UserStoreError::EmailTaken) => {
            (StatusCode::CONFLICT, "Există deja un cont cu acest email").into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

pub(crate) async fn admin_delete_user(
    State(state): State<Arc<AppState>>,
    admin: AdminIdentity,
    Path(email): Path<String>,
) -> Response {
    match state.users.delete(&email).await {
        Ok(()) => {
            state
                .audit
                .record(
                    "admin.users.delete",
                    Some(audit_role(&admin.0)), audit_identity(&admin.0),
                    true,
                    audit_detail("email", email),
                )
                .await;
            Json(json!({ "ok": true })).into_response()
        }
        Err(users::UserStoreError::NotFound) => (StatusCode::NOT_FOUND, "Cont inexistent").into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

#[derive(serde::Deserialize)]
pub(crate) struct AdminSetUserGroupPayload {
    group_id: String,
}

pub(crate) async fn admin_set_user_group(
    State(state): State<Arc<AppState>>,
    admin: AdminIdentity,
    Path(email): Path<String>,
    Json(payload): Json<AdminSetUserGroupPayload>,
) -> Response {
    let config = state.config.load();
    let group_id = payload.group_id.trim();
    if !is_assignable_group(&config, group_id) {
        return (StatusCode::BAD_REQUEST, "Grup necunoscut").into_response();
    }

    match state.users.set_group(&email, group_id).await {
        Ok(()) => {
            state
                .audit
                .record(
                    "admin.users.set_group",
                    Some(audit_role(&admin.0)), audit_identity(&admin.0),
                    true,
                    audit_detail("email", email),
                )
                .await;
            Json(json!({ "ok": true })).into_response()
        }
        Err(users::UserStoreError::NotFound) => (StatusCode::NOT_FOUND, "Cont inexistent").into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

pub(crate) async fn admin_resend_verification(
    State(state): State<Arc<AppState>>,
    _admin: AdminIdentity,
    Path(email): Path<String>,
) -> Response {
    let config = state.config.load();
    let user = match state.users.find_by_email(&email).await {
        Ok(Some(u)) => u,
        Ok(None) => return (StatusCode::NOT_FOUND, "Cont inexistent").into_response(),
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };
    if user.verified {
        return (StatusCode::BAD_REQUEST, "Contul este deja confirmat").into_response();
    }

    let raw_token = random_token_hex();
    let token_hash = hash_token(&raw_token);
    let expires_at = (time::OffsetDateTime::now_utc()
        + Duration::from_secs(config.signup.verification_ttl_minutes * 60))
    .format(&time::format_description::well_known::Rfc3339)
    .unwrap_or_default();

    if let Err(e) = state
        .users
        .regenerate_verification(&email, &token_hash, &expires_at)
        .await
    {
        return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
    }

    let verify_url = format!(
        "{}/api/auth/verify-email?token={raw_token}",
        verification_base_url(&config)
    );
    if let Err(e) = mail::send_verification_email(&config.resend, &config.smtp, &email, &verify_url).await {
        tracing::error!("Failed to resend verification email to {email}: {e}");
    }

    Json(json!({ "ok": true })).into_response()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::GroupConfig;

    #[test]
    fn email_domain_allowed_matches_exact_domain() {
        assert!(email_domain_allowed("a@unitbv.ro", &["unitbv.ro".to_string()]));
    }

    #[test]
    fn email_domain_allowed_matches_subdomain() {
        assert!(email_domain_allowed(
            "a@student.unitbv.ro",
            &["unitbv.ro".to_string()]
        ));
    }

    #[test]
    fn email_domain_allowed_is_case_insensitive() {
        assert!(email_domain_allowed("a@UNITBV.RO", &["unitbv.ro".to_string()]));
        assert!(email_domain_allowed("a@unitbv.ro", &["UNITBV.RO".to_string()]));
    }

    #[test]
    fn email_domain_allowed_rejects_unlisted_domain() {
        assert!(!email_domain_allowed("a@gmail.com", &["unitbv.ro".to_string()]));
    }

    #[test]
    fn email_domain_allowed_rejects_lookalike_domain() {
        // "notunitbv.ro" must not match "unitbv.ro" via a naive ends_with.
        assert!(!email_domain_allowed("a@notunitbv.ro", &["unitbv.ro".to_string()]));
    }

    #[test]
    fn email_domain_allowed_empty_list_allows_nothing() {
        assert!(!email_domain_allowed("a@unitbv.ro", &[]));
    }

    // ------------------------------------------------------------------
    // Wildcard domain patterns (`*`)
    // ------------------------------------------------------------------

    #[test]
    fn wildcard_subdomain_pattern_matches_any_subdomain_but_not_bare_domain() {
        let patterns = vec!["*.unitbv.ro".to_string()];
        assert!(email_domain_allowed("a@student.unitbv.ro", &patterns));
        assert!(email_domain_allowed("a@deep.sub.unitbv.ro", &patterns));
        assert!(!email_domain_allowed("a@unitbv.ro", &patterns));
    }

    #[test]
    fn wildcard_tld_pattern_matches_any_domain_at_any_depth() {
        let patterns = vec!["*.edu".to_string()];
        assert!(email_domain_allowed("a@university.edu", &patterns));
        assert!(email_domain_allowed("a@dept.university.edu", &patterns));
        assert!(!email_domain_allowed("a@university.com", &patterns));
    }

    #[test]
    fn wildcard_prefix_pattern_matches() {
        let patterns = vec!["student*.unitbv.ro".to_string()];
        assert!(email_domain_allowed("a@student1.unitbv.ro", &patterns));
        assert!(email_domain_allowed("a@students.unitbv.ro", &patterns));
        assert!(!email_domain_allowed("a@staff.unitbv.ro", &patterns));
    }

    #[test]
    fn bare_wildcard_matches_every_domain() {
        let patterns = vec!["*".to_string()];
        assert!(email_domain_allowed("a@anything.example", &patterns));
        assert!(email_domain_allowed("a@gmail.com", &patterns));
    }

    #[test]
    fn wildcard_pattern_is_case_insensitive() {
        let patterns = vec!["*.UNITBV.RO".to_string()];
        assert!(email_domain_allowed("a@student.unitbv.ro", &patterns));
    }

    #[test]
    fn non_wildcard_pattern_still_matches_itself_and_subdomains_as_before() {
        let patterns = vec!["unitbv.ro".to_string()];
        assert!(email_domain_allowed("a@unitbv.ro", &patterns));
        assert!(email_domain_allowed("a@student.unitbv.ro", &patterns));
    }

    #[test]
    fn is_plausible_email_accepts_normal_address() {
        assert!(is_plausible_email("student@unitbv.ro"));
    }

    #[test]
    fn is_plausible_email_rejects_missing_at_or_dot_or_whitespace() {
        assert!(!is_plausible_email("not-an-email"));
        assert!(!is_plausible_email("a@localhost"));
        assert!(!is_plausible_email("a b@unitbv.ro"));
        assert!(!is_plausible_email("@unitbv.ro"));
    }

    #[test]
    fn password_meets_policy_requires_length_letter_and_digit() {
        assert!(password_meets_policy("abcd1234"));
        assert!(!password_meets_policy("short1"));
        assert!(!password_meets_policy("alllettersnodigits"));
        assert!(!password_meets_policy("12345678"));
    }

    fn base_config() -> Config {
        toml::from_str(Config::get_default_config_content()).expect("default config parses")
    }

    #[test]
    fn resolve_signup_group_uses_group_email_allowlist_first() {
        let mut config = base_config();
        config.groups.push(GroupConfig {
            id: "lab-advanced".to_string(),
            display_name: "Lab Advanced".to_string(),
            emails: vec!["vip@unitbv.ro".to_string()],
            permissions: Default::default(),
            built_in: false,
        });
        assert_eq!(resolve_signup_group("vip@unitbv.ro", &config), "lab-advanced");
        assert_eq!(resolve_signup_group("other@unitbv.ro", &config), "guest");
    }

    // ------------------------------------------------------------------
    // verification_base_url — must never derive from request-controlled
    // data (regression test for a host-header-injection finding: an
    // attacker-supplied `Host:` header must not be able to redirect
    // someone else's verification email to an attacker-controlled domain).
    // ------------------------------------------------------------------

    #[test]
    fn verification_base_url_uses_configured_public_base_url_when_set() {
        let mut config = base_config();
        config.signup.public_base_url = "https://print.unitbv.ro/".to_string();
        assert_eq!(verification_base_url(&config), "https://print.unitbv.ro");
    }

    #[test]
    fn verification_base_url_falls_back_to_localhost_with_configured_port_when_unset() {
        let mut config = base_config();
        config.signup.public_base_url = String::new();
        config.server.port = 9090;
        assert_eq!(verification_base_url(&config), "http://localhost:9090");
    }

    // ------------------------------------------------------------------
    // is_assignable_group / resolve_signup_group — "anonymous" is a
    // pseudo-group for sessionless visitors, never a real account's group.
    // ------------------------------------------------------------------

    fn config_with_builtin_groups() -> Config {
        let mut config = base_config();
        for id in ["anonymous", "guest", "admin"] {
            config.groups.push(GroupConfig {
                id: id.to_string(),
                display_name: id.to_string(),
                emails: Vec::new(),
                permissions: Default::default(),
                built_in: true,
            });
        }
        config
    }

    #[test]
    fn is_assignable_group_rejects_anonymous_even_though_it_exists() {
        let config = config_with_builtin_groups();
        assert!(!is_assignable_group(&config, "anonymous"));
    }

    #[test]
    fn is_assignable_group_accepts_guest_and_admin() {
        let config = config_with_builtin_groups();
        assert!(is_assignable_group(&config, "guest"));
        assert!(is_assignable_group(&config, "admin"));
    }

    #[test]
    fn is_assignable_group_rejects_unknown_group() {
        let config = config_with_builtin_groups();
        assert!(!is_assignable_group(&config, "made-up-group"));
    }

    #[test]
    fn resolve_signup_group_never_returns_anonymous_even_if_misconfigured() {
        let mut config = config_with_builtin_groups();
        config.signup.default_group = "anonymous".to_string();
        assert_eq!(resolve_signup_group("nobody@example.com", &config), "guest");
    }
}

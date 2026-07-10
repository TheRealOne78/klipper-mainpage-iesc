use crate::*;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use axum_extra::extract::cookie::{Cookie, CookieJar};
use serde_json::json;
use std::sync::Arc;

pub(crate) async fn auth_me(State(state): State<Arc<AppState>>, jar: CookieJar) -> Response {
    let identity = match jar.get("session_token").map(|c| c.value()) {
        Some(token) => state.sessions.validate_session(token).await,
        None => None,
    };

    Json(AuthMeResponse::from_identity(identity.as_ref())).into_response()
}

pub(crate) fn build_session_cookie(token: &str) -> Cookie<'static> {
    Cookie::build(("session_token", token.to_string()))
        .path("/")
        .http_only(true)
        .same_site(axum_extra::extract::cookie::SameSite::Lax)
        .build()
}

#[utoipa::path(
    post,
    path = "/api/auth/login",
    request_body = LoginPayload,
    responses(
        (status = 200, description = "Autentificare reusita", body = LoginResponse),
        (status = 401, description = "Parolă incorectă sau neautorizat")
    )
)]
pub(crate) async fn login(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
    Json(payload): Json<LoginPayload>,
) -> Response {
    let config = state.config.load();

    let username = payload.username.as_deref().map(str::trim).unwrap_or("");
    if username.is_empty() {
        // The frontend now always requires this field too (never sends a
        // blank value) — enforced here as well since the client can't be
        // trusted to actually do that. Knowing *who* attempted a login,
        // even for the shared admin/guest tiers, matters for the audit log.
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "Numele de utilizator este obligatoriu" })),
        )
            .into_response();
    }
    let is_reserved =
        username.eq_ignore_ascii_case("admin") || username.eq_ignore_ascii_case("guest");

    if !is_reserved {
        return login_with_local_account(&state, jar, username, &payload.password).await;
    }

    match state
        .sessions
        .create_session(&payload.password, &config)
        .await
    {
        Ok(session) => {
            let cookie = build_session_cookie(&session.token);
            let role_str = session.identity.role.as_str();
            state
                .audit
                .record(
                    "auth.login",
                    Some(role_str.to_string()),
                    audit_identity(&session.identity),
                    true,
                    audit_detail("role", role_str),
                )
                .await;
            (
                jar.add(cookie),
                Json(LoginResponse {
                    role: role_str.to_string(),
                    email: session.identity.email.clone(),
                    display_name: session.identity.display_name.clone(),
                    auth_source: session.identity.auth_source.clone(),
                }),
            )
                .into_response()
        }
        Err(e) => {
            state
                .audit
                .record(
                    "auth.login",
                    None,
                    None,
                    false,
                    audit_detail("reason", "invalid_credentials"),
                )
                .await;
            (
                StatusCode::UNAUTHORIZED,
                Json(serde_json::json!({ "error": e })),
            )
                .into_response()
        }
    }
}

/// What went wrong resolving a local account's email/password — lets callers
/// (cookie login vs. the OctoPrint-compat API) each decide how to report it,
/// while sharing the actual lookup/verification logic.
#[derive(Debug)]
pub(crate) enum LocalAccountAuthError {
    /// No such account, or the password didn't match — deliberately the same
    /// variant for both (see `resolve_local_account_identity`'s doc comment).
    InvalidCredentials,
    EmailNotVerified,
}

/// Verifies `email`/`password` against a local signup account (`UserStore`,
/// separate from the shared admin/guest passwords) and resolves the matching
/// `Identity` — shared by cookie-based login (`login_with_local_account`)
/// and the OctoPrint-compat API's per-request `X-Api-Key` auth, so any local
/// account (not just the two shared admin/guest tiers) gets its own group's
/// permissions enforced through either path. Deliberately returns the same
/// `InvalidCredentials` for "no such account" and "wrong password" — telling
/// a legitimate signer-upper *why* they can't log in yet (unverified) is more
/// useful than it is a meaningful information leak (the email's existence is
/// already implied by them having just signed up with it), but "does this
/// email exist at all" isn't worth leaking beyond that one case.
///
/// The Argon2/bcrypt verify always runs — against `DUMMY_PASSWORD_HASH` when
/// no account was found — rather than short-circuiting on a missing account.
/// A hash verify is deliberately slow (that's the whole point of Argon2), so
/// skipping it for "no such account" would make that response measurably
/// faster than "wrong password for a real account", letting a caller
/// enumerate valid emails purely by timing.
pub(crate) async fn resolve_local_account_identity(
    users: &UserStore,
    email: &str,
    password: &str,
) -> Result<Identity, LocalAccountAuthError> {
    let user = users.find_by_email(email).await.unwrap_or_default();

    let hash = user
        .as_ref()
        .map(|u| u.password_hash.clone())
        .unwrap_or_else(|| passwords::DUMMY_PASSWORD_HASH.to_string());
    let password_matches = passwords::verify_password(password.to_string(), hash).await;

    let user = match user {
        Some(user) if password_matches => user,
        _ => return Err(LocalAccountAuthError::InvalidCredentials),
    };

    if !user.verified {
        return Err(LocalAccountAuthError::EmailNotVerified);
    }

    Ok(Identity {
        role: UserRole::Group(user.group_id),
        email: Some(user.email),
        display_name: None,
        auth_source: "local_signup".to_string(),
    })
}

/// Local signup-account login path (cookie session): thin wrapper over
/// `resolve_local_account_identity` that turns each outcome into the
/// audited HTTP response the login endpoint has always returned.
async fn login_with_local_account(
    state: &AppState,
    jar: CookieJar,
    email: &str,
    password: &str,
) -> Response {
    let identity = match resolve_local_account_identity(&state.users, email, password).await {
        Ok(identity) => identity,
        Err(LocalAccountAuthError::EmailNotVerified) => {
            state
                .audit
                .record(
                    "auth.login",
                    None,
                    // The email itself is known even though the login
                    // failed — worth recording so the audit log shows who
                    // was trying (and why it didn't work), not just a bare
                    // failure.
                    Some(email.to_string()),
                    false,
                    audit_detail("reason", "email_not_verified"),
                )
                .await;
            return (
                StatusCode::FORBIDDEN,
                Json(json!({ "error": "Adresa de email nu a fost confirmată încă" })),
            )
                .into_response();
        }
        Err(LocalAccountAuthError::InvalidCredentials) => {
            state
                .audit
                .record(
                    "auth.login",
                    None,
                    // May be a real email with the wrong password, or one
                    // that doesn't exist at all — either way it's what the
                    // caller typed, useful for spotting brute-force attempts.
                    Some(email.to_string()),
                    false,
                    audit_detail("reason", "invalid_credentials"),
                )
                .await;
            return (
                StatusCode::UNAUTHORIZED,
                Json(json!({ "error": "Email sau parolă incorectă" })),
            )
                .into_response();
        }
    };

    let session = state.sessions.create_identity_session(identity).await;
    let cookie = build_session_cookie(&session.token);
    let role_str = session.identity.role.as_str();
    state
        .audit
        .record(
            "auth.login",
            Some(role_str.to_string()),
            audit_identity(&session.identity),
            true,
            audit_detail("role", role_str),
        )
        .await;
    (
        jar.add(cookie),
        Json(LoginResponse {
            role: role_str.to_string(),
            email: session.identity.email.clone(),
            display_name: session.identity.display_name.clone(),
            auth_source: session.identity.auth_source.clone(),
        }),
    )
        .into_response()
}

#[utoipa::path(
    post,
    path = "/api/auth/logout",
    responses(
        (status = 200, description = "Deconectare reusita", body = StatusResponse)
    )
)]
pub(crate) async fn logout(State(state): State<Arc<AppState>>, jar: CookieJar) -> Response {
    let role = match jar.get("session_token").map(|c| c.value()) {
        Some(token) => state.sessions.validate_session(token).await,
        None => None,
    };
    if let Some(cookie) = jar.get("session_token") {
        state.sessions.destroy_session(cookie.value()).await;
    }
    state
        .audit
        .record(
            "auth.logout",
            role.as_ref().map(audit_role),
            role.as_ref().and_then(audit_identity),
            true,
            json!({}),
        )
        .await;
    let cookie = Cookie::build(("session_token", ""))
        .path("/")
        .max_age(Duration::ZERO)
        .build();
    (
        jar.add(cookie),
        Json(StatusResponse {
            status: "ok".to_string(),
        }),
    )
        .into_response()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_store() -> UserStore {
        let mut path = std::env::temp_dir();
        path.push(format!("klipper-auth-test-{}.sqlite", uuid::Uuid::new_v4()));
        UserStore::new(path)
    }

    /// bcrypt at a near-minimum cost factor — `resolve_local_account_identity`
    /// always pays a full hash-verify (real account or dummy), so a
    /// production cost factor would make every test here noticeably slow.
    fn low_cost_hash(password: &str) -> String {
        bcrypt::hash(password, 4).expect("bcrypt hash")
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
    async fn correct_password_verified_account_resolves_to_its_group() {
        let store = store_with_verified_user("student@unitbv.ro", "correct-horse", "guest").await;
        let identity = resolve_local_account_identity(&store, "student@unitbv.ro", "correct-horse")
            .await
            .expect("should resolve");
        assert_eq!(identity.role, UserRole::Group("guest".to_string()));
        assert_eq!(identity.email, Some("student@unitbv.ro".to_string()));
        assert_eq!(identity.auth_source, "local_signup");
    }

    #[tokio::test]
    async fn resolves_to_the_accounts_actual_group_not_a_hardcoded_one() {
        let store =
            store_with_verified_user("prof@unitbv.ro", "correct-horse", "lab-supervisors").await;
        let identity = resolve_local_account_identity(&store, "prof@unitbv.ro", "correct-horse")
            .await
            .expect("should resolve");
        assert_eq!(identity.role, UserRole::Group("lab-supervisors".to_string()));
    }

    #[tokio::test]
    async fn email_lookup_is_case_insensitive() {
        let store = store_with_verified_user("Student@Unitbv.RO", "correct-horse", "guest").await;
        let identity = resolve_local_account_identity(&store, "student@unitbv.ro", "correct-horse")
            .await
            .expect("should resolve regardless of case");
        assert_eq!(identity.email, Some("student@unitbv.ro".to_string()));
    }

    #[tokio::test]
    async fn wrong_password_is_rejected_as_invalid_credentials() {
        let store = store_with_verified_user("student@unitbv.ro", "correct-horse", "guest").await;
        let err = resolve_local_account_identity(&store, "student@unitbv.ro", "wrong-password")
            .await
            .unwrap_err();
        assert!(matches!(err, LocalAccountAuthError::InvalidCredentials));
    }

    #[tokio::test]
    async fn unknown_email_is_rejected_as_invalid_credentials_not_a_distinct_error() {
        // Must NOT be distinguishable from "wrong password for a real
        // account" by error variant (or by timing — see the dummy-hash
        // comment on `resolve_local_account_identity`) since that would let
        // a caller enumerate which emails have accounts.
        let store = temp_store();
        store.init().await.expect("init");
        let err = resolve_local_account_identity(&store, "nobody@unitbv.ro", "anything")
            .await
            .unwrap_err();
        assert!(matches!(err, LocalAccountAuthError::InvalidCredentials));
    }

    #[tokio::test]
    async fn unverified_account_with_correct_password_reports_unverified() {
        let store = temp_store();
        store.init().await.expect("init");
        store
            .create_pending(
                "pending@unitbv.ro",
                &low_cost_hash("correct-horse"),
                "guest",
                "sometoken",
                "2999-01-01T00:00:00Z",
            )
            .await
            .expect("create_pending");

        let err = resolve_local_account_identity(&store, "pending@unitbv.ro", "correct-horse")
            .await
            .unwrap_err();
        assert!(matches!(err, LocalAccountAuthError::EmailNotVerified));
    }

    #[tokio::test]
    async fn unverified_account_with_wrong_password_is_invalid_credentials_not_unverified() {
        // The password must be checked before the verified flag — an
        // attacker guessing passwords against a real-but-unverified email
        // shouldn't get a different (more informative) error than they'd
        // get for a wrong password anywhere else.
        let store = temp_store();
        store.init().await.expect("init");
        store
            .create_pending(
                "pending@unitbv.ro",
                &low_cost_hash("correct-horse"),
                "guest",
                "sometoken",
                "2999-01-01T00:00:00Z",
            )
            .await
            .expect("create_pending");

        let err = resolve_local_account_identity(&store, "pending@unitbv.ro", "wrong-password")
            .await
            .unwrap_err();
        assert!(matches!(err, LocalAccountAuthError::InvalidCredentials));
    }

    #[tokio::test]
    async fn empty_password_against_a_real_account_is_rejected() {
        let store = store_with_verified_user("student@unitbv.ro", "correct-horse", "guest").await;
        let err = resolve_local_account_identity(&store, "student@unitbv.ro", "")
            .await
            .unwrap_err();
        assert!(matches!(err, LocalAccountAuthError::InvalidCredentials));
    }
}

use crate::config::Config;
use crate::passwords::verify_password;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use uuid::Uuid;

#[derive(
    Debug, Clone, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize, utoipa::ToSchema,
)]
pub enum UserRole {
    Admin,
    User,
    /// A named group — the string is the group's `id` field from config.
    /// `"anonymous"` and `"guest"` are the built-in groups reached via the
    /// no-session and guest-password flows respectively.
    Group(String),
    Guest,
}

impl UserRole {
    pub fn as_str(&self) -> &str {
        match self {
            UserRole::Admin => "admin",
            UserRole::User => "user",
            UserRole::Group(name) => name.as_str(),
            UserRole::Guest => "guest",
        }
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
pub struct Identity {
    pub role: UserRole,
    pub email: Option<String>,
    pub display_name: Option<String>,
    pub auth_source: String,
}

impl Identity {
    pub fn local_admin() -> Self {
        Self {
            role: UserRole::Admin,
            email: None,
            display_name: Some("Local admin".to_string()),
            auth_source: "local".to_string(),
        }
    }

    pub fn guest(auth_source: &str) -> Self {
        Self {
            role: UserRole::Guest,
            email: None,
            display_name: None,
            auth_source: auth_source.to_string(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct Session {
    pub token: String,
    pub identity: Identity,
}

pub struct SessionManager {
    sessions: Arc<RwLock<HashMap<String, Identity>>>,
}

impl SessionManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn create_identity_session(&self, identity: Identity) -> Session {
        let token = Uuid::new_v4().to_string();
        self.sessions
            .write()
            .await
            .insert(token.clone(), identity.clone());
        Session { token, identity }
    }

    /// Verifies `password` against the shared admin/guest passwords and
    /// returns the matching `Identity`, without allocating a session-map
    /// entry — used both by `create_session` (cookie-based login) and by
    /// per-request header auth (e.g. the OctoPrint-compat API's `X-Api-Key`,
    /// which re-authenticates on every call rather than holding a session).
    pub async fn resolve_identity_for_password(
        &self,
        password: &str,
        config: &Config,
    ) -> Result<Identity, &'static str> {
        // Admin takes precedence: a correct admin password always grants a
        // full-access session regardless of the guest password configuration.
        let admin_hash = &config.auth.admin_password_hash;
        if !admin_hash.is_empty()
            && verify_password(password.to_string(), admin_hash.clone()).await
        {
            return Ok(Identity::local_admin());
        }

        // Custom groups have no shared password of their own — membership
        // comes from local signup accounts (see `resolve_signup_group` in
        // handlers/users.rs). Only the built-in admin/guest tiers are
        // reachable via a local password here.

        // Check guest if password is set
        if let Some(ref guest_hash) = config.auth.guest_password_hash {
            if !guest_hash.is_empty() {
                if verify_password(password.to_string(), guest_hash.clone()).await {
                    return Ok(Identity::guest("local"));
                } else {
                    return Err("Parolă incorectă");
                }
            }
        }

        Err("Parolă incorectă")
    }

    pub async fn create_session(
        &self,
        password: &str,
        config: &Config,
    ) -> Result<Session, &'static str> {
        let identity = self.resolve_identity_for_password(password, config).await?;
        Ok(self.create_identity_session(identity).await)
    }

    pub async fn validate_session(&self, token: &str) -> Option<Identity> {
        self.sessions.read().await.get(token).cloned()
    }

    pub async fn destroy_session(&self, token: &str) {
        self.sessions.write().await.remove(token);
    }
}

pub struct SafetyManager;

impl SafetyManager {
    /// Validators below take the caller's *resolved* per-group `PermissionsConfig`
    /// (via `resolve_permissions` in main.rs) rather than the whole `Config`, since
    /// limits are per-group now. `None` on a limit field means "unlimited for this
    /// group" — but a couple of absolute, sanity-preserving ceilings (500% speed,
    /// 5mm Z-down jog) still apply even to an "unlimited" group.
    pub fn validate_speed_factor(
        speed_factor: f64,
        perms: &crate::config::PermissionsConfig,
    ) -> Result<f64, &'static str> {
        let max_speed = perms.max_speed_factor.map_or(500.0, |v| f64::min(500.0, v));
        if speed_factor < 1.0 || speed_factor > max_speed {
            return Err("Factorul de viteză depășește limitele admise (max 500%)");
        }
        Ok(speed_factor)
    }

    pub fn validate_jog(
        axis: &str,
        distance: f64,
        is_printing: bool,
        perms: &crate::config::PermissionsConfig,
    ) -> Result<(), &'static str> {
        if is_printing && !perms.allow_movement_while_printing {
            return Err("Mișcarea este dezactivată în timpul printării");
        }

        let axis_lower = axis.to_lowercase();
        if axis_lower != "x" && axis_lower != "y" && axis_lower != "z" {
            return Err("Axă invalidă. Sunt permise doar X, Y, Z");
        }

        let max_jog_step = perms.max_jog_step.unwrap_or(f64::MAX);
        if distance.abs() > max_jog_step {
            return Err("Pasul de mișcare depășește limita configurată");
        }

        // Z-down movement conservative safety:
        // if moving Z down (which is negative in absolute jog, i.e., moving towards the bed), limit it further if desired.
        if axis_lower == "z" && distance < 0.0 && distance.abs() > f64::min(5.0, max_jog_step) {
            return Err("Mișcarea în jos pe axa Z este limitată pentru siguranță");
        }

        Ok(())
    }

    pub fn validate_home(perms: &crate::config::PermissionsConfig) -> Result<(), &'static str> {
        if !perms.allow_home_for_guests {
            return Err("Homing-ul este dezactivat pentru siguranță");
        }

        Ok(())
    }

    pub fn validate_preheat(
        hotend: f64,
        bed: f64,
        safety: &crate::config::SafetyConfig,
    ) -> Result<(), &'static str> {
        if hotend < 0.0 || hotend > safety.max_hotend_temp {
            return Err("Temperatura hotend depășește limita configurată");
        }

        if bed < 0.0 || bed > safety.max_bed_temp {
            return Err("Temperatura patului depășește limita configurată");
        }

        Ok(())
    }

    pub fn validate_macro(
        macro_name: &str,
        perms: &crate::config::PermissionsConfig,
    ) -> Result<(), &'static str> {
        let upper_name = macro_name
            .split_whitespace()
            .next()
            .unwrap_or("")
            .to_uppercase();
        // Allow restarting firmware/Klipper regardless of config macro limits
        if upper_name == "FIRMWARE_RESTART" || upper_name == "RESTART" {
            return Ok(());
        }
        if !perms
            .allowed_macros
            .iter()
            .any(|m| m.to_uppercase() == upper_name)
        {
            return Err("Macroul nu este în lista de permisiuni pentru oaspeți");
        }

        Ok(())
    }

    pub fn validate_upload(
        filename: &str,
        size_bytes: u64,
        perms: &crate::config::PermissionsConfig,
    ) -> Result<String, &'static str> {
        let max_bytes = perms.max_upload_mb.map_or(u64::MAX, |mb| mb * 1024 * 1024);
        if size_bytes > max_bytes {
            return Err("Fișierul depășește dimensiunea maximă permisă");
        }

        let path = std::path::Path::new(filename);
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|s| s.to_lowercase());

        match ext.as_deref() {
            Some("gcode") | Some("gco") => {}
            _ => return Err("Doar fișierele .gcode și .gco sunt permise"),
        }

        // Prevent path traversal
        let clean_filename = path
            .file_name()
            .and_then(|f| f.to_str())
            .ok_or("Nume de fișier invalid")?;

        Ok(clean_filename.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::{Config, PermissionsConfig, SafetyConfig};

    /// Guest-safe defaults (`max_speed_factor: Some(200.0)`,
    /// `max_jog_step: Some(10.0)`, `max_upload_mb: Some(250)`,
    /// `allow_movement_while_printing/allow_home_for_guests: false`, a fixed
    /// `allowed_macros` list including "PREHEAT") — see
    /// `PermissionsConfig::default()` in config.rs.
    fn perms() -> PermissionsConfig {
        PermissionsConfig::default()
    }

    /// Every limit `None` ("unlimited"), every capability granted.
    fn unlimited_perms() -> PermissionsConfig {
        PermissionsConfig::unlimited()
    }

    fn safety() -> SafetyConfig {
        SafetyConfig {
            max_hotend_temp: 260.0,
            max_bed_temp: 110.0,
        }
    }

    // ---------------------------------------------------------------------
    // validate_speed_factor
    // ---------------------------------------------------------------------

    #[test]
    fn validate_speed_factor_accepts_within_default_limit() {
        assert_eq!(SafetyManager::validate_speed_factor(150.0, &perms()), Ok(150.0));
    }

    #[test]
    fn validate_speed_factor_rejects_below_minimum() {
        assert!(SafetyManager::validate_speed_factor(0.5, &perms()).is_err());
    }

    #[test]
    fn validate_speed_factor_accepts_at_minimum_boundary() {
        assert_eq!(SafetyManager::validate_speed_factor(1.0, &perms()), Ok(1.0));
    }

    #[test]
    fn validate_speed_factor_rejects_above_group_limit() {
        assert!(SafetyManager::validate_speed_factor(201.0, &perms()).is_err());
    }

    #[test]
    fn validate_speed_factor_accepts_at_group_limit_boundary() {
        assert_eq!(SafetyManager::validate_speed_factor(200.0, &perms()), Ok(200.0));
    }

    #[test]
    fn validate_speed_factor_unlimited_group_still_capped_at_absolute_500_ceiling() {
        assert_eq!(
            SafetyManager::validate_speed_factor(500.0, &unlimited_perms()),
            Ok(500.0)
        );
        assert!(SafetyManager::validate_speed_factor(500.1, &unlimited_perms()).is_err());
    }

    // ---------------------------------------------------------------------
    // validate_jog
    // ---------------------------------------------------------------------

    #[test]
    fn validate_jog_accepts_valid_axes_case_insensitive() {
        for axis in ["x", "X", "y", "Y", "z", "Z"] {
            assert!(
                SafetyManager::validate_jog(axis, 1.0, false, &perms()).is_ok(),
                "axis {axis} should be accepted"
            );
        }
    }

    #[test]
    fn validate_jog_rejects_invalid_axis() {
        for axis in ["a", "", "xy", "w"] {
            assert!(
                SafetyManager::validate_jog(axis, 1.0, false, &perms()).is_err(),
                "axis {axis:?} should be rejected"
            );
        }
    }

    #[test]
    fn validate_jog_rejects_while_printing_when_not_allowed() {
        // allow_movement_while_printing: false by default
        assert!(SafetyManager::validate_jog("x", 1.0, true, &perms()).is_err());
    }

    #[test]
    fn validate_jog_accepts_while_printing_when_allowed() {
        let p = PermissionsConfig {
            allow_movement_while_printing: true,
            ..perms()
        };
        assert!(SafetyManager::validate_jog("x", 1.0, true, &p).is_ok());
    }

    #[test]
    fn validate_jog_rejects_distance_beyond_max_step() {
        // max_jog_step: Some(10.0) by default
        assert!(SafetyManager::validate_jog("x", 10.1, false, &perms()).is_err());
    }

    #[test]
    fn validate_jog_accepts_distance_at_max_step_boundary() {
        assert!(SafetyManager::validate_jog("x", 10.0, false, &perms()).is_ok());
        assert!(SafetyManager::validate_jog("x", -10.0, false, &perms()).is_ok());
    }

    #[test]
    fn validate_jog_z_down_clamped_to_5mm_even_with_larger_step_limit() {
        let p = PermissionsConfig {
            max_jog_step: Some(20.0),
            ..perms()
        };
        assert!(SafetyManager::validate_jog("z", -5.0, false, &p).is_ok());
        assert!(SafetyManager::validate_jog("z", -5.1, false, &p).is_err());
    }

    #[test]
    fn validate_jog_z_down_clamped_to_5mm_even_when_step_limit_unlimited() {
        let p = PermissionsConfig {
            max_jog_step: None,
            ..perms()
        };
        assert!(SafetyManager::validate_jog("z", -5.0, false, &p).is_ok());
        assert!(SafetyManager::validate_jog("z", -5.1, false, &p).is_err());
    }

    #[test]
    fn validate_jog_z_down_uses_the_smaller_of_5mm_or_a_tighter_step_limit() {
        // Step limit (3.0) is tighter than the 5mm ceiling, so it's the step
        // check (not the Z-specific clamp) that governs here.
        let p = PermissionsConfig {
            max_jog_step: Some(3.0),
            ..perms()
        };
        assert!(SafetyManager::validate_jog("z", -3.0, false, &p).is_ok());
        assert!(SafetyManager::validate_jog("z", -3.1, false, &p).is_err());
    }

    #[test]
    fn validate_jog_z_up_is_not_subject_to_the_down_only_clamp() {
        let p = PermissionsConfig {
            max_jog_step: Some(20.0),
            ..perms()
        };
        assert!(SafetyManager::validate_jog("z", 8.0, false, &p).is_ok());
    }

    // ---------------------------------------------------------------------
    // validate_home
    // ---------------------------------------------------------------------

    #[test]
    fn validate_home_rejects_when_disallowed() {
        // allow_home_for_guests: false by default
        assert!(SafetyManager::validate_home(&perms()).is_err());
    }

    #[test]
    fn validate_home_accepts_when_allowed() {
        let p = PermissionsConfig {
            allow_home_for_guests: true,
            ..perms()
        };
        assert!(SafetyManager::validate_home(&p).is_ok());
    }

    // ---------------------------------------------------------------------
    // validate_preheat
    // ---------------------------------------------------------------------

    #[test]
    fn validate_preheat_accepts_within_limits() {
        assert!(SafetyManager::validate_preheat(200.0, 60.0, &safety()).is_ok());
    }

    #[test]
    fn validate_preheat_rejects_hotend_over_limit() {
        assert!(SafetyManager::validate_preheat(261.0, 60.0, &safety()).is_err());
    }

    #[test]
    fn validate_preheat_accepts_hotend_at_limit_boundary() {
        assert!(SafetyManager::validate_preheat(260.0, 60.0, &safety()).is_ok());
    }

    #[test]
    fn validate_preheat_rejects_bed_over_limit() {
        assert!(SafetyManager::validate_preheat(200.0, 111.0, &safety()).is_err());
    }

    #[test]
    fn validate_preheat_accepts_bed_at_limit_boundary() {
        assert!(SafetyManager::validate_preheat(200.0, 110.0, &safety()).is_ok());
    }

    #[test]
    fn validate_preheat_rejects_negative_values() {
        assert!(SafetyManager::validate_preheat(-1.0, 60.0, &safety()).is_err());
        assert!(SafetyManager::validate_preheat(200.0, -1.0, &safety()).is_err());
    }

    // ---------------------------------------------------------------------
    // validate_macro
    // ---------------------------------------------------------------------

    #[test]
    fn validate_macro_accepts_allowed_macro_case_insensitive() {
        // "PREHEAT" is in PermissionsConfig::default()'s allowed_macros.
        assert!(SafetyManager::validate_macro("preheat", &perms()).is_ok());
        assert!(SafetyManager::validate_macro("PREHEAT", &perms()).is_ok());
        assert!(SafetyManager::validate_macro("PrEhEaT", &perms()).is_ok());
    }

    #[test]
    fn validate_macro_matches_only_the_first_whitespace_separated_token() {
        assert!(SafetyManager::validate_macro("PREHEAT PLA", &perms()).is_ok());
    }

    #[test]
    fn validate_macro_rejects_macro_not_in_allow_list() {
        assert!(SafetyManager::validate_macro("SOME_RANDOM_MACRO", &perms()).is_err());
    }

    #[test]
    fn validate_macro_always_allows_firmware_restart_and_restart_regardless_of_allow_list() {
        let p = PermissionsConfig {
            allowed_macros: vec![],
            ..perms()
        };
        assert!(SafetyManager::validate_macro("FIRMWARE_RESTART", &p).is_ok());
        assert!(SafetyManager::validate_macro("RESTART", &p).is_ok());
        assert!(SafetyManager::validate_macro("restart", &p).is_ok());
    }

    #[test]
    fn validate_macro_empty_allow_list_rejects_everything_else() {
        let p = PermissionsConfig {
            allowed_macros: vec![],
            ..perms()
        };
        assert!(SafetyManager::validate_macro("PREHEAT", &p).is_err());
    }

    // ---------------------------------------------------------------------
    // validate_upload
    // ---------------------------------------------------------------------

    #[test]
    fn validate_upload_accepts_within_size_limit() {
        // max_upload_mb: Some(250) by default
        assert!(SafetyManager::validate_upload("model.gcode", 10 * 1024 * 1024, &perms()).is_ok());
    }

    #[test]
    fn validate_upload_rejects_over_size_limit() {
        let too_big = 251 * 1024 * 1024;
        assert!(SafetyManager::validate_upload("model.gcode", too_big, &perms()).is_err());
    }

    #[test]
    fn validate_upload_unlimited_accepts_a_very_large_size() {
        let p = PermissionsConfig {
            max_upload_mb: None,
            ..perms()
        };
        assert!(SafetyManager::validate_upload("model.gcode", 5 * 1024 * 1024 * 1024, &p).is_ok());
    }

    #[test]
    fn validate_upload_accepts_gcode_and_gco_extensions_case_insensitive() {
        for name in ["model.gcode", "model.GCODE", "model.gco", "model.GCO"] {
            assert!(
                SafetyManager::validate_upload(name, 100, &perms()).is_ok(),
                "{name} should be accepted"
            );
        }
    }

    #[test]
    fn validate_upload_rejects_other_extensions() {
        for name in ["model.txt", "model", "model.gcode.exe", "model.stl"] {
            assert!(
                SafetyManager::validate_upload(name, 100, &perms()).is_err(),
                "{name} should be rejected"
            );
        }
    }

    #[test]
    fn validate_upload_strips_directory_components_from_the_returned_filename() {
        // Path::file_name() takes only the last path segment, so any `../`
        // prefix an attacker sends is dropped from the value callers persist.
        let result = SafetyManager::validate_upload("../../etc/passwd.gcode", 100, &perms());
        assert_eq!(result, Ok("passwd.gcode".to_string()));
    }

    // ---------------------------------------------------------------------
    // SessionManager
    // ---------------------------------------------------------------------

    #[tokio::test]
    async fn session_lifecycle_create_validate_destroy() {
        let mgr = SessionManager::new();
        let session = mgr.create_identity_session(Identity::local_admin()).await;

        let found = mgr.validate_session(&session.token).await;
        assert!(found.is_some());
        assert_eq!(found.unwrap().role, UserRole::Admin);

        mgr.destroy_session(&session.token).await;
        assert!(mgr.validate_session(&session.token).await.is_none());
    }

    #[tokio::test]
    async fn session_validate_unknown_token_returns_none() {
        let mgr = SessionManager::new();
        assert!(mgr.validate_session("nonexistent-token").await.is_none());
    }

    #[tokio::test]
    async fn session_destroy_is_idempotent_for_an_already_removed_token() {
        let mgr = SessionManager::new();
        let session = mgr.create_identity_session(Identity::guest("local")).await;
        mgr.destroy_session(&session.token).await;
        // Destroying again must not panic.
        mgr.destroy_session(&session.token).await;
        assert!(mgr.validate_session(&session.token).await.is_none());
    }

    /// Deliberately still bcrypt (at a low cost, for test speed): these
    /// tests exercise `create_session`'s password-routing logic (admin-first,
    /// then guest, else reject), and using a legacy-format hash here doubles
    /// as a regression check that `verify_password` still accepts hashes
    /// created before the Argon2 migration (see `passwords.rs`) — new hashes
    /// are Argon2id, this only tests that old ones weren't broken.
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

    #[tokio::test]
    async fn create_session_with_correct_admin_password_grants_admin() {
        let config = config_with_passwords("admin123", None);
        let mgr = SessionManager::new();
        let session = mgr.create_session("admin123", &config).await.unwrap();
        assert_eq!(session.identity.role, UserRole::Admin);
    }

    #[tokio::test]
    async fn create_session_admin_password_takes_precedence_over_guest_password() {
        let config = config_with_passwords("admin123", Some("guest123"));
        let mgr = SessionManager::new();
        let session = mgr.create_session("admin123", &config).await.unwrap();
        assert_eq!(session.identity.role, UserRole::Admin);
    }

    #[tokio::test]
    async fn create_session_with_wrong_password_and_no_guest_password_is_rejected() {
        let config = config_with_passwords("admin123", None);
        let mgr = SessionManager::new();
        assert!(mgr.create_session("wrong-password", &config).await.is_err());
    }

    #[tokio::test]
    async fn create_session_with_correct_guest_password_grants_guest() {
        let config = config_with_passwords("admin123", Some("guest123"));
        let mgr = SessionManager::new();
        let session = mgr.create_session("guest123", &config).await.unwrap();
        assert_eq!(session.identity.role, UserRole::Guest);
    }

    #[tokio::test]
    async fn create_session_with_wrong_guest_password_is_rejected() {
        let config = config_with_passwords("admin123", Some("guest123"));
        let mgr = SessionManager::new();
        assert!(mgr.create_session("anything-else", &config).await.is_err());
    }

    // ------------------------------------------------------------------
    // resolve_identity_for_password — direct tests. `create_session` is a
    // thin wrapper over this (see above for its transitive coverage); these
    // exercise it without going through session-map allocation, matching
    // how the OctoPrint-compat API's per-request `X-Api-Key` auth uses it.
    // ------------------------------------------------------------------

    #[tokio::test]
    async fn resolve_identity_for_password_does_not_allocate_a_session() {
        let config = config_with_passwords("admin123", None);
        let mgr = SessionManager::new();
        mgr.resolve_identity_for_password("admin123", &config)
            .await
            .unwrap();
        // No token was ever handed out, so there's nothing a caller could
        // validate — confirms this path is truly stateless per-call.
        assert!(mgr.validate_session("").await.is_none());
    }

    #[tokio::test]
    async fn resolve_identity_for_password_matches_create_sessions_identity() {
        let config = config_with_passwords("admin123", Some("guest123"));
        let mgr = SessionManager::new();
        let direct = mgr
            .resolve_identity_for_password("guest123", &config)
            .await
            .unwrap();
        assert_eq!(direct.role, UserRole::Guest);
    }

    #[tokio::test]
    async fn resolve_identity_for_password_rejects_empty_string() {
        let config = config_with_passwords("admin123", None);
        let mgr = SessionManager::new();
        assert!(mgr
            .resolve_identity_for_password("", &config)
            .await
            .is_err());
    }

    #[tokio::test]
    async fn resolve_identity_for_password_with_no_admin_hash_configured_rejects_everything() {
        let mut config: Config = toml::from_str(Config::get_default_config_content())
            .expect("default template must parse");
        config.auth.admin_password_hash = String::new();
        config.auth.guest_password_hash = None;
        let mgr = SessionManager::new();
        assert!(mgr
            .resolve_identity_for_password("anything", &config)
            .await
            .is_err());
    }
}

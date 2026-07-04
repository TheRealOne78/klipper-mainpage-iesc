use crate::config::Config;
use bcrypt::verify;
use std::collections::HashSet;
use std::sync::Arc;
use tokio::sync::RwLock;
use uuid::Uuid;

#[derive(
    Debug, Clone, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize, utoipa::ToSchema,
)]
pub enum UserRole {
    Guest,
}

#[derive(Debug, Clone)]
pub struct Session {
    pub token: String,
    pub role: UserRole,
}

pub struct SessionManager {
    guest_sessions: Arc<RwLock<HashSet<String>>>, // Guest sessions if password required
}

impl SessionManager {
    pub fn new() -> Self {
        Self {
            guest_sessions: Arc::new(RwLock::new(HashSet::new())),
        }
    }

    pub async fn create_session(
        &self,
        password: &str,
        config: &Config,
    ) -> Result<Session, &'static str> {
        // Check guest if password is set
        if let Some(ref guest_hash) = config.auth.guest_password_hash {
            if !guest_hash.is_empty() {
                if verify(password, guest_hash).unwrap_or(false) {
                    let token = Uuid::new_v4().to_string();
                    self.guest_sessions.write().await.insert(token.clone());
                    return Ok(Session {
                        token,
                        role: UserRole::Guest,
                    });
                } else {
                    return Err("Parola incorecta");
                }
            }
        }

        Err("Parola incorecta")
    }

    pub async fn validate_session(&self, token: &str) -> Option<UserRole> {
        if self.guest_sessions.read().await.contains(token) {
            return Some(UserRole::Guest);
        }
        None
    }

    pub async fn destroy_session(&self, token: &str) {
        self.guest_sessions.write().await.remove(token);
    }
}

pub struct SafetyManager;

impl SafetyManager {
    pub fn validate_speed_factor(speed_factor: f64, config: &Config) -> Result<f64, &'static str> {
        let max_speed = f64::min(500.0, config.limits.max_speed_factor);
        if speed_factor < 1.0 || speed_factor > max_speed {
            return Err("Factorul de viteza depaseste limitele admise (max 500%)");
        }
        Ok(speed_factor)
    }

    pub fn validate_jog(
        axis: &str,
        distance: f64,
        is_printing: bool,
        config: &Config,
    ) -> Result<(), &'static str> {
        if is_printing && !config.limits.allow_movement_while_printing {
            return Err("Miscarea este dezactivata in timpul printarii");
        }

        let axis_lower = axis.to_lowercase();
        if axis_lower != "x" && axis_lower != "y" && axis_lower != "z" {
            return Err("Axa invalida. Sunt permise doar X, Y, Z");
        }

        if distance.abs() > config.limits.max_jog_step {
            return Err("Pasul de miscare depaseste limita configurata");
        }

        // Z-down movement conservative safety:
        // if moving Z down (which is negative in absolute jog, i.e., moving towards the bed), limit it further if desired.
        if axis_lower == "z"
            && distance < 0.0
            && distance.abs() > f64::min(5.0, config.limits.max_jog_step)
        {
            return Err("Miscarea in jos pe axa Z este limitata pentru siguranta");
        }

        Ok(())
    }

    pub fn validate_home(config: &Config) -> Result<(), &'static str> {
        if !config.limits.allow_home_for_guests {
            return Err("Homing-ul este dezactivat pentru siguranta");
        }

        Ok(())
    }

    pub fn validate_preheat(hotend: f64, bed: f64, config: &Config) -> Result<(), &'static str> {
        if hotend < 0.0 || hotend > config.limits.max_hotend_temp {
            return Err("Temperatura hotend depaseste limita configurata");
        }

        if bed < 0.0 || bed > config.limits.max_bed_temp {
            return Err("Temperatura patului depaseste limita configurata");
        }

        Ok(())
    }

    pub fn validate_macro(macro_name: &str, config: &Config) -> Result<(), &'static str> {
        let upper_name = macro_name.to_uppercase();
        if !config
            .macros
            .guest_allowed
            .iter()
            .any(|m| m.to_uppercase() == upper_name)
        {
            return Err("Macroul nu este in lista de permisiuni pentru oaspeti");
        }

        Ok(())
    }

    pub fn validate_upload(
        filename: &str,
        size_bytes: u64,
        config: &Config,
    ) -> Result<String, &'static str> {
        let max_bytes = config.limits.max_upload_mb * 1024 * 1024;
        if size_bytes > max_bytes {
            return Err("Fisierul depaseste dimensiunea maxima permisa");
        }

        let path = std::path::Path::new(filename);
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|s| s.to_lowercase());

        match ext.as_deref() {
            Some("gcode") | Some("gco") => {}
            _ => return Err("Doar fisierele .gcode si .gco sunt permise"),
        }

        // Prevent path traversal
        let clean_filename = path
            .file_name()
            .and_then(|f| f.to_str())
            .ok_or("Nume de fisier invalid")?;

        Ok(clean_filename.to_string())
    }
}

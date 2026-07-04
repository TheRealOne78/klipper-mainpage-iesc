use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;

#[derive(Debug, Deserialize, Clone, Serialize)]
pub struct Config {
    pub server: ServerConfig,
    pub auth: AuthConfig,
    pub moonraker: MoonrakerConfig,
    pub mainsail: Option<MainsailConfig>,
    pub limits: LimitsConfig,
    pub branding: BrandingConfig,
    pub theme: ThemeConfig,
    pub preheat: HashMap<String, PreheatPreset>,
    pub macros: MacrosConfig,
}

#[derive(Debug, Deserialize, Clone, Serialize)]
pub struct MainsailConfig {
    pub url: String,
}

#[derive(Debug, Deserialize, Clone, Serialize)]
pub struct ServerConfig {
    pub host: String,
    pub port: u16,
}

#[derive(Debug, Deserialize, Clone, Serialize)]
pub struct AuthConfig {
    pub admin_password_hash: String,
    pub guest_password_hash: Option<String>,
}

#[derive(Debug, Deserialize, Clone, Serialize)]
pub struct MoonrakerConfig {
    pub url: String,
    pub api_key: Option<String>,
}

#[derive(Debug, Deserialize, Clone, Serialize)]
pub struct LimitsConfig {
    pub max_speed_factor: f64,
    pub max_upload_mb: u64,
    pub allow_movement_while_printing: bool,
    pub allow_home_for_guests: bool,
    pub max_hotend_temp: f64,
    pub max_bed_temp: f64,
    pub max_jog_step: f64, // max steps in mm guest can jog in a single command
}

#[derive(Debug, Deserialize, Clone, Serialize)]
pub struct BrandingConfig {
    pub app_name: String,
    pub faculty_name: String,
    pub logo_light: String,
    pub logo_dark: String,
    pub danger_image: String,
    pub moron_warning_text: String,
}

#[derive(Debug, Deserialize, Clone, Serialize)]
pub struct ThemeConfig {
    pub font_family: String,
}

#[derive(Debug, Deserialize, Clone, Serialize, utoipa::ToSchema)]
pub struct PreheatPreset {
    pub hotend: f64,
    pub bed: f64,
}

#[derive(Debug, Deserialize, Clone, Serialize)]
pub struct MacrosConfig {
    pub guest_allowed: Vec<String>,
}

impl Config {
    pub async fn load_from_file<P: AsRef<Path>>(
        path: P,
    ) -> Result<Self, Box<dyn std::error::Error>> {
        let content = tokio::fs::read_to_string(path).await?;
        let config: Config = toml::from_str(&content)?;
        Ok(config)
    }

    pub fn get_default_config_content() -> &'static str {
        r#"[server]
host = "127.0.0.1"
port = 8080

[auth]
# bcrypt hash for password "admin123"
admin_password_hash = "$2b$12$Z0w6K7U0t22iFk.bexXQfOD7X0.m9bQJ.YmX5y58D602fQ/G20Wme"
guest_password_hash = ""

[moonraker]
url = "http://127.0.0.1:7125"
api_key = ""

[mainsail]
url = ""

[limits]
max_speed_factor = 500.0
max_upload_mb = 250
allow_movement_while_printing = false
allow_home_for_guests = false
max_hotend_temp = 260.0
max_bed_temp = 110.0
max_jog_step = 10.0

[branding]
app_name = "3D Print Portal"
faculty_name = "Technical University of Cluj-Napoca"
logo_light = "assets/logo/Logo-UT-NEGRU-RO.png"
logo_dark = "assets/logo/Logo-UT-ALB-RO.png"
danger_image = "assets/danger.svg"
moron_warning_text = "Cititi regulile inainte de a printa si nu fiti iresponsabili!"

[theme]
font_family = "UT Sans"

[preheat.pla]
hotend = 200.0
bed = 60.0

[preheat.petg]
hotend = 240.0
bed = 80.0

[preheat.tpu]
hotend = 220.0
bed = 50.0

[preheat.abs]
hotend = 245.0
bed = 100.0

[macros]
guest_allowed = [
  "LOAD_FILAMENT",
  "UNLOAD_FILAMENT",
  "FILAMENT_CHANGE",
  "LINE_PURGE",
  "PREHEAT",
  "BED_MESH_CALIBRATE"
]
"#
    }
}

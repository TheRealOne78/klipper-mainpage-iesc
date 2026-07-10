use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{broadcast, RwLock};
use tokio_tungstenite::{connect_async, tungstenite::protocol::Message};
use tracing::{error, info, warn};

/// Typed event envelope sent by the backend websocket to frontend clients.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data", rename_all = "snake_case")]
pub enum BackendWsEvent {
    PrinterState(NormalizedPrinterState),
    FilelistChanged(serde_json::Value),
    UpdateResponse(serde_json::Value),
    UpdateRefreshed(serde_json::Value),
    /// Admin config was saved (or a password changed) — clients should refetch
    /// `/api/config` to pick up new permissions/branding/etc. live.
    ConfigChanged,
}

#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub struct BedMeshState {
    pub profile_name: Option<String>,
    pub mesh_min: Option<Vec<f64>>,
    pub mesh_max: Option<Vec<f64>>,
    pub probed_matrix: Option<Vec<Vec<f64>>>,
    pub mesh_matrix: Option<Vec<Vec<f64>>>,
    pub profiles: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub struct ConfigFileState {
    pub settings: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub struct ToolheadState {
    pub axis_minimum: Option<Vec<f64>>,
    pub axis_maximum: Option<Vec<f64>>,
    pub position: Option<Vec<f64>>,
    pub homed_axes: Option<String>,
    pub speed_factor: Option<f64>,
    #[serde(default)]
    pub max_velocity: Option<f64>,
    #[serde(default)]
    pub max_accel: Option<f64>,
    #[serde(default)]
    pub square_corner_velocity: Option<f64>,
    #[serde(default)]
    pub minimum_cruise_ratio: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub struct VirtualSdcardState {
    pub file_position: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub struct MotionReportState {
    pub live_position: Option<Vec<f64>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub struct GcodeMoveState {
    pub homing_origin: Option<Vec<f64>>,
    pub gcode_position: Option<Vec<f64>>,
    pub speed_factor: Option<f64>,
    pub absolute_coordinates: Option<bool>,
    pub absolute_extrude: Option<bool>,
    #[serde(default)]
    pub extrude_factor: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub struct ExcludeObjectState {
    pub objects: Option<serde_json::Value>,
    pub excluded_objects: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub struct WebhooksState {
    pub state: Option<String>,
    pub state_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub struct FanState {
    /// Part-cooling fan speed, 0.0–1.0.
    pub speed: f64,
    pub rpm: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub struct IdleTimeoutState {
    pub state: Option<String>,
    pub printing_time: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub struct ConsoleEvent {
    pub time: f64,
    pub message: String,
    pub event_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub struct NormalizedPrinterState {
    pub connection_state: String, // "connected" | "disconnected" | "connecting" | "error"
    pub state_message: Option<String>,
    pub klipper_state: String, // "ready" | "startup" | "shutdown" | "error" | "unknown"
    pub print_state: String, // "standby" | "printing" | "paused" | "complete" | "cancelled" | "error"
    pub filename: Option<String>,
    #[serde(default)]
    pub current_layer: Option<u64>,
    #[serde(default)]
    pub total_layer: Option<u64>,
    pub progress: f64,          // percentage (0.0 to 100.0)
    pub elapsed_time: f64,      // seconds
    pub time_left: Option<f64>, // seconds
    pub hotend_temp: f64,
    pub hotend_target: f64,
    pub bed_temp: f64,
    pub bed_target: f64,
    pub speed_factor: f64,  // percentage (e.g. 100.0)
    pub homed_axes: String, // e.g. "xyz", or empty/subset
    pub bed_mesh: Option<BedMeshState>,
    pub configfile: Option<ConfigFileState>,
    pub toolhead: Option<ToolheadState>,
    pub virtual_sdcard: Option<VirtualSdcardState>,
    pub motion_report: Option<MotionReportState>,
    pub gcode_move: Option<GcodeMoveState>,
    pub exclude_object: Option<ExcludeObjectState>,
    pub webhooks: Option<WebhooksState>,
    pub idle_timeout: Option<IdleTimeoutState>,
    pub fan: Option<FanState>,
    /// Dynamically-discovered auxiliary Klipper objects (generic fans, LEDs,
    /// output pins, temperature sensors, filament sensors), keyed by their full
    /// object name (e.g. "fan_generic exhaust"). Raw Moonraker status values,
    /// merged across partial updates. Additive: consumers ignore what they don't
    /// understand.
    #[serde(default)]
    pub auxiliary: HashMap<String, serde_json::Value>,
    pub console_events: Vec<ConsoleEvent>,
}

impl Default for NormalizedPrinterState {
    fn default() -> Self {
        Self {
            connection_state: "disconnected".to_string(),
            state_message: None,
            klipper_state: "unknown".to_string(),
            print_state: "standby".to_string(),
            filename: None,
            current_layer: None,
            total_layer: None,
            progress: 0.0,
            elapsed_time: 0.0,
            time_left: None,
            hotend_temp: 0.0,
            hotend_target: 0.0,
            bed_temp: 0.0,
            bed_target: 0.0,
            speed_factor: 100.0,
            homed_axes: "".to_string(),
            bed_mesh: None,
            configfile: None,
            toolhead: None,
            virtual_sdcard: None,
            motion_report: None,
            gcode_move: None,
            exclude_object: None,
            webhooks: None,
            idle_timeout: None,
            fan: None,
            auxiliary: HashMap::new(),
            console_events: Vec::new(),
        }
    }
}

/// Klipper object-name prefixes we surface as generic auxiliary controls.
/// `printer.objects.list` returns names like "fan_generic exhaust"; we match on
/// the first whitespace-delimited token.
const AUX_OBJECT_PREFIXES: &[&str] = &[
    "fan_generic",
    "heater_fan",
    "controller_fan",
    "temperature_fan",
    "output_pin",
    "led",
    "neopixel",
    "dotstar",
    "pca9533",
    "pca9632",
    "temperature_sensor",
    "filament_switch_sensor",
    "filament_motion_sensor",
    "firmware_retraction",
    "heater_generic",
    "manual_probe",
    "tmc2209",
    "tmc2208",
    "tmc2240",
    "tmc2130",
    "tmc5160",
    "tmc2660",
];

/// True when `name` (a full Klipper object name) is an auxiliary object we track.
fn is_aux_object(name: &str) -> bool {
    let head = name.split_whitespace().next().unwrap_or("");
    AUX_OBJECT_PREFIXES.contains(&head)
}

/// What the read loop should do after handling one WS message.
#[derive(Debug, PartialEq)]
pub enum WsAction {
    /// Nothing further.
    None,
    /// Klippy re-entered "ready"; re-send the object subscription + rediscover.
    Resubscribe,
    /// `printer.objects.list` arrived; send the enhanced (core + aux) subscribe.
    SubscribeAux,
}

pub struct MoonrakerClient {
    url: String,
    api_key: Option<String>,
    state: Arc<RwLock<NormalizedPrinterState>>,
    broadcaster: broadcast::Sender<BackendWsEvent>,
    http_client: reqwest::Client,
    /// Auxiliary object names discovered via `printer.objects.list`.
    aux_objects: Arc<RwLock<Vec<String>>>,
}

impl MoonrakerClient {
    pub fn new(url: String, api_key: Option<String>) -> Self {
        let cleaned_url = url.trim_end_matches('/').to_string();
        let (tx, _) = broadcast::channel(100);
        Self {
            url: cleaned_url,
            api_key,
            state: Arc::new(RwLock::new(NormalizedPrinterState::default())),
            broadcaster: tx,
            http_client: reqwest::Client::new(),
            aux_objects: Arc::new(RwLock::new(Vec::new())),
        }
    }

    pub fn get_state(&self) -> Arc<RwLock<NormalizedPrinterState>> {
        self.state.clone()
    }

    pub fn subscribe_updates(&self) -> broadcast::Receiver<BackendWsEvent> {
        self.broadcaster.subscribe()
    }

    /// Push an event to every connected frontend WS client. Fire-and-forget:
    /// no receivers (no open sockets) is not an error.
    pub fn broadcast_event(&self, event: BackendWsEvent) {
        let _ = self.broadcaster.send(event);
    }

    // HTTP command helpers
    pub async fn run_gcode(&self, gcode: &str) -> Result<(), reqwest::Error> {
        self.add_console_event(gcode.to_string(), "command".to_string())
            .await;
        let url = format!("{}/printer/gcode/script", self.url);
        let mut req = self.http_client.post(&url);
        if let Some(ref key) = self.api_key {
            req = req.header("X-Api-Key", key);
        }

        let payload = serde_json::json!({ "script": gcode });
        req.json(&payload).send().await?.error_for_status()?;
        Ok(())
    }

    pub async fn add_console_event(&self, message: String, event_type: String) {
        let mut st = self.state.write().await;
        let event_type = if event_type == "response" {
            if message.starts_with("// action:") {
                "action".to_string()
            } else if message.starts_with("// debug:") {
                "debug".to_string()
            } else if message.starts_with("!! ") {
                "error".to_string()
            } else {
                event_type
            }
        } else {
            event_type
        };
        st.console_events.push(ConsoleEvent {
            time: current_time_seconds(),
            message,
            event_type,
        });
        if st.console_events.len() > 500 {
            let drain_count = st.console_events.len() - 500;
            st.console_events.drain(0..drain_count);
        }
        let state_val = st.clone();
        drop(st);
        let _ = self
            .broadcaster
            .send(BackendWsEvent::PrinterState(state_val));
    }

    pub async fn upload_gcode(
        &self,
        filename: &str,
        file_bytes: Vec<u8>,
    ) -> Result<(), reqwest::Error> {
        let url = format!("{}/server/files/upload", self.url);
        let mut req = self.http_client.post(&url);
        if let Some(ref key) = self.api_key {
            req = req.header("X-Api-Key", key);
        }

        let part = reqwest::multipart::Part::bytes(file_bytes)
            .file_name(filename.to_string())
            .mime_str("application/octet-stream")
            .unwrap();

        let form = reqwest::multipart::Form::new().part("file", part);
        req.multipart(form).send().await?.error_for_status()?;
        Ok(())
    }

    /// Moonraker server metadata used to discover components and file roots.
    pub async fn get_server_info(&self) -> Result<serde_json::Value, reqwest::Error> {
        let url = format!("{}/server/info", self.url);
        self.get_json(&url).await
    }

    /// Moonraker announcements (update warnings / RSS notices).
    pub async fn get_announcements(&self) -> Result<serde_json::Value, reqwest::Error> {
        let url = format!("{}/server/announcements/list", self.url);
        let mut req = self.http_client.get(&url);
        if let Some(ref key) = self.api_key {
            req = req.header("X-Api-Key", key);
        }
        req.send().await?.error_for_status()?.json().await
    }

    /// Available G-code command names (for console autocomplete). Moonraker
    /// returns { result: { COMMAND: "description", ... } }.
    pub async fn get_gcode_help(&self) -> Result<serde_json::Value, reqwest::Error> {
        let url = format!("{}/printer/gcode/help", self.url);
        let mut req = self.http_client.get(&url);
        if let Some(ref key) = self.api_key {
            req = req.header("X-Api-Key", key);
        }
        req.send().await?.error_for_status()?.json().await
    }

    /// G-code file metadata (thumbnails, estimated time, filament, layers...).
    pub async fn get_file_metadata(
        &self,
        filename: &str,
    ) -> Result<serde_json::Value, reqwest::Error> {
        let url = format!("{}/server/files/metadata", self.url);
        let mut req = self.http_client.get(&url).query(&[("filename", filename)]);
        if let Some(ref key) = self.api_key {
            req = req.header("X-Api-Key", key);
        }
        req.send().await?.error_for_status()?.json().await
    }

    /// List files under the `config` root (printer.cfg and friends).
    pub async fn list_config_files(&self) -> Result<serde_json::Value, reqwest::Error> {
        self.list_files("config", None).await
    }

    /// Read a config file's raw text (path is relative to the config root).
    pub async fn read_config_file(&self, path: &str) -> Result<String, reqwest::Error> {
        self.read_file("config", path).await
    }

    /// Write a config file via the Moonraker upload endpoint (root=config).
    pub async fn write_config_file(
        &self,
        path: &str,
        content: String,
    ) -> Result<(), reqwest::Error> {
        let url = format!("{}/server/files/upload", self.url);
        let mut req = self.http_client.post(&url);
        if let Some(ref key) = self.api_key {
            req = req.header("X-Api-Key", key);
        }
        let part = reqwest::multipart::Part::bytes(content.into_bytes())
            .file_name(path.to_string())
            .mime_str("application/octet-stream")
            .unwrap();
        let form = reqwest::multipart::Form::new()
            .text("root", "config")
            .part("file", part);
        req.multipart(form).send().await?.error_for_status()?;
        Ok(())
    }

    /// List files under a Moonraker registered root.
    pub async fn list_files(
        &self,
        root: &str,
        path: Option<&str>,
    ) -> Result<serde_json::Value, reqwest::Error> {
        let url = format!("{}/server/files/list", self.url);
        let mut params = vec![("root", root.to_string())];
        if let Some(path) = path.filter(|p| !p.is_empty()) {
            params.push(("path", path.to_string()));
        }
        let mut req = self.http_client.get(&url).query(&params);
        if let Some(ref key) = self.api_key {
            req = req.header("X-Api-Key", key);
        }
        req.send().await?.error_for_status()?.json().await
    }

    /// List a directory with Moonraker's directory endpoint.
    pub async fn list_directory(
        &self,
        root: &str,
        path: Option<&str>,
    ) -> Result<serde_json::Value, reqwest::Error> {
        let moonraker_path = join_root_path(root, path.unwrap_or(""));
        let url = format!("{}/server/files/directory", self.url);
        let mut req = self
            .http_client
            .get(&url)
            .query(&[("path", moonraker_path), ("extended", "true".to_string())]);
        if let Some(ref key) = self.api_key {
            req = req.header("X-Api-Key", key);
        }
        req.send().await?.error_for_status()?.json().await
    }

    /// Read a file as text from a Moonraker registered root.
    pub async fn read_file(&self, root: &str, path: &str) -> Result<String, reqwest::Error> {
        let url = format!("{}/server/files/{}/{}", self.url, root, encode_path(path));
        let mut req = self.http_client.get(&url);
        if let Some(ref key) = self.api_key {
            req = req.header("X-Api-Key", key);
        }
        req.send().await?.error_for_status()?.text().await
    }

    /// Download a raw file from a Moonraker registered root.
    pub async fn download_file(&self, root: &str, path: &str) -> Result<Vec<u8>, reqwest::Error> {
        let url = format!("{}/server/files/{}/{}", self.url, root, encode_path(path));
        let mut req = self.http_client.get(&url);
        if let Some(ref key) = self.api_key {
            req = req.header("X-Api-Key", key);
        }
        Ok(req
            .send()
            .await?
            .error_for_status()?
            .bytes()
            .await?
            .to_vec())
    }

    /// Upload a file to a Moonraker registered root and optional directory.
    pub async fn upload_file(
        &self,
        root: &str,
        path: Option<&str>,
        filename: &str,
        file_bytes: Vec<u8>,
    ) -> Result<serde_json::Value, reqwest::Error> {
        let url = format!("{}/server/files/upload", self.url);
        let mut req = self.http_client.post(&url);
        if let Some(ref key) = self.api_key {
            req = req.header("X-Api-Key", key);
        }
        let part = reqwest::multipart::Part::bytes(file_bytes)
            .file_name(filename.to_string())
            .mime_str("application/octet-stream")
            .unwrap();
        let mut form = reqwest::multipart::Form::new()
            .text("root", root.to_string())
            .part("file", part);
        if let Some(path) = path.filter(|p| !p.is_empty()) {
            form = form.text("path", path.to_string());
        }
        req.multipart(form)
            .send()
            .await?
            .error_for_status()?
            .json()
            .await
    }

    /// Create a directory in a Moonraker registered root.
    pub async fn create_directory(
        &self,
        root: &str,
        path: &str,
    ) -> Result<serde_json::Value, reqwest::Error> {
        let url = format!("{}/server/files/directory", self.url);
        self.post_json(
            &url,
            serde_json::json!({ "path": join_root_path(root, path) }),
        )
        .await
    }

    /// Move or rename a file/directory through Moonraker.
    pub async fn move_file(
        &self,
        source_root: &str,
        source: &str,
        dest_root: &str,
        dest: &str,
    ) -> Result<serde_json::Value, reqwest::Error> {
        let url = format!("{}/server/files/move", self.url);
        self.post_json(
            &url,
            serde_json::json!({
                "source": join_root_path(source_root, source),
                "dest": join_root_path(dest_root, dest),
            }),
        )
        .await
    }

    /// Copy a file/directory through Moonraker.
    pub async fn copy_file(
        &self,
        source_root: &str,
        source: &str,
        dest_root: &str,
        dest: &str,
    ) -> Result<serde_json::Value, reqwest::Error> {
        let url = format!("{}/server/files/copy", self.url);
        self.post_json(
            &url,
            serde_json::json!({
                "source": join_root_path(source_root, source),
                "dest": join_root_path(dest_root, dest),
            }),
        )
        .await
    }

    /// Delete a file from a Moonraker registered root.
    pub async fn delete_file(
        &self,
        root: &str,
        path: &str,
    ) -> Result<serde_json::Value, reqwest::Error> {
        let url = format!("{}/server/files/{}/{}", self.url, root, encode_path(path));
        let mut req = self.http_client.delete(&url);
        if let Some(ref key) = self.api_key {
            req = req.header("X-Api-Key", key);
        }
        req.send().await?.error_for_status()?.json().await
    }

    /// Delete a directory from a Moonraker registered root.
    pub async fn delete_directory(
        &self,
        root: &str,
        path: &str,
        force: bool,
    ) -> Result<serde_json::Value, reqwest::Error> {
        let url = format!("{}/server/files/directory", self.url);
        let mut req = self.http_client.delete(&url).query(&[
            ("path", join_root_path(root, path)),
            ("force", force.to_string()),
        ]);
        if let Some(ref key) = self.api_key {
            req = req.header("X-Api-Key", key);
        }
        req.send().await?.error_for_status()?.json().await
    }

    /// Ask Moonraker to zip selected files/directories.
    pub async fn zip_files(
        &self,
        root: &str,
        items: &[String],
        destination: Option<&str>,
        store_only: bool,
    ) -> Result<Vec<u8>, reqwest::Error> {
        let url = format!("{}/server/files/zip", self.url);
        let paths: Vec<String> = items
            .iter()
            .map(|item| join_root_path(root, item))
            .collect();
        let mut payload = serde_json::json!({
            "items": paths,
            "store_only": store_only,
        });
        if let Some(dest) = destination.filter(|d| !d.is_empty()) {
            payload["dest"] = serde_json::Value::String(join_root_path(root, dest));
        }
        let mut req = self.http_client.post(&url);
        if let Some(ref key) = self.api_key {
            req = req.header("X-Api-Key", key);
        }
        Ok(req
            .json(&payload)
            .send()
            .await?
            .error_for_status()?
            .bytes()
            .await?
            .to_vec())
    }

    pub async fn start_print(&self, filename: &str) -> Result<(), reqwest::Error> {
        let url = format!("{}/printer/print/start", self.url);
        let mut req = self.http_client.post(&url);
        if let Some(ref key) = self.api_key {
            req = req.header("X-Api-Key", key);
        }
        let payload = serde_json::json!({ "filename": filename });
        req.json(&payload).send().await?.error_for_status()?;
        Ok(())
    }

    pub async fn pause_print(&self) -> Result<(), reqwest::Error> {
        let url = format!("{}/printer/print/pause", self.url);
        let mut req = self.http_client.post(&url);
        if let Some(ref key) = self.api_key {
            req = req.header("X-Api-Key", key);
        }
        req.send().await?.error_for_status()?;
        Ok(())
    }

    pub async fn resume_print(&self) -> Result<(), reqwest::Error> {
        let url = format!("{}/printer/print/resume", self.url);
        let mut req = self.http_client.post(&url);
        if let Some(ref key) = self.api_key {
            req = req.header("X-Api-Key", key);
        }
        req.send().await?.error_for_status()?;
        Ok(())
    }

    pub async fn cancel_print(&self) -> Result<(), reqwest::Error> {
        let url = format!("{}/printer/print/cancel", self.url);
        let mut req = self.http_client.post(&url);
        if let Some(ref key) = self.api_key {
            req = req.header("X-Api-Key", key);
        }
        req.send().await?.error_for_status()?;
        Ok(())
    }

    pub async fn emergency_stop(&self) -> Result<(), reqwest::Error> {
        let url = format!("{}/printer/emergency_stop", self.url);
        let mut req = self.http_client.post(&url);
        if let Some(ref key) = self.api_key {
            req = req.header("X-Api-Key", key);
        }
        req.send().await?.error_for_status()?;
        Ok(())
    }

    pub async fn get_gcode_file(&self, path: &str) -> Result<String, reqwest::Error> {
        let url = format!("{}/server/files/gcodes/{}", self.url, encode_path(path));
        let mut req = self.http_client.get(&url);
        if let Some(ref key) = self.api_key {
            req = req.header("X-Api-Key", key);
        }

        req.send().await?.error_for_status()?.text().await
    }

    pub async fn list_gcode_files(&self) -> Result<serde_json::Value, reqwest::Error> {
        let url = format!("{}/server/files/list?root=gcodes", self.url);
        let mut req = self.http_client.get(&url);
        if let Some(ref key) = self.api_key {
            req = req.header("X-Api-Key", key);
        }

        req.send().await?.error_for_status()?.json().await
    }

    pub async fn delete_gcode_file(&self, path: &str) -> Result<serde_json::Value, reqwest::Error> {
        self.delete_file("gcodes", path).await
    }

    pub async fn get_power_devices(&self) -> Result<serde_json::Value, reqwest::Error> {
        let url = format!("{}/machine/device_power/devices", self.url);
        let mut req = self.http_client.get(&url);
        if let Some(ref key) = self.api_key {
            req = req.header("X-Api-Key", key);
        }

        req.send().await?.error_for_status()?.json().await
    }

    pub async fn set_power_device(
        &self,
        device: &str,
        action: &str,
    ) -> Result<serde_json::Value, reqwest::Error> {
        let url = format!("{}/machine/device_power/device", self.url);
        let mut req = self.http_client.post(&url);
        if let Some(ref key) = self.api_key {
            req = req.header("X-Api-Key", key);
        }

        req.json(&serde_json::json!({ "device": device, "action": action }))
            .send()
            .await?
            .error_for_status()?
            .json()
            .await
    }

    pub async fn machine_reboot(&self) -> Result<serde_json::Value, reqwest::Error> {
        let url = format!("{}/machine/reboot", self.url);
        let mut req = self.http_client.post(&url);
        if let Some(ref key) = self.api_key {
            req = req.header("X-Api-Key", key);
        }

        req.send().await?.error_for_status()?.json().await
    }

    pub async fn machine_shutdown(&self) -> Result<serde_json::Value, reqwest::Error> {
        let url = format!("{}/machine/shutdown", self.url);
        let mut req = self.http_client.post(&url);
        if let Some(ref key) = self.api_key {
            req = req.header("X-Api-Key", key);
        }

        req.send().await?.error_for_status()?.json().await
    }

    /// Recent print-job history (most recent first). Moonraker returns
    /// { result: { count, jobs: [...] } }.
    pub async fn get_history_list(&self, limit: u32) -> Result<serde_json::Value, reqwest::Error> {
        let url = format!(
            "{}/server/history/list?limit={}&order=desc",
            self.url, limit
        );
        let mut req = self.http_client.get(&url);
        if let Some(ref key) = self.api_key {
            req = req.header("X-Api-Key", key);
        }

        req.send().await?.error_for_status()?.json().await
    }

    /// Aggregate print statistics. Moonraker returns
    /// { result: { job_totals: {...} } }.
    pub async fn get_history_totals(&self) -> Result<serde_json::Value, reqwest::Error> {
        let url = format!("{}/server/history/totals", self.url);
        let mut req = self.http_client.get(&url);
        if let Some(ref key) = self.api_key {
            req = req.header("X-Api-Key", key);
        }

        req.send().await?.error_for_status()?.json().await
    }

    /// Query endstop states. Moonraker returns { result: { x, y, z: "open"|"TRIGGERED" } }.
    pub async fn query_endstops(&self) -> Result<serde_json::Value, reqwest::Error> {
        let url = format!("{}/printer/query_endstops/status", self.url);
        let mut req = self.http_client.get(&url);
        if let Some(ref key) = self.api_key {
            req = req.header("X-Api-Key", key);
        }

        req.send().await?.error_for_status()?.json().await
    }

    /// System info (host details + the list of managed services).
    pub async fn get_system_info(&self) -> Result<serde_json::Value, reqwest::Error> {
        let url = format!("{}/machine/system_info", self.url);
        let mut req = self.http_client.get(&url);
        if let Some(ref key) = self.api_key {
            req = req.header("X-Api-Key", key);
        }

        req.send().await?.error_for_status()?.json().await
    }

    /// Moonraker process / host resource statistics (CPU, memory, temp, net).
    pub async fn get_proc_stats(&self) -> Result<serde_json::Value, reqwest::Error> {
        let url = format!("{}/machine/proc_stats", self.url);
        self.get_json(&url).await
    }

    /// List the names of all available printer objects.
    pub async fn list_printer_objects(&self) -> Result<serde_json::Value, reqwest::Error> {
        let url = format!("{}/printer/objects/list", self.url);
        self.get_json(&url).await
    }

    /// Query specific printer objects. `query` is a raw query string, e.g.
    /// `mcu&mcu%20head` to fetch the `mcu` and `mcu head` objects.
    pub async fn query_printer_objects(
        &self,
        query: &str,
    ) -> Result<serde_json::Value, reqwest::Error> {
        let url = format!("{}/printer/objects/query?{}", self.url, query);
        self.get_json(&url).await
    }

    /// Restart/start/stop a managed service (klipper, moonraker, webcamd, ...).
    pub async fn service_action(
        &self,
        service: &str,
        action: &str,
    ) -> Result<serde_json::Value, reqwest::Error> {
        let url = format!(
            "{}/machine/services/{}?service={}",
            self.url, action, service
        );
        let mut req = self.http_client.post(&url);
        if let Some(ref key) = self.api_key {
            req = req.header("X-Api-Key", key);
        }

        req.send().await?.error_for_status()?.json().await
    }

    /// Update-manager status (component versions + update availability).
    pub async fn get_update_status(
        &self,
        refresh: bool,
    ) -> Result<serde_json::Value, reqwest::Error> {
        let url = format!("{}/machine/update/status?refresh={}", self.url, refresh);
        let mut req = self.http_client.get(&url);
        if let Some(ref key) = self.api_key {
            req = req.header("X-Api-Key", key);
        }

        req.send().await?.error_for_status()?.json().await
    }

    /// Trigger an update. Core components (full/moonraker/klipper/system) map to
    /// `/machine/update/<component>`; anything else is treated as a client name.
    pub async fn update_component(
        &self,
        component: &str,
    ) -> Result<serde_json::Value, reqwest::Error> {
        let url = match component {
            "full" | "moonraker" | "klipper" | "system" => {
                format!("{}/machine/update/{}", self.url, component)
            }
            client => format!("{}/machine/update/client?name={}", self.url, client),
        };
        let mut req = self.http_client.post(&url);
        if let Some(ref key) = self.api_key {
            req = req.header("X-Api-Key", key);
        }

        req.send().await?.error_for_status()?.json().await
    }

    /// Recover a failed update-manager component.
    pub async fn recover_update(
        &self,
        component: &str,
        hard: bool,
    ) -> Result<serde_json::Value, reqwest::Error> {
        let url = format!("{}/machine/update/recover", self.url);
        let mut payload = serde_json::json!({ "name": component });
        if hard {
            payload["hard"] = serde_json::Value::Bool(true);
        }
        self.post_json(&url, payload).await
    }

    async fn get_json(&self, url: &str) -> Result<serde_json::Value, reqwest::Error> {
        let mut req = self.http_client.get(url);
        if let Some(ref key) = self.api_key {
            req = req.header("X-Api-Key", key);
        }
        req.send().await?.error_for_status()?.json().await
    }

    async fn post_json(
        &self,
        url: &str,
        payload: serde_json::Value,
    ) -> Result<serde_json::Value, reqwest::Error> {
        let mut req = self.http_client.post(url);
        if let Some(ref key) = self.api_key {
            req = req.header("X-Api-Key", key);
        }
        req.json(&payload)
            .send()
            .await?
            .error_for_status()?
            .json()
            .await
    }

    /// Job queue status. Moonraker returns
    /// { result: { queued_jobs: [...], queue_state } }.
    pub async fn get_job_queue(&self) -> Result<serde_json::Value, reqwest::Error> {
        let url = format!("{}/server/job_queue/status", self.url);
        let mut req = self.http_client.get(&url);
        if let Some(ref key) = self.api_key {
            req = req.header("X-Api-Key", key);
        }

        req.send().await?.error_for_status()?.json().await
    }

    /// Append filenames to the job queue.
    pub async fn job_queue_add(
        &self,
        filenames: &[String],
    ) -> Result<serde_json::Value, reqwest::Error> {
        let url = format!("{}/server/job_queue/job", self.url);
        let mut req = self.http_client.post(&url);
        if let Some(ref key) = self.api_key {
            req = req.header("X-Api-Key", key);
        }

        req.json(&serde_json::json!({ "filenames": filenames }))
            .send()
            .await?
            .error_for_status()?
            .json()
            .await
    }

    /// Remove queued jobs by id, or clear the whole queue when `all` is true.
    pub async fn job_queue_delete(
        &self,
        job_ids: &[String],
        all: bool,
    ) -> Result<serde_json::Value, reqwest::Error> {
        let url = if all {
            format!("{}/server/job_queue/job?all=true", self.url)
        } else {
            format!(
                "{}/server/job_queue/job?job_ids={}",
                self.url,
                job_ids.join(",")
            )
        };
        let mut req = self.http_client.delete(&url);
        if let Some(ref key) = self.api_key {
            req = req.header("X-Api-Key", key);
        }

        req.send().await?.error_for_status()?.json().await
    }

    /// Pause (`pause=true`) or start/resume (`pause=false`) the job queue.
    pub async fn job_queue_set_state(
        &self,
        pause: bool,
    ) -> Result<serde_json::Value, reqwest::Error> {
        let action = if pause { "pause" } else { "start" };
        let url = format!("{}/server/job_queue/{}", self.url, action);
        let mut req = self.http_client.post(&url);
        if let Some(ref key) = self.api_key {
            req = req.header("X-Api-Key", key);
        }

        req.send().await?.error_for_status()?.json().await
    }

    /// Proxy the Moonraker temperature store to get historical temperature data
    pub async fn get_temperature_store(&self) -> Result<String, reqwest::Error> {
        let url = format!(
            "{}/server/temperature_store?include_monitors=true",
            self.url
        );
        let mut req = self.http_client.get(&url);
        if let Some(ref key) = self.api_key {
            req = req.header("X-Api-Key", key);
        }

        let response = req.send().await?;
        if response.status().is_success() {
            return response.text().await;
        }

        let fallback_url = format!("{}/server/temperature_store", self.url);
        let mut fallback_req = self.http_client.get(&fallback_url);
        if let Some(ref key) = self.api_key {
            fallback_req = fallback_req.header("X-Api-Key", key);
        }

        fallback_req.send().await?.error_for_status()?.text().await
    }

    /// Fetch the webcams list from Moonraker API
    pub async fn get_webcams(&self) -> Result<Vec<crate::config::WebcamConfig>, reqwest::Error> {
        let url = format!("{}/server/webcams/list", self.url);
        let mut req = self.http_client.get(&url);
        if let Some(ref key) = self.api_key {
            req = req.header("X-Api-Key", key);
        }

        let res = req.send().await?;
        if !res.status().is_success() {
            return Ok(vec![]);
        }

        #[derive(Deserialize)]
        struct MoonrakerWebcamsResponse {
            result: MoonrakerWebcamsResult,
        }

        #[derive(Deserialize)]
        struct MoonrakerWebcamsResult {
            webcams: Vec<serde_json::Value>,
        }

        let body = res.json::<MoonrakerWebcamsResponse>().await;
        match body {
            Ok(parsed) => {
                let mut webcams = vec![];
                for val in parsed.result.webcams {
                    if let Ok(mut cam) = serde_json::from_value::<crate::config::WebcamConfig>(val)
                    {
                        cam.source = "moonraker".to_string();
                        webcams.push(cam);
                    }
                }
                Ok(webcams)
            }
            Err(_) => Ok(vec![]),
        }
    }

    // Start WebSocket monitoring thread
    pub fn start_monitoring(self: Arc<Self>) {
        let client_clone = self.clone();
        tokio::spawn(async move {
            loop {
                info!("Connecting to Moonraker WebSocket...");
                let mut base_url = client_clone.url.clone();
                if base_url.ends_with('/') {
                    base_url.pop();
                }
                let ws_url = base_url
                    .replace("http://", "ws://")
                    .replace("https://", "wss://")
                    + "/websocket";

                {
                    let mut st = client_clone.state.write().await;
                    st.connection_state = "connecting".to_string();
                    st.state_message = None;
                }
                client_clone.broadcast_state().await;

                // Bound the connect attempt so an unreachable/powered-off
                // printer fails fast (and retries) instead of hanging on the
                // OS TCP timeout (~2 min) with the UI stuck on "connecting".
                let connect_result = match tokio::time::timeout(
                    Duration::from_secs(5),
                    connect_async(&ws_url),
                )
                .await
                {
                    Ok(res) => res,
                    Err(_) => {
                        error!("Moonraker WS connect timed out after 5s");
                        {
                            let mut st = client_clone.state.write().await;
                            st.connection_state = "error".to_string();
                            st.state_message = Some("Connection timed out".to_string());
                        }
                        client_clone.broadcast_state().await;
                        tokio::time::sleep(Duration::from_secs(5)).await;
                        continue;
                    }
                };

                match connect_result {
                    Ok((mut ws_stream, _)) => {
                        info!("Connected to Moonraker WebSocket successfully.");
                        {
                            let mut st = client_clone.state.write().await;
                            st.connection_state = "connected".to_string();
                        }
                        client_clone.broadcast_state().await;

                        // Send the core subscription immediately (guarantees the
                        // live-state stream regardless of discovery), then ask
                        // Moonraker for the full object list to discover aux
                        // objects (fans/LEDs/pins/sensors).
                        if let Err(e) = ws_stream
                            .send(Message::Text(Self::subscribe_message()))
                            .await
                        {
                            error!("Failed to send subscribe message: {:?}", e);
                            continue;
                        }
                        if let Err(e) = ws_stream.send(Message::Text(Self::list_message())).await {
                            warn!("Failed to send objects.list request: {:?}", e);
                        }

                        // Monitor messages with a heartbeat ping every 5 seconds to detect dead connections
                        let mut ping_interval = tokio::time::interval(Duration::from_secs(5));
                        // Skip the first tick immediately to avoid pinging right at connection start
                        ping_interval.tick().await;

                        loop {
                            tokio::select! {
                                _ = ping_interval.tick() => {
                                    if let Err(e) = ws_stream.send(Message::Ping(vec![])).await {
                                        error!("Failed to send Moonraker WebSocket ping: {:?}", e);
                                        break;
                                    }
                                }
                                msg_res_opt = ws_stream.next() => {
                                    let msg_res = match msg_res_opt {
                                        Some(res) => res,
                                        None => {
                                            info!("Moonraker WebSocket connection closed by stream end.");
                                            break;
                                        }
                                    };
                                    match msg_res {
                                        Ok(Message::Text(txt)) => {
                                            match client_clone.handle_ws_message(&txt).await {
                                                Ok(WsAction::Resubscribe) => {
                                                    info!(
                                                        "Klippy ready; re-subscribing to printer objects"
                                                    );
                                                    if let Err(e) = ws_stream
                                                        .send(Message::Text(Self::subscribe_message()))
                                                        .await
                                                    {
                                                        error!("Failed to re-subscribe after klippy ready: {:?}", e);
                                                        break;
                                                    }
                                                    if let Err(e) = ws_stream
                                                        .send(Message::Text(Self::list_message()))
                                                        .await
                                                    {
                                                        warn!("Failed to re-send objects.list: {:?}", e);
                                                    }
                                                }
                                                Ok(WsAction::SubscribeAux) => {
                                                    let msg = client_clone.aux_subscribe_message().await;
                                                    if let Err(e) = ws_stream.send(Message::Text(msg)).await
                                                    {
                                                        warn!("Failed to send aux subscribe: {:?}", e);
                                                    }
                                                }
                                                Ok(WsAction::None) => {}
                                                Err(e) => warn!("Error parsing WS message: {:?}", e),
                                            }
                                        }
                                        Ok(Message::Close(_)) => {
                                            info!("Moonraker WebSocket closed by server.");
                                            break;
                                        }
                                        Ok(Message::Pong(_)) => {
                                            // Pong received, connection is healthy
                                        }
                                        Ok(Message::Ping(p)) => {
                                            // Echo back ping
                                            if let Err(e) = ws_stream.send(Message::Pong(p)).await {
                                                warn!("Failed to reply to ping with pong: {:?}", e);
                                            }
                                        }
                                        Err(e) => {
                                            error!("Moonraker WebSocket error: {:?}", e);
                                            break;
                                        }
                                        _ => {}
                                    }
                                }
                            }
                        }
                    }
                    Err(e) => {
                        error!("Failed to connect to Moonraker WS: {:?}", e);
                        {
                            let mut st = client_clone.state.write().await;
                            st.connection_state = "error".to_string();
                            st.state_message = Some(e.to_string());
                        }
                        client_clone.broadcast_state().await;
                    }
                }

                tokio::time::sleep(Duration::from_secs(5)).await;
            }
        });
    }

    async fn broadcast_state(&self) {
        let state = self.state.read().await.clone();
        let _ = self.broadcaster.send(BackendWsEvent::PrinterState(state));
    }

    /// Handle one inbound Moonraker WS message.
    ///
    /// Returns `Ok(true)` when Klippy has just (re)entered the "ready" state and
    /// the caller must re-send the object subscription (a Klippy restart clears
    /// its subscriptions, so without this klipper_state stays frozen).
    async fn handle_ws_message(&self, text: &str) -> Result<WsAction, serde_json::Error> {
        let value: serde_json::Value = serde_json::from_str(text)?;
        let mut state_changed = false;
        let mut needs_resubscribe = false;
        // Aux object names discovered from a printer.objects.list response, if any.
        let mut discovered_aux: Option<Vec<String>> = None;

        let mut st = self.state.write().await;

        // 1. Initial subscription response
        if let Some(result) = value.get("result") {
            if let Some(status) = result.get("status") {
                Self::update_state_from_json(&mut st, status);
                state_changed = true;
            }
            // printer.objects.list response: { result: { objects: [names...] } }.
            if let Some(objects) = result.get("objects").and_then(|o| o.as_array()) {
                let aux: Vec<String> = objects
                    .iter()
                    .filter_map(|o| o.as_str())
                    .filter(|name| is_aux_object(name))
                    .map(str::to_string)
                    .collect();
                discovered_aux = Some(aux);
            }
        }

        // 2. Klipper status updates (notify_status_update)
        // Moonraker sends: {"method": "notify_status_update", "params": [<status_data>, <timestamp>]}
        // The status data is directly at params[0], NOT nested under a "status" key.
        if let Some(method) = value.get("method") {
            if method.as_str() == Some("notify_status_update") {
                if let Some(params) = value.get("params") {
                    if let Some(arr) = params.as_array() {
                        if !arr.is_empty() {
                            Self::update_state_from_json(&mut st, &arr[0]);
                            state_changed = true;
                        }
                    }
                }
            } else if method.as_str() == Some("notify_gcode_response") {
                if let Some(message) = value
                    .get("params")
                    .and_then(|params| params.as_array())
                    .and_then(|params| params.first())
                    .and_then(|message| message.as_str())
                {
                    let event_type = if message.starts_with("// action:") {
                        "action"
                    } else if message.starts_with("// debug:") {
                        "debug"
                    } else if message.starts_with("!! ") {
                        "error"
                    } else {
                        "response"
                    };
                    st.console_events.push(ConsoleEvent {
                        time: current_time_seconds(),
                        message: message.to_string(),
                        event_type: event_type.to_string(),
                    });
                    if st.console_events.len() > 500 {
                        let drain_count = st.console_events.len() - 500;
                        st.console_events.drain(0..drain_count);
                    }
                    state_changed = true;
                }
            } else if method.as_str() == Some("notify_klippy_ready") {
                // Klippy restarted and is ready again. Reflect it immediately;
                // the re-subscription (triggered below) will refresh the rest.
                st.klipper_state = "ready".to_string();
                st.state_message = Some("Printer is ready".to_string());
                needs_resubscribe = true;
                state_changed = true;
            } else if method.as_str() == Some("notify_klippy_shutdown") {
                st.klipper_state = "shutdown".to_string();
                state_changed = true;
            } else if method.as_str() == Some("notify_klippy_disconnected") {
                // Host lost the Klippy process (e.g. mid FIRMWARE_RESTART).
                st.klipper_state = "disconnected".to_string();
                state_changed = true;
            } else if method.as_str() == Some("notify_filelist_changed") {
                let _ = self
                    .broadcaster
                    .send(BackendWsEvent::FilelistChanged(notification_data(&value)));
            } else if method.as_str() == Some("notify_update_response") {
                let _ = self
                    .broadcaster
                    .send(BackendWsEvent::UpdateResponse(notification_data(&value)));
            } else if method.as_str() == Some("notify_update_refreshed") {
                let _ = self
                    .broadcaster
                    .send(BackendWsEvent::UpdateRefreshed(notification_data(&value)));
            }
        }

        if state_changed {
            // Drop write lock before sending to prevent deadlocks
            let state_val = st.clone();
            drop(st);
            let _ = self
                .broadcaster
                .send(BackendWsEvent::PrinterState(state_val));
        } else {
            drop(st);
        }

        // Store any newly-discovered aux object names (distinct lock, taken after
        // releasing the state lock).
        if let Some(aux) = discovered_aux {
            *self.aux_objects.write().await = aux;
            return Ok(WsAction::SubscribeAux);
        }

        if needs_resubscribe {
            Ok(WsAction::Resubscribe)
        } else {
            Ok(WsAction::None)
        }
    }

    /// The fixed set of core objects we always subscribe to.
    fn core_objects() -> serde_json::Value {
        serde_json::json!({
            "webhooks": ["state", "state_message"],
            "idle_timeout": ["state", "printing_time"],
            "toolhead": ["status", "homed_axes", "speed_factor", "position", "axis_minimum", "axis_maximum", "max_velocity", "max_accel", "square_corner_velocity", "minimum_cruise_ratio"],
            "extruder": ["temperature", "target"],
            "heater_bed": ["temperature", "target"],
            "fan": ["speed", "rpm"],
            "print_stats": ["state", "filename", "print_duration", "progress", "info"],
            "bed_mesh": ["profile_name", "mesh_min", "mesh_max", "probed_matrix", "mesh_matrix", "profiles"],
            "configfile": ["settings"],
            "virtual_sdcard": ["file_position"],
            "motion_report": ["live_position"],
            "gcode_move": ["homing_origin", "gcode_position", "speed_factor", "absolute_coordinates", "absolute_extrude", "extrude_factor"],
            "exclude_object": ["objects", "excluded_objects"]
        })
    }

    /// The `printer.objects.subscribe` request payload, as a JSON string.
    ///
    /// Sent on initial connect and re-sent whenever Klippy re-enters "ready"
    /// (a restart resets Klippy-side subscriptions).
    fn subscribe_message() -> String {
        serde_json::json!({
            "jsonrpc": "2.0",
            "method": "printer.objects.subscribe",
            "params": { "objects": Self::core_objects() },
            "id": 42
        })
        .to_string()
    }

    /// An enhanced subscribe that adds the discovered auxiliary objects (each
    /// with `null` = all fields) on top of the core set. This is a superset of
    /// `subscribe_message()`, so the core stream is never lost even if discovery
    /// or this call misbehaves.
    fn subscribe_message_with_aux(aux: &[String]) -> String {
        let mut objects = Self::core_objects();
        if let Some(map) = objects.as_object_mut() {
            for name in aux {
                map.insert(name.clone(), serde_json::Value::Null);
            }
        }
        serde_json::json!({
            "jsonrpc": "2.0",
            "method": "printer.objects.subscribe",
            "params": { "objects": objects },
            "id": 42
        })
        .to_string()
    }

    /// The `printer.objects.list` discovery request.
    fn list_message() -> String {
        serde_json::json!({
            "jsonrpc": "2.0",
            "method": "printer.objects.list",
            "id": 41
        })
        .to_string()
    }

    /// Build the enhanced subscribe from the currently-known aux objects.
    async fn aux_subscribe_message(&self) -> String {
        let aux = self.aux_objects.read().await.clone();
        Self::subscribe_message_with_aux(&aux)
    }

    fn update_state_from_json(st: &mut NormalizedPrinterState, status: &serde_json::Value) {
        // Auxiliary objects (generic fans, LEDs, output pins, sensors). Copy any
        // status key that names a tracked aux object into the auxiliary map,
        // shallow-merging partial updates so previously-known fields persist.
        if let Some(obj) = status.as_object() {
            for (key, val) in obj {
                if !is_aux_object(key) {
                    continue;
                }
                match st.auxiliary.get_mut(key) {
                    Some(serde_json::Value::Object(existing)) => {
                        if let Some(incoming) = val.as_object() {
                            for (k, v) in incoming {
                                existing.insert(k.clone(), v.clone());
                            }
                        } else {
                            st.auxiliary.insert(key.clone(), val.clone());
                        }
                    }
                    _ => {
                        st.auxiliary.insert(key.clone(), val.clone());
                    }
                }
            }
        }

        // Part-cooling fan. Status updates can be partial, so merge with the
        // previously-known speed/rpm.
        if let Some(fan) = status.get("fan") {
            let current = st.fan.clone().unwrap_or(FanState {
                speed: 0.0,
                rpm: None,
            });
            let speed = fan
                .get("speed")
                .and_then(|v| v.as_f64())
                .unwrap_or(current.speed);
            let rpm = fan.get("rpm").and_then(|v| v.as_f64()).or(current.rpm);
            st.fan = Some(FanState { speed, rpm });
        }

        // Extruder
        if let Some(webhooks) = status.get("webhooks") {
            let current = st.webhooks.clone().unwrap_or(WebhooksState {
                state: None,
                state_message: None,
            });
            let state_value = webhooks
                .get("state")
                .and_then(|v| v.as_str())
                .map(str::to_string)
                .or(current.state);
            let state_message = webhooks
                .get("state_message")
                .and_then(|v| v.as_str())
                .map(str::to_string)
                .or(current.state_message);

            if let Some(ref klippy_state) = state_value {
                st.klipper_state = klippy_state.clone();
            }
            st.state_message = state_message.clone();
            st.webhooks = Some(WebhooksState {
                state: state_value,
                state_message,
            });
        }

        if let Some(idle_timeout) = status.get("idle_timeout") {
            let current = st.idle_timeout.clone().unwrap_or(IdleTimeoutState {
                state: None,
                printing_time: None,
            });
            st.idle_timeout = Some(IdleTimeoutState {
                state: idle_timeout
                    .get("state")
                    .and_then(|v| v.as_str())
                    .map(str::to_string)
                    .or(current.state),
                printing_time: idle_timeout
                    .get("printing_time")
                    .and_then(|v| v.as_f64())
                    .or(current.printing_time),
            });
        }

        // Extruder
        if let Some(extruder) = status.get("extruder") {
            if let Some(temp) = extruder.get("temperature").and_then(|v| v.as_f64()) {
                st.hotend_temp = temp;
            }
            if let Some(target) = extruder.get("target").and_then(|v| v.as_f64()) {
                st.hotend_target = target;
            }
        }

        // Bed
        if let Some(bed) = status.get("heater_bed") {
            if let Some(temp) = bed.get("temperature").and_then(|v| v.as_f64()) {
                st.bed_temp = temp;
            }
            if let Some(target) = bed.get("target").and_then(|v| v.as_f64()) {
                st.bed_target = target;
            }
        }

        // Toolhead
        if let Some(toolhead) = status.get("toolhead") {
            if let Some(sf) = toolhead.get("speed_factor").and_then(|v| v.as_f64()) {
                st.speed_factor = sf * 100.0; // convert to percentage
            }
            if let Some(axes) = toolhead.get("homed_axes").and_then(|v| v.as_str()) {
                st.homed_axes = axes.to_string();
            }
            let current = st.toolhead.clone().unwrap_or(ToolheadState {
                axis_minimum: None,
                axis_maximum: None,
                position: None,
                homed_axes: None,
                speed_factor: None,
                max_velocity: None,
                max_accel: None,
                square_corner_velocity: None,
                minimum_cruise_ratio: None,
            });
            let toolhead_f64 = |key: &str, fallback: Option<f64>| {
                toolhead.get(key).and_then(|v| v.as_f64()).or(fallback)
            };
            let max_velocity = toolhead_f64("max_velocity", current.max_velocity);
            let max_accel = toolhead_f64("max_accel", current.max_accel);
            let square_corner_velocity =
                toolhead_f64("square_corner_velocity", current.square_corner_velocity);
            let minimum_cruise_ratio =
                toolhead_f64("minimum_cruise_ratio", current.minimum_cruise_ratio);
            let axis_minimum = toolhead
                .get("axis_minimum")
                .and_then(parse_f64_array)
                .or(current.axis_minimum);
            let axis_maximum = toolhead
                .get("axis_maximum")
                .and_then(parse_f64_array)
                .or(current.axis_maximum);
            let position = toolhead
                .get("position")
                .and_then(parse_f64_array)
                .or(current.position);
            let homed_axes = toolhead
                .get("homed_axes")
                .and_then(|v| v.as_str())
                .map(str::to_string)
                .or(current.homed_axes);
            let speed_factor = toolhead
                .get("speed_factor")
                .and_then(|v| v.as_f64())
                .map(|v| v * 100.0)
                .or(current.speed_factor);
            st.toolhead = Some(ToolheadState {
                axis_minimum,
                axis_maximum,
                position,
                homed_axes,
                speed_factor,
                max_velocity,
                max_accel,
                square_corner_velocity,
                minimum_cruise_ratio,
            });
        }

        // Print stats
        if let Some(print_stats) = status.get("print_stats") {
            if let Some(state) = print_stats.get("state").and_then(|v| v.as_str()) {
                st.print_state = state.to_string();
            }
            if let Some(filename) = print_stats.get("filename").and_then(|v| v.as_str()) {
                st.filename = if filename.is_empty() {
                    None
                } else {
                    Some(filename.to_string())
                };
            }
            if let Some(dur) = print_stats.get("print_duration").and_then(|v| v.as_f64()) {
                st.elapsed_time = dur;
            }
            if let Some(prog) = print_stats.get("progress").and_then(|v| v.as_f64()) {
                st.progress = prog * 100.0; // convert to percentage
            }
            // Layer progress (slicer must emit SET_PRINT_STATS_INFO). Merge so a
            // partial update without `info` doesn't clear known layer counts.
            if let Some(info) = print_stats.get("info") {
                if let Some(cur) = info.get("current_layer").and_then(|v| v.as_u64()) {
                    st.current_layer = Some(cur);
                }
                if let Some(total) = info.get("total_layer").and_then(|v| v.as_u64()) {
                    st.total_layer = Some(total);
                }
            }
        }

        // Estimate time left
        if st.print_state == "printing" && st.progress > 0.0 && st.elapsed_time > 0.0 {
            let total_est = st.elapsed_time / (st.progress / 100.0);
            st.time_left = Some(f64::max(0.0, total_est - st.elapsed_time));
        } else {
            st.time_left = None;
        }

        if st.webhooks.is_none() && st.connection_state == "connected" {
            st.klipper_state = "ready".to_string();
        }

        if let Some(bed_mesh) = status.get("bed_mesh") {
            let current = st.bed_mesh.clone().unwrap_or(BedMeshState {
                profile_name: None,
                mesh_min: None,
                mesh_max: None,
                probed_matrix: None,
                mesh_matrix: None,
                profiles: None,
            });
            st.bed_mesh = Some(BedMeshState {
                profile_name: bed_mesh
                    .get("profile_name")
                    .and_then(|v| v.as_str())
                    .map(str::to_string)
                    .or(current.profile_name),
                mesh_min: bed_mesh
                    .get("mesh_min")
                    .and_then(parse_f64_array)
                    .or(current.mesh_min),
                mesh_max: bed_mesh
                    .get("mesh_max")
                    .and_then(parse_f64_array)
                    .or(current.mesh_max),
                probed_matrix: bed_mesh
                    .get("probed_matrix")
                    .and_then(parse_f64_matrix)
                    .or(current.probed_matrix),
                mesh_matrix: bed_mesh
                    .get("mesh_matrix")
                    .and_then(parse_f64_matrix)
                    .or(current.mesh_matrix),
                profiles: bed_mesh.get("profiles").cloned().or(current.profiles),
            });
        }

        if let Some(configfile) = status.get("configfile") {
            st.configfile = Some(ConfigFileState {
                settings: configfile
                    .get("settings")
                    .cloned()
                    .or_else(|| st.configfile.as_ref().and_then(|c| c.settings.clone())),
            });
        }

        if let Some(virtual_sdcard) = status.get("virtual_sdcard") {
            st.virtual_sdcard = Some(VirtualSdcardState {
                file_position: virtual_sdcard
                    .get("file_position")
                    .and_then(|v| v.as_u64())
                    .or_else(|| st.virtual_sdcard.as_ref().and_then(|v| v.file_position)),
            });
        }

        if let Some(motion_report) = status.get("motion_report") {
            st.motion_report = Some(MotionReportState {
                live_position: motion_report
                    .get("live_position")
                    .and_then(parse_f64_array)
                    .or_else(|| {
                        st.motion_report
                            .as_ref()
                            .and_then(|m| m.live_position.clone())
                    }),
            });
        }

        if let Some(gcode_move) = status.get("gcode_move") {
            let current = st.gcode_move.clone().unwrap_or(GcodeMoveState {
                homing_origin: None,
                gcode_position: None,
                speed_factor: None,
                absolute_coordinates: None,
                absolute_extrude: None,
                extrude_factor: None,
            });
            st.gcode_move = Some(GcodeMoveState {
                extrude_factor: gcode_move
                    .get("extrude_factor")
                    .and_then(|v| v.as_f64())
                    .map(|v| v * 100.0)
                    .or(current.extrude_factor),
                homing_origin: gcode_move
                    .get("homing_origin")
                    .and_then(parse_f64_array)
                    .or(current.homing_origin),
                gcode_position: gcode_move
                    .get("gcode_position")
                    .and_then(parse_f64_array)
                    .or(current.gcode_position),
                speed_factor: gcode_move
                    .get("speed_factor")
                    .and_then(|v| v.as_f64())
                    .map(|v| v * 100.0)
                    .or(current.speed_factor),
                absolute_coordinates: gcode_move
                    .get("absolute_coordinates")
                    .and_then(|v| v.as_bool())
                    .or(current.absolute_coordinates),
                absolute_extrude: gcode_move
                    .get("absolute_extrude")
                    .and_then(|v| v.as_bool())
                    .or(current.absolute_extrude),
            });
        }

        if let Some(exclude_object) = status.get("exclude_object") {
            st.exclude_object = Some(ExcludeObjectState {
                objects: exclude_object
                    .get("objects")
                    .cloned()
                    .or_else(|| st.exclude_object.as_ref().and_then(|e| e.objects.clone())),
                excluded_objects: exclude_object
                    .get("excluded_objects")
                    .and_then(|v| {
                        v.as_array().map(|arr| {
                            arr.iter()
                                .filter_map(|item| item.as_str().map(str::to_string))
                                .collect::<Vec<_>>()
                        })
                    })
                    .or_else(|| {
                        st.exclude_object
                            .as_ref()
                            .and_then(|e| e.excluded_objects.clone())
                    }),
            });
        }
    }
}

fn parse_f64_array(value: &serde_json::Value) -> Option<Vec<f64>> {
    value
        .as_array()
        .map(|arr| arr.iter().filter_map(|v| v.as_f64()).collect::<Vec<f64>>())
}

fn parse_f64_matrix(value: &serde_json::Value) -> Option<Vec<Vec<f64>>> {
    value.as_array().map(|rows| {
        rows.iter()
            .filter_map(parse_f64_array)
            .filter(|row| !row.is_empty())
            .collect::<Vec<Vec<f64>>>()
    })
}

fn encode_path(path: &str) -> String {
    path.split('/')
        .map(|segment| {
            segment
                .bytes()
                .flat_map(|byte| match byte {
                    b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                        vec![byte as char]
                    }
                    _ => format!("%{:02X}", byte).chars().collect(),
                })
                .collect::<String>()
        })
        .collect::<Vec<String>>()
        .join("/")
}

fn join_root_path(root: &str, path: &str) -> String {
    let clean = path.trim().trim_start_matches('/');
    if clean.is_empty() {
        root.trim_matches('/').to_string()
    } else {
        format!("{}/{}", root.trim_matches('/'), clean)
    }
}

fn notification_data(value: &serde_json::Value) -> serde_json::Value {
    match value.get("params").and_then(|params| params.as_array()) {
        Some(params) if params.len() == 1 => params[0].clone(),
        Some(params) => serde_json::Value::Array(params.clone()),
        None => serde_json::Value::Null,
    }
}

fn current_time_seconds() -> f64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs_f64())
        .unwrap_or(0.0)
}

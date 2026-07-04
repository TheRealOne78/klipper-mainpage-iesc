use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{broadcast, RwLock};
use tokio_tungstenite::{connect_async, tungstenite::protocol::Message};
use tracing::{error, info, warn};

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
            console_events: Vec::new(),
        }
    }
}

pub struct MoonrakerClient {
    url: String,
    api_key: Option<String>,
    state: Arc<RwLock<NormalizedPrinterState>>,
    broadcaster: broadcast::Sender<NormalizedPrinterState>,
    http_client: reqwest::Client,
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
        }
    }

    pub fn get_state(&self) -> Arc<RwLock<NormalizedPrinterState>> {
        self.state.clone()
    }

    pub fn subscribe_updates(&self) -> broadcast::Receiver<NormalizedPrinterState> {
        self.broadcaster.subscribe()
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
        let _ = self.broadcaster.send(state_val);
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

    // Start WebSocket monitoring thread
    pub fn start_monitoring(self: Arc<Self>) {
        let client_clone = self.clone();
        tokio::spawn(async move {
            loop {
                info!("Connecting to Moonraker WebSocket...");
                let ws_url = client_clone
                    .url
                    .replace("http://", "ws://")
                    .replace("https://", "wss://")
                    + "/websocket";

                {
                    let mut st = client_clone.state.write().await;
                    st.connection_state = "connecting".to_string();
                    st.state_message = None;
                }
                let _ = client_clone
                    .broadcaster
                    .send(client_clone.state.read().await.clone());

                // Bound the connect attempt so an unreachable/powered-off
                // printer fails fast (and retries) instead of hanging on the
                // OS TCP timeout (~2 min) with the UI stuck on "connecting".
                let connect_result =
                    match tokio::time::timeout(Duration::from_secs(5), connect_async(&ws_url)).await
                    {
                        Ok(res) => res,
                        Err(_) => {
                            error!("Moonraker WS connect timed out after 5s");
                            {
                                let mut st = client_clone.state.write().await;
                                st.connection_state = "error".to_string();
                                st.state_message = Some("Connection timed out".to_string());
                            }
                            let _ = client_clone
                                .broadcaster
                                .send(client_clone.state.read().await.clone());
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
                        let _ = client_clone
                            .broadcaster
                            .send(client_clone.state.read().await.clone());

                        // Send Subscription request
                        let subscribe_msg = serde_json::json!({
                            "jsonrpc": "2.0",
                            "method": "printer.objects.subscribe",
                            "params": {
                                "objects": {
                                    "webhooks": ["state", "state_message"],
                                    "idle_timeout": ["state", "printing_time"],
                                    "toolhead": ["status", "homed_axes", "speed_factor", "position", "axis_minimum", "axis_maximum"],
                                    "extruder": ["temperature", "target"],
                                    "heater_bed": ["temperature", "target"],
                                    "print_stats": ["state", "filename", "print_duration", "progress"],
                                    "bed_mesh": ["profile_name", "mesh_min", "mesh_max", "probed_matrix", "mesh_matrix", "profiles"],
                                    "configfile": ["settings"],
                                    "virtual_sdcard": ["file_position"],
                                    "motion_report": ["live_position"],
                                    "gcode_move": ["homing_origin", "gcode_position", "speed_factor", "absolute_coordinates", "absolute_extrude"],
                                    "exclude_object": ["objects", "excluded_objects"]
                                }
                            },
                            "id": 42
                        });

                        if let Err(e) = ws_stream
                            .send(Message::Text(subscribe_msg.to_string()))
                            .await
                        {
                            error!("Failed to send subscribe message: {:?}", e);
                            continue;
                        }

                        // Monitor messages
                        while let Some(msg_res) = ws_stream.next().await {
                            match msg_res {
                                Ok(Message::Text(txt)) => {
                                    if let Err(e) = client_clone.handle_ws_message(&txt).await {
                                        warn!("Error parsing WS message: {:?}", e);
                                    }
                                }
                                Ok(Message::Close(_)) => {
                                    info!("Moonraker WebSocket closed by server.");
                                    break;
                                }
                                Err(e) => {
                                    error!("Moonraker WebSocket error: {:?}", e);
                                    break;
                                }
                                _ => {}
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
                        let _ = client_clone
                            .broadcaster
                            .send(client_clone.state.read().await.clone());
                    }
                }

                tokio::time::sleep(Duration::from_secs(5)).await;
            }
        });
    }

    async fn handle_ws_message(&self, text: &str) -> Result<(), serde_json::Error> {
        let value: serde_json::Value = serde_json::from_str(text)?;
        let mut state_changed = false;

        let mut st = self.state.write().await;

        // 1. Initial subscription response
        if let Some(result) = value.get("result") {
            if let Some(status) = result.get("status") {
                Self::update_state_from_json(&mut st, status);
                state_changed = true;
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
            }
        }

        if state_changed {
            // Drop write lock before sending to prevent deadlocks
            let state_val = st.clone();
            drop(st);
            let _ = self.broadcaster.send(state_val);
        }

        Ok(())
    }

    fn update_state_from_json(st: &mut NormalizedPrinterState, status: &serde_json::Value) {
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
            });
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
            });
            st.gcode_move = Some(GcodeMoveState {
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

fn current_time_seconds() -> f64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs_f64())
        .unwrap_or(0.0)
}

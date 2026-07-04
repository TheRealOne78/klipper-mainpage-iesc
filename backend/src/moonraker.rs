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
}

#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub struct ExcludeObjectState {
    pub objects: Option<serde_json::Value>,
    pub excluded_objects: Option<Vec<String>>,
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
        let (tx, _) = broadcast::channel(100);
        Self {
            url,
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
        let url = format!("{}/printer/gcode/script", self.url);
        let mut req = self.http_client.post(&url);
        if let Some(ref key) = self.api_key {
            req = req.header("X-Api-Key", key);
        }

        let payload = serde_json::json!({ "script": gcode });
        req.json(&payload).send().await?.error_for_status()?;
        Ok(())
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

                match connect_async(&ws_url).await {
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
                                    "toolhead": ["status", "homed_axes", "speed_factor", "position", "axis_minimum", "axis_maximum"],
                                    "extruder": ["temperature", "target"],
                                    "heater_bed": ["temperature", "target"],
                                    "print_stats": ["state", "filename", "print_duration", "progress"],
                                    "bed_mesh": ["profile_name", "mesh_min", "mesh_max", "probed_matrix", "mesh_matrix", "profiles"],
                                    "configfile": ["settings"],
                                    "virtual_sdcard": ["file_position"],
                                    "motion_report": ["live_position"],
                                    "gcode_move": ["homing_origin"],
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

        // 2. Klipper status updates
        if let Some(method) = value.get("method") {
            if method.as_str() == Some("notify_status_update") {
                if let Some(params) = value.get("params") {
                    if let Some(arr) = params.as_array() {
                        if !arr.is_empty() {
                            if let Some(status) = arr[0].get("status") {
                                Self::update_state_from_json(&mut st, status);
                                state_changed = true;
                            }
                        }
                    }
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
            });
            let axis_minimum = toolhead
                .get("axis_minimum")
                .and_then(parse_f64_array)
                .or(current.axis_minimum);
            let axis_maximum = toolhead
                .get("axis_maximum")
                .and_then(parse_f64_array)
                .or(current.axis_maximum);
            st.toolhead = Some(ToolheadState {
                axis_minimum,
                axis_maximum,
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

        // Default klipper state to ready if connected
        st.klipper_state = "ready".to_string();

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
            st.gcode_move = Some(GcodeMoveState {
                homing_origin: gcode_move
                    .get("homing_origin")
                    .and_then(parse_f64_array)
                    .or_else(|| st.gcode_move.as_ref().and_then(|g| g.homing_origin.clone())),
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

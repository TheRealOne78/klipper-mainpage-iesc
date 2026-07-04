import { useState, useEffect, useCallback, useRef } from "react";

export interface PrinterState {
  connection_state: string;
  state_message?: string;
  klipper_state: string;
  print_state: string;
  filename?: string;
  progress: number;
  elapsed_time: number;
  time_left?: number;
  hotend_temp: number;
  hotend_target: number;
  bed_temp: number;
  bed_target: number;
  speed_factor: number;
  homed_axes: string;
  bed_mesh?: {
    profile_name?: string | null;
    mesh_min?: number[] | null;
    mesh_max?: number[] | null;
    probed_matrix?: number[][] | null;
    mesh_matrix?: number[][] | null;
    profiles?: unknown;
  } | null;
  configfile?: {
    settings?: {
      bed_mesh?: Record<string, unknown>;
      printer?: {
        kinematics?: string;
        [key: string]: unknown;
      };
      extruder?: {
        nozzle_diameter?: number | string;
        [key: string]: unknown;
      };
      [key: string]: unknown;
    } | null;
  } | null;
  toolhead?: {
    axis_minimum?: number[] | null;
    axis_maximum?: number[] | null;
    position?: number[] | null;
    homed_axes?: string | null;
    speed_factor?: number | null;
  } | null;
  virtual_sdcard?: {
    file_position?: number | null;
  } | null;
  motion_report?: {
    live_position?: number[] | null;
  } | null;
  gcode_move?: {
    homing_origin?: number[] | null;
    gcode_position?: number[] | null;
    speed_factor?: number | null;
    absolute_coordinates?: boolean | null;
    absolute_extrude?: boolean | null;
  } | null;
  exclude_object?: {
    objects?: unknown;
    excluded_objects?: string[] | null;
  } | null;
  webhooks?: {
    state?: string | null;
    state_message?: string | null;
  } | null;
  idle_timeout?: {
    state?: string | null;
    printing_time?: number | null;
  } | null;
  console_events?: Array<{
    time: number;
    message: string;
    event_type: "command" | "response" | "action" | "debug" | "error" | string;
  }>;
}

export interface PortalConfig {
  app_name: string;
  faculty_name: string;
  logo_light: string;
  logo_dark: string;
  danger_image: string;
  moron_warning_text: string;
  theme: {
    font_family: string;
  };
  limits: {
    max_speed_factor: number;
    max_upload_mb: number;
    allow_movement_while_printing: boolean;
    allow_home_for_guests: boolean;
    max_jog_step: number;
  };
  preheat_presets: Record<string, { hotend: number; bed: number }>;
  allowed_macros: string[];
  guest_auth_required: boolean;
  mainsail_url?: string | null;
  moonraker_url?: string | null;
}

const API_BASE = "/api";

export function usePrinterState() {
  const [printerState, setPrinterState] = useState<PrinterState>({
    connection_state: "disconnected",
    klipper_state: "unknown",
    print_state: "standby",
    progress: 0,
    elapsed_time: 0,
    hotend_temp: 0,
    hotend_target: 0,
    bed_temp: 0,
    bed_target: 0,
    speed_factor: 100,
    homed_axes: "",
  });

  const [portalConfig, setPortalConfig] = useState<PortalConfig | null>(null);
  const [role, setRole] = useState<"admin" | "guest" | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectDelayRef = useRef<number>(500);

  // Fetch configuration. Retries on failure so that the make-dev startup
  // race (frontend up before backend) resolves without a manual page reload.
  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/config`);
      if (!res.ok) throw new Error(`config ${res.status}`);
      const data = await res.json();
      setPortalConfig(data);
      if (data.guest_auth_required) {
        setAuthRequired(true);
      }
    } catch (e) {
      console.error("Failed to fetch config, retrying in 1s", e);
      window.setTimeout(() => {
        void fetchConfig();
      }, 1000);
    }
  }, []);

  // WebSocket Connection
  const connectWs = useCallback(() => {
    if (wsRef.current) return;

    const loc = window.location;
    const protocol = loc.protocol === "https:" ? "wss:" : "ws:";
    // The Vite dev proxy (ws: true) handles forwarding /api/ws to the backend
    const wsUrl = `${protocol}//${loc.host}${API_BASE}/ws`;

    console.log(`Connecting to portal WS: ${wsUrl}`);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("Portal WS Connected");
      setWsConnected(true);
      reconnectDelayRef.current = 500;
    };

    ws.onmessage = (event) => {
      try {
        const state: PrinterState = JSON.parse(event.data);
        setPrinterState(state);
      } catch (e) {
        console.error("Error parsing WS message", e);
      }
    };

    ws.onclose = () => {
      const delay = reconnectDelayRef.current;
      console.log(`Portal WS Closed. Reconnecting in ${delay}ms...`);
      setWsConnected(false);
      wsRef.current = null;
      // Exponential backoff: quick first retries (500ms) during the
      // make-dev startup race, capped at 5s for steady-state outages.
      reconnectDelayRef.current = Math.min(delay * 2, 5000);
      reconnectTimeoutRef.current = window.setTimeout(() => {
        connectWs();
      }, delay);
    };

    ws.onerror = (e) => {
      console.error("Portal WS Error", e);
      ws.close();
    };
  }, []);

  // Disconnect WebSocket
  const disconnectWs = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  useEffect(() => {
    fetchConfig();
    // Check if role is stored locally or session token cookie exists
    const storedRole = localStorage.getItem("portal_role");
    if (storedRole === "admin" || storedRole === "guest") {
      setRole(storedRole as "admin" | "guest");
    }
    connectWs();

    return () => {
      disconnectWs();
    };
  }, [fetchConfig, connectWs, disconnectWs]);

  // Auth Operations
  const login = useCallback(async (password: string) => {
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        const data = await res.json();
        setRole(data.role);
        localStorage.setItem("portal_role", data.role);
        setAuthRequired(false);
        return { success: true };
      } else {
        const data = await res.json();
        return { success: false, error: data.error || "Parola incorecta" };
      }
    } catch {
      return { success: false, error: "Eroare de retea la autentificare" };
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/auth/logout`, { method: "POST" });
    } catch (e) {
      console.error("Logout error", e);
    }
    setRole(null);
    localStorage.removeItem("portal_role");
    if (portalConfig?.guest_auth_required) {
      setAuthRequired(true);
    }
  }, [portalConfig]);

  // Printer Control API Calls
  const apiPost = useCallback(async (path: string, body?: any) => {
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Request failed: ${res.status}`);
      }
      return await res.json().catch(() => ({ status: "ok" }));
    } catch (e: any) {
      console.error(`API Error for ${path}:`, e);
      throw e;
    }
  }, []);

  const preheat = useCallback(
    (preset: string) => apiPost("/preheat", { preset }),
    [apiPost],
  );
  const runMacro = useCallback(
    (macroName: string) => apiPost("/macro/run", { macro_name: macroName }),
    [apiPost],
  );
  const jog = useCallback(
    (axis: string, distance: number) => apiPost("/move", { axis, distance }),
    [apiPost],
  );
  const moveTo = useCallback(
    (axis: string, position: number) => apiPost("/move_to", { axis, position }),
    [apiPost],
  );
  const home = useCallback(
    (axis: string = "home") => apiPost("/move", { axis, distance: 0 }),
    [apiPost],
  );
  const disableMotors = useCallback(
    () => apiPost("/motors/disable"),
    [apiPost],
  );
  const setTargetTemp = useCallback(
    (heater: string, target: number) =>
      apiPost("/target_temp", { heater, target }),
    [apiPost],
  );
  const setSpeedFactor = useCallback(
    (factor: number) => apiPost("/speed_factor", { factor }),
    [apiPost],
  );

  const startPrint = useCallback(
    (filename: string) => apiPost("/print/start", { filename }),
    [apiPost],
  );
  const pausePrint = useCallback(() => apiPost("/print/pause"), [apiPost]);
  const resumePrint = useCallback(() => apiPost("/print/resume"), [apiPost]);
  const cancelPrint = useCallback(() => apiPost("/print/cancel"), [apiPost]);
  const emergencyStop = useCallback(
    () => apiPost("/print/emergency_stop"),
    [apiPost],
  );

  // Upload Gcode
  const uploadGcode = useCallback((file: File) => {
    return new Promise<{ success: boolean; filename?: string; error?: string }>(
      (resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${API_BASE}/print/upload`, true);

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const pct = Math.round((event.loaded / event.total) * 100);
            setUploadProgress(pct);
          }
        };

        xhr.onload = () => {
          setUploadProgress(null);
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const res = JSON.parse(xhr.responseText);
              resolve({ success: true, filename: res.filename });
            } catch {
              resolve({ success: true });
            }
          } else {
            resolve({
              success: false,
              error: xhr.responseText || "Incarcare esuata",
            });
          }
        };

        xhr.onerror = () => {
          setUploadProgress(null);
          resolve({
            success: false,
            error: "Eroare de retea in timpul incarcarii",
          });
        };

        const formData = new FormData();
        formData.append("file", file);
        xhr.send(formData);
      },
    );
  }, []);

  return {
    printerState,
    portalConfig,
    role,
    authRequired,
    wsConnected,
    uploadProgress,
    login,
    logout,
    preheat,
    runMacro,
    jog,
    moveTo,
    home,
    disableMotors,
    setTargetTemp,
    setSpeedFactor,
    startPrint,
    pausePrint,
    resumePrint,
    cancelPrint,
    emergencyStop,
    uploadGcode,
    refreshConfig: fetchConfig,
  };
}

import { useState, useEffect, useCallback, useRef } from "react";
import { useAdminConfig } from "./hooks/useAdminConfig";
export * from "./printerTypes";
import type {
  PrinterState,
  PortalConfig,
  AuthUser,
  AuthRole,
  PowerDevice,
  PrintHistory,
  PrintHistoryJob,
  PrintHistoryTotals,
  GcodeFile,
  DirectoryListing,
  DirectoryDir,
  DirectoryFile,
  FileMovePayload,
  GcodeFileMetadata,
  AnnouncementEntry,
  MachineSystem,
  UpdateComponent,
  JobQueueStatus,
  JobQueueEntry,
  ServerInfo,
  PortalWsEnvelope,
  PowChallenge,
} from "./printerTypes";

const API_BASE = "/api";

const normalizeRole = (value: unknown): AuthRole | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized || null;
};

const normalizeAuthUser = (value: unknown): AuthUser => {
  const data =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  return {
    role: normalizeRole(data.role),
    email: typeof data.email === "string" ? data.email : null,
    display_name:
      typeof data.display_name === "string" ? data.display_name : null,
    auth_source: typeof data.auth_source === "string" ? data.auth_source : null,
  };
};

/** Throws with the response body (or a fallback "<message>: <status>") when
 * `res` isn't ok. Consolidates ~28 near-identical inline blocks that used to
 * repeat this at every fetch call site in this file. Preserve the exact
 * `failedMessage` text passed at each call site — `lib/errorTranslations.ts`'s
 * `PREFIXES` table matches error messages by this exact prefix string. */
async function assertOk(res: Response, failedMessage: string): Promise<void> {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `${failedMessage}: ${res.status}`);
  }
}

export function usePrinterState() {
  const adminConfigApi = useAdminConfig();
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
  const [authUser, setAuthUser] = useState<AuthUser>({ role: null });
  const [role, setRole] = useState<AuthRole | null>(null);
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
        const payload = JSON.parse(event.data) as PrinterState | PortalWsEnvelope;
        if (
          payload &&
          typeof payload === "object" &&
          "type" in payload &&
          "data" in payload
        ) {
          if (payload.type === "printer_state") {
            setPrinterState(payload.data as PrinterState);
          } else if (payload.type === "config_changed") {
            // Admin saved config (possibly in another tab/session) — refetch
            // so permissions/branding/etc. update live without a reload.
            void fetchConfig();
          }
          return;
        }
        setPrinterState(payload as PrinterState);
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
  }, [fetchConfig]);

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

  const refreshAuth = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`auth ${res.status}`);
      const data = normalizeAuthUser(await res.json());
      setAuthUser(data);
      setRole(data.role);
      if (data.role) {
        localStorage.setItem("portal_role", data.role);
        setAuthRequired(false);
      } else {
        localStorage.removeItem("portal_role");
      }
    } catch (e) {
      console.error("Failed to refresh auth session", e);
      setAuthUser({ role: null });
      setRole(null);
      localStorage.removeItem("portal_role");
    }
  }, []);

  useEffect(() => {
    // refreshAuth first so the session cookie is established before fetchConfig
    // calls /api/config — that endpoint is session-aware and returns permissions
    // for the current role (group perms differ from guest perms).
    void (async () => {
      await refreshAuth();
      await fetchConfig();
    })();
    connectWs();

    return () => {
      disconnectWs();
    };
  }, [fetchConfig, refreshAuth, connectWs, disconnectWs]);

  // Auth Operations
  const login = useCallback(async (password: string, username?: string) => {
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(username ? { username, password } : { password }),
      });
      if (res.ok) {
        const data = normalizeAuthUser(await res.json());
        setAuthUser(data);
        setRole(data.role);
        if (data.role) {
          localStorage.setItem("portal_role", data.role);
        } else {
          localStorage.removeItem("portal_role");
        }
        setAuthRequired(false);
        // Re-fetch config so session-aware permissions (group perms) take effect.
        void fetchConfig();
        return { success: true };
      } else {
        const data = await res.json();
        return { success: false, error: data.error || "Parolă incorectă" };
      }
    } catch {
      return { success: false, error: "Eroare de rețea la autentificare" };
    }
  }, [fetchConfig]);

  /** Fetches a fresh proof-of-work anti-spam challenge for `signup` below. */
  const requestPowChallenge = useCallback(async (): Promise<PowChallenge> => {
    const res = await fetch(`${API_BASE}/auth/pow-challenge`);
    await assertOk(res, "Nu s-a putut obține un challenge anti-spam");
    return res.json();
  }, []);

  /** Solves an Anubis-style proof-of-work challenge in the browser: brute
   * forces a nonce whose SHA-256 hash (of `seed:nonce`) has `difficulty_bits`
   * leading zero bits. Runs on the main thread in small batches (yielding via
   * `setTimeout(0)`) so the tab doesn't freeze while solving. */
  const solvePowChallenge = useCallback(async (challenge: PowChallenge): Promise<string> => {
    const encoder = new TextEncoder();
    const leadingZeroBits = (bytes: Uint8Array): number => {
      let bits = 0;
      for (const byte of bytes) {
        if (byte === 0) {
          bits += 8;
          continue;
        }
        bits += Math.clz32(byte) - 24;
        break;
      }
      return bits;
    };

    for (let nonce = 0; ; nonce++) {
      const data = encoder.encode(`${challenge.seed}:${nonce}`);
      const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
      if (leadingZeroBits(digest) >= challenge.difficulty_bits) {
        return String(nonce);
      }
      if (nonce % 2000 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
  }, []);

  /** Registers a new local account. Solves the PoW challenge itself when the
   * portal requires one. Throws on failure (domain not allowed, email taken,
   * IP not allowed, ...) — the backend's error text is shown via the caller's
   * existing toast/error-localization path. */
  const signup = useCallback(
    async (email: string, password: string): Promise<{ status: string }> => {
      let powFields: { pow_token: string; pow_nonce: string } | undefined;
      if (portalConfig?.auth?.signup_requires_pow) {
        const challenge = await requestPowChallenge();
        const nonce = await solvePowChallenge(challenge);
        powFields = { pow_token: challenge.token, pow_nonce: nonce };
      }
      const res = await fetch(`${API_BASE}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, ...powFields }),
      });
      await assertOk(res, "Înregistrarea a eșuat");
      return res.json();
    },
    [portalConfig, requestPowChallenge, solvePowChallenge],
  );

  const logout = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/auth/logout`, { method: "POST" });
    } catch (e) {
      console.error("Logout error", e);
    }
    setAuthUser({ role: null });
    setRole(null);
    localStorage.removeItem("portal_role");
    if (portalConfig?.guest_auth_required) {
      setAuthRequired(true);
    }
    // Re-fetch config so guest permissions replace any session-specific ones.
    void fetchConfig();
  }, [portalConfig, fetchConfig]);

  // Printer Control API Calls
  const apiPost = useCallback(async (path: string, body?: any) => {
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      await assertOk(res, "Request failed");
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
  const sendConsole = useCallback(
    (command: string) => apiPost("/console/send", { command }),
    [apiPost],
  );
  const getAnnouncements = useCallback(async (): Promise<AnnouncementEntry[]> => {
    const res = await fetch(`${API_BASE}/announcements`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return [];
    const data = await res.json().catch(() => ({}));
    return Array.isArray(data?.entries)
      ? (data.entries as AnnouncementEntry[])
      : [];
  }, []);
  const getConsoleCommands = useCallback(async (): Promise<string[]> => {
    const res = await fetch(`${API_BASE}/console/commands`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return [];
    const data = await res.json().catch(() => ({}));
    return Array.isArray(data?.commands) ? (data.commands as string[]) : [];
  }, []);
  const setFanSpeed = useCallback(
    (speed: number) => apiPost("/fan", { speed }),
    [apiPost],
  );
  const extrudeFilament = useCallback(
    (length: number, speed: number) =>
      apiPost("/extrude", { length, speed }),
    [apiPost],
  );
  const manualProbe = useCallback(
    (action: "testz" | "accept" | "abort", delta = 0) =>
      apiPost("/probe", { action, delta }),
    [apiPost],
  );
  const setFlow = useCallback(
    (factor: number) => apiPost("/flow", { factor }),
    [apiPost],
  );
  const setLimits = useCallback(
    (
      velocity: number,
      accel: number,
      square_corner_velocity: number,
      minimum_cruise_ratio: number,
    ) =>
      apiPost("/limits", {
        velocity,
        accel,
        square_corner_velocity,
        minimum_cruise_ratio,
      }),
    [apiPost],
  );
  const setRetraction = useCallback(
    (
      retract_length: number,
      retract_speed: number,
      unretract_extra_length: number,
      unretract_speed: number,
    ) =>
      apiPost("/retraction", {
        retract_length,
        retract_speed,
        unretract_extra_length,
        unretract_speed,
      }),
    [apiPost],
  );
  const setAuxFan = useCallback(
    (name: string, speed: number) => apiPost("/aux/fan", { name, speed }),
    [apiPost],
  );
  const setAuxPin = useCallback(
    (name: string, value: number) => apiPost("/aux/pin", { name, value }),
    [apiPost],
  );
  const excludeObject = useCallback(
    (name: string) => apiPost("/exclude_object", { name }),
    [apiPost],
  );
  const setAuxHeater = useCallback(
    (name: string, target: number) => apiPost("/aux/heater", { name, target }),
    [apiPost],
  );
  const setTmcCurrent = useCallback(
    (stepper: string, current: number) =>
      apiPost("/aux/tmc", { stepper, current }),
    [apiPost],
  );
  const setAuxLed = useCallback(
    (name: string, red: number, green: number, blue: number, white = 0) =>
      apiPost("/aux/led", { name, red, green, blue, white }),
    [apiPost],
  );
  const getPowerDevices = useCallback(async (): Promise<PowerDevice[]> => {
    const res = await fetch(`${API_BASE}/power/devices`, {
      headers: { Accept: "application/json" },
    });
    await assertOk(res, "Power devices request failed");
    const data = await res.json().catch(() => ({}));
    // Moonraker wraps the list as { result: { devices: [...] } }.
    const devices = data?.result?.devices ?? data?.devices ?? [];
    return Array.isArray(devices) ? (devices as PowerDevice[]) : [];
  }, []);
  const setPowerDevice = useCallback(
    (device: string, action: "on" | "off" | "toggle") =>
      apiPost("/power/device", { device, action }),
    [apiPost],
  );
  const getPrintHistory = useCallback(
    async (limit = 50): Promise<PrintHistory> => {
      const res = await fetch(`${API_BASE}/history?limit=${limit}`, {
        headers: { Accept: "application/json" },
      });
      await assertOk(res, "History request failed");
      const data = await res.json().catch(() => ({}));
      return {
        jobs: Array.isArray(data?.jobs) ? (data.jobs as PrintHistoryJob[]) : [],
        totals: (data?.totals ?? null) as PrintHistoryTotals | null,
      };
    },
    [],
  );
  const getGcodeFiles = useCallback(async (): Promise<GcodeFile[]> => {
    const res = await fetch(`${API_BASE}/files/gcodes`, {
      headers: { Accept: "application/json" },
    });
    await assertOk(res, "File list request failed");
    const data = await res.json().catch(() => ({}));
    // Moonraker returns { result: [ { path, modified, size } ] }.
    const list = Array.isArray(data?.result)
      ? data.result
      : Array.isArray(data)
        ? data
        : [];
    return list as GcodeFile[];
  }, []);
  const getFileMetadata = useCallback(
    async (filename: string): Promise<GcodeFileMetadata> => {
      const res = await fetch(
        `${API_BASE}/files/metadata?filename=${encodeURIComponent(filename)}`,
        { headers: { Accept: "application/json" } },
      );
      await assertOk(res, "Metadata failed");
      return (await res.json()) as GcodeFileMetadata;
    },
    [],
  );
  const deleteGcodeFile = useCallback(async (path: string): Promise<void> => {
    // Encode each path segment but keep the slashes so the `*path` wildcard route
    // still matches nested files (e.g. "subdir/part.gcode").
    const encoded = path
      .split("/")
      .map((seg) => encodeURIComponent(seg))
      .join("/");
    const res = await fetch(`${API_BASE}/files/gcodes/${encoded}`, {
      method: "DELETE",
    });
    await assertOk(res, "Delete failed");
  }, []);
  // Directory browser API (gcodes root). Each helper returns parsed JSON and
  // throws on a non-OK response so callers can surface the error.
  const listDirectory = useCallback(
    async (root: string, path?: string): Promise<DirectoryListing> => {
      const params = new URLSearchParams({ root });
      if (path) params.set("path", path);
      const res = await fetch(`${API_BASE}/files/directory?${params.toString()}`, {
        headers: { Accept: "application/json" },
      });
      await assertOk(res, "Directory list failed");
      const data = await res.json().catch(() => ({}));
      return {
        dirs: Array.isArray(data?.dirs) ? (data.dirs as DirectoryDir[]) : [],
        files: Array.isArray(data?.files)
          ? (data.files as DirectoryFile[])
          : [],
        disk_usage: data?.disk_usage ?? null,
        root_info: data?.root_info ?? null,
      };
    },
    [],
  );
  const createDirectory = useCallback(
    async (root: string, path: string): Promise<any> => {
      const res = await fetch(`${API_BASE}/files/directory`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ root, path }),
      });
      await assertOk(res, "Create directory failed");
      return res.json().catch(() => ({ status: "ok" }));
    },
    [],
  );
  const moveFile = useCallback(
    async (payload: FileMovePayload): Promise<any> => {
      const res = await fetch(`${API_BASE}/files/move`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      await assertOk(res, "Move failed");
      return res.json().catch(() => ({ status: "ok" }));
    },
    [],
  );
  const deleteGcodePath = useCallback(
    async (path: string): Promise<any> => {
      const encoded = path
        .split("/")
        .map((seg) => encodeURIComponent(seg))
        .join("/");
      const res = await fetch(
        `${API_BASE}/files/file/${encoded}?root=gcodes`,
        { method: "DELETE" },
      );
      await assertOk(res, "Delete failed");
      return res.json().catch(() => ({ status: "ok" }));
    },
    [],
  );
  const deleteDirectory = useCallback(
    async (root: string, path: string, force = false): Promise<any> => {
      const params = new URLSearchParams({ root, path, force: String(force) });
      const res = await fetch(`${API_BASE}/files/directory?${params.toString()}`, {
        method: "DELETE",
        headers: { Accept: "application/json" },
      });
      await assertOk(res, "Delete directory failed");
      return res.json().catch(() => ({ status: "ok" }));
    },
    [],
  );
  const uploadToDirectory = useCallback(
    async (root: string, path: string, file: File): Promise<any> => {
      const form = new FormData();
      form.append("file", file);
      form.append("root", root);
      if (path) form.append("path", path);
      const res = await fetch(`${API_BASE}/files/upload`, {
        method: "POST",
        body: form,
      });
      await assertOk(res, "Upload failed");
      return res.json().catch(() => ({ status: "ok" }));
    },
    [],
  );
  const jobQueueAdd = useCallback(
    (filenames: string[]) => apiPost("/job_queue/add", { filenames }),
    [apiPost],
  );
  const getJobQueue = useCallback(async (): Promise<JobQueueStatus> => {
    const res = await fetch(`${API_BASE}/job_queue`, {
      headers: { Accept: "application/json" },
    });
    await assertOk(res, "Job queue request failed");
    const data = await res.json().catch(() => ({}));
    return {
      queued_jobs: Array.isArray(data?.queued_jobs)
        ? (data.queued_jobs as JobQueueEntry[])
        : [],
      queue_state: typeof data?.queue_state === "string" ? data.queue_state : "",
    };
  }, []);
  const jobQueueDelete = useCallback(
    (jobIds: string[], all = false) =>
      apiPost("/job_queue/delete", { job_ids: jobIds, all }),
    [apiPost],
  );
  const jobQueueSetState = useCallback(
    (pause: boolean) => apiPost("/job_queue/state", { pause }),
    [apiPost],
  );
  const getConfigFiles = useCallback(async (): Promise<string[]> => {
    const res = await fetch(`${API_BASE}/config_files`, {
      headers: { Accept: "application/json" },
    });
    await assertOk(res, "Config list failed");
    const data = await res.json().catch(() => []);
    const list = Array.isArray(data) ? data : [];
    return list
      .map((f: { path?: string }) => f?.path)
      .filter((p): p is string => typeof p === "string");
  }, []);
  const readConfigFile = useCallback(async (path: string): Promise<string> => {
    const encoded = path
      .split("/")
      .map((s) => encodeURIComponent(s))
      .join("/");
    const res = await fetch(`${API_BASE}/config_files/${encoded}`, {
      headers: { Accept: "application/json" },
    });
    await assertOk(res, "Config read failed");
    const data = await res.json().catch(() => ({}));
    return typeof data?.content === "string" ? data.content : "";
  }, []);
  const writeConfigFile = useCallback(
    async (path: string, content: string): Promise<void> => {
      const encoded = path
        .split("/")
        .map((s) => encodeURIComponent(s))
        .join("/");
      const res = await fetch(`${API_BASE}/config_files/${encoded}`, {
        method: "PUT",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content }),
      });
      await assertOk(res, "Config write failed");
    },
    [],
  );
  const getEndstops = useCallback(async (): Promise<Record<string, string>> => {
    const res = await fetch(`${API_BASE}/machine/endstops`, {
      headers: { Accept: "application/json" },
    });
    await assertOk(res, "Endstop query failed");
    const data = await res.json().catch(() => ({}));
    return data && typeof data === "object"
      ? (data as Record<string, string>)
      : {};
  }, []);
  const getServices = useCallback(async (): Promise<string[]> => {
    const res = await fetch(`${API_BASE}/machine/services`, {
      headers: { Accept: "application/json" },
    });
    await assertOk(res, "Services request failed");
    const data = await res.json().catch(() => ({}));
    return Array.isArray(data?.services) ? (data.services as string[]) : [];
  }, []);
  const serviceAction = useCallback(
    (service: string, action: "restart" | "start" | "stop") =>
      apiPost("/machine/services/action", { service, action }),
    [apiPost],
  );
  const getServerInfo = useCallback(async (): Promise<ServerInfo> => {
    const res = await fetch(`${API_BASE}/server/info`, {
      headers: { Accept: "application/json" },
    });
    await assertOk(res, "Server info failed");
    const data = await res.json().catch(() => ({}));
    const result = data?.result ?? data;
    return (result?.server_info ?? result) as ServerInfo;
  }, []);
  const getMachineSystem = useCallback(async (): Promise<MachineSystem> => {
    const res = await fetch(`${API_BASE}/machine/system`, {
      headers: { Accept: "application/json" },
    });
    await assertOk(res, "System loads failed");
    const data = await res.json().catch(() => ({}));
    return {
      system_info: data?.system_info ?? null,
      proc_stats: data?.proc_stats ?? null,
      mcus: data?.mcus ?? {},
    };
  }, []);
  const getUpdateStatus = useCallback(async (refresh = false): Promise<UpdateComponent[]> => {
    const res = await fetch(`${API_BASE}/machine/update/status?refresh=${refresh}`, {
      headers: { Accept: "application/json" },
    });
    await assertOk(res, "Update status failed");
    const data = await res.json().catch(() => ({}));
    const versionInfo = (data?.version_info ?? {}) as Record<string, any>;
    return Object.entries(versionInfo).map(([name, info]) => ({
      name,
      ...(info ?? {}),
      version: info?.version,
      remote_version: info?.remote_version,
      package_count:
        typeof info?.package_count === "number" ? info.package_count : undefined,
    }));
  }, []);
  const machineUpdate = useCallback(
    (component: string) => apiPost("/machine/update", { component }),
    [apiPost],
  );
  const hostReboot = useCallback(
    () => apiPost("/machine/reboot"),
    [apiPost],
  );
  const hostShutdown = useCallback(
    () => apiPost("/machine/shutdown"),
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
              error: xhr.responseText || "Încărcare eșuată",
            });
          }
        };

        xhr.onerror = () => {
          setUploadProgress(null);
          resolve({
            success: false,
            error: "Eroare de rețea în timpul încărcării",
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
    authUser,
    role,
    authRequired,
    wsConnected,
    uploadProgress,
    login,
    logout,
    signup,
    preheat,
    runMacro,
    sendConsole,
    getConsoleCommands,
    getAnnouncements,
    setFanSpeed,
    extrudeFilament,
    manualProbe,
    setRetraction,
    setLimits,
    setFlow,
    setAuxFan,
    setAuxPin,
    setAuxLed,
    setAuxHeater,
    setTmcCurrent,
    excludeObject,
    getPowerDevices,
    setPowerDevice,
    getPrintHistory,
    getServices,
    getServerInfo,
    serviceAction,
    getEndstops,
    getConfigFiles,
    readConfigFile,
    writeConfigFile,
    getUpdateStatus,
    getMachineSystem,
    machineUpdate,
    getGcodeFiles,
    getFileMetadata,
    deleteGcodeFile,
    listDirectory,
    createDirectory,
    moveFile,
    deleteGcodePath,
    deleteDirectory,
    uploadToDirectory,
    getJobQueue,
    jobQueueAdd,
    jobQueueDelete,
    jobQueueSetState,
    hostReboot,
    hostShutdown,
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
    ...adminConfigApi,
  };
}

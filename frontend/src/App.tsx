import React, { useState, useEffect, useRef } from "react";
import { usePrinterState, pickLocalized } from "./usePrinterState";
import { useContentHeadings } from "./hooks/useContentHeadings";
import { Rules } from "./pages/Rules";
import { Troubleshooting } from "./pages/Troubleshooting";
import { Dashboard } from "./pages/Dashboard";
import { GcodeViewer } from "./pages/GcodeViewer";
import { Heightmap } from "./pages/Heightmap";
import { AdminSettings } from "./pages/AdminSettings";
import { AdminAudit } from "./pages/AdminAudit";
import { GcodeFilesPage } from "./pages/GcodeFilesPage";
import { HistoryPage } from "./pages/HistoryPage";
import { MachinePage } from "./pages/MachinePage";
import { ExternalLink } from "lucide-react";
import { translations, LANGUAGES, type Lang } from "./translations";
import { footerPresetIconFor } from "./lib/footerIcons";
import { isSafeUrl } from "./lib/url";
import { useToast } from "./contexts/ToastContext";
import { pageAnchors, getHashTarget } from "./lib/routing";
import {
  AUTO_THEME,
  DEFAULT_DARK_THEME,
  DEFAULT_LIGHT_THEME,
  THEME_STORAGE_KEY,
  resolveThemeMode,
  resolveThemeSelection,
} from "./lib/themes";
import { toErrorMessage } from "./lib/toErrorMessage";
import { usePermissions } from "./hooks/usePermissions";
import { SafetyModal } from "./features/app/SafetyModal";
import { AuthModal } from "./features/app/AuthModal";
import { AppHeader } from "./features/app/AppHeader";
import { AppSidebar } from "./features/app/AppSidebar";
import { PendingUploadsBanner } from "./features/app/PendingUploadsBanner";
import { usePendingUploads, type PendingUpload } from "./hooks/usePendingUploads";

// Logo imports
import logoRoRgb from "./assets/unitbv/logo/RO/Logo-UT-IESC-RGB-RO.png";
import logoRoAlb from "./assets/unitbv/logo/RO/Logo-UT-IESC-ALB-RO.png";
import logoEnRgb from "./assets/unitbv/logo/EN/Logo-UT-IESC-RGB-EN.png";
import logoEnWhite from "./assets/unitbv/logo/EN/Logo-UT-IESC-WHITE-EN.png";

/** Trims an admin-configured URL and returns it only if `isSafeUrl` accepts
 * it (http/https only) — used for Mainsail/Fluidd/OctoPrint account-menu
 * links and footer links, none of which come from a fixed allow-list. */
const safeExternalUrl = (url: string | null | undefined): string | null => {
  const trimmed = url?.trim();
  if (!trimmed) return null;
  return isSafeUrl(trimmed) ? trimmed : null;
};

const App: React.FC = () => {
  const {
    printerState,
    portalConfig,
    role,
    authRequired,
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
    serviceAction,
    getEndstops,
    getConfigFiles,
    readConfigFile,
    writeConfigFile,
    getUpdateStatus,
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
    getAdminConfig,
    getAdminMacros,
    getAdminPowerDevices,
    updateAdminConfig,
    uploadAdminAsset,
    uploadAdminFont,
    uploadFooterLinkIcon,
    changeAdminPassword,
    getAdminAudit,
    getAdminUsers,
    createAdminUser,
    deleteAdminUser,
    setAdminUserGroup,
    resendAdminUserVerification,
    refreshConfig,
  } = usePrinterState();
  const { pendingUploads, cancelPendingUpload, refreshPendingUploads } = usePendingUploads();
  // Dismissing the modal hides it for the rest of the session without
  // discarding the queued file — tracked by id so a newly-arrived upload
  // (one not yet dismissed) still pops it back open.
  const [dismissedPendingUploadIds, setDismissedPendingUploadIds] = useState<Set<string>>(
    new Set(),
  );
  const visiblePendingUploads = pendingUploads.filter(
    (item) => !dismissedPendingUploadIds.has(item.id),
  );

  const [page, setPage] = useState<string>("rules");
  const prefersLightSystemTheme = (): boolean =>
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: light)").matches;

  // `theme` holds the user's *selection*: a concrete theme id, or the
  // literal "auto" to follow the OS preference live. `themeMode` is the
  // resolved light/dark mode of whatever is currently applied — the only
  // thing chart/canvas code elsewhere in the app needs to know.
  const getStoredThemeSelection = (): string => {
    if (typeof window === "undefined") return AUTO_THEME;
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    // Legacy values from before the multi-theme system predate "auto" and
    // meant an explicit, permanent choice — preserve that intent instead of
    // silently resetting the user to Auto.
    if (stored === "light") return DEFAULT_LIGHT_THEME;
    if (stored === "dark") return DEFAULT_DARK_THEME;
    return stored || AUTO_THEME;
  };

  const applyTheme = (selection: string) => {
    const resolvedId = resolveThemeSelection(selection, prefersLightSystemTheme());
    const mode = resolveThemeMode(resolvedId);
    setTheme(selection);
    setThemeMode(mode);
    document.documentElement.setAttribute("data-theme", resolvedId);
    document.documentElement.setAttribute("data-theme-mode", mode);
    document.documentElement.style.colorScheme = mode;
  };

  const [theme, setTheme] = useState<string>(getStoredThemeSelection);
  const [themeMode, setThemeMode] = useState<"light" | "dark">(() =>
    resolveThemeMode(resolveThemeSelection(getStoredThemeSelection(), prefersLightSystemTheme())),
  );
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const themeMenuRef = useRef<HTMLDivElement>(null);
  const [lang, setLang] = useState<Lang>("ro");
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [authEmail, setAuthEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [signupBusy, setSignupBusy] = useState(false);
  const [safetyModalOpen, setSafetyModalOpen] = useState(true);
  const [isUploadSafety, setIsUploadSafety] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(10);

  useEffect(() => {
    let timer: any;
    if (safetyModalOpen && isUploadSafety) {
      setCountdown(10);
      timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [safetyModalOpen, isUploadSafety]);

  // Layout states
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [rulesCollapsed, setRulesCollapsed] = useState(false);
  // Guide (troubleshooting.md content) is collapsed by default — it's long.
  const [guideCollapsed, setGuideCollapsed] = useState(true);

  // Dynamic sidebar nav: headings pulled live from the same markdown-rendered
  // content Rules.tsx/Troubleshooting.tsx display, instead of a hardcoded list.
  const { headings: rulesHeadings } = useContentHeadings("rules", lang);
  const { headings: troubleshootingHeadings } = useContentHeadings(
    "troubleshooting",
    lang,
  );
  const [langDropdownOpen, setLangDropdownOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [powerMenuOpen, setPowerMenuOpen] = useState(false);
  const [navPowerDevices, setNavPowerDevices] = useState<
    Awaited<ReturnType<typeof getPowerDevices>>
  >([]);
  const [navServices, setNavServices] = useState<string[]>([]);
  const [navPowerBusy, setNavPowerBusy] = useState<string | null>(null);
  const [navPowerError, setNavPowerError] = useState<string | null>(null);
  // Dashboard card-rearrange (edit) mode, toggled from the nav bar.
  const [editLayout, setEditLayout] = useState(false);
  const [scrollTarget, setScrollTarget] = useState<string>("");
  const langSelectorRef = useRef<HTMLDivElement>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const powerMenuRef = useRef<HTMLDivElement>(null);

  // Close the language dropdown when clicking away
  useEffect(() => {
    if (!langDropdownOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (
        langSelectorRef.current &&
        !langSelectorRef.current.contains(event.target as Node)
      ) {
        setLangDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [langDropdownOpen]);

  // Close the theme dropdown when clicking away
  useEffect(() => {
    if (!themeMenuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (
        themeMenuRef.current &&
        !themeMenuRef.current.contains(event.target as Node)
      ) {
        setThemeMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [themeMenuOpen]);

  useEffect(() => {
    if (!accountMenuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (
        accountMenuRef.current &&
        !accountMenuRef.current.contains(event.target as Node)
      ) {
        setAccountMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [accountMenuOpen]);

  useEffect(() => {
    if (!powerMenuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (
        powerMenuRef.current &&
        !powerMenuRef.current.contains(event.target as Node)
      ) {
        setPowerMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [powerMenuOpen]);

  const { pushToast } = useToast();

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Tracks whether the hash present on the very first load (if any) has
  // already been resolved to a page, either via the static table below or
  // via the dynamic-heading fallback further down — once true, that
  // fallback effect stops trying (it must not fight later in-app hash
  // updates for anchors that are legitimately dynamic-only).
  const initialHashResolved = useRef(false);

  useEffect(() => {
    const applyHashTarget = () => {
      const target = getHashTarget();
      if (!target) return;
      initialHashResolved.current = true;
      setPage(target.page);
      setScrollTarget(target.target || "");
    };

    applyHashTarget();
    window.addEventListener("hashchange", applyHashTarget);
    return () => window.removeEventListener("hashchange", applyHashTarget);
  }, []);

  // Fresh-load / external-link fallback: a hash can also be a dynamically
  // generated content-heading anchor (see useContentHeadings) that isn't in
  // the static hashTargets table above. Those can only be resolved once the
  // corresponding page's headings have finished loading, so retry here
  // whenever either heading list updates, until the initial hash (if any)
  // has been resolved once. Without this, opening a direct link to such an
  // anchor silently fell back to the hardcoded initial "rules" page.
  useEffect(() => {
    if (initialHashResolved.current) return;
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash) return;
    if (rulesHeadings.some((h) => h.id === hash)) {
      initialHashResolved.current = true;
      setPage("rules");
      setScrollTarget(hash);
    } else if (troubleshootingHeadings.some((h) => h.id === hash)) {
      initialHashResolved.current = true;
      setPage("troubleshooting");
      setScrollTarget(hash);
    }
  }, [rulesHeadings, troubleshootingHeadings]);

  // Initialize theme & language
  useEffect(() => {
    const selection = getStoredThemeSelection();
    applyTheme(selection);
    // A fresh installation (no stored value at all) defaults to Auto —
    // persist that explicitly so it's a real, visible choice rather than
    // just an implicit fallback.
    if (!localStorage.getItem(THEME_STORAGE_KEY)) {
      localStorage.setItem(THEME_STORAGE_KEY, AUTO_THEME);
    }

    const savedLang = localStorage.getItem("lang") as Lang | null;
    if (savedLang && LANGUAGES.some((l) => l.code === savedLang)) {
      setLang(savedLang);
    }
  }, []);

  // While "Auto" is selected, live-follow OS theme changes without needing
  // a reload (Auto otherwise only resolves once, at mount).
  useEffect(() => {
    if (theme !== AUTO_THEME) return;
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const handleChange = () => applyTheme(AUTO_THEME);
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, [theme]);

  // Inject a @font-face rule for any custom uploaded font.
  useEffect(() => {
    const fontUrl = portalConfig?.theme?.font_url;
    const fontFamily = portalConfig?.theme?.font_family;
    if (!fontUrl || !fontFamily) return;
    const style = document.createElement("style");
    style.setAttribute("data-custom-font", "1");
    style.textContent = `@font-face { font-family: "${fontFamily}"; src: url("${fontUrl}"); }`;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, [portalConfig?.theme?.font_url, portalConfig?.theme?.font_family]);

  // Actually apply the admin-selected font family to the page (previously
  // only the @font-face for a custom upload was injected above — the global
  // --font-stack variable the whole app renders with was never updated, so
  // picking a font in the admin panel had no visible effect). Falls back to
  // the bundled "UT Sans" + generic system stack when unset.
  useEffect(() => {
    const fontFamily = portalConfig?.theme?.font_family?.trim();
    document.documentElement.style.setProperty(
      "--font-stack",
      fontFamily
        ? `"${fontFamily}", "UT Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif`
        : `"UT Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`,
    );
  }, [portalConfig?.theme?.font_family]);

  const selectTheme = (selection: string) => {
    applyTheme(selection);
    localStorage.setItem(THEME_STORAGE_KEY, selection);
    setThemeMenuOpen(false);
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    const res = await login(password, authEmail.trim() || undefined);
    if (res.success) {
      setPassword("");
      setAuthEmail("");
      setAuthNotice(null);
      setAuthModalOpen(false);
      setAccountMenuOpen(false);
      handleSidebarLinkClick("dashboard");
    } else {
      setAuthError(res.error || translations[lang].authFailed);
    }
  };

  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthNotice(null);
    if (password !== confirmPassword) {
      setAuthError(t.passwordsDontMatch);
      return;
    }
    setSignupBusy(true);
    try {
      const result = await signup(authEmail.trim(), password);
      setPassword("");
      setConfirmPassword("");
      if (result.status === "verified") {
        setAuthNotice(t.signupVerifiedNotice);
        setAuthMode("login");
      } else {
        setAuthNotice(t.signupPendingNotice);
      }
    } catch (err) {
      setAuthError(toErrorMessage(err));
    } finally {
      setSignupBusy(false);
    }
  };

  const handleSidebarLinkClick = (pageName: string, elementId?: string) => {
    const nextHash = elementId || pageAnchors[pageName] || pageName;
    setPage(pageName);
    // Leaving the dashboard cancels card-rearrange mode.
    if (pageName !== "dashboard") setEditLayout(false);
    setScrollTarget(elementId || "");
    setAccountMenuOpen(false);
    if (window.location.hash !== `#${nextHash}`) {
      window.location.hash = nextHash;
    }
    if (window.innerWidth <= 768) {
      setSidebarOpen(false);
    }
    if (elementId && page === pageName) {
      const el = document.getElementById(elementId);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    } else if (!elementId) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleEmergencyStopClick = async () => {
    try {
      const res = await emergencyStop();
      if (res && res.status === "ok") {
        pushToast("success", t.emergencyStopSuccess);
      } else {
        pushToast("error", t.emergencyStopFailed);
      }
    } catch {
      pushToast("error", t.emergencyStopFailed);
    }
  };

  const handleLogoutClick = async () => {
    setAccountMenuOpen(false);
    await logout();
  };

  const handleNavUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleNavUploadFile = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const res = await uploadGcode(file);
      if (res.success) {
        pushToast("success", t.uploadSuccess.replace("{name}", file.name));
        handleSidebarLinkClick("dashboard");
        setUploadedFileName(res.filename || file.name);
        setIsUploadSafety(true);
        setSafetyModalOpen(true);
      } else {
        pushToast("error", res.error || t.uploadFailed);
      }
    } catch {
      pushToast("error", t.uploadFailed);
    }
  };

  const handlePendingUploadRequestPrint = (item: PendingUpload) => {
    setUploadedFileName(item.filename);
    setIsUploadSafety(true);
    setSafetyModalOpen(true);
  };

  const handlePendingUploadCancel = (id: string) => {
    void cancelPendingUpload(id);
  };

  const handlePendingUploadLoginClick = () => {
    setAuthMode("login");
    setAuthModalOpen(true);
  };

  const handlePendingUploadDismiss = () => {
    setDismissedPendingUploadIds(
      (current) => new Set([...current, ...pendingUploads.map((item) => item.id)]),
    );
  };

  // `start_print` clears the matching pending-upload queue entry
  // server-side (see backend/handlers/print_control.rs), but the banner
  // only learns that on its next poll (up to a few seconds later) unless
  // nudged — refresh right away so a confirmed file disappears immediately.
  const startPrintAndRefreshQueue = async (filename: string) => {
    const result = await startPrint(filename);
    void refreshPendingUploads();
    return result;
  };

  const t = translations[lang];

  // The signup email-verification link (GET /api/auth/verify-email) redirects
  // back here with a query param instead of a hash — surface it as a toast
  // once, then strip it so a refresh doesn't re-show it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("verified")) {
      pushToast("success", t.signupEmailVerifiedToast);
    } else if (params.has("verify_failed")) {
      pushToast("error", t.signupEmailVerifyFailedToast);
    } else {
      return;
    }
    params.delete("verified");
    params.delete("verify_failed");
    const query = params.toString();
    window.history.replaceState(
      null,
      "",
      window.location.pathname + (query ? `?${query}` : "") + window.location.hash,
    );
    // Runs once on mount only — the query string is a one-shot redirect
    // target, not app state to react to on every lang/pushToast change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isOffline = printerState.connection_state !== "connected";
  const isPrinterReady = !isOffline && printerState.klipper_state === "ready";
  const isOfflineOrNotReady = isOffline || !isPrinterReady;
  // Admins bypass; guests governed by [permissions].
  const isAuthenticated = role !== null;
  const {
    isAdmin,
    canUpload,
    canManageFiles,
    canViewGcode,
    canViewHeightmap,
    canViewFiles,
    canControlPrint,
    canControlMachine,
    canViewPower,
    canControlPower,
    canOpenMainsail,
    canOpenFluidd,
    canOpenOctoPrint,
  } = usePermissions(portalConfig, role);
  // isSafeUrl guards against a misconfigured (or malicious) javascript:/data:
  // URL in the admin config ever becoming a clickable link.
  const mainsailUrl = canOpenMainsail
    ? safeExternalUrl(portalConfig?.mainsail_url)
    : null;
  const fluiddUrl = canOpenFluidd
    ? safeExternalUrl(portalConfig?.fluidd_url)
    : null;
  const octoprintUrl = canOpenOctoPrint
    ? safeExternalUrl(portalConfig?.octoprint_url)
    : null;

  useEffect(() => {
    // Power devices/services come from Moonraker, which stays reachable even when
    // the printer (Klipper) is disconnected — so do NOT gate this on isOffline.
    // getPowerDevices throws only when Moonraker itself is unreachable.
    if (!canViewPower && !canControlMachine) {
      setNavPowerDevices([]);
      setNavServices([]);
      return;
    }

    let cancelled = false;
    const refresh = async () => {
      try {
        const [devices, services] = await Promise.all([
          canViewPower ? getPowerDevices() : Promise.resolve([]),
          canControlMachine ? getServices() : Promise.resolve([]),
        ]);
        if (!cancelled) {
          setNavPowerDevices(devices);
          setNavServices(
            services.filter((service) => service && service !== "klipper_mcu"),
          );
          setNavPowerError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setNavPowerError(toErrorMessage(err));
        }
      }
    };

    void refresh();
    const timer = window.setInterval(refresh, powerMenuOpen ? 5000 : 15000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [
    canControlMachine,
    canViewPower,
    getPowerDevices,
    getServices,
    isOffline,
    powerMenuOpen,
  ]);

  const togglePowerDevice = async (device: string) => {
    setNavPowerBusy(device);
    try {
      await setPowerDevice(device, "toggle");
      setNavPowerDevices(await getPowerDevices());
    } catch (err) {
      pushToast("error", toErrorMessage(err));
    } finally {
      setNavPowerBusy(null);
    }
  };

  const runPowerAction = async (id: string, action: () => Promise<any>) => {
    setNavPowerBusy(id);
    try {
      await action();
      if (canViewPower) setNavPowerDevices(await getPowerDevices());
    } catch (err) {
      pushToast("error", toErrorMessage(err));
    } finally {
      setNavPowerBusy(null);
    }
  };

  // Label is per-group, carried in the caller's own resolved permissions —
  // portalConfig.permissions already reflects the current caller's group.
  const powerDeviceAccess = portalConfig?.permissions?.power_devices ?? {};
  // The backend's /api/power/devices already filters by the caller's
  // resolved group permissions — no client-side visibility re-check needed.
  const visiblePowerDevices = navPowerDevices.filter(
    (device) => !device.device.startsWith("_"),
  );
  const powerMenuHasItems =
    visiblePowerDevices.length > 0 || canControlMachine || navServices.length > 0;

  const powerDeviceLabel = (device: { device: string; type?: string }) => {
    const access = powerDeviceAccess[device.device];
    const label = access?.label?.trim() || device.device;
    return device.type ? `${label} (${device.type})` : label;
  };

  // Fine-grained per-device control is enforced server-side (POST /api/power/device
  // 403s if not allowed); the client only needs the coarse control_power gate.
  const canTogglePowerDevice = (_device: { device: string }) => isAdmin || canControlPower;

  // Select logo: use admin-uploaded branding (starts with /api/) first,
  // fall back to bundled language-specific defaults. logo_light/logo_dark are
  // keyed by language code with a "default" fallback.
  const fallbackLogoLight = lang === "ro" ? logoRoRgb : logoEnRgb;
  const fallbackLogoDark = lang === "ro" ? logoRoAlb : logoEnWhite;
  const resolveLogoSrc = (
    map: Record<string, string> | undefined,
    fallback: string,
  ): string => {
    const field = pickLocalized(map, lang);
    if (field && field.startsWith("/api/")) return field;
    return fallback;
  };
  const logoSrc =
    themeMode === "light"
      ? resolveLogoSrc(portalConfig?.logo_light, fallbackLogoLight)
      : resolveLogoSrc(portalConfig?.logo_dark, fallbackLogoDark);
  // isSafeUrl drops any admin-configured link that isn't http/https (e.g. a
  // misconfigured javascript:/data: URL) before it can ever become clickable.
  const footerLinks = (portalConfig?.footer_links ?? []).filter((link) =>
    isSafeUrl(link.url),
  );
  const appName = pickLocalized(portalConfig?.app_name, lang, "3D Print Portal");

  useEffect(() => {
    document.title = appName;
  }, [appName]);

  return (
    <div className="app-container">
      {/* Header */}
      <AppHeader
        t={t}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        handleSidebarLinkClick={handleSidebarLinkClick}
        logoSrc={logoSrc}
        appName={appName}
        canUpload={canUpload}
        handleNavUploadClick={handleNavUploadClick}
        isOfflineOrNotReady={isOfflineOrNotReady}
        fileInputRef={fileInputRef}
        handleNavUploadFile={handleNavUploadFile}
        handleEmergencyStopClick={handleEmergencyStopClick}
        isOffline={isOffline}
        page={page}
        editLayout={editLayout}
        setEditLayout={setEditLayout}
        langSelectorRef={langSelectorRef}
        langDropdownOpen={langDropdownOpen}
        setLangDropdownOpen={setLangDropdownOpen}
        lang={lang}
        setLang={setLang}
        theme={theme}
        themeMode={themeMode}
        onSelectTheme={selectTheme}
        themeMenuOpen={themeMenuOpen}
        setThemeMenuOpen={setThemeMenuOpen}
        themeMenuRef={themeMenuRef}
        powerMenuHasItems={powerMenuHasItems}
        powerMenuRef={powerMenuRef}
        powerMenuOpen={powerMenuOpen}
        setPowerMenuOpen={setPowerMenuOpen}
        navPowerError={navPowerError}
        canControlMachine={canControlMachine}
        navPowerBusy={navPowerBusy}
        runPowerAction={runPowerAction}
        runMacro={runMacro}
        visiblePowerDevices={visiblePowerDevices}
        canTogglePowerDevice={canTogglePowerDevice}
        togglePowerDevice={togglePowerDevice}
        powerDeviceLabel={powerDeviceLabel}
        printerState={printerState}
        navServices={navServices}
        serviceAction={serviceAction}
        hostReboot={hostReboot}
        hostShutdown={hostShutdown}
      />

      {/* Main layout with sidebar and viewport */}
      <div className="app-main-layout">
        {/* Sidebar */}
        <AppSidebar
          t={t}
          sidebarOpen={sidebarOpen}
          page={page}
          handleSidebarLinkClick={handleSidebarLinkClick}
          canViewFiles={canViewFiles}
          canViewGcode={canViewGcode}
          canControlMachine={canControlMachine}
          canViewHeightmap={canViewHeightmap}
          rulesHeadings={rulesHeadings}
          rulesCollapsed={rulesCollapsed}
          setRulesCollapsed={setRulesCollapsed}
          scrollTarget={scrollTarget}
          troubleshootingHeadings={troubleshootingHeadings}
          guideCollapsed={guideCollapsed}
          setGuideCollapsed={setGuideCollapsed}
          accountMenuRef={accountMenuRef}
          accountMenuOpen={accountMenuOpen}
          setAccountMenuOpen={setAccountMenuOpen}
          isAuthenticated={isAuthenticated}
          handleLogoutClick={handleLogoutClick}
          setAuthModalOpen={setAuthModalOpen}
          isAdmin={isAdmin}
          mainsailUrl={mainsailUrl}
          fluiddUrl={fluiddUrl}
          octoprintUrl={octoprintUrl}
        />

        {/* Viewport content */}
        <div
          className={`main-viewport-content ${page === "dashboard" ? "dashboard-viewport" : ""}`}
        >
          {/* Upload Progress */}
          {uploadProgress !== null && (
            <div
              className="notification-banner success"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                textAlign: "left",
                marginBottom: "1.5rem",
              }}
            >
              <div style={{ fontWeight: "bold" }}>
                {t.uploading} ({uploadProgress}%)
              </div>
              <div
                style={{
                  height: "6px",
                  backgroundColor: "var(--border-color)",
                  borderRadius: "3px",
                  overflow: "hidden",
                  width: "100%",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    backgroundColor: "var(--success-color)",
                    width: `${uploadProgress}%`,
                  }}
                />
              </div>
            </div>
          )}

          {/* Active page */}
          <div id={pageAnchors[page] || page} className="active-view-container">
            {page === "rules" && (
              <Rules
                config={portalConfig}
                lang={lang}
                scrollTarget={scrollTarget}
              />
            )}
            {page === "troubleshooting" && (
              <Troubleshooting lang={lang} scrollTarget={scrollTarget} />
            )}
            {page === "gcode_files" && canViewFiles && (
              <GcodeFilesPage
                lang={lang}
                config={portalConfig}
                canControlPrint={canControlPrint}
                canManageFiles={canManageFiles}
                canUpload={canUpload}
                onListDirectory={listDirectory}
                onGetFileMetadata={getFileMetadata}
                onCreateDirectory={createDirectory}
                onMoveFile={moveFile}
                onDeleteGcodePath={deleteGcodePath}
                onDeleteDirectory={deleteDirectory}
                onUploadToDirectory={uploadToDirectory}
                onStartPrint={startPrint}
                onJobQueueAdd={jobQueueAdd}
              />
            )}
            {page === "gcode_viewer" && canViewGcode && (
              <GcodeViewer
                lang={lang}
                theme={themeMode}
                fileName={uploadedFileName || printerState?.filename || null}
                printerState={printerState}
                config={portalConfig}
              />
            )}
            {page === "history" && canViewFiles && (
              <HistoryPage
                lang={lang}
                config={portalConfig}
                canControlPrint={canControlPrint}
                onGetPrintHistory={getPrintHistory}
                onStartPrint={startPrint}
              />
            )}
            {page === "machine" && canControlMachine && (
              <MachinePage
                lang={lang}
                canControlMachine={canControlMachine}
                onRunMacro={runMacro}
                onGetServices={getServices}
                onServiceAction={serviceAction}
                onGetEndstops={getEndstops}
                onGetConfigFiles={getConfigFiles}
                onReadConfigFile={readConfigFile}
                onWriteConfigFile={writeConfigFile}
                onGetUpdateStatus={getUpdateStatus}
                onMachineUpdate={machineUpdate}
                onHostReboot={hostReboot}
                onHostShutdown={hostShutdown}
              />
            )}
            {page === "heightmap" && canViewHeightmap && (
              <Heightmap
                lang={lang}
                printerState={printerState}
                sendGcode={async (gcode) => {
                  try {
                    await runMacro(gcode);
                    return true;
                  } catch {
                    return false;
                  }
                }}
                config={portalConfig}
                role={role}
              />
            )}
            {page === "settings" && (
              <AdminSettings
                lang={lang}
                role={role}
                portalConfig={portalConfig}
                getAdminConfig={getAdminConfig}
                getAdminMacros={getAdminMacros}
                getAdminPowerDevices={getAdminPowerDevices}
                updateAdminConfig={updateAdminConfig}
                uploadAdminAsset={uploadAdminAsset}
                uploadAdminFont={uploadAdminFont}
                uploadFooterLinkIcon={uploadFooterLinkIcon}
                changeAdminPassword={changeAdminPassword}
                getAdminUsers={getAdminUsers}
                createAdminUser={createAdminUser}
                deleteAdminUser={deleteAdminUser}
                setAdminUserGroup={setAdminUserGroup}
                resendAdminUserVerification={resendAdminUserVerification}
                refreshConfig={refreshConfig}
              />
            )}
            {page === "audit" && (
              <AdminAudit
                lang={lang}
                role={role}
                getAdminAudit={getAdminAudit}
                getFileMetadata={getFileMetadata}
              />
            )}
            {page === "dashboard" && (
              <Dashboard
                state={printerState}
                config={portalConfig}
                role={role}
                lang={lang}
                theme={themeMode}
                editLayout={editLayout}
                uploadProgress={uploadProgress}
                onPreheat={preheat}
                onRunMacro={runMacro}
                onSendConsole={sendConsole}
                onGetConsoleCommands={getConsoleCommands}
                onGetAnnouncements={getAnnouncements}
                onSetFanSpeed={setFanSpeed}
                onExtrude={extrudeFilament}
                onManualProbe={manualProbe}
                onSetRetraction={setRetraction}
                onSetLimits={setLimits}
                onSetFlow={setFlow}
                onSetAuxFan={setAuxFan}
                onSetAuxPin={setAuxPin}
                onSetAuxLed={setAuxLed}
                onSetAuxHeater={setAuxHeater}
                onSetTmcCurrent={setTmcCurrent}
                onExcludeObject={excludeObject}
                onGetPowerDevices={getPowerDevices}
                onSetPowerDevice={setPowerDevice}
                onHostReboot={hostReboot}
                onHostShutdown={hostShutdown}
                onGetServices={getServices}
                onServiceAction={serviceAction}
                onGetEndstops={getEndstops}
                onGetConfigFiles={getConfigFiles}
                onReadConfigFile={readConfigFile}
                onWriteConfigFile={writeConfigFile}
                onGetUpdateStatus={getUpdateStatus}
                onMachineUpdate={machineUpdate}
                onGetPrintHistory={getPrintHistory}
                onGetGcodeFiles={getGcodeFiles}
                onGetFileMetadata={getFileMetadata}
                onDeleteGcodeFile={deleteGcodeFile}
                onGetJobQueue={getJobQueue}
                onJobQueueAdd={jobQueueAdd}
                onJobQueueDelete={jobQueueDelete}
                onJobQueueSetState={jobQueueSetState}
                onJog={jog}
                onMoveTo={moveTo}
                onHome={home}
                onDisableMotors={disableMotors}
                onSetTargetTemp={setTargetTemp}
                onSetSpeedFactor={setSpeedFactor}
                onStartPrint={startPrint}
                onPause={pausePrint}
                onResume={resumePrint}
                onCancel={cancelPrint}
                onUpload={async (file) => {
                  const res = await uploadGcode(file);
                  if (res.success) {
                    setUploadedFileName(res.filename || file.name);
                    setIsUploadSafety(true);
                    setSafetyModalOpen(true);
                  }
                  return res;
                }}
              />
            )}
          </div>

          {/* Footer */}
          <footer className="app-footer">
            <div>
              {t.appCopyright} {new Date().getFullYear()}{" "}
              <a
                href="https://github.com/Ariimeow78"
                target="_blank"
                rel="noopener noreferrer"
              >
                Ariimeow78
              </a>
              . {t.appFreeSoftwareLicensedUnder}{" "}
              <a
                href="https://www.gnu.org/licenses/agpl-3.0.html"
                target="_blank"
                rel="noopener noreferrer"
              >
                GNU AGPL-3.0
              </a>
              .
            </div>

            {/* Admin-configurable footer links (GitHub, institution links, etc.) */}
            {footerLinks.length > 0 && (
              <div className="footer-links">
                {footerLinks.map((link) => {
                  const PresetIcon = link.icon_url
                    ? footerPresetIconFor(link.icon_url)
                    : null;
                  return (
                    <a
                      key={link.id}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={link.label}
                    >
                      {PresetIcon ? (
                        <PresetIcon size={20} />
                      ) : link.icon_url ? (
                        <img src={link.icon_url} alt="" width={20} height={20} />
                      ) : (
                        <ExternalLink size={20} />
                      )}
                    </a>
                  );
                })}
              </div>
            )}
          </footer>
        </div>
      </div>

      {/* Safety & Warning Modal */}
      {safetyModalOpen && (
        <SafetyModal
          t={t}
          setSafetyModalOpen={setSafetyModalOpen}
          setIsUploadSafety={setIsUploadSafety}
          setUploadedFileName={setUploadedFileName}
          handleSidebarLinkClick={handleSidebarLinkClick}
          isUploadSafety={isUploadSafety}
          countdown={countdown}
          uploadedFileName={uploadedFileName}
          startPrint={startPrintAndRefreshQueue}
          pushToast={pushToast}
        />
      )}

      {/* Only one modal on screen at a time — the pending-uploads modal
          hides itself while the safety/auth modal is up (e.g. after
          clicking "Log in to print" from within it) instead of sitting on
          top of it; it reappears once that modal closes, since the queued
          file itself is unaffected either way. */}
      {!safetyModalOpen &&
        !(authModalOpen ||
          (authRequired && page !== "rules" && page !== "troubleshooting")) && (
          <PendingUploadsBanner
            t={t}
            items={visiblePendingUploads}
            canControlPrint={canControlPrint}
            isLoggedIn={isAuthenticated}
            onRequestPrint={handlePendingUploadRequestPrint}
            onCancel={handlePendingUploadCancel}
            onLoginClick={handlePendingUploadLoginClick}
            onDismiss={handlePendingUploadDismiss}
          />
        )}

      {/* Auth Modal / Portal Lock */}
      {(authModalOpen ||
        (authRequired && page !== "rules" && page !== "troubleshooting")) && (
        <AuthModal
          t={t}
          handleLoginSubmit={handleLoginSubmit}
          handleSignupSubmit={handleSignupSubmit}
          authMode={authMode}
          setAuthMode={setAuthMode}
          authEmail={authEmail}
          setAuthEmail={setAuthEmail}
          password={password}
          setPassword={setPassword}
          confirmPassword={confirmPassword}
          setConfirmPassword={setConfirmPassword}
          authError={authError}
          authNotice={authNotice}
          signupBusy={signupBusy}
          signupEnabled={Boolean(portalConfig?.auth?.signup_enabled)}
          signupAllowedDomains={portalConfig?.auth?.signup_allowed_domains ?? []}
          authRequired={authRequired}
          setAuthModalOpen={setAuthModalOpen}
        />
      )}
    </div>
  );
};

export default App;

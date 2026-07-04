import React, { useState, useEffect, useRef } from "react";
import { usePrinterState } from "./usePrinterState";
import { Rules } from "./pages/Rules";
import { Troubleshooting } from "./pages/Troubleshooting";
import { Dashboard } from "./pages/Dashboard";
import { GcodeViewer } from "./pages/GcodeViewer";
import { Heightmap } from "./pages/Heightmap";
import {
  Sun,
  Moon,
  Lock,
  Menu,
  ChevronDown,
  ChevronUp,
  Globe,
  Upload,
  AlertTriangle,
  X,
  Compass,
  Eye,
  LayoutDashboard,
  BookOpen,
  Wrench,
  FileText,
} from "lucide-react";
import { translations } from "./translations";

// Logo imports
import logoRoRgb from "./assets/unitbv/logo/RO/Logo-UT-IESC-RGB-RO.png";
import logoRoAlb from "./assets/unitbv/logo/RO/Logo-UT-IESC-ALB-RO.png";
import logoEnRgb from "./assets/unitbv/logo/EN/Logo-UT-IESC-RGB-EN.png";
import logoEnWhite from "./assets/unitbv/logo/EN/Logo-UT-IESC-WHITE-EN.png";

// Hero main image import
import mainImage from "./assets/main.webp";

const pageAnchors: Record<string, string> = {
  dashboard: "dashboard",
  gcode_viewer: "gcode-3d",
  heightmap: "heightmap",
  rules: "regulament",
  troubleshooting: "proceduri-standard",
};

const hashTargets: Record<string, { page: string; target?: string }> = {
  dashboard: { page: "dashboard" },
  "gcode-3d": { page: "gcode_viewer" },
  heightmap: { page: "heightmap" },
  regulament: { page: "rules" },
  rules: { page: "rules" },
  ghid: { page: "troubleshooting", target: "proceduri-standard" },
  "proceduri-standard": {
    page: "troubleshooting",
    target: "proceduri-standard",
  },
  "cum-se-incarca-corect-filamentul": {
    page: "troubleshooting",
    target: "cum-se-incarca-corect-filamentul",
  },
  "cum-se-face-nivelarea-manuala-bed-leveling": {
    page: "troubleshooting",
    target: "cum-se-face-nivelarea-manuala-bed-leveling",
  },
  depanare: { page: "troubleshooting", target: "ce-fac-in-caz-de" },
  "ce-fac-in-caz-de": {
    page: "troubleshooting",
    target: "ce-fac-in-caz-de",
  },
};

const getHashTarget = () => {
  const hash = window.location.hash.replace(/^#/, "");
  return hashTargets[hash] || { page: "rules" };
};

const App: React.FC = () => {
  const {
    printerState,
    portalConfig,
    role,
    authRequired,
    uploadProgress,
    login,
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
  } = usePrinterState();

  const [page, setPage] = useState<string>("rules");
  const getPreferredTheme = (): "light" | "dark" => {
    if (typeof window === "undefined") return "dark";
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "light" || savedTheme === "dark") return savedTheme;
    return window.matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark";
  };

  const applyTheme = (nextTheme: "light" | "dark") => {
    setTheme(nextTheme);
    document.documentElement.setAttribute("data-theme", nextTheme);
    document.documentElement.style.colorScheme = nextTheme;
  };

  const [theme, setTheme] = useState<"light" | "dark">(getPreferredTheme);
  const [lang, setLang] = useState<"ro" | "en">("ro");
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
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
  const [guideCollapsed, setGuideCollapsed] = useState(false);
  const [troubleCollapsed, setTroubleCollapsed] = useState(false);
  const [langDropdownOpen, setLangDropdownOpen] = useState(false);
  const [scrollTarget, setScrollTarget] = useState<string>("");
  const langSelectorRef = useRef<HTMLDivElement>(null);

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

  // Status and notification states
  const [notification, setNotification] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const applyHashTarget = () => {
      const target = getHashTarget();
      setPage(target.page);
      setScrollTarget(target.target || "");
    };

    applyHashTarget();
    window.addEventListener("hashchange", applyHashTarget);
    return () => window.removeEventListener("hashchange", applyHashTarget);
  }, []);

  // Initialize theme & language
  useEffect(() => {
    const savedTheme = localStorage.getItem("theme") as "light" | "dark" | null;
    const systemTheme = window.matchMedia("(prefers-color-scheme: light)")
      .matches
      ? "light"
      : "dark";
    applyTheme(savedTheme || systemTheme);

    const savedLang = localStorage.getItem("lang") as "ro" | "en" | null;
    if (savedLang === "ro" || savedLang === "en") {
      setLang(savedLang);
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === "dark" ? "light" : "dark";
    applyTheme(newTheme);
    localStorage.setItem("theme", newTheme);
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    const res = await login(password);
    if (res.success) {
      setPassword("");
      setAuthModalOpen(false);
      handleSidebarLinkClick("dashboard");
    } else {
      setAuthError(res.error || translations[lang].authFailed);
    }
  };

  const handleSidebarLinkClick = (pageName: string, elementId?: string) => {
    const nextHash = elementId || pageAnchors[pageName] || pageName;
    setPage(pageName);
    setScrollTarget(elementId || "");
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
        setNotification({
          type: "success",
          message: t.emergencyStopSuccess,
        });
      } else {
        setNotification({
          type: "error",
          message: t.emergencyStopFailed,
        });
      }
    } catch {
      setNotification({
        type: "error",
        message: t.emergencyStopFailed,
      });
    }
    setTimeout(() => setNotification(null), 5000);
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
        setNotification({
          type: "success",
          message: t.uploadSuccess.replace("{name}", file.name),
        });
        handleSidebarLinkClick("dashboard");
        setUploadedFileName(res.filename || file.name);
        setIsUploadSafety(true);
        setSafetyModalOpen(true);
      } else {
        setNotification({
          type: "error",
          message: res.error || t.uploadFailed,
        });
      }
    } catch {
      setNotification({
        type: "error",
        message: t.uploadFailed,
      });
    }
    setTimeout(() => setNotification(null), 5000);
  };

  const t = translations[lang];
  const isOffline = printerState.connection_state !== "connected";

  // Select logo based on language & theme
  const logoSrc =
    lang === "ro"
      ? theme === "light"
        ? logoRoRgb
        : logoRoAlb
      : theme === "light"
        ? logoEnRgb
        : logoEnWhite;

  return (
    <div className="app-container">
      {/* Header */}
      <header>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <button
            className="btn-menu-toggle"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            title={t.sidebarToggle}
          >
            <Menu size={20} />
          </button>

          <div
            className="logo-container"
            onClick={() => handleSidebarLinkClick("dashboard")}
            style={{ cursor: "pointer" }}
          >
            <img
              src={logoSrc}
              alt="IESC Logo"
              className="logo-img"
              style={{ height: "45px" }}
            />
            <div className="app-title-group" style={{ marginLeft: "8px" }}>
              <h1 style={{ fontSize: "1.1rem" }}>{t.appTitle}</h1>
            </div>
          </div>
        </div>

        <div className="header-controls">
          {/* Upload GCode Button in Header */}
          <button
            className="btn btn-upload-nav"
            onClick={handleNavUploadClick}
            disabled={isOffline}
          >
            <Upload size={16} />
            <span className="hide-mobile">G-code</span>
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleNavUploadFile}
            accept=".gcode,.gco"
            style={{ display: "none" }}
            disabled={isOffline}
          />

          {/* Emergency Stop Button in Header */}
          <button
            className="btn btn-danger btn-estop"
            onClick={handleEmergencyStopClick}
            disabled={isOffline}
          >
            <AlertTriangle size={16} />
            {t.emergencyStop}
          </button>

          {/* Language selection dropdown icon */}
          <div
            className="lang-selector-container"
            style={{ position: "relative" }}
            ref={langSelectorRef}
          >
            <button
              className="btn-lang-toggle"
              onClick={() => setLangDropdownOpen(!langDropdownOpen)}
              style={{
                background: "transparent",
                border: "1px solid var(--border-color)",
                color: "var(--text-primary)",
                padding: "8px",
                borderRadius: "50%",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              title={t.languageSelect}
            >
              <Globe size={18} />
            </button>
            {langDropdownOpen && (
              <div
                className="lang-dropdown"
                style={{
                  position: "absolute",
                  top: "100%",
                  right: 0,
                  marginTop: "8px",
                  backgroundColor: "var(--surface-color)",
                  border: "1px solid var(--border-color)",
                  borderRadius: "var(--border-radius)",
                  boxShadow: "0 4px 12px var(--shadow-color)",
                  zIndex: 20,
                  display: "flex",
                  flexDirection: "column",
                  minWidth: "120px",
                  overflow: "hidden",
                }}
              >
                <button
                  onClick={() => {
                    setLang("ro");
                    localStorage.setItem("lang", "ro");
                    setLangDropdownOpen(false);
                  }}
                  style={{
                    padding: "10px 16px",
                    background: "none",
                    border: "none",
                    color: "var(--text-primary)",
                    textAlign: "left",
                    cursor: "pointer",
                    fontWeight: lang === "ro" ? "bold" : "normal",
                    backgroundColor:
                      lang === "ro" ? "var(--accent-light)" : "transparent",
                  }}
                >
                  Română (RO)
                </button>
                <button
                  onClick={() => {
                    setLang("en");
                    localStorage.setItem("lang", "en");
                    setLangDropdownOpen(false);
                  }}
                  style={{
                    padding: "10px 16px",
                    background: "none",
                    border: "none",
                    color: "var(--text-primary)",
                    textAlign: "left",
                    cursor: "pointer",
                    fontWeight: lang === "en" ? "bold" : "normal",
                    backgroundColor:
                      lang === "en" ? "var(--accent-light)" : "transparent",
                  }}
                >
                  English (EN)
                </button>
              </div>
            )}
          </div>

          <button
            className="btn-theme-toggle"
            onClick={toggleTheme}
            title={t.themeToggle}
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          {/* Mainsail Redirect Button */}
          {portalConfig?.mainsail_url &&
            portalConfig.mainsail_url.trim() !== "" && (
              <a
                className="btn-theme-toggle"
                href={portalConfig.mainsail_url}
                target="_blank"
                rel="noopener noreferrer"
                title="Mainsail"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  textDecoration: "none",
                }}
              >
                <Compass size={18} />
              </a>
            )}
        </div>
      </header>

      {/* Main layout with sidebar and viewport */}
      <div className="app-main-layout">
        {/* Sidebar */}
        <aside className={`sidebar ${sidebarOpen ? "open" : "closed"}`}>
          {/* Section: Dashboard */}
          <div className="sidebar-section">
            <button
              className={`sidebar-header-btn single ${page === "dashboard" ? "active" : ""}`}
              onClick={() => handleSidebarLinkClick("dashboard")}
            >
              <span className="sidebar-icon-label">
                <LayoutDashboard size={16} />
                <span className="sidebar-label-text">{t.dashboard}</span>
              </span>
            </button>
          </div>

          <hr className="sidebar-divider" />

          {/* Section: 3D G-Code Viewer */}
          <div className="sidebar-section">
            <button
              className={`sidebar-header-btn single ${page === "gcode_viewer" ? "active" : ""}`}
              onClick={() => handleSidebarLinkClick("gcode_viewer")}
            >
              <span className="sidebar-icon-label">
                <Eye size={16} />
                <span className="sidebar-label-text">
                  {lang === "ro" ? "Vizualizare 3D G-Code" : "3D GCode view"}
                </span>
              </span>
            </button>
          </div>

          <hr className="sidebar-divider compact" />

          {/* Section: Heightmap */}
          <div className="sidebar-section">
            <button
              className={`sidebar-header-btn single ${page === "heightmap" ? "active" : ""}`}
              onClick={() => handleSidebarLinkClick("heightmap")}
            >
              <span className="sidebar-icon-label">
                <Compass size={16} />
                <span className="sidebar-label-text">Heightmap</span>
              </span>
            </button>
          </div>

          <hr className="sidebar-divider" />

          {/* Section: Regulament (standalone) */}
          <div className="sidebar-section">
            <button
              className={`sidebar-header-btn single ${page === "rules" ? "active" : ""}`}
              onClick={() => handleSidebarLinkClick("rules")}
            >
              <span className="sidebar-icon-label">
                <FileText size={16} />
                <span className="sidebar-label-text">{t.rules}</span>
              </span>
            </button>
          </div>

          <hr className="sidebar-divider" />

          {/* Section: Ghid (Guide) - collapsible */}
          <div className="sidebar-section">
            <div className="sidebar-header-row">
              <button
                className={`sidebar-header-btn ${page === "troubleshooting" && scrollTarget.startsWith("proceduri") ? "active" : ""}`}
                onClick={() =>
                  handleSidebarLinkClick(
                    "troubleshooting",
                    "proceduri-standard",
                  )
                }
              >
                <span className="sidebar-icon-label">
                  <BookOpen size={16} />
                  <span className="sidebar-label-text">
                    {lang === "ro" ? "Ghid" : "Guide"}
                  </span>
                </span>
              </button>
              <button
                className="sidebar-collapse-btn"
                onClick={() => setGuideCollapsed(!guideCollapsed)}
                title={guideCollapsed ? "Expand" : "Collapse"}
              >
                {guideCollapsed ? (
                  <ChevronDown size={14} />
                ) : (
                  <ChevronUp size={14} />
                )}
              </button>
            </div>
            {!guideCollapsed && (
              <div className="sidebar-links">
                <button
                  className={`sidebar-link ${page === "troubleshooting" && scrollTarget === "proceduri-standard" ? "active" : ""}`}
                  onClick={() =>
                    handleSidebarLinkClick(
                      "troubleshooting",
                      "proceduri-standard",
                    )
                  }
                >
                  {lang === "ro" ? "Proceduri Standard" : "Standard Procedures"}
                </button>
                <button
                  className={`sidebar-link sub ${page === "troubleshooting" && scrollTarget === "cum-se-incarca-corect-filamentul" ? "active" : ""}`}
                  onClick={() =>
                    handleSidebarLinkClick(
                      "troubleshooting",
                      "cum-se-incarca-corect-filamentul",
                    )
                  }
                >
                  {lang === "ro" ? "Încărcare Filament" : "Filament Loading"}
                </button>
                <button
                  className={`sidebar-link sub ${page === "troubleshooting" && scrollTarget === "cum-se-face-nivelarea-manuala-bed-leveling" ? "active" : ""}`}
                  onClick={() =>
                    handleSidebarLinkClick(
                      "troubleshooting",
                      "cum-se-face-nivelarea-manuala-bed-leveling",
                    )
                  }
                >
                  {lang === "ro" ? "Nivelare Pat" : "Bed Leveling"}
                </button>
              </div>
            )}
          </div>

          {/* Section: Depanare (Troubleshooting) - collapsible */}
          <div className="sidebar-section">
            <div className="sidebar-header-row">
              <button
                className={`sidebar-header-btn ${page === "troubleshooting" && scrollTarget === "ce-fac-in-caz-de" ? "active" : ""}`}
                onClick={() =>
                  handleSidebarLinkClick("troubleshooting", "ce-fac-in-caz-de")
                }
              >
                <span className="sidebar-icon-label">
                  <Wrench size={16} />
                  <span className="sidebar-label-text">
                    {lang === "ro" ? "Depanare" : "Troubleshooting"}
                  </span>
                </span>
              </button>
              <button
                className="sidebar-collapse-btn"
                onClick={() => setTroubleCollapsed(!troubleCollapsed)}
                title={troubleCollapsed ? "Expand" : "Collapse"}
              >
                {troubleCollapsed ? (
                  <ChevronDown size={14} />
                ) : (
                  <ChevronUp size={14} />
                )}
              </button>
            </div>
            {!troubleCollapsed && (
              <div className="sidebar-links">
                <button
                  className={`sidebar-link ${page === "troubleshooting" && scrollTarget === "ce-fac-in-caz-de" ? "active" : ""}`}
                  onClick={() =>
                    handleSidebarLinkClick(
                      "troubleshooting",
                      "ce-fac-in-caz-de",
                    )
                  }
                >
                  {lang === "ro" ? "Ce fac în caz de..." : "What if..."}
                </button>
              </div>
            )}
          </div>
        </aside>

        {/* Viewport content */}
        <div
          className={`main-viewport-content ${page === "dashboard" ? "dashboard-viewport" : ""}`}
        >
          {/* Notifications */}
          {notification && (
            <div className={`notification-banner ${notification.type}`}>
              <span>{notification.message}</span>
            </div>
          )}

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
            {page === "gcode_viewer" && (
              <GcodeViewer
                lang={lang}
                theme={theme}
                fileName={uploadedFileName || printerState?.filename || null}
                printerState={printerState}
                config={portalConfig}
              />
            )}
            {page === "heightmap" && (
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
              />
            )}
            {page === "dashboard" && (
              <Dashboard
                state={printerState}
                config={portalConfig}
                role={role}
                lang={lang}
                theme={theme}
                uploadProgress={uploadProgress}
                onPreheat={preheat}
                onRunMacro={runMacro}
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
              © {new Date().getFullYear()} {t.university} - {t.faculty}.{" "}
              {t.footerText}{" "}
              {lang === "ro" ? "Licențiat sub" : "Licensed under"}{" "}
              <a
                href="https://www.gnu.org/licenses/agpl-3.0.html"
                target="_blank"
                rel="noopener noreferrer"
              >
                GNU AGPL-3.0
              </a>
              .
            </div>

            {/* Social / Link Icons */}
            <div className="footer-links">
              <a
                href="https://www.unitbv.ro"
                target="_blank"
                rel="noopener noreferrer"
                title="UNITBV"
              >
                <span className="ut-symbol">U</span>
              </a>
              <a
                href="https://iesc.unitbv.ro"
                target="_blank"
                rel="noopener noreferrer"
                title="IESC"
              >
                <span className="ut-symbol">E</span>
              </a>
              <a
                href="https://github.com/TheRealOne78/klipper-mainpage-iesc"
                target="_blank"
                rel="noopener noreferrer"
                title="GitHub Repository"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
                  <path d="M9 18c-4.51 2-5-2-7-2" />
                </svg>
              </a>
            </div>
          </footer>
        </div>
      </div>

      {/* Safety & Warning Modal */}
      {safetyModalOpen && (
        <div className="modal-overlay" style={{ zIndex: 110 }}>
          <div
            className="modal-content"
            style={{
              width: "90%",
              maxWidth: "800px",
              maxHeight: "95vh",
              overflowY: "auto",
              position: "relative",
              padding: "2rem",
            }}
          >
            {/* X button — outside the warning div */}
            <button
              onClick={() => {
                setSafetyModalOpen(false);
                setIsUploadSafety(false);
                setUploadedFileName(null);
              }}
              style={{
                position: "absolute",
                top: "12px",
                right: "12px",
                background: "transparent",
                border: "none",
                color: "var(--text-secondary)",
                cursor: "pointer",
                padding: "4px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 2,
              }}
              title={lang === "ro" ? "Închide" : "Close"}
            >
              <X size={24} />
            </button>

            <div
              className="big-red-warning"
              style={{
                marginBottom: "1.5rem",
                padding: "2rem",
                display: "flex",
                alignItems: "center",
                gap: "16px",
              }}
            >
              <AlertTriangle
                size={36}
                className="warning-icon"
                style={{ flexShrink: 0 }}
              />
              <span
                style={{
                  fontSize: "1.35rem",
                  fontWeight: "800",
                  lineHeight: "1.4",
                }}
              >
                {t.bigRedWarning}
              </span>
            </div>

            <div
              className="hero-image-container"
              style={{
                marginBottom: "1.5rem",
                boxShadow: "none",
                border: "none",
              }}
            >
              <img
                src={mainImage}
                className="hero-img-full"
                alt="Warning Illustration"
              />
            </div>

            {/* Navigation buttons: Go to Rules, Go to Instructions */}
            <div
              style={{ display: "flex", gap: "12px", marginBottom: "1.5rem" }}
            >
              <button
                className="btn"
                style={{
                  flex: 1,
                  padding: "12px",
                  fontWeight: "600",
                  fontSize: "1rem",
                }}
                onClick={() => {
                  handleSidebarLinkClick("rules");
                  setSafetyModalOpen(false);
                  setIsUploadSafety(false);
                  setUploadedFileName(null);
                }}
              >
                {lang === "ro" ? "Vezi regulamentul" : "View rules"}
              </button>
              <button
                className="btn"
                style={{
                  flex: 1,
                  padding: "12px",
                  fontWeight: "600",
                  fontSize: "1rem",
                }}
                onClick={() => {
                  handleSidebarLinkClick(
                    "troubleshooting",
                    "proceduri-standard",
                  );
                  setSafetyModalOpen(false);
                  setIsUploadSafety(false);
                  setUploadedFileName(null);
                }}
              >
                {lang === "ro" ? "Vezi instrucțiunile" : "View instructions"}
              </button>
            </div>

            {/* Bottom action buttons — only shown for upload flow */}
            {isUploadSafety && (
              <div style={{ display: "flex", gap: "12px" }}>
                <button
                  className="btn"
                  style={{
                    flex: 1,
                    padding: "14px",
                    fontWeight: "bold",
                    fontSize: "1.05rem",
                  }}
                  onClick={() => {
                    setSafetyModalOpen(false);
                    setIsUploadSafety(false);
                    setUploadedFileName(null);
                  }}
                >
                  {lang === "ro" ? "Renunță" : "Cancel"}
                </button>
                <button
                  className="btn btn-primary"
                  disabled={countdown > 0}
                  onClick={async () => {
                    if (uploadedFileName) {
                      try {
                        await startPrint(uploadedFileName);
                        setNotification({
                          type: "success",
                          message: t.printStarted,
                        });
                      } catch {
                        setNotification({
                          type: "error",
                          message: t.printStartFailed,
                        });
                      }
                      setTimeout(() => setNotification(null), 5000);
                    }
                    setSafetyModalOpen(false);
                    setIsUploadSafety(false);
                    setUploadedFileName(null);
                  }}
                  style={{
                    flex: 1,
                    padding: "14px",
                    fontWeight: "bold",
                    fontSize: "1.05rem",
                    backgroundColor:
                      countdown > 0
                        ? "var(--border-color)"
                        : "var(--accent-color)",
                    cursor: countdown > 0 ? "not-allowed" : "pointer",
                  }}
                >
                  {lang === "ro"
                    ? `Am înțeles, printează ${countdown > 0 ? `(${countdown}s)` : ""}`
                    : `I understand, print ${countdown > 0 ? `(${countdown}s)` : ""}`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Auth Modal / Portal Lock */}
      {(authModalOpen ||
        (authRequired && page !== "rules" && page !== "troubleshooting")) && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div
              style={{
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <Lock size={36} style={{ color: "var(--accent-color)" }} />
              <h3>{t.authTitle}</h3>
              <p
                style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}
              >
                {t.authSubtitle}
              </p>
            </div>

            <form
              onSubmit={handleLoginSubmit}
              style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
            >
              <div className="form-group">
                <label htmlFor="auth-password">{t.passwordLabel}</label>
                <input
                  type="password"
                  id="auth-password"
                  className="form-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t.passwordPlaceholder}
                  required
                />
              </div>

              {authError && (
                <div
                  style={{
                    color: "var(--danger-color)",
                    fontSize: "0.85rem",
                    fontWeight: "500",
                  }}
                >
                  {authError}
                </div>
              )}

              <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                {!authRequired && (
                  <button
                    type="button"
                    className="btn"
                    style={{ flex: 1 }}
                    onClick={() => setAuthModalOpen(false)}
                  >
                    {t.cancelButton}
                  </button>
                )}
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                >
                  {t.loginButton}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;

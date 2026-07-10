import React from "react";
import type { Dispatch, SetStateAction, RefObject } from "react";
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  Compass,
  Cpu,
  ExternalLink,
  Eye,
  FileText,
  FolderOpen,
  History,
  LayoutDashboard,
  LogIn,
  LogOut,
  ScrollText,
  Settings,
  UserRound,
} from "lucide-react";
import type { ContentHeading } from "../../hooks/useContentHeadings";
import type { Translations } from "../../translations";

interface AppSidebarProps {
  t: Translations;
  sidebarOpen: boolean;
  page: string;
  handleSidebarLinkClick: (pageName: string, elementId?: string) => void;
  canViewFiles: boolean;
  canViewGcode: boolean;
  canControlMachine: boolean;
  canViewHeightmap: boolean;
  rulesHeadings: ContentHeading[];
  rulesCollapsed: boolean;
  setRulesCollapsed: Dispatch<SetStateAction<boolean>>;
  scrollTarget: string;
  troubleshootingHeadings: ContentHeading[];
  guideCollapsed: boolean;
  setGuideCollapsed: Dispatch<SetStateAction<boolean>>;
  accountMenuRef: RefObject<HTMLDivElement | null>;
  accountMenuOpen: boolean;
  setAccountMenuOpen: Dispatch<SetStateAction<boolean>>;
  isAuthenticated: boolean;
  handleLogoutClick: () => Promise<void>;
  setAuthModalOpen: Dispatch<SetStateAction<boolean>>;
  isAdmin: boolean;
  mainsailUrl: string | null;
  fluiddUrl: string | null;
  octoprintUrl: string | null;
}

export const AppSidebar: React.FC<AppSidebarProps> = ({
  t,
  sidebarOpen,
  page,
  handleSidebarLinkClick,
  canViewFiles,
  canViewGcode,
  canControlMachine,
  canViewHeightmap,
  rulesHeadings,
  rulesCollapsed,
  setRulesCollapsed,
  scrollTarget,
  troubleshootingHeadings,
  guideCollapsed,
  setGuideCollapsed,
  accountMenuRef,
  accountMenuOpen,
  setAccountMenuOpen,
  isAuthenticated,
  handleLogoutClick,
  setAuthModalOpen,
  isAdmin,
  mainsailUrl,
  fluiddUrl,
  octoprintUrl,
}) => (
  <aside className={`sidebar ${sidebarOpen ? "open" : "closed"}`}>
  <div className="sidebar-scroll">
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

    {canViewFiles && (
      <>
        <div className="sidebar-section">
          <button
            className={`sidebar-header-btn single ${page === "gcode_files" ? "active" : ""}`}
            onClick={() => handleSidebarLinkClick("gcode_files")}
          >
            <span className="sidebar-icon-label">
              <FolderOpen size={16} />
              <span className="sidebar-label-text">
                {t.appNavFiles}
              </span>
            </span>
          </button>
        </div>

        <hr className="sidebar-divider compact" />
      </>
    )}

    {canViewGcode && (
      <>
        {/* Section: 3D G-Code Viewer */}
        <div className="sidebar-section">
          <button
            className={`sidebar-header-btn single ${page === "gcode_viewer" ? "active" : ""}`}
            onClick={() => handleSidebarLinkClick("gcode_viewer")}
          >
            <span className="sidebar-icon-label">
              <Eye size={16} />
              <span className="sidebar-label-text">
                {t.appNavGcodeView}
              </span>
            </span>
          </button>
        </div>

        <hr className="sidebar-divider compact" />
      </>
    )}

    {canViewFiles && (
      <>
        <div className="sidebar-section">
          <button
            className={`sidebar-header-btn single ${page === "history" ? "active" : ""}`}
            onClick={() => handleSidebarLinkClick("history")}
          >
            <span className="sidebar-icon-label">
              <History size={16} />
              <span className="sidebar-label-text">
                {t.appNavHistory}
              </span>
            </span>
          </button>
        </div>

        <hr className="sidebar-divider compact" />
      </>
    )}

    {canControlMachine && (
      <>
        <div className="sidebar-section">
          <button
            className={`sidebar-header-btn single ${page === "machine" ? "active" : ""}`}
            onClick={() => handleSidebarLinkClick("machine")}
          >
            <span className="sidebar-icon-label">
              <Cpu size={16} />
              <span className="sidebar-label-text">{t.machine}</span>
            </span>
          </button>
        </div>

        <hr className="sidebar-divider compact" />
      </>
    )}

    {canViewHeightmap && (
      <>
        {/* Section: Heightmap */}
        <div className="sidebar-section">
          <button
            className={`sidebar-header-btn single ${page === "heightmap" ? "active" : ""}`}
            onClick={() => handleSidebarLinkClick("heightmap")}
          >
            <span className="sidebar-icon-label">
              <Compass size={16} />
              <span className="sidebar-label-text">{t.heightmap}</span>
            </span>
          </button>
        </div>

        <hr className="sidebar-divider" />
      </>
    )}

    {/* Section: Regulament (Rules) — headings pulled live from rules.md */}
    <div className="sidebar-section">
      {rulesHeadings.length === 0 ? (
        <button
          className={`sidebar-header-btn single ${page === "rules" ? "active" : ""}`}
          onClick={() => handleSidebarLinkClick("rules")}
        >
          <span className="sidebar-icon-label">
            <FileText size={16} />
            <span className="sidebar-label-text">{t.rules}</span>
          </span>
        </button>
      ) : (
        <>
          <div className="sidebar-header-row">
            <button
              className={`sidebar-header-btn ${page === "rules" ? "active" : ""}`}
              onClick={() => handleSidebarLinkClick("rules")}
            >
              <span className="sidebar-icon-label">
                <FileText size={16} />
                <span className="sidebar-label-text">{t.rules}</span>
              </span>
            </button>
            <button
              className="sidebar-collapse-btn"
              onClick={() => setRulesCollapsed(!rulesCollapsed)}
              title={rulesCollapsed ? t.expand : t.collapse}
            >
              {rulesCollapsed ? (
                <ChevronDown size={14} />
              ) : (
                <ChevronUp size={14} />
              )}
            </button>
          </div>
          {!rulesCollapsed && (
            <div className="sidebar-links">
              {rulesHeadings.map((h) => (
                <button
                  key={h.id}
                  className={`sidebar-link sidebar-link-h${h.level} ${page === "rules" && scrollTarget === h.id ? "active" : ""}`}
                  onClick={() => handleSidebarLinkClick("rules", h.id)}
                >
                  {h.text}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>

    <hr className="sidebar-divider" />

    {/* Section: Ghid (Guide) — headings pulled live from troubleshooting.md */}
    <div className="sidebar-section">
      {troubleshootingHeadings.length === 0 ? (
        <button
          className={`sidebar-header-btn single ${page === "troubleshooting" ? "active" : ""}`}
          onClick={() => handleSidebarLinkClick("troubleshooting")}
        >
          <span className="sidebar-icon-label">
            <BookOpen size={16} />
            <span className="sidebar-label-text">{t.appNavGuide}</span>
          </span>
        </button>
      ) : (
        <>
          <div className="sidebar-header-row">
            <button
              className={`sidebar-header-btn ${page === "troubleshooting" ? "active" : ""}`}
              onClick={() => handleSidebarLinkClick("troubleshooting")}
            >
              <span className="sidebar-icon-label">
                <BookOpen size={16} />
                <span className="sidebar-label-text">
                  {t.appNavGuide}
                </span>
              </span>
            </button>
            <button
              className="sidebar-collapse-btn"
              onClick={() => setGuideCollapsed(!guideCollapsed)}
              title={guideCollapsed ? t.expand : t.collapse}
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
              {troubleshootingHeadings.map((h) => (
                <button
                  key={h.id}
                  className={`sidebar-link sidebar-link-h${h.level} ${page === "troubleshooting" && scrollTarget === h.id ? "active" : ""}`}
                  onClick={() =>
                    handleSidebarLinkClick("troubleshooting", h.id)
                  }
                >
                  {h.text}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  </div>

    <div className="sidebar-section sidebar-account-section" ref={accountMenuRef}>
      <button
        className={`sidebar-header-btn single sidebar-account-toggle ${accountMenuOpen ? "active" : ""}`}
        onClick={() => setAccountMenuOpen((open) => !open)}
        title={t.accountMenu}
      >
        <span className="sidebar-icon-label">
          <UserRound size={16} />
          <span className="sidebar-label-text">{t.accountMenu}</span>
        </span>
      </button>
      {accountMenuOpen && (
        <div className="sidebar-account-menu">
          {isAuthenticated ? (
            <button onClick={() => void handleLogoutClick()}>
              <LogOut size={14} />
              {t.logout}
            </button>
          ) : (
            <button
              onClick={() => {
                setAuthModalOpen(true);
                setAccountMenuOpen(false);
              }}
            >
              <LogIn size={14} />
              {t.login}
            </button>
          )}

          {isAdmin && (
            <>
              <button
                onClick={() => {
                  handleSidebarLinkClick("settings");
                  setAccountMenuOpen(false);
                }}
              >
                <Settings size={14} />
                {t.settings}
              </button>
              <button
                onClick={() => {
                  handleSidebarLinkClick("audit");
                  setAccountMenuOpen(false);
                }}
              >
                <ScrollText size={14} />
                {t.audit}
              </button>
            </>
          )}

          {mainsailUrl && (
            <a
              href={mainsailUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setAccountMenuOpen(false)}
            >
              <ExternalLink size={14} />
              {t.openMainsail}
            </a>
          )}

          {fluiddUrl && (
            <a
              href={fluiddUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setAccountMenuOpen(false)}
            >
              <ExternalLink size={14} />
              {t.openFluidd}
            </a>
          )}

          {octoprintUrl && (
            <a
              href={octoprintUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setAccountMenuOpen(false)}
            >
              <ExternalLink size={14} />
              {t.openOctoPrint}
            </a>
          )}
        </div>
      )}
    </div>
  </aside>
);

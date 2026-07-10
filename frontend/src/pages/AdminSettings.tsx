import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Camera,
  Check,
  Globe,
  KeyRound,
  LockKeyhole,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Thermometer,
  Users,
} from "lucide-react";
import type {
  AdminConfig,
  AdminUserEntry,
  FooterLink,
  GroupConfig,
  PortalConfig,
  PowerDevice,
} from "../usePrinterState";
import { translations } from "../translations";
import type { Lang } from "../translations";
import { useToast } from "../contexts/ToastContext";
import { readRecord } from "../lib/formCoercion";
import { AuthSection } from "../features/admin/AuthSection";
import { UsersSection } from "../features/admin/UsersSection";
import { GroupsSection } from "../features/admin/GroupsSection";
import { CamerasSection } from "../features/admin/CamerasSection";
import { SystemSection } from "../features/admin/SystemSection";
import { PreheatSection } from "../features/admin/PreheatSection";
import { BrandingSection } from "../features/admin/BrandingSection";
import {
  permissionLabels,
  limitLabels,
  type BrandingLang,
} from "../features/admin/adminHelpers";
import { detectAvailableFonts } from "../lib/fontDetect";
import { toErrorMessage } from "../lib/toErrorMessage";

type T = (typeof translations)[Lang];

interface AdminSettingsProps {
  lang: Lang;
  role: string | null;
  portalConfig: PortalConfig | null;
  getAdminConfig: () => Promise<AdminConfig>;
  getAdminMacros: () => Promise<string[]>;
  getAdminPowerDevices: () => Promise<PowerDevice[]>;
  updateAdminConfig: (config: AdminConfig) => Promise<AdminConfig>;
  uploadAdminAsset: (
    kind: "logo-light" | "logo-dark" | "favicon" | "danger-image",
    file: File,
    lang?: string,
  ) => Promise<AdminConfig>;
  uploadAdminFont: (file: File) => Promise<AdminConfig>;
  uploadFooterLinkIcon: (id: string, file: File) => Promise<AdminConfig>;
  changeAdminPassword: (
    scope: "admin" | "guest",
    currentPassword: string,
    newPassword: string,
  ) => Promise<void>;
  getAdminUsers: () => Promise<AdminUserEntry[]>;
  createAdminUser: (email: string, password: string, groupId: string) => Promise<void>;
  deleteAdminUser: (email: string) => Promise<void>;
  setAdminUserGroup: (email: string, groupId: string) => Promise<void>;
  resendAdminUserVerification: (email: string) => Promise<void>;
  /** Called after a successful save so other parts of the app (portalConfig)
   * reflect the change immediately, without waiting on the WS round-trip. */
  refreshConfig?: () => void;
}

type SectionId =
  | "auth"
  | "users"
  | "groups"
  | "cameras"
  | "preheat"
  | "branding"
  | "system";

const sectionIcons: Record<SectionId, React.ReactNode> = {
  auth: <KeyRound size={15} />,
  users: <Users size={15} />,
  groups: <Users size={15} />,
  cameras: <Camera size={15} />,
  preheat: <Thermometer size={15} />,
  branding: <Globe size={15} />,
  system: <SlidersHorizontal size={15} />,
};

// Groups the flat permission list into the same cards/features the admin
// actually sees in the app, so the checklist reads as "what can this group do
// on the Status card / Power menu / etc" instead of one long alphabet-soup grid.

const sectionLabels = (t: T): Record<SectionId, string> => ({
  groups: t.admSectionGroups,
  auth: t.admSectionAuth,
  users: t.admSectionUsers,
  cameras: t.admSectionCameras,
  preheat: t.admSectionPreheat,
  branding: t.admSectionBranding,
  system: t.admSectionSystem,
});

const cloneConfig = (config: AdminConfig): AdminConfig =>
  JSON.parse(JSON.stringify(config)) as AdminConfig;


export const AdminSettings: React.FC<AdminSettingsProps> = ({
  lang,
  role,
  portalConfig,
  getAdminConfig,
  getAdminMacros,
  getAdminPowerDevices,
  updateAdminConfig,
  uploadAdminAsset,
  uploadAdminFont,
  uploadFooterLinkIcon,
  changeAdminPassword,
  getAdminUsers,
  createAdminUser,
  deleteAdminUser,
  setAdminUserGroup,
  resendAdminUserVerification,
  refreshConfig,
}) => {
  const t = translations[lang];
  const labels = sectionLabels(t);
  const permLabels = permissionLabels(t);
  const limLabels = limitLabels(t);
  const [activeSection, setActiveSection] = useState<SectionId>("groups");
  const [source, setSource] = useState<AdminConfig | null>(null);
  const [draft, setDraft] = useState<AdminConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { pushToast } = useToast();
  const [jsonDrafts, setJsonDrafts] = useState<Record<string, string>>({});
  const [assetBusy, setAssetBusy] = useState<string | null>(null);
  const [brandingLang, setBrandingLang] = useState<BrandingLang>("default");

  // Password change form (separate from the config save flow — plaintext is
  // hashed server-side and never round-tripped through the config editor).
  // Groups no longer have shared passwords (local signup accounts instead).
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNewAdmin, setPwNewAdmin] = useState("");
  const [pwNewGuest, setPwNewGuest] = useState("");
  const [pwBusy, setPwBusy] = useState<string | null>(null);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwNotice, setPwNotice] = useState<string | null>(null);
  const [availableMacros, setAvailableMacros] = useState<string[]>([]);
  const [livePowerDevices, setLivePowerDevices] = useState<PowerDevice[]>([]);
  // Fonts actually installed on THIS device (the admin's), detected via
  // canvas text-measurement against a curated candidate list (see
  // lib/fontDetect.ts) — works in every browser, unlike the Chromium-only
  // Local Font Access API this used to rely on. Runs once automatically;
  // there's nothing to click.
  const [localFonts, setLocalFonts] = useState<string[] | null>(null);

  useEffect(() => {
    setLocalFonts(detectAvailableFonts());
  }, []);

  const loadConfig = useCallback(async () => {
    if (role !== "admin") return;
    setLoading(true);
    try {
      const nextConfig = await getAdminConfig();
      setSource(cloneConfig(nextConfig));
      setDraft(cloneConfig(nextConfig));
      setJsonDrafts({
        auth: JSON.stringify(readRecord(nextConfig.auth), null, 2),
      });
    } catch (err) {
      const message = toErrorMessage(err);
      pushToast("error", message || t.admConfigEndpointNotReady);
    } finally {
      setLoading(false);
    }
  }, [getAdminConfig, role, pushToast, t.admConfigEndpointNotReady]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    if (role !== "admin") return;
    getAdminMacros()
      .then(setAvailableMacros)
      .catch(() => setAvailableMacros([]));
    getAdminPowerDevices()
      .then(setLivePowerDevices)
      .catch(() => setLivePowerDevices([]));
  }, [role, getAdminMacros, getAdminPowerDevices]);

  const submitPassword = useCallback(
    async (scope: "admin" | "guest") => {
      setPwError(null);
      setPwNotice(null);
      const newPassword = scope === "admin" ? pwNewAdmin : pwNewGuest;
      if (!pwCurrent) {
        setPwError(t.admEnterCurrentAdminPassword);
        return;
      }
      if (scope === "admin" && newPassword.length < 4) {
        setPwError(t.admNewPasswordMinLength);
        return;
      }
      setPwBusy(scope);
      try {
        await changeAdminPassword(scope, pwCurrent, newPassword);
        setPwNotice(
          scope === "admin"
            ? t.admAdminPasswordUpdated
            : newPassword
              ? t.admGuestPasswordSet
              : t.admGuestPasswordDisabled,
        );
        setPwCurrent("");
        setPwNewAdmin("");
        setPwNewGuest("");
        // Refresh so the "guest password set" marker reflects reality.
        void loadConfig();
      } catch (err) {
        setPwError(toErrorMessage(err));
      } finally {
        setPwBusy(null);
      }
    },
    [changeAdminPassword, lang, loadConfig, pwCurrent, pwNewAdmin, pwNewGuest],
  );

  const dirty = useMemo(
    () => JSON.stringify(source) !== JSON.stringify(draft),
    [draft, source],
  );

  const mutateDraft = (updater: (next: AdminConfig) => void) => {
    setDraft((current) => {
      if (!current) return current;
      const next = cloneConfig(current);
      updater(next);
      return next;
    });
  };

  const setRecordField = (
    section: keyof AdminConfig,
    field: string,
    value: unknown,
  ) => {
    mutateDraft((next) => {
      const record = readRecord(next[section]);
      next[section] = { ...record, [field]: value };
    });
  };


  const uploadAsset = async (
    kind: "logo-light" | "logo-dark" | "favicon" | "danger-image",
    file: File | null,
    assetLang: string = "default",
  ) => {
    if (!file) return;
    setAssetBusy(`${kind}:${assetLang}`);
    try {
      const saved = await uploadAdminAsset(kind, file, assetLang);
      setSource(cloneConfig(saved));
      setDraft(cloneConfig(saved));
      pushToast("success", t.adminSettingsSaved);
      refreshConfig?.();
    } catch (err) {
      pushToast("error", toErrorMessage(err));
    } finally {
      setAssetBusy(null);
    }
  };

  const uploadFont = async (file: File | null) => {
    if (!file) return;
    setAssetBusy("font");
    try {
      const saved = await uploadAdminFont(file);
      setSource(cloneConfig(saved));
      setDraft(cloneConfig(saved));
      pushToast("success", t.adminSettingsSaved);
    } catch (err) {
      pushToast("error", toErrorMessage(err));
    } finally {
      setAssetBusy(null);
    }
  };

  const addFooterLink = () => {
    mutateDraft((next) => {
      const links = Array.isArray(next.footer_links) ? next.footer_links : [];
      const maxOrder = links.reduce((max, l) => Math.max(max, l.order ?? 0), -1);
      next.footer_links = [
        ...links,
        {
          id: `link-${Date.now()}`,
          label: "",
          url: "",
          icon_url: "",
          order: maxOrder + 1,
        },
      ];
    });
  };

  const removeFooterLink = (idx: number) => {
    mutateDraft((next) => {
      next.footer_links = (next.footer_links ?? []).filter((_, i) => i !== idx);
    });
  };

  const updateFooterLinkField = (
    idx: number,
    field: "label" | "url" | "icon_url",
    value: string,
  ) => {
    mutateDraft((next) => {
      const links = [...(next.footer_links ?? [])];
      links[idx] = { ...links[idx], [field]: value };
      next.footer_links = links;
    });
  };

  const uploadFooterLinkIconFile = async (id: string, file: File | null) => {
    if (!file) return;
    setAssetBusy(`footer-link:${id}`);
    try {
      const saved = await uploadFooterLinkIcon(id, file);
      setSource(cloneConfig(saved));
      setDraft(cloneConfig(saved));
      pushToast("success", t.adminSettingsSaved);
    } catch (err) {
      pushToast("error", toErrorMessage(err));
    } finally {
      setAssetBusy(null);
    }
  };

  const defaultGroupPermissions = (): GroupConfig["permissions"] => ({
    view_status: true,
    view_temps: true,
    view_temp_target: true,
    control_temps: false,
    view_webcam: true,
    view_toolhead: true,
    control_toolhead: false,
    view_macros: true,
    run_macros: false,
    view_console: false,
    send_console: false,
    view_speed: true,
    view_files: true,
    manage_files: false,
    view_power: true,
    control_power: false,
    control_machine: false,
    upload_gcode: false,
    control_print: true,
    view_gcode_viewer: true,
    view_heightmap: true,
    open_mainsail: true,
    open_fluidd: true,
    open_octoprint: true,
    max_speed_factor: 200,
    max_jog_step: 10,
    max_upload_mb: 250,
    allow_movement_while_printing: false,
    allow_home_for_guests: false,
    power_devices: {},
    allowed_macros: [],
  });

  const updateGroup = (idx: number, updater: (group: GroupConfig) => void) => {
    mutateDraft((next) => {
      const groups = next.groups as GroupConfig[];
      updater(groups[idx]);
    });
  };

  const addGroup = () => {
    mutateDraft((next) => {
      (next.groups as GroupConfig[]).push({
        id: "",
        display_name: "",
        emails: [],
        built_in: false,
        permissions: defaultGroupPermissions(),
      });
    });
  };

  const removeGroup = (idx: number) => {
    mutateDraft((next) => {
      next.groups = (next.groups as GroupConfig[]).filter((_, i) => i !== idx);
    });
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const saved = await updateAdminConfig(draft);
      setSource(cloneConfig(saved));
      setDraft(cloneConfig(saved));
      pushToast("success", t.adminSettingsSaved);
      refreshConfig?.();
    } catch (err) {
      const message = toErrorMessage(err);
      pushToast("error", message || t.adminSettingsSaveFailed);
    } finally {
      setSaving(false);
    }
  };

  const revert = () => {
    if (!source) return;
    setDraft(cloneConfig(source));
    setJsonDrafts({
      auth: JSON.stringify(readRecord(source.auth), null, 2),
    });
  };

  if (role !== "admin") {

    return (
      <section className="admin-settings-page">
        <div className="admin-settings-empty">
          <LockKeyhole size={22} />
          <h2>{t.adminSettingsTitle}</h2>
          <p>{t.adminSettingsAdminOnly}</p>
        </div>
      </section>
    );
  }

  const preheat = readRecord(draft?.preheat);
  const auth = readRecord(draft?.auth);
  // GET redacts a configured guest hash to a non-empty placeholder ("__set__").
  const guestPasswordSet = Boolean(
    auth.guest_password_hash &&
      typeof auth.guest_password_hash === "string" &&
      auth.guest_password_hash.length > 0,
  );
  const signup = readRecord(draft?.signup);
  const smtp = readRecord(draft?.smtp);
  const resend = readRecord(draft?.resend);
  const geoRestriction = readRecord(draft?.geo_restriction);
  const webcams = Array.isArray(draft?.webcams) ? draft.webcams : [];
  const groups: GroupConfig[] = Array.isArray(draft?.groups) ? (draft.groups as GroupConfig[]) : [];
  const footerLinksList: FooterLink[] = Array.isArray(draft?.footer_links)
    ? (draft.footer_links as FooterLink[])
    : [];

  const authSection = (
    <AuthSection
      t={t}
      pwCurrent={pwCurrent}
      setPwCurrent={setPwCurrent}
      pwNewAdmin={pwNewAdmin}
      setPwNewAdmin={setPwNewAdmin}
      pwBusy={pwBusy}
      submitPassword={submitPassword}
      guestPasswordSet={guestPasswordSet}
      pwNewGuest={pwNewGuest}
      setPwNewGuest={setPwNewGuest}
      pwError={pwError}
      pwNotice={pwNotice}
      signup={signup}
      smtp={smtp}
      resend={resend}
      geoRestriction={geoRestriction}
      groups={groups}
      setRecordField={setRecordField}
      jsonDrafts={jsonDrafts}
      setJsonDrafts={setJsonDrafts}
      mutateDraft={mutateDraft}
      pushToast={pushToast}
    />
  );

  const usersSection = (
    <UsersSection
      t={t}
      groups={groups}
      getAdminUsers={getAdminUsers}
      createAdminUser={createAdminUser}
      deleteAdminUser={deleteAdminUser}
      setAdminUserGroup={setAdminUserGroup}
      resendAdminUserVerification={resendAdminUserVerification}
      pushToast={pushToast}
    />
  );

  const groupsSection = (
    <GroupsSection
      t={t}
      groups={groups}
      removeGroup={removeGroup}
      updateGroup={updateGroup}
      permLabels={permLabels}
      limLabels={limLabels}
      livePowerDevices={livePowerDevices}
      availableMacros={availableMacros}
      addGroup={addGroup}
    />
  );

  const camerasSection = (
    <CamerasSection t={t} webcams={webcams} mutateDraft={mutateDraft} />
  );

  const systemSection = (
    <SystemSection t={t} draft={draft} setRecordField={setRecordField} />
  );

  const preheatSection = (
    <PreheatSection
      t={t}
      preheat={preheat}
      setRecordField={setRecordField}
      mutateDraft={mutateDraft}
    />
  );

  const brandingSection = (
    <BrandingSection
      t={t}
      draft={draft}
      brandingLang={brandingLang}
      setBrandingLang={setBrandingLang}
      mutateDraft={mutateDraft}
      setRecordField={setRecordField}
      assetBusy={assetBusy}
      uploadAsset={uploadAsset}
      localFonts={localFonts}
      uploadFont={uploadFont}
      footerLinksList={footerLinksList}
      updateFooterLinkField={updateFooterLinkField}
      uploadFooterLinkIconFile={uploadFooterLinkIconFile}
      removeFooterLink={removeFooterLink}
      addFooterLink={addFooterLink}
    />
  );

  return (
    <section className="admin-settings-page">
      <div className="admin-settings-topbar">
        <div>
          <h2>{t.adminSettingsTitle}</h2>
          <p>{t.adminSettingsSubtitle}</p>
        </div>
        <div className="admin-settings-actions">
          <button className="btn" onClick={revert} disabled={!dirty || saving}>
            <RotateCcw size={15} />
            {t.revert}
          </button>
          <button
            className="btn btn-primary"
            onClick={() => void save()}
            disabled={!dirty || saving}
          >
            {saving ? <SlidersHorizontal size={15} /> : <Save size={15} />}
            {saving ? t.saving : t.save}
          </button>
        </div>
      </div>

      {loading && (
        <div className="admin-settings-banner">
          <Check size={16} />
          <span>{t.adminSettingsLoading}</span>
        </div>
      )}

      {!draft && !loading ? (
        <div className="admin-settings-empty">
          <AlertTriangle size={22} />
          <h3>{t.adminSettingsUnavailable}</h3>
          <p>{t.adminSettingsBackendHint}</p>
          <button className="btn btn-compact" onClick={() => void loadConfig()}>
            {t.retry}
          </button>
        </div>
      ) : (
        <div className="admin-settings-shell">
          <nav className="admin-settings-tabs" aria-label={t.adminSettingsTitle}>
            {(Object.keys(labels) as SectionId[]).map((section) => (
              <button
                key={section}
                className={activeSection === section ? "active" : ""}
                onClick={() => setActiveSection(section)}
              >
                {sectionIcons[section]}
                <span>{labels[section]}</span>
              </button>
            ))}
          </nav>

          <div className="admin-settings-panel">
            {activeSection === "auth" && authSection}

            {activeSection === "users" && usersSection}

            {activeSection === "groups" && groupsSection}


            {activeSection === "cameras" && camerasSection}

            {activeSection === "system" && systemSection}

            {activeSection === "preheat" && preheatSection}

            {activeSection === "branding" && brandingSection}

          </div>
        </div>
      )}

      {portalConfig && (
        <p className="admin-settings-footnote">
          {t.adminSettingsPortalHint}
        </p>
      )}
    </section>
  );
};


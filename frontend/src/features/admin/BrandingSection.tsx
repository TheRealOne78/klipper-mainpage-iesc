import React from "react";
import { Globe, Plus, Trash2, Upload } from "lucide-react";
import { UploadIconButton } from "../../components/UploadIconButton";
import { IconPicker } from "../../components/IconPicker";
import { Select } from "../../components/Select";
import { PRESET_ICON_PREFIX, footerPresetIconFor } from "../../lib/footerIcons";
import { readRecord, asText } from "../../lib/formCoercion";
import type { BrandingLang } from "./adminHelpers";
import { BRANDING_LANGS } from "./adminHelpers";
import type { AdminConfig, FooterLink } from "../../printerTypes";
import type { Translations } from "../../translations";

const BUNDLED_FONT = "UT Sans";

interface BrandingSectionProps {
  t: Translations;
  draft: AdminConfig | null;
  brandingLang: BrandingLang;
  setBrandingLang: (lang: BrandingLang) => void;
  mutateDraft: (updater: (next: AdminConfig) => void) => void;
  setRecordField: (
    section: keyof AdminConfig,
    field: string,
    value: unknown,
  ) => void;
  assetBusy: string | null;
  uploadAsset: (
    kind: "logo-light" | "logo-dark" | "favicon" | "danger-image",
    file: File | null,
    assetLang?: string,
  ) => Promise<void>;
  localFonts: string[] | null;
  uploadFont: (file: File | null) => Promise<void>;
  footerLinksList: FooterLink[];
  updateFooterLinkField: (
    idx: number,
    field: "label" | "url" | "icon_url",
    value: string,
  ) => void;
  uploadFooterLinkIconFile: (id: string, file: File | null) => Promise<void>;
  removeFooterLink: (idx: number) => void;
  addFooterLink: () => void;
}

export const BrandingSection: React.FC<BrandingSectionProps> = ({
  t,
  draft,
  brandingLang,
  setBrandingLang,
  mutateDraft,
  setRecordField,
  assetBusy,
  uploadAsset,
  localFonts,
  uploadFont,
  footerLinksList,
  updateFooterLinkField,
  uploadFooterLinkIconFile,
  removeFooterLink,
  addFooterLink,
}) => {
  const fontFileInputRef = React.useRef<HTMLInputElement>(null);

  return (
  <div className="admin-branding-categories">
    {/* Governs every localized field below (identity text + images). */}
    <div className="admin-branding-lang-tabs">
      {BRANDING_LANGS.map((bl) => (
        <button
          key={bl}
          type="button"
          className={brandingLang === bl ? "active" : ""}
          onClick={() => setBrandingLang(bl)}
        >
          {bl === "default" ? t.admBrandingLangDefault : bl.toUpperCase()}
        </button>
      ))}
    </div>
    <p className="admin-hint">{t.admBrandingLangHint}</p>

    <div className="admin-branding-category">
      <p className="admin-branding-category-label">
        {t.admBrandingCatIdentity}
      </p>
      <div className="admin-form-grid">
        {(
          [
            ["app_name", t.admPrinterAppName],
            ["organization_name", t.admFacultyOrganization],
            ["moron_warning_text", t.admWarningText],
          ] as const
        ).map(([field, label]) => {
          const map = readRecord(readRecord(draft?.branding)[field]);
          const value = asText(map[brandingLang]);
          return (
            <label className="admin-field full" key={field}>
              {label}
              <input
                type="text"
                value={value}
                onChange={(event) => {
                  const v = event.currentTarget.value;
                  mutateDraft((next) => {
                    const branding = readRecord(next.branding);
                    const m = readRecord(branding[field]);
                    next.branding = {
                      ...branding,
                      [field]: { ...m, [brandingLang]: v },
                    };
                  });
                }}
              />
            </label>
          );
        })}
      </div>
    </div>

    <div className="admin-branding-category">
      <p className="admin-branding-category-label">
        {t.admBrandingCatImages}
      </p>
      <div className="admin-form-grid">
        {(
          [
            ["logo-light", "logo_light", t.admLightLogoPath],
            ["logo-dark", "logo_dark", t.admDarkLogoPath],
            ["favicon", "favicon", t.admFaviconPath],
            ["danger-image", "danger_image", t.admWarningImagePath],
          ] as const
        ).map(([kind, field, label]) => {
          const imageMap = readRecord(draft?.branding)[field];
          const currentValue =
            imageMap && typeof imageMap === "object"
              ? asText((imageMap as Record<string, string>)[brandingLang])
              : "";
          const busyKey = `${kind}:${brandingLang}`;
          return (
            <div className="admin-field-with-upload full" key={`${kind}-${brandingLang}`}>
              <label className="admin-field">
                {label}
                <input
                  type="text"
                  value={currentValue}
                  placeholder="/assets/..."
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    mutateDraft((next) => {
                      const branding = readRecord(next.branding);
                      const map = readRecord(branding[field]);
                      next.branding = {
                        ...branding,
                        [field]: { ...map, [brandingLang]: value },
                      };
                    });
                  }}
                />
              </label>
              <UploadIconButton
                accept="image/*"
                busy={assetBusy === busyKey}
                title={t.admUploadFile}
                onFile={(file) => void uploadAsset(kind, file, brandingLang)}
              />
            </div>
          );
        })}
      </div>
    </div>

    <div className="admin-branding-category">
      <p className="admin-branding-category-label">{t.admBrandingCatFont}</p>
      <div className="admin-form-grid">
        {(() => {
          const fontFamily = asText(readRecord(draft?.theme).font_family);
          const presetOptions = Array.from(
            new Set([BUNDLED_FONT, ...(localFonts ?? [])]),
          );
          const isPreset = presetOptions.includes(fontFamily);
          return (
            <>
              <label className="admin-field">
                {t.admFontFamily}
                <input
                  ref={fontFileInputRef}
                  type="file"
                  accept=".otf,.ttf,.woff,.woff2"
                  hidden
                  onChange={(event) => {
                    void uploadFont(event.currentTarget.files?.[0] ?? null);
                    event.currentTarget.value = "";
                  }}
                />
                <Select
                  value={isPreset ? fontFamily : ""}
                  placeholder={isPreset ? undefined : fontFamily}
                  onChange={(value) =>
                    setRecordField("theme", "font_family", value)
                  }
                  options={presetOptions.map((f) => ({
                    value: f,
                    label: f,
                    style: { fontFamily: `"${f}"` },
                  }))}
                  extraAction={{
                    label:
                      assetBusy === "font" ? t.admUploading : t.admFontUploadOption,
                    icon: <Upload size={14} />,
                    onClick: () => fontFileInputRef.current?.click(),
                  }}
                />
                <small style={{ opacity: 0.7 }}>{t.admFontDetectHint}</small>
              </label>
              {!isPreset && (
                <label className="admin-field">
                  {t.admFontCustomLabel}
                  <input
                    type="text"
                    value={fontFamily}
                    onChange={(event) =>
                      setRecordField(
                        "theme",
                        "font_family",
                        event.currentTarget.value,
                      )
                    }
                  />
                </label>
              )}
              <label className="admin-field full">
                {t.admFontUploadLabel}
                <small style={{ opacity: 0.7 }}>
                  {asText(readRecord(draft?.theme).font_url) || t.admFontNoCustom}
                </small>
              </label>
            </>
          );
        })()}
      </div>
    </div>

    <div className="admin-branding-category">
      <p className="admin-branding-category-label">{t.admBrandingCatUrls}</p>
      <div className="admin-form-grid">
        {(
          [
            ["mainsail", "url", "Mainsail URL"],
            ["fluidd", "url", "Fluidd URL"],
            ["octoprint", "url", "OctoPrint URL"],
            ["moonraker", "url", "Moonraker URL"],
            ["server", "host", t.admServerHost],
            ["server", "port", t.admServerPort],
          ] as const
        ).map(([section, field, label]) => (
          <label className="admin-field" key={`${section}.${field}`}>
            {label}
            <input
              type={field === "port" ? "number" : "text"}
              value={asText(readRecord(draft?.[section])?.[field])}
              onChange={(event) =>
                setRecordField(
                  section,
                  field,
                  field === "port"
                    ? Number(event.currentTarget.value)
                    : event.currentTarget.value,
                )
              }
            />
          </label>
        ))}
      </div>
    </div>

    <div className="admin-branding-category">
      <p className="admin-branding-category-label">{t.admFooterLinks}</p>
      <p className="admin-hint">{t.admFooterLinksHint}</p>
      {footerLinksList.length === 0 && (
        <p className="admin-hint">{t.admFooterLinksEmpty}</p>
      )}
      <div className="admin-footer-link-list">
        {footerLinksList.map((link, idx) => {
          const PresetIcon = link.icon_url
            ? footerPresetIconFor(link.icon_url)
            : null;
          return (
            <div className="admin-footer-link-row" key={link.id}>
              <div className="admin-footer-link-icon-preview">
                {PresetIcon ? (
                  <PresetIcon size={16} />
                ) : link.icon_url ? (
                  <img src={link.icon_url} alt="" width={16} height={16} />
                ) : (
                  <Globe size={16} />
                )}
              </div>
              <input
                className="admin-footer-link-text"
                value={link.label}
                placeholder={t.admFooterLinkLabel}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  updateFooterLinkField(idx, "label", value);
                }}
              />
              <input
                className="admin-footer-link-text"
                placeholder={t.admFooterLinkUrl}
                value={link.url}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  updateFooterLinkField(idx, "url", value);
                }}
              />
              <IconPicker
                value={
                  link.icon_url?.startsWith(PRESET_ICON_PREFIX)
                    ? link.icon_url.slice(PRESET_ICON_PREFIX.length)
                    : ""
                }
                triggerTitle={t.admFooterLinkPresetIcons}
                searchPlaceholder={t.admIconPickerSearch}
                onSelect={(name) =>
                  updateFooterLinkField(
                    idx,
                    "icon_url",
                    `${PRESET_ICON_PREFIX}${name}`,
                  )
                }
              />
              <UploadIconButton
                accept="image/*"
                busy={assetBusy === `footer-link:${link.id}`}
                title={t.admFooterLinkIcon}
                onFile={(file) => void uploadFooterLinkIconFile(link.id, file)}
              />
              <button
                type="button"
                className="btn btn-compact"
                onClick={() => removeFooterLink(idx)}
              >
                <Trash2 size={13} />
              </button>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        className="btn btn-compact"
        style={{ marginTop: 8 }}
        onClick={addFooterLink}
      >
        <Plus size={14} /> {t.admFooterLinkAdd}
      </button>
    </div>
  </div>
  );
};

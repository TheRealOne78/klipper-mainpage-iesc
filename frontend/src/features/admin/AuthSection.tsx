import React from "react";
import type { Dispatch, SetStateAction } from "react";
import { AlertTriangle, Check, KeyRound, Send } from "lucide-react";
import { asStringList, asText } from "../../lib/formCoercion";
import { JsonSectionEditor } from "./JsonSectionEditor";
import { parseJson } from "./adminHelpers";
import { GeoRegionPicker, type GeoRegionEntry } from "./GeoRegionPicker";
import { Select } from "../../components/Select";
import { toErrorMessage } from "../../lib/toErrorMessage";
import type { AdminConfig, GroupConfig } from "../../printerTypes";
import type { Translations } from "../../translations";

/** Coerces the config draft's loosely-typed `geo_restriction.allowed_regions`
 * (an `unknown[]` from JSON) into `GeoRegionEntry[]`, dropping anything
 * without a usable `country` string — mirrors the defensive style of
 * `lib/formCoercion.ts`'s helpers but is specific enough to this one field's
 * shape that it doesn't belong there. */
const asRegionList = (value: unknown): GeoRegionEntry[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): GeoRegionEntry | null => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const country = typeof record.country === "string" ? record.country : "";
      if (!country) return null;
      const city = typeof record.city === "string" ? record.city : null;
      return { country, city };
    })
    .filter((entry): entry is GeoRegionEntry => entry !== null);
};

interface AuthSectionProps {
  t: Translations;
  pwCurrent: string;
  setPwCurrent: Dispatch<SetStateAction<string>>;
  pwNewAdmin: string;
  setPwNewAdmin: Dispatch<SetStateAction<string>>;
  pwBusy: string | null;
  submitPassword: (scope: "admin" | "guest") => Promise<void>;
  guestPasswordSet: boolean;
  pwNewGuest: string;
  setPwNewGuest: Dispatch<SetStateAction<string>>;
  pwError: string | null;
  pwNotice: string | null;
  signup: Record<string, unknown>;
  smtp: Record<string, unknown>;
  resend: Record<string, unknown>;
  geoRestriction: Record<string, unknown>;
  groups: GroupConfig[];
  setRecordField: (
    section: keyof AdminConfig,
    field: string,
    value: unknown,
  ) => void;
  jsonDrafts: Record<string, string>;
  setJsonDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  mutateDraft: (updater: (next: AdminConfig) => void) => void;
  pushToast: (type: "error" | "success", message: string) => void;
}

export const AuthSection: React.FC<AuthSectionProps> = ({
  t,
  pwCurrent,
  setPwCurrent,
  pwNewAdmin,
  setPwNewAdmin,
  pwBusy,
  submitPassword,
  guestPasswordSet,
  pwNewGuest,
  setPwNewGuest,
  pwError,
  pwNotice,
  signup,
  smtp,
  resend,
  geoRestriction,
  groups,
  setRecordField,
  jsonDrafts,
  setJsonDrafts,
  mutateDraft,
  pushToast,
}) => {
  const ipRestrictionEnabled = Boolean(geoRestriction.ip_enabled);
  const locationRestrictionEnabled = Boolean(geoRestriction.location_enabled);
  const modeSwitchEnabled = ipRestrictionEnabled || locationRestrictionEnabled;

  return (
  <div className="admin-section-stack">
    <div className="admin-password-card full">
      <div className="admin-password-head">
        <KeyRound size={16} />
        <h3>{t.admChangePasswords}</h3>
      </div>
      <p className="admin-password-hint">{t.admPasswordsHashedHint}</p>
      <label className="admin-field full">
        {t.admCurrentAdminPassword}
        <input
          type="password"
          autoComplete="current-password"
          value={pwCurrent}
          onChange={(event) => setPwCurrent(event.currentTarget.value)}
        />
      </label>
      <div className="admin-password-row">
        <label className="admin-field">
          {t.admNewAdminPassword}
          <input
            type="password"
            autoComplete="new-password"
            value={pwNewAdmin}
            onChange={(event) =>
              setPwNewAdmin(event.currentTarget.value)
            }
          />
        </label>
        <button
          type="button"
          className="btn btn-primary"
          disabled={pwBusy !== null}
          onClick={() => void submitPassword("admin")}
        >
          {pwBusy === "admin"
            ? t.admSaving
            : t.admUpdateAdminPassword}
        </button>
      </div>
      <div className="admin-password-row">
        <label className="admin-field">
          {t.admNewGuestPassword}
          <input
            type="password"
            autoComplete="new-password"
            placeholder={
              guestPasswordSet ? t.admPasswordIsSet : t.admNoPassword
            }
            value={pwNewGuest}
            onChange={(event) =>
              setPwNewGuest(event.currentTarget.value)
            }
          />
        </label>
        <button
          type="button"
          className="btn"
          disabled={pwBusy !== null}
          onClick={() => void submitPassword("guest")}
        >
          {pwBusy === "guest"
            ? t.admSaving
            : pwNewGuest
              ? t.admSetGuestPassword
              : t.admDisableGuestPassword}
        </button>
      </div>
      {pwError && (
        <p className="admin-inline-error">
          <AlertTriangle size={14} /> {pwError}
        </p>
      )}
      {pwNotice && (
        <p className="admin-inline-ok">
          <Check size={14} /> {pwNotice}
        </p>
      )}
    </div>


    {/* Local signup */}
    <div className="admin-password-card full">
      <div className="admin-password-head">
        <KeyRound size={16} />
        <h3>{t.admSignupTitle}</h3>
      </div>
      <p className="admin-password-hint">{t.admSignupHint}</p>

      <label className="admin-check-row">
        <input
          type="checkbox"
          checked={Boolean(signup.enabled)}
          onChange={(event) =>
            setRecordField("signup", "enabled", event.currentTarget.checked)
          }
        />
        <span>{t.admSignupEnabled}</span>
      </label>

      <label className="admin-field full">
        {t.admSignupAllowedDomains}
        <textarea
          rows={3}
          placeholder={t.admSignupAllowedDomainsPlaceholder}
          value={asStringList(signup.allowed_domains).join("\n")}
          onChange={(event) =>
            setRecordField(
              "signup",
              "allowed_domains",
              event.currentTarget.value
                .split("\n")
                .map((line) => line.trim())
                .filter(Boolean),
            )
          }
        />
        <small>{t.admSignupAllowedDomainsHint}</small>
      </label>

      <label className="admin-field">
        {t.admSignupDefaultGroup}
        {/* "anonymous" represents no session at all — never a valid landing
            group for an actually-verified signup account. */}
        <Select
          value={asText(signup.default_group) || "guest"}
          onChange={(value) => setRecordField("signup", "default_group", value)}
          options={groups
            .filter((group) => group.id !== "anonymous")
            .map((group) => ({
              value: group.id,
              label: group.display_name || group.id,
            }))}
        />
      </label>

      <label className="admin-check-row">
        <input
          type="checkbox"
          checked={Boolean(signup.require_email_verification)}
          onChange={(event) =>
            setRecordField(
              "signup",
              "require_email_verification",
              event.currentTarget.checked,
            )
          }
        />
        <span>{t.admSignupRequireVerification}</span>
      </label>

      <label className="admin-check-row">
        <input
          type="checkbox"
          checked={Boolean(signup.require_pow_challenge)}
          onChange={(event) =>
            setRecordField(
              "signup",
              "require_pow_challenge",
              event.currentTarget.checked,
            )
          }
        />
        <span>{t.admSignupRequirePow}</span>
      </label>

      <label className="admin-field">
        {t.admSignupPowDifficulty}
        <input
          type="number"
          min={8}
          max={28}
          value={asText(signup.pow_difficulty_bits) || "20"}
          onChange={(event) =>
            setRecordField(
              "signup",
              "pow_difficulty_bits",
              Number(event.currentTarget.value),
            )
          }
        />
      </label>

      <label className="admin-field">
        {t.admSignupVerificationTtl}
        <input
          type="number"
          min={5}
          value={asText(signup.verification_ttl_minutes) || "1440"}
          onChange={(event) =>
            setRecordField(
              "signup",
              "verification_ttl_minutes",
              Number(event.currentTarget.value),
            )
          }
        />
      </label>

      <label className="admin-field full">
        {t.admSignupPublicBaseUrl}
        <input
          type="text"
          placeholder="https://print.example.com"
          value={asText(signup.public_base_url)}
          onChange={(event) =>
            setRecordField("signup", "public_base_url", event.currentTarget.value)
          }
        />
        <small>{t.admSignupPublicBaseUrlHint}</small>
      </label>
    </div>

    {/* Combined outbound-email card: Resend (resend.com) is the preferred
        provider — one API key, no SMTP host/port/TLS to get right, and works
        through firewalls that block outbound SMTP ports — tried first
        whenever its API key is set; SMTP below is the fallback used
        whenever it isn't. */}
    <div className="admin-password-card full">
      <div className="admin-password-head">
        <Send size={16} />
        <h3>{t.admEmailTitle}</h3>
      </div>
      <p className="admin-password-hint">{t.admEmailHint}</p>

      <label className="admin-field">
        {t.admResendApiKey}
        <input
          type="password"
          placeholder={
            resend.api_key === "__set__" ? t.admPasswordIsSet : t.admNoPassword
          }
          onChange={(event) =>
            setRecordField("resend", "api_key", event.currentTarget.value)
          }
        />
        <small>{t.admResendApiKeyHint}</small>
      </label>
      <label className="admin-field full">
        {t.admResendFromAddress}
        <input
          type="text"
          placeholder="noreply@example.com"
          value={asText(resend.from_address)}
          onChange={(event) =>
            setRecordField("resend", "from_address", event.currentTarget.value)
          }
        />
        <small>{t.admResendFromAddressHint}</small>
      </label>

      <div className="admin-subsection-label">
        <KeyRound size={13} /> {t.admSmtpTitle}
      </div>
      <p className="admin-password-hint">{t.admSmtpHint}</p>

      <label className="admin-field">
        {t.admSmtpHost}
        <input
          type="text"
          value={asText(smtp.host)}
          onChange={(event) => setRecordField("smtp", "host", event.currentTarget.value)}
        />
      </label>
      <label className="admin-field">
        {t.admSmtpPort}
        <input
          type="number"
          value={asText(smtp.port) || "587"}
          onChange={(event) =>
            setRecordField("smtp", "port", Number(event.currentTarget.value))
          }
        />
      </label>
      <label className="admin-field">
        {t.admSmtpUsername}
        <input
          type="text"
          value={asText(smtp.username)}
          onChange={(event) =>
            setRecordField("smtp", "username", event.currentTarget.value)
          }
        />
      </label>
      <label className="admin-field">
        {t.admSmtpPassword}
        <input
          type="password"
          placeholder={
            smtp.password === "__set__" ? t.admPasswordIsSet : t.admNoPassword
          }
          onChange={(event) =>
            setRecordField("smtp", "password", event.currentTarget.value)
          }
        />
      </label>
      <label className="admin-field full">
        {t.admSmtpFromAddress}
        <input
          type="text"
          value={asText(smtp.from_address)}
          onChange={(event) =>
            setRecordField("smtp", "from_address", event.currentTarget.value)
          }
        />
      </label>
      <label className="admin-check-row">
        <input
          type="checkbox"
          checked={Boolean(smtp.use_starttls)}
          onChange={(event) =>
            setRecordField("smtp", "use_starttls", event.currentTarget.checked)
          }
        />
        <span>{t.admSmtpUseStarttls}</span>
      </label>
    </div>

    {/* Geo / IP restriction */}
    <div className="admin-password-card full">
      <div className="admin-password-head">
        <KeyRound size={16} />
        <h3>{t.admGeoTitle}</h3>
      </div>
      <p className="admin-password-hint">{t.admGeoHint}</p>

      <div className={`admin-field full${modeSwitchEnabled ? "" : " disabled"}`}>
        <span>{t.admGeoMode}</span>
        <div className="geo-mode-switch">
          <button
            type="button"
            className={`btn btn-compact${
              asText(geoRestriction.mode) !== "blacklist" ? " btn-primary" : ""
            }`}
            disabled={!modeSwitchEnabled}
            onClick={() => setRecordField("geo_restriction", "mode", "whitelist")}
          >
            {t.admGeoModeWhitelist}
          </button>
          <button
            type="button"
            className={`btn btn-compact${
              asText(geoRestriction.mode) === "blacklist" ? " btn-primary" : ""
            }`}
            disabled={!modeSwitchEnabled}
            onClick={() => setRecordField("geo_restriction", "mode", "blacklist")}
          >
            {t.admGeoModeBlacklist}
          </button>
        </div>
        <small>
          {asText(geoRestriction.mode) === "blacklist"
            ? t.admGeoModeBlacklistHint
            : t.admGeoModeWhitelistHint}
        </small>
      </div>

      {/* Location (country/city) restriction — its own checkbox sits
          directly above the fields it gates (mmdb path + region picker),
          independent from the IP-range checkbox below. */}
      <label className="admin-check-row full">
        <input
          type="checkbox"
          checked={locationRestrictionEnabled}
          onChange={(event) =>
            setRecordField(
              "geo_restriction",
              "location_enabled",
              event.currentTarget.checked,
            )
          }
        />
        <span>{t.admGeoLocationEnabled}</span>
      </label>

      <label className={`admin-field full${locationRestrictionEnabled ? "" : " disabled"}`}>
        {t.admGeoMmdbPath}
        <input
          type="text"
          disabled={!locationRestrictionEnabled}
          placeholder="/etc/klipper-portal/GeoLite2-City.mmdb"
          value={asText(geoRestriction.mmdb_path)}
          onChange={(event) =>
            setRecordField("geo_restriction", "mmdb_path", event.currentTarget.value)
          }
        />
        <small>{t.admGeoMmdbPathHint}</small>
      </label>

      <label className={`admin-field full${locationRestrictionEnabled ? "" : " disabled"}`}>
        {t.admGeoRegions}
        <GeoRegionPicker
          t={t}
          disabled={!locationRestrictionEnabled}
          regions={asRegionList(geoRestriction.allowed_regions)}
          onChange={(regions) =>
            setRecordField("geo_restriction", "allowed_regions", regions)
          }
        />
        <small>{t.admGeoDataAttribution}</small>
      </label>

      {/* IP-range (CIDR) restriction — independent from the location
          checkbox above; either, both, or neither can be on. */}
      <label className="admin-check-row full">
        <input
          type="checkbox"
          checked={ipRestrictionEnabled}
          onChange={(event) =>
            setRecordField("geo_restriction", "ip_enabled", event.currentTarget.checked)
          }
        />
        <span>{t.admGeoIpEnabled}</span>
      </label>

      <label className={`admin-field full${ipRestrictionEnabled ? "" : " disabled"}`}>
        {t.admGeoCidrs}
        <textarea
          rows={3}
          disabled={!ipRestrictionEnabled}
          placeholder="193.226.0.0/16"
          value={asStringList(geoRestriction.allowed_cidrs).join("\n")}
          onChange={(event) =>
            setRecordField(
              "geo_restriction",
              "allowed_cidrs",
              event.currentTarget.value
                .split("\n")
                .map((line) => line.trim())
                .filter(Boolean),
            )
          }
        />
        <small>{t.admGeoCidrsHint}</small>
      </label>
      <label className={`admin-check-row${ipRestrictionEnabled ? "" : " disabled"}`}>
        <input
          type="checkbox"
          disabled={!ipRestrictionEnabled}
          checked={Boolean(geoRestriction.trust_x_forwarded_for)}
          onChange={(event) =>
            setRecordField(
              "geo_restriction",
              "trust_x_forwarded_for",
              event.currentTarget.checked,
            )
          }
        />
        <span>{t.admGeoTrustForwardedFor}</span>
      </label>
    </div>

    <JsonSectionEditor
      title={t.admAuthJson}
      applyLabel={t.admApplyJson}
      value={jsonDrafts.auth || "{}"}
      onChange={(value) =>
        setJsonDrafts((current) => ({ ...current, auth: value }))
      }
      onApply={() => {
        try {
          const parsed = parseJson(jsonDrafts.auth || "{}");
          mutateDraft((next) => {
            next.auth = parsed;
          });
        } catch (err) {
          pushToast("error", toErrorMessage(err));
        }
      }}
    />
  </div>
  );
};

import React from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  GraduationCap,
  Lock,
  Mail,
  RotateCw,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import type { Translations } from "../../translations";

interface AuthModalProps {
  t: Translations;
  handleLoginSubmit: (e: React.FormEvent) => Promise<void>;
  handleSignupSubmit: (e: React.FormEvent) => Promise<void>;
  authMode: "login" | "signup";
  setAuthMode: Dispatch<SetStateAction<"login" | "signup">>;
  authEmail: string;
  setAuthEmail: Dispatch<SetStateAction<string>>;
  password: string;
  setPassword: Dispatch<SetStateAction<string>>;
  confirmPassword: string;
  setConfirmPassword: Dispatch<SetStateAction<string>>;
  authError: string | null;
  authNotice: string | null;
  signupBusy: boolean;
  signupEnabled: boolean;
  signupAllowedDomains: string[];
  authRequired: boolean;
  setAuthModalOpen: Dispatch<SetStateAction<boolean>>;
}

/** The login/signup form shown either as a dismissable account-menu modal, or
 * (when `authRequired` and the current page isn't public) as a portal lock
 * the visitor can't close without signing in. Signup is only offered when
 * the backend has it enabled (`signupEnabled`, from `/api/config`). */
export const AuthModal: React.FC<AuthModalProps> = ({
  t,
  handleLoginSubmit,
  handleSignupSubmit,
  authMode,
  setAuthMode,
  authEmail,
  setAuthEmail,
  password,
  setPassword,
  confirmPassword,
  setConfirmPassword,
  authError,
  authNotice,
  signupBusy,
  signupEnabled,
  signupAllowedDomains,
  authRequired,
  setAuthModalOpen,
}) => (
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
        <h3>{authMode === "signup" ? t.signupTitle : t.authTitle}</h3>
        <p
          style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}
        >
          {authMode === "signup" ? t.signupSubtitle : t.authSubtitle}
        </p>
      </div>

      <form
        onSubmit={authMode === "signup" ? handleSignupSubmit : handleLoginSubmit}
        style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
      >
        <div className="form-group">
          <label htmlFor="auth-email">
            {authMode === "signup" ? t.emailLabel : t.usernameLabel}
          </label>
          <input
            // Signup always needs a real, valid email (it receives the
            // confirmation link) — login accepts "admin"/"guest"/a local
            // account's email too, so it can't be type="email" (the browser
            // would block submitting a non-email value like "admin").
            type={authMode === "signup" ? "email" : "text"}
            id="auth-email"
            className="form-input"
            value={authEmail}
            onChange={(e) => setAuthEmail(e.target.value)}
            placeholder={
              authMode === "signup" ? t.emailPlaceholder : t.usernamePlaceholder
            }
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="auth-password">{t.passwordLabel}</label>
          <input
            type="password"
            id="auth-password"
            className="form-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t.passwordPlaceholder}
            autoComplete={authMode === "signup" ? "new-password" : "current-password"}
            required
          />
        </div>

        {authMode === "signup" && (
          <div className="form-group">
            <label htmlFor="auth-confirm-password">{t.confirmPasswordLabel}</label>
            <input
              type="password"
              id="auth-confirm-password"
              className="form-input"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder={t.passwordPlaceholder}
              autoComplete="new-password"
              required
            />
          </div>
        )}

        {authMode === "signup" && (
          <ul className="auth-signup-requirements">
            <li>
              <GraduationCap size={15} />
              <span>
                {signupAllowedDomains.length > 0
                  ? t.signupReqDomain.replace(
                      "{domains}",
                      signupAllowedDomains.join(", "),
                    )
                  : t.signupReqDomainGeneric}
              </span>
            </li>
            <li>
              <ShieldCheck size={15} />
              <span>{t.signupReqPassword}</span>
            </li>
            <li>
              <Mail size={15} />
              <span>{t.signupReqEmailConfirm}</span>
            </li>
          </ul>
        )}

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

        {authNotice && (
          <div
            style={{
              color: "var(--success-color, var(--accent-color))",
              fontSize: "0.85rem",
              fontWeight: "500",
            }}
          >
            {authNotice}
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
            style={{
              flex: 1,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
            }}
            disabled={authMode === "signup" && signupBusy}
          >
            {authMode === "signup" && signupBusy && (
              <RotateCw size={16} className="spin" />
            )}
            {authMode === "signup"
              ? signupBusy
                ? t.signupSolvingChallenge
                : t.signupButton
              : t.loginButton}
          </button>
        </div>

        {signupEnabled && (
          <button
            type="button"
            className="auth-mode-switch"
            onClick={() => {
              setAuthMode(authMode === "signup" ? "login" : "signup");
            }}
          >
            <UserPlus size={14} />
            {authMode === "signup" ? t.authSwitchToLogin : t.authSwitchToSignup}
          </button>
        )}
      </form>
    </div>
  </div>
);

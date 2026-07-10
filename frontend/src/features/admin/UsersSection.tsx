import React, { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Mail, Plus, RefreshCcw, Trash2, UserRound } from "lucide-react";
import { Select } from "../../components/Select";
import { toErrorMessage } from "../../lib/toErrorMessage";
import type { AdminUserEntry, GroupConfig } from "../../printerTypes";
import type { Translations } from "../../translations";

interface UsersSectionProps {
  t: Translations;
  groups: GroupConfig[];
  getAdminUsers: () => Promise<AdminUserEntry[]>;
  createAdminUser: (email: string, password: string, groupId: string) => Promise<void>;
  deleteAdminUser: (email: string) => Promise<void>;
  setAdminUserGroup: (email: string, groupId: string) => Promise<void>;
  resendAdminUserVerification: (email: string) => Promise<void>;
  pushToast: (type: "error" | "success", message: string) => void;
}

/** Live admin view of local signup accounts — separate from the draft/save
 * config flow used by the other sections, since every action here (add,
 * delete, resend, change group) takes effect immediately server-side. */
export const UsersSection: React.FC<UsersSectionProps> = ({
  t,
  groups,
  getAdminUsers,
  createAdminUser,
  deleteAdminUser,
  setAdminUserGroup,
  resendAdminUserVerification,
  pushToast,
}) => {
  const [users, setUsers] = useState<AdminUserEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyEmail, setBusyEmail] = useState<string | null>(null);

  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newConfirmPassword, setNewConfirmPassword] = useState("");
  const [newGroup, setNewGroup] = useState("guest");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // "anonymous" represents having no session at all — a local account
  // always has one, so it's never a valid group for a real account.
  const assignableGroups = groups.filter((group) => group.id !== "anonymous");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setUsers(await getAdminUsers());
    } catch (err) {
      pushToast("error", toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [getAdminUsers, pushToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async () => {
    if (!newEmail.trim() || !newPassword) return;
    setCreateError(null);
    if (newPassword !== newConfirmPassword) {
      setCreateError(t.passwordsDontMatch);
      return;
    }
    setCreating(true);
    try {
      await createAdminUser(newEmail.trim(), newPassword, newGroup);
      setNewEmail("");
      setNewPassword("");
      setNewConfirmPassword("");
      pushToast("success", t.admUserCreated);
      void load();
    } catch (err) {
      pushToast("error", toErrorMessage(err));
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (email: string) => {
    setBusyEmail(email);
    try {
      await deleteAdminUser(email);
      pushToast("success", t.admUserDeleted);
      void load();
    } catch (err) {
      pushToast("error", toErrorMessage(err));
    } finally {
      setBusyEmail(null);
    }
  };

  const handleGroupChange = async (email: string, groupId: string) => {
    setBusyEmail(email);
    try {
      await setAdminUserGroup(email, groupId);
      void load();
    } catch (err) {
      pushToast("error", toErrorMessage(err));
    } finally {
      setBusyEmail(null);
    }
  };

  const handleResend = async (email: string) => {
    setBusyEmail(email);
    try {
      await resendAdminUserVerification(email);
      pushToast("success", t.admUserVerificationResent);
    } catch (err) {
      pushToast("error", toErrorMessage(err));
    } finally {
      setBusyEmail(null);
    }
  };

  return (
    <div className="admin-table-wrap">
      <p className="admin-hint">{t.admUsersHint}</p>

      <div className="admin-password-card full">
        <div className="admin-password-head">
          <UserRound size={16} />
          <h3>{t.admUserAddTitle}</h3>
        </div>
        <div className="admin-form-grid">
          <label className="admin-field">
            {t.admUserEmail}
            <input
              type="email"
              value={newEmail}
              onChange={(event) => setNewEmail(event.currentTarget.value)}
            />
          </label>
          <label className="admin-field">
            {t.admUserPassword}
            <input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.currentTarget.value)}
            />
          </label>
          <label className="admin-field">
            {t.confirmPasswordLabel}
            <input
              type="password"
              autoComplete="new-password"
              value={newConfirmPassword}
              onChange={(event) => setNewConfirmPassword(event.currentTarget.value)}
            />
          </label>
          <label className="admin-field">
            {t.admUserGroup}
            <Select
              value={newGroup}
              onChange={setNewGroup}
              options={assignableGroups.map((group) => ({
                value: group.id,
                label: group.display_name || group.id,
              }))}
            />
          </label>
        </div>
        {createError && (
          <p className="admin-inline-error">
            <AlertTriangle size={14} /> {createError}
          </p>
        )}
        <button
          type="button"
          className="btn btn-primary"
          disabled={creating || !newEmail.trim() || !newPassword}
          onClick={() => void handleCreate()}
        >
          <Plus size={14} /> {creating ? t.admSaving : t.admUserAdd}
        </button>
      </div>

      <div className="admin-users-list-head">
        <h3>{t.admUsersListTitle}</h3>
        <button type="button" className="btn btn-compact" onClick={() => void load()}>
          <RefreshCcw size={13} /> {t.admRefresh}
        </button>
      </div>

      {loading ? (
        <p className="admin-hint">{t.admLoading}</p>
      ) : users.length === 0 ? (
        <p className="admin-hint">{t.admUsersEmpty}</p>
      ) : (
        <div className="admin-audit-table-wrap">
          <table className="admin-audit-table">
            <thead>
              <tr>
                <th>{t.admUserEmail}</th>
                <th>{t.admUserGroup}</th>
                <th>{t.admUserVerified}</th>
                <th>{t.admUserCreatedAt}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.email}>
                  <td>{user.email}</td>
                  <td>
                    <Select
                      value={user.group_id}
                      disabled={busyEmail === user.email}
                      onChange={(value) => void handleGroupChange(user.email, value)}
                      options={assignableGroups.map((group) => ({
                        value: group.id,
                        label: group.display_name || group.id,
                      }))}
                    />
                  </td>
                  <td>{user.verified ? t.admUserVerifiedYes : t.admUserVerifiedNo}</td>
                  <td>{new Date(user.created_at).toLocaleString()}</td>
                  <td className="admin-users-row-actions">
                    {!user.verified && (
                      <button
                        type="button"
                        className="btn btn-compact"
                        disabled={busyEmail === user.email}
                        onClick={() => void handleResend(user.email)}
                        title={t.admUserResendVerification}
                      >
                        <Mail size={13} />
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-danger btn-compact"
                      disabled={busyEmail === user.email}
                      onClick={() => void handleDelete(user.email)}
                      title={t.admUserDelete}
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

import { useCallback } from "react";
import type { AdminConfig, AdminAuditEntry, AdminUserEntry, PowerDevice } from "../printerTypes";

const API_BASE = "/api";

/** Throws with the response body (or a fallback "<message>: <status>") when
 * `res` isn't ok. Mirrors the identically-named helper in `usePrinterState.ts`
 * — kept local here (not imported) so this hook stays independently movable;
 * preserve the exact `failedMessage` text at each call site since
 * `lib/errorTranslations.ts`'s `PREFIXES` table matches by that prefix. */
async function assertOk(res: Response, failedMessage: string): Promise<void> {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `${failedMessage}: ${res.status}`);
  }
}

/** Admin-panel config CRUD + branding/footer-icon uploads + password change.
 * Split out of `usePrinterState` since none of these need reactive component
 * state — every call here is a self-contained fetch. */
export function useAdminConfig() {
  const getAdminConfig = useCallback(async (): Promise<AdminConfig> => {
    const res = await fetch(`${API_BASE}/admin/config`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (res.status === 404) {
        throw new Error(
          "Admin config endpoint returned 404. Restart the backend so the latest admin routes are loaded, then verify the frontend proxy forwards /api/admin/config to the backend.",
        );
      }
      throw new Error(text || `Admin config request failed: ${res.status}`);
    }
    return (await res.json()) as AdminConfig;
  }, []);

  const getAdminMacros = useCallback(async (): Promise<string[]> => {
    const res = await fetch(`${API_BASE}/admin/macros`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    await assertOk(res, "Admin macros request failed");
    return (await res.json()) as string[];
  }, []);

  const getAdminPowerDevices = useCallback(async (): Promise<PowerDevice[]> => {
    const res = await fetch(`${API_BASE}/power/devices`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    await assertOk(res, "Power devices request failed");
    const body = await res.json();
    return (body?.result?.devices ?? []) as PowerDevice[];
  }, []);

  const updateAdminConfig = useCallback(
    async (config: AdminConfig): Promise<AdminConfig> => {
      const res = await fetch(`${API_BASE}/admin/config`, {
        method: "PUT",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(config),
      });
      await assertOk(res, "Admin config update failed");
      return (await res.json().catch(() => config)) as AdminConfig;
    },
    [],
  );

  const uploadAdminAsset = useCallback(
    async (
      kind: "logo-light" | "logo-dark" | "favicon" | "danger-image",
      file: File,
      lang: string = "default",
    ): Promise<AdminConfig> => {
      const form = new FormData();
      form.append("file", file);
      const url =
        lang === "default"
          ? `${API_BASE}/admin/branding/${kind}`
          : `${API_BASE}/admin/branding/${kind}/${lang}`;
      const res = await fetch(url, {
        method: "POST",
        body: form,
      });
      await assertOk(res, "Asset upload failed");
      return (await res.json()) as AdminConfig;
    },
    [],
  );

  const uploadAdminFont = useCallback(async (file: File): Promise<AdminConfig> => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${API_BASE}/admin/branding/font`, {
      method: "POST",
      body: form,
    });
    await assertOk(res, "Font upload failed");
    return (await res.json()) as AdminConfig;
  }, []);

  const uploadFooterLinkIcon = useCallback(
    async (id: string, file: File): Promise<AdminConfig> => {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${API_BASE}/admin/footer-link-icon/${id}`, {
        method: "POST",
        body: form,
      });
      await assertOk(res, "Icon upload failed");
      return (await res.json()) as AdminConfig;
    },
    [],
  );

  const changeAdminPassword = useCallback(
    async (
      scope: "admin" | "guest",
      currentPassword: string,
      newPassword: string,
    ): Promise<void> => {
      const res = await fetch(`${API_BASE}/admin/password`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          scope,
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });
      await assertOk(res, "Password change failed");
    },
    [],
  );

  const getAdminAudit = useCallback(async (): Promise<AdminAuditEntry[]> => {
    const res = await fetch(`${API_BASE}/admin/audit`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (res.status === 404) {
        throw new Error(
          "Admin audit endpoint returned 404. Restart the backend and check that the proxy is forwarding /api/admin/audit.",
        );
      }
      throw new Error(text || `Admin audit request failed: ${res.status}`);
    }
    const data = await res.json();
    if (Array.isArray(data)) return data as AdminAuditEntry[];
    if (Array.isArray(data?.entries)) return data.entries as AdminAuditEntry[];
    if (Array.isArray(data?.audit)) return data.audit as AdminAuditEntry[];
    return [];
  }, []);

  const getAdminUsers = useCallback(async (): Promise<AdminUserEntry[]> => {
    const res = await fetch(`${API_BASE}/admin/users`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    await assertOk(res, "Admin users request failed");
    return (await res.json()) as AdminUserEntry[];
  }, []);

  const createAdminUser = useCallback(
    async (email: string, password: string, groupId: string): Promise<void> => {
      const res = await fetch(`${API_BASE}/admin/users`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password, group_id: groupId }),
      });
      await assertOk(res, "Failed to create account");
    },
    [],
  );

  const deleteAdminUser = useCallback(async (email: string): Promise<void> => {
    const res = await fetch(`${API_BASE}/admin/users/${encodeURIComponent(email)}`, {
      method: "DELETE",
    });
    await assertOk(res, "Failed to delete account");
  }, []);

  const setAdminUserGroup = useCallback(
    async (email: string, groupId: string): Promise<void> => {
      const res = await fetch(
        `${API_BASE}/admin/users/${encodeURIComponent(email)}/group`,
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ group_id: groupId }),
        },
      );
      await assertOk(res, "Failed to change account group");
    },
    [],
  );

  const resendAdminUserVerification = useCallback(async (email: string): Promise<void> => {
    const res = await fetch(
      `${API_BASE}/admin/users/${encodeURIComponent(email)}/resend-verification`,
      { method: "POST" },
    );
    await assertOk(res, "Failed to resend verification email");
  }, []);

  return {
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
  };
}

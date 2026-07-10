import React from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  toTitle,
  permissionCategories,
  groupLimitNumberKeys,
  groupLimitBoolKeys,
} from "./adminHelpers";
import type { GroupConfig, PowerDevice } from "../../printerTypes";
import type { Translations } from "../../translations";

interface GroupsSectionProps {
  t: Translations;
  groups: GroupConfig[];
  removeGroup: (idx: number) => void;
  updateGroup: (idx: number, updater: (group: GroupConfig) => void) => void;
  permLabels: Record<string, string>;
  limLabels: Record<string, string>;
  livePowerDevices: PowerDevice[];
  availableMacros: string[];
  addGroup: () => void;
}

export const GroupsSection: React.FC<GroupsSectionProps> = ({
  t,
  groups,
  removeGroup,
  updateGroup,
  permLabels,
  limLabels,
  livePowerDevices,
  availableMacros,
  addGroup,
}) => (
  <div className="admin-table-wrap">
    <p className="admin-hint">{t.admGroupsHint}</p>

    {groups.length === 0 && (
      <p className="admin-hint">{t.admGroupsEmpty}</p>
    )}
    {groups.map((group, idx) => (
      <details key={idx} className="admin-group-card" open={false}>
        <summary className="admin-group-summary">
          <span>
            {group.display_name || group.id || `Group ${idx + 1}`}
            {group.built_in && (
              <em className="admin-group-builtin-tag">
                {t.admGroupBuiltIn}
              </em>
            )}
          </span>
          {!group.built_in && (
            <button
              className="btn btn-danger btn-compact"
              onClick={() => removeGroup(idx)}
            >
              <Trash2 size={13} /> {t.admGroupRemove}
            </button>
          )}
        </summary>
        <div className="admin-group-body">
          <label className="admin-field">
            {t.admGroupName}
            <input
              type="text"
              value={group.id}
              disabled={group.built_in}
              onChange={(e) => {
                const value = e.currentTarget.value;
                updateGroup(idx, (g) => {
                  g.id = value;
                });
              }}
            />
          </label>
          <label className="admin-field">
            {t.admGroupDisplayName}
            <input
              type="text"
              value={group.display_name}
              onChange={(e) => {
                const value = e.currentTarget.value;
                updateGroup(idx, (g) => {
                  g.display_name = value;
                });
              }}
            />
          </label>

          {!group.built_in && (
            <label className="admin-field full">
              {t.admGroupEmails}
              <textarea
                rows={4}
                placeholder={t.admGroupEmailsPlaceholder}
                value={(group.emails ?? []).join("\n")}
                onChange={(e) => {
                  const emails = e.currentTarget.value
                    .split("\n")
                    .map((line) => line.trim())
                    .filter(Boolean);
                  updateGroup(idx, (g) => {
                    g.emails = emails;
                  });
                }}
              />
              <small>{t.admGroupEmailsHint}</small>
            </label>
          )}

          {/* Per-group permissions, grouped by feature/card */}
          <p className="admin-subsection-label">{t.admGroupPermissions}</p>
          <div className="admin-permission-categories">
            {permissionCategories(t).map((category) => (
              <div className="admin-permission-category" key={category.label}>
                <p className="admin-permission-category-label">
                  {category.label}
                </p>
                <div className="admin-section-grid permissions-grid">
                  {category.keys.map((key) => (
                    <label className="admin-check-row" key={key}>
                      <input
                        type="checkbox"
                        checked={Boolean(
                          group.permissions[
                            key as keyof typeof group.permissions
                          ],
                        )}
                        onChange={(e) => {
                          const checked = e.currentTarget.checked;
                          updateGroup(idx, (g) => {
                            (
                              g.permissions as unknown as Record<string, unknown>
                            )[key] = checked;
                          });
                        }}
                      />
                      <span>{permLabels[key] ?? toTitle(key)}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Per-group limits */}
          <p className="admin-subsection-label">{t.admGroupLimits}</p>
          <div className="admin-form-grid">
            {groupLimitNumberKeys.map((key) => {
              const value = group.permissions[key];
              const unlimited = value === null || value === undefined;
              return (
                <div className="admin-limit-field" key={key}>
                  <label className="admin-field">
                    {limLabels[key] ?? toTitle(key)}
                    <input
                      type="number"
                      disabled={unlimited}
                      value={unlimited ? "" : value}
                      placeholder={unlimited ? t.admUnlimited : ""}
                      onChange={(e) => {
                        const numValue = Number(e.currentTarget.value);
                        updateGroup(idx, (g) => {
                          (g.permissions as unknown as Record<string, unknown>)[key] =
                            numValue;
                        });
                      }}
                    />
                  </label>
                  <label className="admin-check-row">
                    <input
                      type="checkbox"
                      checked={unlimited}
                      onChange={(e) => {
                        const checked = e.currentTarget.checked;
                        updateGroup(idx, (g) => {
                          (g.permissions as unknown as Record<string, unknown>)[key] =
                            checked ? null : 0;
                        });
                      }}
                    />
                    <span>{t.admUnlimited}</span>
                  </label>
                </div>
              );
            })}
            {groupLimitBoolKeys.map((key) => (
              <label className="admin-check-row" key={key}>
                <input
                  type="checkbox"
                  checked={Boolean(group.permissions[key])}
                  onChange={(e) => {
                    const checked = e.currentTarget.checked;
                    updateGroup(idx, (g) => {
                      (g.permissions as unknown as Record<string, unknown>)[key] =
                        checked;
                    });
                  }}
                />
                <span>{limLabels[key] ?? toTitle(key)}</span>
              </label>
            ))}
          </div>

          {/* Per-group power device label + access — each group
              can label/show/control devices independently. */}
          {livePowerDevices.length > 0 && (
            <>
              <p className="admin-subsection-label">{t.admGroupPowerDevices}</p>
              <p className="admin-hint">{t.admGroupPowerDevicesHint}</p>
              <div className="admin-power-device-group-list">
                {livePowerDevices.map((device) => {
                  const access = group.permissions.power_devices?.[device.device];
                  const label = access?.label ?? "";
                  const visible = access?.visible ?? true;
                  const controllable = access?.controllable ?? true;
                  const patchAccess = (
                    next: Partial<{
                      label: string;
                      visible: boolean;
                      controllable: boolean;
                    }>,
                  ) => {
                    updateGroup(idx, (g) => {
                      const current = g.permissions.power_devices?.[device.device];
                      g.permissions.power_devices = {
                        ...g.permissions.power_devices,
                        [device.device]: {
                          label: current?.label ?? "",
                          visible: current?.visible ?? true,
                          controllable: current?.controllable ?? true,
                          ...next,
                        },
                      };
                    });
                  };
                  return (
                    <div className="admin-power-device-group-row" key={device.device}>
                      <div className="admin-power-device-group-row-head">
                        <strong>{device.device}</strong>
                        <input
                          value={label}
                          placeholder={t.admLabel}
                          onChange={(e) => {
                            const value = e.currentTarget.value;
                            patchAccess({ label: value });
                          }}
                        />
                      </div>
                      <label className="admin-check-row">
                        <input
                          type="checkbox"
                          checked={visible}
                          onChange={(e) => {
                            const checked = e.currentTarget.checked;
                            patchAccess({ visible: checked });
                          }}
                        />
                        <span>{t.admVisibleToGuests}</span>
                      </label>
                      <label className="admin-check-row">
                        <input
                          type="checkbox"
                          checked={controllable}
                          onChange={(e) => {
                            const checked = e.currentTarget.checked;
                            patchAccess({ controllable: checked });
                          }}
                        />
                        <span>{t.admGuestsCanControl}</span>
                      </label>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Per-group macro allow-list */}
          <p className="admin-subsection-label">{t.admGroupMacros}</p>
          {availableMacros.length === 0 ? (
            <p className="admin-hint">{t.admMacrosEmpty}</p>
          ) : (
            <>
              <p className="admin-hint">{t.admMacrosHint}</p>
              <div className="admin-section-grid permissions-grid">
                {availableMacros.map((name) => {
                  const allowed = (group.permissions.allowed_macros ?? []).includes(
                    name,
                  );
                  return (
                    <label className="admin-check-row" key={name}>
                      <input
                        type="checkbox"
                        checked={allowed}
                        onChange={(e) => {
                          const checked = e.currentTarget.checked;
                          updateGroup(idx, (g) => {
                            const current = g.permissions.allowed_macros ?? [];
                            g.permissions.allowed_macros = checked
                              ? [...current, name]
                              : current.filter((m) => m !== name);
                          });
                        }}
                      />
                      <span>{name}</span>
                    </label>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </details>
    ))}

    <button
      className="btn btn-compact"
      style={{ marginTop: 12 }}
      onClick={addGroup}
    >
      <Plus size={14} /> {t.admGroupAdd}
    </button>
  </div>
);

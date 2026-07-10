import React from "react";
import type { Dispatch, SetStateAction } from "react";
import { AlertTriangle, CheckCircle, FileText, Save } from "lucide-react";
import { CollapseButton } from "../CollapseButton";
import { Select } from "../../../components/Select";
import type { Translations } from "../../../translations";

interface ConfigCardProps {
  t: Translations;
  configCollapsed: boolean;
  setConfigCollapsed: Dispatch<SetStateAction<boolean>>;
  selectedConfig: string;
  loadConfigFile: (path: string) => Promise<void>;
  configFiles: string[];
  configError: string | null;
  configContent: string;
  setConfigContent: Dispatch<SetStateAction<string>>;
  configBusy: boolean;
  configNotice: string | null;
  saveConfigFile: () => Promise<void>;
}

export const ConfigCard: React.FC<ConfigCardProps> = ({
  t,
  configCollapsed,
  setConfigCollapsed,
  selectedConfig,
  loadConfigFile,
  configFiles,
  configError,
  configContent,
  setConfigContent,
  configBusy,
  configNotice,
  saveConfigFile,
}) => (
  <div className="dashboard-card config-card">
    <div className="card-title">
      <FileText size={20} />
      <span>{t.configEditor}</span>
      <div className="panel-header-actions" style={{ marginLeft: "auto" }}>
        <CollapseButton
          collapsed={configCollapsed}
          storageKey="configCollapsed"
          setter={setConfigCollapsed}
          t={t}
        />
      </div>
    </div>

    {!configCollapsed && (
      <div className="config-body">
        <Select
          className="config-select"
          value={selectedConfig}
          onChange={(value) => void loadConfigFile(value)}
          placeholder={t.configSelect}
          options={configFiles.map((f) => ({ value: f, label: f }))}
        />
        {configError && (
          <div className="config-error">
            <AlertTriangle size={14} /> {configError}
          </div>
        )}
        {selectedConfig && (
          <>
            <textarea
              className="config-textarea"
              spellCheck={false}
              value={configContent}
              disabled={configBusy}
              onChange={(event) => setConfigContent(event.currentTarget.value)}
            />
            <div className="config-actions">
              {configNotice && (
                <span className="config-notice">
                  <CheckCircle size={14} /> {configNotice}
                </span>
              )}
              <button
                type="button"
                className="btn btn-primary"
                disabled={configBusy}
                onClick={() => void saveConfigFile()}
              >
                <Save size={15} /> {configBusy ? t.updatesUpdating : t.configSave}
              </button>
            </div>
          </>
        )}
      </div>
    )}
  </div>
);

import React from "react";
import type { Dispatch, SetStateAction } from "react";
import { ChevronDown, Send, Sliders } from "lucide-react";
import { CollapseButton } from "../CollapseButton";
import type { MacroDefinition } from "../../../pages/Dashboard";
import type { Translations } from "../../../translations";

interface MacrosCardProps {
  t: Translations;
  macrosCollapsed: boolean;
  setMacrosCollapsed: Dispatch<SetStateAction<boolean>>;
  macroDefinitions: MacroDefinition[];
  openMacroParams: string | null;
  setOpenMacroParams: Dispatch<SetStateAction<string | null>>;
  macroParamRef: React.RefObject<HTMLDivElement | null>;
  isOfflineOrNotReady: boolean;
  isPrinting: boolean;
  canRunMacros: boolean;
  handleMacroAction: (macroName: string) => Promise<void>;
  macroParamValues: Record<string, Record<string, string>>;
  handleMacroParamChange: (
    macroName: string,
    paramName: string,
    value: string,
  ) => void;
  handleMacroWithParams: (macro: MacroDefinition) => Promise<void>;
}

export const MacrosCard: React.FC<MacrosCardProps> = ({
  t,
  macrosCollapsed,
  setMacrosCollapsed,
  macroDefinitions,
  openMacroParams,
  setOpenMacroParams,
  macroParamRef,
  isOfflineOrNotReady,
  isPrinting,
  canRunMacros,
  handleMacroAction,
  macroParamValues,
  handleMacroParamChange,
  handleMacroWithParams,
}) => (
  <div className="dashboard-card">
    <div className="card-title">
      <Sliders size={20} />
      <span>{t.macrosTitle}</span>
      <div className="panel-header-actions" style={{ marginLeft: "auto" }}>
        <CollapseButton
          collapsed={macrosCollapsed}
          storageKey="macrosCollapsed"
          setter={setMacrosCollapsed}
          t={t}
        />
      </div>
    </div>

    {!macrosCollapsed && (
      <div className="macro-list">
        {macroDefinitions.map((macro) => {
          const params = Object.entries(macro.params).filter(
            ([paramName]) => !paramName.startsWith("_"),
          );
          const paramsOpen = openMacroParams === macro.name;

          return (
            <div
              className="macro-entry"
              key={macro.name}
              ref={paramsOpen ? macroParamRef : undefined}
            >
              <div className="macro-button-group">
                <button
                  className={`btn macro-run-button ${params.length ? "has-params" : ""}`}
                  disabled={isOfflineOrNotReady || isPrinting || !canRunMacros}
                  onClick={() => handleMacroAction(macro.name)}
                  title={macro.description}
                >
                  <span>{macro.label}</span>
                </button>
                {params.length > 0 && (
                  <button
                    className={`btn macro-param-toggle ${paramsOpen ? "active" : ""}`}
                    disabled={isOfflineOrNotReady || isPrinting || !canRunMacros}
                    title={t.macroParameters}
                    onClick={() =>
                      setOpenMacroParams((current) =>
                        current === macro.name ? null : macro.name,
                      )
                    }
                  >
                    <ChevronDown size={16} />
                  </button>
                )}
              </div>
              {paramsOpen && (
                <div className="macro-param-panel">
                  <div className="macro-param-grid">
                    {params.map(([paramName, param]) => (
                      <label className="macro-param-field" key={paramName}>
                        <span>{paramName}</span>
                        <input
                          value={
                            macroParamValues[macro.name]?.[paramName] ??
                            ""
                          }
                          placeholder={param.default ?? ""}
                          inputMode={
                            param.type === "int" ||
                            param.type === "double"
                              ? "decimal"
                              : "text"
                          }
                          onChange={(event) =>
                            handleMacroParamChange(
                              macro.name,
                              paramName,
                              event.target.value,
                            )
                          }
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              void handleMacroWithParams(macro);
                            }
                          }}
                        />
                      </label>
                    ))}
                  </div>
                  <button
                    className="btn btn-primary macro-param-send"
                    disabled={isOfflineOrNotReady || isPrinting || !canRunMacros}
                    onClick={() => void handleMacroWithParams(macro)}
                  >
                    <Send size={15} /> {t.send}
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {macroDefinitions.length === 0 && (
          <span
            style={{
              fontSize: "0.85rem",
              color: "var(--text-secondary)",
            }}
          >
            {t.macrosNone}
          </span>
        )}
      </div>
    )}
  </div>
);

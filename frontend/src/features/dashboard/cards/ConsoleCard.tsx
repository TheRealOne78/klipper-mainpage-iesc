import React from "react";
import type { Dispatch, SetStateAction } from "react";
import { Terminal, Trash2, Settings } from "lucide-react";
import { CollapseButton } from "../CollapseButton";
import type { PrinterState } from "../../../printerTypes";
import type { Translations } from "../../../translations";

interface ConsoleCardProps {
  state: PrinterState;
  t: Translations;
  consoleCollapsed: boolean;
  setConsoleCollapsed: Dispatch<SetStateAction<boolean>>;
  setConsoleClearedAt: Dispatch<SetStateAction<number>>;
  consoleSettingsRef: React.RefObject<HTMLDivElement | null>;
  consoleSettingsOpen: boolean;
  setConsoleSettingsOpen: Dispatch<SetStateAction<boolean>>;
  consoleHideTempReplies: boolean;
  setConsoleHideTempReplies: Dispatch<SetStateAction<boolean>>;
  consoleEvents: Array<{
    time: number;
    message: string;
    event_type: "command" | "response" | "action" | "debug" | "error" | string;
  }>;
  canSendConsole: boolean;
  consoleInput: string;
  setConsoleInput: Dispatch<SetStateAction<string>>;
  consoleSending: boolean;
  isOfflineOrNotReady: boolean;
  onConsoleKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  consoleCommands: string[];
  submitConsole: () => Promise<void>;
}

export const ConsoleCard: React.FC<ConsoleCardProps> = ({
  state,
  t,
  consoleCollapsed,
  setConsoleCollapsed,
  setConsoleClearedAt,
  consoleSettingsRef,
  consoleSettingsOpen,
  setConsoleSettingsOpen,
  consoleHideTempReplies,
  setConsoleHideTempReplies,
  consoleEvents,
  canSendConsole,
  consoleInput,
  setConsoleInput,
  consoleSending,
  isOfflineOrNotReady,
  onConsoleKeyDown,
  consoleCommands,
  submitConsole,
}) => (
  <div className="dashboard-card console-card">
    <div className="card-title">
      <Terminal size={20} />
      <span>{t.console}</span>
      <div className="panel-header-actions" style={{ marginLeft: "auto" }}>
        <button
          type="button"
          className="icon-button"
          title={t.consoleClear}
          onClick={() => {
            const last = (state.console_events ?? [])[
              (state.console_events ?? []).length - 1
            ];
            setConsoleClearedAt(last ? last.time : Date.now() / 1000);
          }}
        >
          <Trash2 size={16} />
        </button>
        <div
          ref={consoleSettingsRef}
          style={{ position: "relative", display: "inline-flex" }}
        >
          <button
            type="button"
            className="icon-button"
            title={t.temperatureSettings}
            onClick={() => setConsoleSettingsOpen((o) => !o)}
          >
            <Settings size={16} />
          </button>
          {consoleSettingsOpen && (
            <div className="console-settings-menu">
              <label className="console-settings-row">
                <input
                  type="checkbox"
                  checked={consoleHideTempReplies}
                  onChange={(e) => {
                    setConsoleHideTempReplies(e.currentTarget.checked);
                    localStorage.setItem(
                      "consoleHideTempReplies",
                      String(e.currentTarget.checked),
                    );
                  }}
                />
                <span>{t.consoleHideTemps}</span>
              </label>
            </div>
          )}
        </div>
        <CollapseButton
          collapsed={consoleCollapsed}
          storageKey="consoleCollapsed"
          setter={setConsoleCollapsed}
          t={t}
        />
      </div>
    </div>

    {!consoleCollapsed && (
      <div className="console-log" aria-live="polite">
        {consoleEvents.length === 0 ? (
          <div className="list-empty-state">{t.noConsoleMessages}</div>
        ) : (
          consoleEvents.map((event, index) => (
            <div
              className={`console-row ${event.event_type}`}
              key={`${event.time}-${index}`}
            >
              <span className="console-time">
                {new Date(event.time * 1000).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <span className="console-message">{event.message}</span>
            </div>
          ))
        )}
      </div>
    )}

    {!consoleCollapsed && canSendConsole && (
      <form
        className="console-input-row"
        onSubmit={(event) => {
          event.preventDefault();
          void submitConsole();
        }}
      >
        <input
          className="console-input"
          type="text"
          value={consoleInput}
          placeholder={t.consolePlaceholder}
          disabled={consoleSending || isOfflineOrNotReady}
          onChange={(event) => setConsoleInput(event.currentTarget.value)}
          onKeyDown={onConsoleKeyDown}
          spellCheck={false}
          autoComplete="off"
          list="console-command-list"
        />
        <datalist id="console-command-list">
          {consoleCommands.map((cmd) => (
            <option key={cmd} value={cmd} />
          ))}
        </datalist>
        <button
          type="submit"
          className="btn btn-primary console-send-btn"
          disabled={
            consoleSending || isOfflineOrNotReady || !consoleInput.trim()
          }
        >
          {t.consoleSend}
        </button>
      </form>
    )}
  </div>
);

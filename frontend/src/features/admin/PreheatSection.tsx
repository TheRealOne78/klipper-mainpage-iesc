import React from "react";
import { asNumber, readRecord } from "../../lib/formCoercion";
import type { AdminConfig } from "../../printerTypes";
import type { Translations } from "../../translations";

interface PreheatSectionProps {
  t: Translations;
  preheat: Record<string, unknown>;
  setRecordField: (
    section: keyof AdminConfig,
    field: string,
    value: unknown,
  ) => void;
  mutateDraft: (updater: (next: AdminConfig) => void) => void;
}

export const PreheatSection: React.FC<PreheatSectionProps> = ({
  t,
  preheat,
  setRecordField,
  mutateDraft,
}) => (
  <div className="admin-table-wrap">
    <div className="admin-table-toolbar">
      <span>{Object.keys(preheat).length} {t.admPresets}</span>
      <button
        className="btn btn-compact"
        onClick={() =>
          setRecordField("preheat", `preset_${Date.now()}`, {
            hotend: 200,
            bed: 60,
          })
        }
      >
        {t.admAddPreset}
      </button>
    </div>
    <div className="admin-preheat-grid">
      {Object.entries(preheat).map(([name, value]) => {
        const preset = readRecord(value);
        return (
          <div className="admin-preheat-row" key={name}>
            <input
              value={name}
              onChange={(event) => {
                const nextName = event.currentTarget.value;
                mutateDraft((next) => {
                  const record = readRecord(next.preheat);
                  const current = record[name];
                  delete record[name];
                  record[nextName] = current;
                  next.preheat = record;
                });
              }}
            />
            <label>
              {t.admHotend}
              <input
                type="number"
                value={asNumber(preset.hotend)}
                onChange={(event) =>
                  setRecordField("preheat", name, {
                    ...preset,
                    hotend: Number(event.currentTarget.value),
                  })
                }
              />
            </label>
            <label>
              {t.admBed}
              <input
                type="number"
                value={asNumber(preset.bed)}
                onChange={(event) =>
                  setRecordField("preheat", name, {
                    ...preset,
                    bed: Number(event.currentTarget.value),
                  })
                }
              />
            </label>
            <button
              className="btn btn-compact"
              onClick={() =>
                mutateDraft((next) => {
                  const record = readRecord(next.preheat);
                  delete record[name];
                  next.preheat = record;
                })
              }
            >
              {t.admRemove}
            </button>
          </div>
        );
      })}
    </div>
  </div>
);

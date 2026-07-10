import React, { useEffect, useMemo, useState } from "react";
import { Check, Pencil, Plus, X } from "lucide-react";
import { COUNTRIES, countryName, flagEmoji } from "../../lib/countries";
import { citiesForCountry } from "../../lib/cities";
import { Select } from "../../components/Select";
import type { Translations } from "../../translations";

export interface GeoRegionEntry {
  country: string;
  city?: string | null;
}

interface GeoRegionPickerProps {
  t: Translations;
  regions: GeoRegionEntry[];
  onChange: (regions: GeoRegionEntry[]) => void;
  disabled?: boolean;
}

/** Visual region allow-list builder: search/click a country, optionally add
 * a city within it, "Done" to add the country as-is (whole-country entry)
 * or "Add" to add it narrowed to that city. Existing entries are chips you
 * can click to edit (change the city, or remove) — matches the "click
 * country, then city, click again to edit/remove" flow that was asked for,
 * plus flag icons via `flagEmoji` (no image assets needed). */
export const GeoRegionPicker: React.FC<GeoRegionPickerProps> = ({
  t,
  regions,
  onChange,
  disabled,
}) => {
  const [search, setSearch] = useState("");
  const [pickingCountry, setPickingCountry] = useState<string | null>(null);
  const [cityDraft, setCityDraft] = useState("");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [cityOptions, setCityOptions] = useState<string[] | null>(null);

  useEffect(() => {
    if (!pickingCountry) {
      setCityOptions(null);
      return;
    }
    let cancelled = false;
    setCityOptions(null);
    citiesForCountry(pickingCountry).then((cities) => {
      if (!cancelled) setCityOptions(cities);
    });
    return () => {
      cancelled = true;
    };
  }, [pickingCountry]);

  const filteredCountries = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return COUNTRIES;
    return COUNTRIES.filter(
      (c) =>
        c.name.toLowerCase().includes(query) ||
        c.code.toLowerCase().includes(query),
    );
  }, [search]);

  const startPicking = (code: string, existingIndex: number | null = null) => {
    setPickingCountry(code);
    setEditingIndex(existingIndex);
    setCityDraft(
      existingIndex !== null ? regions[existingIndex]?.city ?? "" : "",
    );
  };

  const cancelPicking = () => {
    setPickingCountry(null);
    setEditingIndex(null);
    setCityDraft("");
  };

  const commit = (city: string | null) => {
    if (!pickingCountry) return;
    const entry: GeoRegionEntry = { country: pickingCountry, city };
    const next = [...regions];
    if (editingIndex !== null) {
      next[editingIndex] = entry;
    } else {
      next.push(entry);
    }
    onChange(next);
    cancelPicking();
  };

  const removeRegion = (index: number) => {
    onChange(regions.filter((_, i) => i !== index));
    if (editingIndex === index) cancelPicking();
  };

  return (
    <div
      className="geo-region-picker"
      style={disabled ? { pointerEvents: "none" } : undefined}
    >
      {regions.length > 0 && (
        <div className="geo-region-chips">
          {regions.map((region, index) => (
            <button
              type="button"
              key={`${region.country}-${region.city ?? ""}-${index}`}
              className="geo-region-chip"
              onClick={() => startPicking(region.country, index)}
              title={t.admGeoEditRegion}
            >
              <span className="geo-region-chip-flag">
                {flagEmoji(region.country)}
              </span>
              <span>
                {countryName(region.country)}
                {region.city ? ` — ${region.city}` : ""}
              </span>
              <Pencil size={12} />
              <span
                className="geo-region-chip-remove"
                onClick={(event) => {
                  event.stopPropagation();
                  removeRegion(index);
                }}
                title={t.admRemove}
              >
                <X size={12} />
              </span>
            </button>
          ))}
        </div>
      )}

      {pickingCountry ? (
        <div className="geo-region-city-step">
          <div className="geo-region-city-step-head">
            <span className="geo-region-chip-flag">
              {flagEmoji(pickingCountry)}
            </span>
            <strong>{countryName(pickingCountry)}</strong>
          </div>
          <label className="admin-field full">
            {t.admGeoCityOptional}
            <Select
              value={cityDraft}
              onChange={setCityDraft}
              placeholder={
                cityOptions === null
                  ? t.admLoading
                  : cityOptions.length > 0
                    ? t.admGeoCityOptionalPlaceholder
                    : t.admGeoNoCitiesKnown
              }
              disabled={cityOptions === null || cityOptions.length === 0}
              options={(cityOptions ?? []).map((city) => ({
                value: city,
                label: city,
              }))}
              searchable
              searchPlaceholder={t.admGeoCitySearchPlaceholder}
              truncatedHint={t.admGeoMoreCitiesHint}
            />
          </label>
          <div className="geo-region-city-step-actions">
            <button type="button" className="btn" onClick={cancelPicking}>
              {t.cancelButton}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => commit(null)}
            >
              <Check size={14} /> {t.admGeoWholeCountry}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!cityDraft.trim()}
              onClick={() => commit(cityDraft.trim())}
            >
              <Plus size={14} />{" "}
              {editingIndex !== null ? t.admGeoSave : t.admGeoAddCity}
            </button>
          </div>
        </div>
      ) : (
        <div className="geo-region-country-picker">
          <input
            type="text"
            className="geo-region-search"
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            placeholder={t.admGeoSearchCountry}
          />
          <div className="geo-region-country-list">
            {filteredCountries.map((country) => (
              <button
                type="button"
                key={country.code}
                className="geo-region-country-option"
                onClick={() => startPicking(country.code)}
              >
                <span className="geo-region-chip-flag">
                  {flagEmoji(country.code)}
                </span>
                <span>{country.name}</span>
              </button>
            ))}
            {filteredCountries.length === 0 && (
              <p className="admin-hint">{t.admGeoNoCountryMatch}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

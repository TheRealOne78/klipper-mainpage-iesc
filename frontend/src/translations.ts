// i18n is NOT hardcoded here — translations live in JSON locale files under
// ./locales/<lang>/<area>.json and are merged into one flat object per language
// so usage stays `t.someKey`. To add a new language: create ./locales/<code>/
// with the same area files, then register it in `translations` and `LANGUAGES`.

import enCommon from "./locales/en/common.json";
import enDashboard from "./locales/en/dashboard.json";
import enMachine from "./locales/en/machine.json";
import enHistory from "./locales/en/history.json";
import enAdmin from "./locales/en/admin.json";
import enPages from "./locales/en/pages.json";

import roCommon from "./locales/ro/common.json";
import roDashboard from "./locales/ro/dashboard.json";
import roMachine from "./locales/ro/machine.json";
import roHistory from "./locales/ro/history.json";
import roAdmin from "./locales/ro/admin.json";
import roPages from "./locales/ro/pages.json";

import plCommon from "./locales/pl/common.json";
import plDashboard from "./locales/pl/dashboard.json";
import plMachine from "./locales/pl/machine.json";
import plHistory from "./locales/pl/history.json";
import plAdmin from "./locales/pl/admin.json";
import plPages from "./locales/pl/pages.json";

export type Lang = "ro" | "en" | "pl";

/** Registered languages, in the order they appear in the switcher. */
export const LANGUAGES: { code: Lang; label: string }[] = [
  { code: "ro", label: "Română" },
  { code: "en", label: "English" },
  { code: "pl", label: "Polski" },
];

export const translations = {
  ro: {
    ...roCommon,
    ...roDashboard,
    ...roMachine,
    ...roHistory,
    ...roAdmin,
    ...roPages,
  },
  en: {
    ...enCommon,
    ...enDashboard,
    ...enMachine,
    ...enHistory,
    ...enAdmin,
    ...enPages,
  },
  pl: {
    ...plCommon,
    ...plDashboard,
    ...plMachine,
    ...plHistory,
    ...plAdmin,
    ...plPages,
  },
};

/** Flat translation map for a single language, i.e. `translations[lang]`. */
export type Translations = (typeof translations)["en"];

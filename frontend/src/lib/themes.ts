export interface ThemeDefinition {
  id: string;
  label: string;
  mode: "light" | "dark";
}

// `id` is written verbatim into the `data-theme` attribute on <html> — each
// one must have a matching `[data-theme="<id>"]` block in index.scss (except
// "ut-dark", which is the :root default and needs no override block).
export const THEMES: ThemeDefinition[] = [
  { id: "ut-light", label: "UT Light", mode: "light" },
  { id: "ut-dark", label: "UT Dark", mode: "dark" },
  { id: "ut-black", label: "UT Black", mode: "dark" },
  { id: "ariimeow78-light", label: "Ariimeow78's Light", mode: "light" },
  { id: "solarized-light", label: "Solarized Light", mode: "light" },
  { id: "solarized-dark", label: "Solarized Dark", mode: "dark" },
  { id: "obsidian-light", label: "Obsidian Light", mode: "light" },
  { id: "obsidian-dark", label: "Obsidian Dark", mode: "dark" },
  { id: "dracula", label: "Dracula", mode: "dark" },
  { id: "one-light", label: "One Light", mode: "light" },
  { id: "one-dark", label: "One Dark", mode: "dark" },
  { id: "gruvbox", label: "Gruvbox", mode: "dark" },
  { id: "nord", label: "Nord", mode: "dark" },
  { id: "catppuccin", label: "Catppuccin", mode: "dark" },
  { id: "tokyo-night", label: "Tokyo Night", mode: "dark" },
  { id: "monokai", label: "Monokai", mode: "dark" },
  { id: "everforest", label: "Everforest", mode: "dark" },
  { id: "material", label: "Material", mode: "dark" },
];

export const THEME_STORAGE_KEY = "theme";
export const AUTO_THEME = "auto";
export const DEFAULT_DARK_THEME = "ut-dark";
export const DEFAULT_LIGHT_THEME = "ut-light";

const THEME_BY_ID = new Map(THEMES.map((theme) => [theme.id, theme]));

export function getThemeDefinition(id: string): ThemeDefinition | undefined {
  return THEME_BY_ID.get(id);
}

// Resolves a stored selection (a concrete theme id, "auto", or a legacy
// "light"/"dark" value predating this theme system) to a concrete theme id.
export function resolveThemeSelection(
  selection: string | null | undefined,
  prefersLight: boolean,
): string {
  if (selection === "light") return DEFAULT_LIGHT_THEME;
  if (selection === "dark") return DEFAULT_DARK_THEME;
  if (selection && selection !== AUTO_THEME && THEME_BY_ID.has(selection)) {
    return selection;
  }
  return prefersLight ? DEFAULT_LIGHT_THEME : DEFAULT_DARK_THEME;
}

export function resolveThemeMode(id: string): "light" | "dark" {
  return getThemeDefinition(id)?.mode ?? "dark";
}

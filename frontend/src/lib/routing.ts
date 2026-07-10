/** Maps a page name to the hash used for its own top-level anchor (falls
 * back to the page name itself when not listed here). */
export const pageAnchors: Record<string, string> = {
  dashboard: "dashboard",
  gcode_files: "gcode-files",
  gcode_viewer: "gcode-3d",
  history: "history",
  machine: "machine",
  heightmap: "heightmap",
  settings: "settings",
  audit: "audit",
  rules: "regulament",
  troubleshooting: "proceduri-standard",
};

export const hashTargets: Record<string, { page: string; target?: string }> = {
  dashboard: { page: "dashboard" },
  "gcode-files": { page: "gcode_files" },
  "gcode-3d": { page: "gcode_viewer" },
  history: { page: "history" },
  machine: { page: "machine" },
  heightmap: { page: "heightmap" },
  settings: { page: "settings" },
  audit: { page: "audit" },
  regulament: { page: "rules" },
  rules: { page: "rules" },
  ghid: { page: "troubleshooting", target: "proceduri-standard" },
  "proceduri-standard": {
    page: "troubleshooting",
    target: "proceduri-standard",
  },
  "cum-se-incarca-corect-filamentul": {
    page: "troubleshooting",
    target: "cum-se-incarca-corect-filamentul",
  },
  "cum-se-face-nivelarea-manuala-bed-leveling": {
    page: "troubleshooting",
    target: "cum-se-face-nivelarea-manuala-bed-leveling",
  },
  depanare: { page: "troubleshooting", target: "ce-fac-in-caz-de" },
  "ce-fac-in-caz-de": {
    page: "troubleshooting",
    target: "ce-fac-in-caz-de",
  },
};

// Returns null for a hash that isn't one of the fixed page-level routes above
// — that now includes every dynamically-generated content-heading anchor
// (see useContentHeadings), which handleSidebarLinkClick already routes
// correctly itself. Returning null tells the hashchange listener to leave
// the current page/scrollTarget alone instead of clobbering them.
export const getHashTarget = (): { page: string; target?: string } | null => {
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) return { page: "rules" };
  return hashTargets[hash] || null;
};


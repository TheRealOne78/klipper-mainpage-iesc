/** True only for `http:`/`https:` URLs. Used to guard admin-configured links
 * (Mainsail/Fluidd/OctoPrint, footer links) before rendering them as an `href`
 * — those values come from the admin config, not a fixed allow-list, so a
 * misconfigured `javascript:`/`data:` URL should never become clickable. */
export function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

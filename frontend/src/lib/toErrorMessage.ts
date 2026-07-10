/** Extracts a display string from a caught value of type `unknown` — `Error`
 * instances use their `message`, anything else is stringified as-is. Used at
 * every fetch `catch` block that stores/shows the failure to the user. */
export const toErrorMessage = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

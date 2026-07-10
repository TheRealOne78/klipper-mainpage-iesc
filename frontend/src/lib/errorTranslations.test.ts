import { describe, expect, it } from "vitest";
import { localizeErrorMessage } from "./errorTranslations";

// Re-derive the exact/prefix keys from the module's own exported behavior
// rather than re-importing the (unexported) tables, so this test stays
// honest about what's actually reachable through the public function.
const EXACT_SAMPLE: [string, { en: string; ro: string; pl: string }][] = [
  [
    "Parolă incorectă",
    {
      en: "Incorrect password",
      ro: "Parolă incorectă",
      pl: "Nieprawidłowe hasło",
    },
  ],
  [
    "Această acțiune nu este permisă de configurație",
    {
      en: "This action is not allowed by the current configuration",
      ro: "Această acțiune nu este permisă de configurație",
      pl: "Ta czynność nie jest dozwolona przez konfigurację",
    },
  ],
  [
    "Imprimanta este oprită sau deconectată",
    {
      en: "The printer is off or disconnected",
      ro: "Imprimanta este oprită sau deconectată",
      pl: "Drukarka jest wyłączona lub odłączona",
    },
  ],
  [
    "Failed to disable motors",
    {
      en: "Failed to disable motors",
      ro: "Dezactivarea motoarelor a eșuat",
      pl: "Wyłączenie silników nie powiodło się",
    },
  ],
  [
    "Eroare de rețea la autentificare",
    {
      en: "Network error during authentication",
      ro: "Eroare de rețea la autentificare",
      pl: "Błąd sieci podczas uwierzytelniania",
    },
  ],
];

describe("localizeErrorMessage — EXACT table", () => {
  it.each(EXACT_SAMPLE)("translates %s for every language", (raw, expected) => {
    expect(localizeErrorMessage(raw, "en")).toBe(expected.en);
    expect(localizeErrorMessage(raw, "ro")).toBe(expected.ro);
    expect(localizeErrorMessage(raw, "pl")).toBe(expected.pl);
  });

  it("matches after trimming surrounding whitespace", () => {
    expect(localizeErrorMessage("  Parolă incorectă  ", "en")).toBe(
      "Incorrect password",
    );
  });
});

describe("localizeErrorMessage — PREFIXES table (\"<prefix>: <code>\")", () => {
  it("translates the prefix and preserves a numeric code suffix", () => {
    expect(localizeErrorMessage("Delete failed: 500", "ro")).toBe(
      "Ștergerea a eșuat: 500",
    );
    expect(localizeErrorMessage("Delete failed: 500", "pl")).toBe(
      "Usuwanie nie powiodło się: 500",
    );
    expect(localizeErrorMessage("Delete failed: 500", "en")).toBe(
      "Delete failed: 500",
    );
  });

  it("translates other known prefixes with their code suffix", () => {
    expect(localizeErrorMessage("Upload failed: 413", "ro")).toBe(
      "Încărcarea a eșuat: 413",
    );
    expect(localizeErrorMessage("Config write failed: 403", "pl")).toBe(
      "Zapis konfiguracji nie powiódł się: 403",
    );
  });

  it("preserves a non-numeric suffix too, since only the prefix is looked up", () => {
    expect(localizeErrorMessage("Request failed: Not Found", "ro")).toBe(
      "Cererea a eșuat: Not Found",
    );
  });
});

describe("localizeErrorMessage — fallback behavior", () => {
  it("returns completely unrecognized messages unchanged, for every language", () => {
    const msg = "Something totally unexpected happened";
    expect(localizeErrorMessage(msg, "en")).toBe(msg);
    expect(localizeErrorMessage(msg, "ro")).toBe(msg);
    expect(localizeErrorMessage(msg, "pl")).toBe(msg);
  });

  it("returns an empty string unchanged", () => {
    expect(localizeErrorMessage("", "en")).toBe("");
  });

  it("does not mistranslate a message that merely contains a colon but isn't a known prefix", () => {
    const msg = "Unrecognized prefix: 42";
    expect(localizeErrorMessage(msg, "ro")).toBe(msg);
  });

  it("leaves a colon-bearing message with no space after the colon untouched", () => {
    const msg = "Delete failed:500";
    expect(localizeErrorMessage(msg, "ro")).toBe(msg);
  });
});

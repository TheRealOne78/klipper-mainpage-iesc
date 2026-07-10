import type { Lang } from "../translations";

interface Translation {
  en: string;
  ro: string;
  pl: string;
}

/**
 * The backend (and a few frontend fetch wrappers) return raw, single-language
 * error text — there's no error-code protocol, just a prose string in the
 * HTTP response body or a hardcoded fallback. That text used to be shown to
 * the user verbatim regardless of the UI language they picked. This table
 * maps every KNOWN backend/frontend error string to en/ro/pl, and
 * localizeErrorMessage() below is the single choke point (called from
 * ToastContext.pushToast) that looks a message up before it's displayed.
 * Anything not in this table is shown as-is (better than nothing for a truly
 * unexpected error) — this is a pragmatic client-side patch, not a real
 * backend i18n system.
 */
const EXACT: Record<string, Translation> = {
  // --- backend: safety/permission validators (security.rs) ---
  "Parolă incorectă": {
    en: "Incorrect password",
    ro: "Parolă incorectă",
    pl: "Nieprawidłowe hasło",
  },
  "Factorul de viteză depășește limitele admise (max 500%)": {
    en: "Speed factor exceeds the allowed limits (max 500%)",
    ro: "Factorul de viteză depășește limitele admise (max 500%)",
    pl: "Współczynnik prędkości przekracza dozwolone limity (maks. 500%)",
  },
  "Mișcarea este dezactivată în timpul printării": {
    en: "Movement is disabled while printing",
    ro: "Mișcarea este dezactivată în timpul printării",
    pl: "Ruch jest wyłączony podczas drukowania",
  },
  "Axă invalidă. Sunt permise doar X, Y, Z": {
    en: "Invalid axis. Only X, Y, Z are allowed",
    ro: "Axă invalidă. Sunt permise doar X, Y, Z",
    pl: "Nieprawidłowa oś. Dozwolone są tylko X, Y, Z",
  },
  "Pasul de mișcare depășește limita configurată": {
    en: "Jog step exceeds the configured limit",
    ro: "Pasul de mișcare depășește limita configurată",
    pl: "Krok ruchu przekracza skonfigurowany limit",
  },
  "Mișcarea în jos pe axa Z este limitată pentru siguranță": {
    en: "Downward Z movement is limited for safety",
    ro: "Mișcarea în jos pe axa Z este limitată pentru siguranță",
    pl: "Ruch w dół na osi Z jest ograniczony ze względów bezpieczeństwa",
  },
  "Homing-ul este dezactivat pentru siguranță": {
    en: "Homing is disabled for safety",
    ro: "Homing-ul este dezactivat pentru siguranță",
    pl: "Bazowanie (homing) jest wyłączone ze względów bezpieczeństwa",
  },
  "Temperatura hotend depășește limita configurată": {
    en: "Hotend temperature exceeds the configured limit",
    ro: "Temperatura hotend depășește limita configurată",
    pl: "Temperatura hotendu przekracza skonfigurowany limit",
  },
  "Temperatura patului depășește limita configurată": {
    en: "Bed temperature exceeds the configured limit",
    ro: "Temperatura patului depășește limita configurată",
    pl: "Temperatura stołu przekracza skonfigurowany limit",
  },
  "Macroul nu este în lista de permisiuni pentru oaspeți": {
    en: "This macro isn't in the guest allow-list",
    ro: "Macroul nu este în lista de permisiuni pentru oaspeți",
    pl: "To makro nie znajduje się na liście dozwolonych dla gości",
  },
  "Fișierul depășește dimensiunea maximă permisă": {
    en: "The file exceeds the maximum allowed size",
    ro: "Fișierul depășește dimensiunea maximă permisă",
    pl: "Plik przekracza maksymalny dozwolony rozmiar",
  },
  "Doar fișierele .gcode și .gco sunt permise": {
    en: "Only .gcode and .gco files are allowed",
    ro: "Doar fișierele .gcode și .gco sunt permise",
    pl: "Dozwolone są tylko pliki .gcode i .gco",
  },
  "Nume de fișier invalid": {
    en: "Invalid file name",
    ro: "Nume de fișier invalid",
    pl: "Nieprawidłowa nazwa pliku",
  },

  // --- backend: general request handling (main.rs) ---
  "Această acțiune nu este permisă de configurație": {
    en: "This action is not allowed by the current configuration",
    ro: "Această acțiune nu este permisă de configurație",
    pl: "Ta czynność nie jest dozwolona przez konfigurację",
  },
  "Imprimanta este oprită sau deconectată": {
    en: "The printer is off or disconnected",
    ro: "Imprimanta este oprită sau deconectată",
    pl: "Drukarka jest wyłączona lub odłączona",
  },
  "Parola actuală este incorectă": {
    en: "Current password is incorrect",
    ro: "Parola actuală este incorectă",
    pl: "Obecne hasło jest nieprawidłowe",
  },
  "Parola nouă trebuie să aibă cel puțin 4 caractere": {
    en: "New password must be at least 4 characters",
    ro: "Parola nouă trebuie să aibă cel puțin 4 caractere",
    pl: "Nowe hasło musi mieć co najmniej 4 znaki",
  },
  "Lipsește fișierul": {
    en: "File is missing",
    ro: "Lipsește fișierul",
    pl: "Brak pliku",
  },
  "Preset preîncălzire invalid": {
    en: "Invalid preheat preset",
    ro: "Preset preîncălzire invalid",
    pl: "Nieprawidłowy profil nagrzewania",
  },
  "Axa nu este homed": {
    en: "Axis is not homed",
    ro: "Axa nu este homed",
    pl: "Oś nie jest zbazowana (homed)",
  },
  "Axă invalidă": {
    en: "Invalid axis",
    ro: "Axă invalidă",
    pl: "Nieprawidłowa oś",
  },

  // --- backend: generic validation (mostly admin-config editing) ---
  "Action must be update or recover": {
    en: "Action must be update or recover",
    ro: "Acțiunea trebuie să fie update sau recover",
    pl: "Czynność musi być update lub recover",
  },
  "Admin password hash cannot be empty": {
    en: "Admin password hash cannot be empty",
    ro: "Hash-ul parolei de admin nu poate fi gol",
    pl: "Hasz hasła administratora nie może być pusty",
  },
  "Command cannot be empty": {
    en: "Command cannot be empty",
    ro: "Comanda nu poate fi goală",
    pl: "Polecenie nie może być puste",
  },
  "Component cannot be empty": {
    en: "Component cannot be empty",
    ro: "Componenta nu poate fi goală",
    pl: "Komponent nie może być pusty",
  },
  "Current out of range": {
    en: "Current out of range",
    ro: "Valoare curentă în afara intervalului",
    pl: "Aktualna wartość poza zakresem",
  },
  "Enabled webcams need a stream URL": {
    en: "Enabled webcams need a stream URL",
    ro: "Camerele active au nevoie de un URL de stream",
    pl: "Włączone kamery wymagają adresu URL strumienia",
  },
  "Flow must be between 50 and 200": {
    en: "Flow must be between 50 and 200",
    ro: "Flux-ul trebuie să fie între 50 și 200",
    pl: "Przepływ musi być między 50 a 200",
  },
  "Font file not found": {
    en: "Font file not found",
    ro: "Fișierul de font nu a fost găsit",
    pl: "Nie znaleziono pliku czcionki",
  },
  "Footer link URL cannot be empty": {
    en: "Footer link URL cannot be empty",
    ro: "URL-ul linkului de subsol nu poate fi gol",
    pl: "Adres URL linku w stopce nie może być pusty",
  },
  "Footer link id must be non-empty alphanumeric/dash/underscore, max 64 chars": {
    en: "Footer link id must be non-empty alphanumeric/dash/underscore, max 64 chars",
    ro: "ID-ul linkului de subsol trebuie să fie alfanumeric/cratimă/underscore, max 64 caractere",
    pl: "Id linku w stopce musi być alfanumeryczne/myślnik/podkreślenie, maks. 64 znaki",
  },
  "Footer link ids must be unique": {
    en: "Footer link ids must be unique",
    ro: "ID-urile linkurilor de subsol trebuie să fie unice",
    pl: "Id linków w stopce muszą być unikalne",
  },
  "Footer link label cannot be empty": {
    en: "Footer link label cannot be empty",
    ro: "Eticheta linkului de subsol nu poate fi goală",
    pl: "Etykieta linku w stopce nie może być pusta",
  },
  "Footer link not found": {
    en: "Footer link not found",
    ro: "Linkul de subsol nu a fost găsit",
    pl: "Nie znaleziono linku w stopce",
  },
  "Group display name cannot be empty": {
    en: "Group display name cannot be empty",
    ro: "Numele afișat al grupului nu poate fi gol",
    pl: "Wyświetlana nazwa grupy nie może być pusta",
  },
  "Group id cannot be empty": {
    en: "Group id cannot be empty",
    ro: "ID-ul grupului nu poate fi gol",
    pl: "Id grupy nie może być puste",
  },
  "Group ids must be unique": {
    en: "Group ids must be unique",
    ro: "ID-urile grupurilor trebuie să fie unice",
    pl: "Id grup muszą być unikalne",
  },
  "Group max jog step must be greater than zero": {
    en: "Group max jog step must be greater than zero",
    ro: "Pasul maxim de mișcare al grupului trebuie să fie mai mare decât zero",
    pl: "Maksymalny krok ruchu grupy musi być większy od zera",
  },
  "Group max speed factor must be between 1 and 500": {
    en: "Group max speed factor must be between 1 and 500",
    ro: "Factorul de viteză maxim al grupului trebuie să fie între 1 și 500",
    pl: "Maksymalny współczynnik prędkości grupy musi być między 1 a 500",
  },
  "Group max upload size must be greater than zero": {
    en: "Group max upload size must be greater than zero",
    ro: "Dimensiunea maximă de încărcare a grupului trebuie să fie mai mare decât zero",
    pl: "Maksymalny rozmiar przesyłania grupy musi być większy od zera",
  },
  "Hashing failed": {
    en: "Hashing failed",
    ro: "Criptarea (hashing) a eșuat",
    pl: "Haszowanie nie powiodło się",
  },
  "Heater invalid": {
    en: "Invalid heater",
    ro: "Element de încălzire invalid",
    pl: "Nieprawidłowy grzałka",
  },
  "Icon not found": {
    en: "Icon not found",
    ro: "Iconița nu a fost găsită",
    pl: "Nie znaleziono ikony",
  },
  "Invalid G-code path": {
    en: "Invalid G-code path",
    ro: "Cale G-code invalidă",
    pl: "Nieprawidłowa ścieżka G-code",
  },
  "Invalid LED name": {
    en: "Invalid LED name",
    ro: "Nume LED invalid",
    pl: "Nieprawidłowa nazwa LED",
  },
  "Invalid Z delta": {
    en: "Invalid Z delta",
    ro: "Delta Z invalidă",
    pl: "Nieprawidłowa delta Z",
  },
  "Invalid action": {
    en: "Invalid action",
    ro: "Acțiune invalidă",
    pl: "Nieprawidłowa czynność",
  },
  "Invalid fan name": {
    en: "Invalid fan name",
    ro: "Nume ventilator invalid",
    pl: "Nieprawidłowa nazwa wentylatora",
  },
  "Invalid file path": {
    en: "Invalid file path",
    ro: "Cale de fișier invalidă",
    pl: "Nieprawidłowa ścieżka pliku",
  },
  "Invalid file root": {
    en: "Invalid file root",
    ro: "Rădăcină de fișiere invalidă",
    pl: "Nieprawidłowy katalog główny plików",
  },
  "Invalid heater name": {
    en: "Invalid heater name",
    ro: "Nume element de încălzire invalid",
    pl: "Nieprawidłowa nazwa grzałki",
  },
  "Invalid id": {
    en: "Invalid id",
    ro: "ID invalid",
    pl: "Nieprawidłowe id",
  },
  "Invalid object name": {
    en: "Invalid object name",
    ro: "Nume obiect invalid",
    pl: "Nieprawidłowa nazwa obiektu",
  },
  "Invalid path": {
    en: "Invalid path",
    ro: "Cale invalidă",
    pl: "Nieprawidłowa ścieżka",
  },
  "Invalid pin name": {
    en: "Invalid pin name",
    ro: "Nume pin invalid",
    pl: "Nieprawidłowa nazwa pinu",
  },
  "Invalid stepper name": {
    en: "Invalid stepper name",
    ro: "Nume motor pas cu pas invalid",
    pl: "Nieprawidłowa nazwa silnika krokowego",
  },
  "Length out of range": {
    en: "Length out of range",
    ro: "Lungime în afara intervalului",
    pl: "Długość poza zakresem",
  },
  "Limit value out of range": {
    en: "Limit value out of range",
    ro: "Valoare limită în afara intervalului",
    pl: "Wartość graniczna poza zakresem",
  },
  "Logo not found": {
    en: "Logo not found",
    ro: "Logo-ul nu a fost găsit",
    pl: "Nie znaleziono logo",
  },
  "Missing a required built-in group (anonymous/guest/admin)": {
    en: "Missing a required built-in group (anonymous/guest/admin)",
    ro: "Lipsește un grup predefinit obligatoriu (anonymous/guest/admin)",
    pl: "Brak wymaganej wbudowanej grupy (anonymous/guest/admin)",
  },
  'Signup default group cannot be "anonymous" (that group is for sessionless visitors only)': {
    en: 'Signup default group cannot be "anonymous" (that group is for sessionless visitors only)',
    ro: 'Grupul implicit pentru înregistrare nu poate fi "anonymous" (acel grup e doar pentru vizitatori fără sesiune)',
    pl: 'Domyślna grupa rejestracji nie może być "anonymous" (ta grupa jest tylko dla gości bez sesji)',
  },
  "Missing directory path": {
    en: "Missing directory path",
    ro: "Lipsește calea directorului",
    pl: "Brak ścieżki katalogu",
  },
  "Missing file": {
    en: "Missing file",
    ro: "Lipsește fișierul",
    pl: "Brak pliku",
  },
  "Moonraker URL cannot be empty": {
    en: "Moonraker URL cannot be empty",
    ro: "URL-ul Moonraker nu poate fi gol",
    pl: "Adres URL Moonraker nie może być pusty",
  },
  "No custom font uploaded": {
    en: "No custom font uploaded",
    ro: "Niciun font personalizat încărcat",
    pl: "Nie przesłano niestandardowej czcionki",
  },
  "No filenames provided": {
    en: "No filenames provided",
    ro: "Niciun nume de fișier furnizat",
    pl: "Nie podano nazw plików",
  },
  "No files selected": {
    en: "No files selected",
    ro: "Niciun fișier selectat",
    pl: "Nie wybrano plików",
  },
  "No job ids provided": {
    en: "No job ids provided",
    ro: "Niciun id de job furnizat",
    pl: "Nie podano id zadań",
  },
  "Only G-code files can be fetched": {
    en: "Only G-code files can be fetched",
    ro: "Se pot obține doar fișiere G-code",
    pl: "Można pobierać tylko pliki G-code",
  },
  "Power device cannot be empty": {
    en: "Power device cannot be empty",
    ro: "Dispozitivul de alimentare nu poate fi gol",
    pl: "Urządzenie zasilania nie może być puste",
  },
  "Preheat bed value is outside configured limits": {
    en: "Preheat bed value is outside configured limits",
    ro: "Valoarea de preîncălzire a patului este în afara limitelor configurate",
    pl: "Wartość nagrzewania stołu przekracza skonfigurowane limity",
  },
  "Preheat hotend value is outside configured limits": {
    en: "Preheat hotend value is outside configured limits",
    ro: "Valoarea de preîncălzire a hotend-ului este în afara limitelor configurate",
    pl: "Wartość nagrzewania hotendu przekracza skonfigurowane limity",
  },
  "Preheat preset names cannot be empty": {
    en: "Preheat preset names cannot be empty",
    ro: "Numele presetărilor de preîncălzire nu pot fi goale",
    pl: "Nazwy profili nagrzewania nie mogą być puste",
  },
  "Retraction value out of range": {
    en: "Retraction value out of range",
    ro: "Valoare de retragere în afara intervalului",
    pl: "Wartość retrakcji poza zakresem",
  },
  "Scope invalid": {
    en: "Invalid scope",
    ro: "Domeniu (scope) invalid",
    pl: "Nieprawidłowy zakres",
  },
  "Server port must be greater than zero": {
    en: "Server port must be greater than zero",
    ro: "Portul serverului trebuie să fie mai mare decât zero",
    pl: "Port serwera musi być większy od zera",
  },
  "Service cannot be empty": {
    en: "Service cannot be empty",
    ro: "Serviciul nu poate fi gol",
    pl: "Usługa nie może być pusta",
  },
  "Speed must be between 0 and 1": {
    en: "Speed must be between 0 and 1",
    ro: "Viteza trebuie să fie între 0 și 1",
    pl: "Prędkość musi być między 0 a 1",
  },
  "Speed out of range": {
    en: "Speed out of range",
    ro: "Viteză în afara intervalului",
    pl: "Prędkość poza zakresem",
  },
  "Target out of range": {
    en: "Target out of range",
    ro: "Țintă în afara intervalului",
    pl: "Wartość docelowa poza zakresem",
  },
  "Temperature limits cannot be negative": {
    en: "Temperature limits cannot be negative",
    ro: "Limitele de temperatură nu pot fi negative",
    pl: "Limity temperatury nie mogą być ujemne",
  },
  "Unknown branding asset": {
    en: "Unknown branding asset",
    ro: "Fișier de branding necunoscut",
    pl: "Nieznany zasób brandingu",
  },
  "Unknown language": {
    en: "Unknown language",
    ro: "Limbă necunoscută",
    pl: "Nieznany język",
  },
  "Unsupported image type": {
    en: "Unsupported image type",
    ro: "Tip de imagine neacceptat",
    pl: "Nieobsługiwany typ obrazu",
  },
  "Value must be between 0 and 1": {
    en: "Value must be between 0 and 1",
    ro: "Valoarea trebuie să fie între 0 și 1",
    pl: "Wartość musi być między 0 a 1",
  },
  "Webcam names cannot be empty": {
    en: "Webcam names cannot be empty",
    ro: "Numele camerelor web nu pot fi goale",
    pl: "Nazwy kamer internetowych nie mogą być puste",
  },

  // --- backend: local signup/login/anti-spam (handlers/users.rs, pow.rs, geo.rs) ---
  "Înregistrarea nu este activată": {
    en: "Signup is not enabled",
    ro: "Înregistrarea nu este activată",
    pl: "Rejestracja nie jest włączona",
  },
  "Adresă de email invalidă": {
    en: "Invalid email address",
    ro: "Adresă de email invalidă",
    pl: "Nieprawidłowy adres e-mail",
  },
  "Acest domeniu de email nu are voie să se înregistreze": {
    en: "This email domain isn't allowed to sign up",
    ro: "Acest domeniu de email nu are voie să se înregistreze",
    pl: "Ta domena e-mail nie może się zarejestrować",
  },
  "Parola trebuie să aibă minim 8 caractere, cu cel puțin o literă și o cifră": {
    en: "Password must be at least 8 characters, with at least one letter and one digit",
    ro: "Parola trebuie să aibă minim 8 caractere, cu cel puțin o literă și o cifră",
    pl: "Hasło musi mieć co najmniej 8 znaków, w tym jedną literę i jedną cyfrę",
  },
  "Parola este prea lungă": {
    en: "Password is too long",
    ro: "Parola este prea lungă",
    pl: "Hasło jest za długie",
  },
  "Parola nouă este prea lungă": {
    en: "New password is too long",
    ro: "Parola nouă este prea lungă",
    pl: "Nowe hasło jest za długie",
  },
  "Există deja un cont cu acest email": {
    en: "An account with this email already exists",
    ro: "Există deja un cont cu acest email",
    pl: "Konto z tym adresem e-mail już istnieje",
  },
  "Adresa de email nu a fost confirmată încă": {
    en: "This email address hasn't been confirmed yet",
    ro: "Adresa de email nu a fost confirmată încă",
    pl: "Ten adres e-mail nie został jeszcze potwierdzony",
  },
  "Email sau parolă incorectă": {
    en: "Incorrect email or password",
    ro: "Email sau parolă incorectă",
    pl: "Nieprawidłowy e-mail lub hasło",
  },
  "Grup necunoscut": {
    en: "Unknown group",
    ro: "Grup necunoscut",
    pl: "Nieznana grupa",
  },
  "Cont inexistent": {
    en: "Account not found",
    ro: "Cont inexistent",
    pl: "Nie znaleziono konta",
  },
  "Contul este deja confirmat": {
    en: "This account is already confirmed",
    ro: "Contul este deja confirmat",
    pl: "To konto zostało już potwierdzone",
  },
  "Această acțiune nu este permisă din locația ta": {
    en: "This action isn't allowed from your location",
    ro: "Această acțiune nu este permisă din locația ta",
    pl: "Ta czynność nie jest dozwolona z Twojej lokalizacji",
  },
  "Challenge invalid": {
    en: "Anti-spam challenge is invalid",
    ro: "Challenge invalid",
    pl: "Nieprawidłowe wyzwanie anty-spamowe",
  },
  "Challenge expirat, cere unul nou": {
    en: "Anti-spam challenge expired, request a new one",
    ro: "Challenge expirat, cere unul nou",
    pl: "Wyzwanie anty-spamowe wygasło, poproś o nowe",
  },
  "Soluția anti-spam este invalidă": {
    en: "Anti-spam solution is invalid",
    ro: "Soluția anti-spam este invalidă",
    pl: "Rozwiązanie anty-spamowe jest nieprawidłowe",
  },
  "Macrourile necesită autentificare": {
    en: "Macros require signing in",
    ro: "Macrourile necesită autentificare",
    pl: "Makra wymagają zalogowania",
  },

  // --- frontend: hardcoded fallbacks (useAdminConfig.ts 404 diagnostics) ---
  "Admin config endpoint returned 404. Restart the backend so the latest admin routes are loaded, then verify the frontend proxy forwards /api/admin/config to the backend.":
    {
      en: "Admin config endpoint returned 404. Restart the backend so the latest admin routes are loaded, then verify the frontend proxy forwards /api/admin/config to the backend.",
      ro: "Endpoint-ul de configurație admin a răspuns cu 404. Repornește backend-ul ca să se încarce cele mai noi rute admin, apoi verifică dacă proxy-ul frontend-ului redirecționează /api/admin/config către backend.",
      pl: "Punkt końcowy konfiguracji administratora zwrócił 404. Uruchom ponownie backend, aby załadować najnowsze trasy administratora, a następnie sprawdź, czy proxy frontendu przekazuje /api/admin/config do backendu.",
    },
  "Admin audit endpoint returned 404. Restart the backend and check that the proxy is forwarding /api/admin/audit.":
    {
      en: "Admin audit endpoint returned 404. Restart the backend and check that the proxy is forwarding /api/admin/audit.",
      ro: "Endpoint-ul de audit admin a răspuns cu 404. Repornește backend-ul și verifică dacă proxy-ul redirecționează /api/admin/audit.",
      pl: "Punkt końcowy audytu administratora zwrócił 404. Uruchom ponownie backend i sprawdź, czy proxy przekazuje /api/admin/audit.",
    },

  // --- frontend: hardcoded fallbacks (admin JSON editors) ---
  "Expected a JSON object": {
    en: "Expected a JSON object",
    ro: "Se aștepta un obiect JSON",
    pl: "Oczekiwano obiektu JSON",
  },
  "Invalid JSON syntax": {
    en: "Invalid JSON syntax",
    ro: "Sintaxă JSON invalidă",
    pl: "Nieprawidłowa składnia JSON",
  },

  // --- frontend: hardcoded fallbacks (Dashboard.tsx action handlers) ---
  "Failed to disable motors": {
    en: "Failed to disable motors",
    ro: "Dezactivarea motoarelor a eșuat",
    pl: "Wyłączenie silników nie powiodło się",
  },
  "Failed to set extruder temperature": {
    en: "Failed to set extruder temperature",
    ro: "Setarea temperaturii extruderului a eșuat",
    pl: "Ustawienie temperatury ekstrudera nie powiodło się",
  },
  "Failed to set bed temperature": {
    en: "Failed to set bed temperature",
    ro: "Setarea temperaturii patului a eșuat",
    pl: "Ustawienie temperatury stołu nie powiodło się",
  },
  "Failed to set temperature preset": {
    en: "Failed to set temperature preset",
    ro: "Setarea presetării de temperatură a eșuat",
    pl: "Ustawienie profilu temperatury nie powiodło się",
  },

  // --- frontend: hardcoded fallbacks (usePrinterState.ts login/upload) ---
  // ("Parolă incorectă" is already registered above, from security.rs.)
  "Eroare de rețea la autentificare": {
    en: "Network error during authentication",
    ro: "Eroare de rețea la autentificare",
    pl: "Błąd sieci podczas uwierzytelniania",
  },
  "Încărcare eșuată": {
    en: "Upload failed",
    ro: "Încărcare eșuată",
    pl: "Przesyłanie nie powiodło się",
  },
  "Eroare de rețea în timpul încărcării": {
    en: "Network error during upload",
    ro: "Eroare de rețea în timpul încărcării",
    pl: "Błąd sieci podczas przesyłania",
  },
};

/** "<Prefix>: <code>" style fallbacks written directly in usePrinterState.ts
 * (e.g. "Delete failed: 500") — translated by prefix, code passed through. */
const PREFIXES: Record<string, Translation> = {
  "Nu s-a putut obține un challenge anti-spam": {
    en: "Could not obtain an anti-spam challenge",
    ro: "Nu s-a putut obține un challenge anti-spam",
    pl: "Nie udało się uzyskać wyzwania anty-spamowego",
  },
  "Înregistrarea a eșuat": {
    en: "Signup failed",
    ro: "Înregistrarea a eșuat",
    pl: "Rejestracja nie powiodła się",
  },
  "Admin audit request failed": {
    en: "Admin audit request failed",
    ro: "Cererea de audit admin a eșuat",
    pl: "Żądanie audytu administratora nie powiodło się",
  },
  "Admin config request failed": {
    en: "Admin config request failed",
    ro: "Cererea de configurație admin a eșuat",
    pl: "Żądanie konfiguracji administratora nie powiodło się",
  },
  "Admin config update failed": {
    en: "Admin config update failed",
    ro: "Actualizarea configurației admin a eșuat",
    pl: "Aktualizacja konfiguracji administratora nie powiodła się",
  },
  "Admin macros request failed": {
    en: "Admin macros request failed",
    ro: "Cererea de macrouri admin a eșuat",
    pl: "Żądanie makr administratora nie powiodło się",
  },
  "Admin users request failed": {
    en: "Admin users request failed",
    ro: "Cererea de conturi admin a eșuat",
    pl: "Żądanie kont administratora nie powiodło się",
  },
  "Failed to create account": {
    en: "Failed to create account",
    ro: "Crearea contului a eșuat",
    pl: "Utworzenie konta nie powiodło się",
  },
  "Failed to delete account": {
    en: "Failed to delete account",
    ro: "Ștergerea contului a eșuat",
    pl: "Usunięcie konta nie powiodło się",
  },
  "Failed to change account group": {
    en: "Failed to change account group",
    ro: "Schimbarea grupului contului a eșuat",
    pl: "Zmiana grupy konta nie powiodła się",
  },
  "Failed to resend verification email": {
    en: "Failed to resend verification email",
    ro: "Retrimiterea emailului de confirmare a eșuat",
    pl: "Ponowne wysłanie e-maila weryfikacyjnego nie powiodło się",
  },
  "Asset upload failed": {
    en: "Asset upload failed",
    ro: "Încărcarea fișierului a eșuat",
    pl: "Przesyłanie zasobu nie powiodło się",
  },
  "Config list failed": {
    en: "Config list failed",
    ro: "Listarea configurației a eșuat",
    pl: "Listowanie konfiguracji nie powiodło się",
  },
  "Config read failed": {
    en: "Config read failed",
    ro: "Citirea configurației a eșuat",
    pl: "Odczyt konfiguracji nie powiódł się",
  },
  "Config write failed": {
    en: "Config write failed",
    ro: "Scrierea configurației a eșuat",
    pl: "Zapis konfiguracji nie powiódł się",
  },
  "Create directory failed": {
    en: "Create directory failed",
    ro: "Crearea directorului a eșuat",
    pl: "Tworzenie katalogu nie powiodło się",
  },
  "Delete directory failed": {
    en: "Delete directory failed",
    ro: "Ștergerea directorului a eșuat",
    pl: "Usuwanie katalogu nie powiodło się",
  },
  "Delete failed": {
    en: "Delete failed",
    ro: "Ștergerea a eșuat",
    pl: "Usuwanie nie powiodło się",
  },
  "Directory list failed": {
    en: "Directory list failed",
    ro: "Listarea directorului a eșuat",
    pl: "Listowanie katalogu nie powiodło się",
  },
  "Endstop query failed": {
    en: "Endstop query failed",
    ro: "Interogarea endstop-urilor a eșuat",
    pl: "Zapytanie o endstopy nie powiodło się",
  },
  "File list request failed": {
    en: "File list request failed",
    ro: "Cererea de listare a fișierelor a eșuat",
    pl: "Żądanie listy plików nie powiodło się",
  },
  "Font upload failed": {
    en: "Font upload failed",
    ro: "Încărcarea fontului a eșuat",
    pl: "Przesyłanie czcionki nie powiodło się",
  },
  "History request failed": {
    en: "History request failed",
    ro: "Cererea de istoric a eșuat",
    pl: "Żądanie historii nie powiodło się",
  },
  "Icon upload failed": {
    en: "Icon upload failed",
    ro: "Încărcarea iconiței a eșuat",
    pl: "Przesyłanie ikony nie powiodło się",
  },
  "Job queue request failed": {
    en: "Job queue request failed",
    ro: "Cererea cozii de printare a eșuat",
    pl: "Żądanie kolejki zadań nie powiodło się",
  },
  "Metadata failed": {
    en: "Metadata request failed",
    ro: "Cererea de metadate a eșuat",
    pl: "Żądanie metadanych nie powiodło się",
  },
  "Move failed": {
    en: "Move failed",
    ro: "Mutarea a eșuat",
    pl: "Przenoszenie nie powiodło się",
  },
  "Password change failed": {
    en: "Password change failed",
    ro: "Schimbarea parolei a eșuat",
    pl: "Zmiana hasła nie powiodła się",
  },
  "Power devices request failed": {
    en: "Power devices request failed",
    ro: "Cererea dispozitivelor de alimentare a eșuat",
    pl: "Żądanie urządzeń zasilania nie powiodło się",
  },
  "Request failed": {
    en: "Request failed",
    ro: "Cererea a eșuat",
    pl: "Żądanie nie powiodło się",
  },
  "Server info failed": {
    en: "Server info request failed",
    ro: "Cererea de informații server a eșuat",
    pl: "Żądanie informacji o serwerze nie powiodło się",
  },
  "Services request failed": {
    en: "Services request failed",
    ro: "Cererea de servicii a eșuat",
    pl: "Żądanie usług nie powiodło się",
  },
  "System loads failed": {
    en: "System loads request failed",
    ro: "Cererea de încărcare sistem a eșuat",
    pl: "Żądanie obciążenia systemu nie powiodło się",
  },
  "Update status failed": {
    en: "Update status request failed",
    ro: "Cererea de stare a actualizărilor a eșuat",
    pl: "Żądanie stanu aktualizacji nie powiodło się",
  },
  "Upload failed": {
    en: "Upload failed",
    ro: "Încărcarea a eșuat",
    pl: "Przesyłanie nie powiodło się",
  },
};

/** Looks up a raw error message (backend response text, or one of this
 * app's own hardcoded fetch-failure fallbacks) and returns its translation
 * for `lang`, falling back to the original message unchanged if unknown. */
export function localizeErrorMessage(message: string, lang: Lang): string {
  const trimmed = message.trim();
  const exact = EXACT[trimmed];
  if (exact) return exact[lang];

  // "<Prefix>: <code>" — translate the prefix, keep the code as-is.
  const colonIndex = trimmed.lastIndexOf(": ");
  if (colonIndex > 0) {
    const prefix = trimmed.slice(0, colonIndex);
    const suffix = trimmed.slice(colonIndex + 2);
    const entry = PREFIXES[prefix];
    if (entry) return `${entry[lang]}: ${suffix}`;
  }

  return message;
}

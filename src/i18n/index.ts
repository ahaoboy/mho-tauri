// ── i18n setup ──────────────────────────────────────────────────────────
//
// English is the fallback; Chinese is detected from the system language.
// The user's choice is persisted in localStorage, so the next launch starts
// in the same language. `system` means "follow the OS/browser preference".

import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en";
import zh from "./zh";

/** Languages shipped with the app. */
export const LANGUAGES = ["en", "zh"] as const;
export type Language = (typeof LANGUAGES)[number];

/** Persisted preference: a concrete language or `system`. */
export const SYSTEM = "system";
export type LanguagePreference = Language | typeof SYSTEM;

const STORAGE_KEY = "mho:language";

function isLanguage(value: unknown): value is Language {
  return LANGUAGES.includes(value as Language);
}

/** Best match for the OS/browser language list; English when unknown. */
export function systemLanguage(): Language {
  const tags = [navigator.language, ...(navigator.languages ?? [])];
  for (const tag of tags) {
    const base = tag?.toLowerCase().split("-")[0];
    if (base === "zh") return "zh";
    if (base === "en") return "en";
    // Anything else falls through to the next tag, then to English.
  }
  return "en";
}

/** Stored preference, or `system` when the user never picked one. */
export function getPreference(): LanguagePreference {
  const stored = localStorage.getItem(STORAGE_KEY);
  return isLanguage(stored) ? stored : SYSTEM;
}

/** Language a preference resolves to right now. */
export function resolve(preference: LanguagePreference): Language {
  return preference === SYSTEM ? systemLanguage() : preference;
}

function apply() {
  void i18n.changeLanguage(resolve(getPreference()));
}

/**
 * Persist and apply a preference. `system` clears the stored value so a later
 * OS language change is picked up again.
 */
export function setLanguagePreference(preference: LanguagePreference) {
  if (preference === SYSTEM) {
    localStorage.removeItem(STORAGE_KEY);
  } else {
    localStorage.setItem(STORAGE_KEY, preference);
  }
  apply();
}

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, zh: { translation: zh } },
  lng: resolve(getPreference()),
  fallbackLng: "en",
  supportedLngs: [...LANGUAGES],
  load: "currentOnly",
  interpolation: { escapeValue: false },
});

// Keep <html lang> in sync for accessibility and native rendering.
i18n.on("languageChanged", (lng) => {
  document.documentElement.lang = lng;
});
document.documentElement.lang = i18n.language;

// Follow the OS/browser language while the preference is `system`.
if (typeof window !== "undefined") {
  window.addEventListener("languagechange", () => {
    if (getPreference() === SYSTEM) apply();
  });
}

export default i18n;

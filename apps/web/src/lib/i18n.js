// The site's languages and how a word is looked up (issue #7). Pure: the React side is
// I18nContext.jsx (useT). The words themselves are lib/strings.js.
//
// Only the interface is translated. Place names, addresses, inspection types and the
// health departments' violation text are shown as published, and the site's name stays.
import { STRINGS } from "./strings.js";

// Each language by its own name, as the picker lists it, with the locale for dates.
export const LANGUAGES = [
  { code: "en", name: "English", locale: "en-US" },
  { code: "es", name: "Español", locale: "es-US" },
];
export const DEFAULT_LANGUAGE = "en";
export const LANGUAGE_KEY = "lfs_lang"; // localStorage: the visitor's choice

/** A language by its own name ("Español"); the code itself for one the site lacks. */
export const languageName = (code) => LANGUAGES.find((l) => l.code === code)?.name ?? code;

const known = (code) => LANGUAGES.some((l) => l.code === code);
export const localeOf = (code) => (LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0]).locale;

/**
 * The language to show: the visitor's saved choice, else the first language their browser
 * asks for that the site has, else English. storage may be null (blocked site data).
 * @param {Storage|null} storage
 * @param {readonly string[]} browserLanguages  navigator.languages, e.g. ["es-MX", "en"]
 */
export function pickLanguage(storage, browserLanguages = []) {
  try {
    const saved = storage?.getItem(LANGUAGE_KEY);
    if (known(saved)) return saved;
  } catch {
    /* blocked storage: fall through */
  }
  for (const tag of browserLanguages ?? []) {
    const code = String(tag).toLowerCase().split("-")[0];
    if (known(code)) return code;
  }
  return DEFAULT_LANGUAGE;
}

/** Remembers the visitor's choice; quietly does nothing when storage is blocked. */
export function saveLanguage(storage, code) {
  try {
    if (known(code)) storage?.setItem(LANGUAGE_KEY, code);
  } catch {
    /* blocked storage */
  }
}

// A plural entry is { one, other }; vars.n picks the form.
const form = (entry, n) =>
  entry && typeof entry === "object" ? (n === 1 ? entry.one : entry.other) : entry;

/**
 * The word for `key` in `lang`, with {name} placeholders filled from vars. Falls back to
 * English, then to the key itself, so a missing word shows up instead of breaking a page.
 */
export function translate(lang, key, vars = {}) {
  const entry = STRINGS[lang]?.[key] ?? STRINGS[DEFAULT_LANGUAGE][key];
  const text = form(entry, vars.n) ?? key;
  return text.replace(/\{(\w+)\}/g, (whole, name) => (name in vars ? String(vars[name]) : whole));
}

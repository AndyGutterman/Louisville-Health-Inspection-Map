/**
 * email/words.js — every word the emails say, in each language the site has (English and
 * Spanish), so the digest and the one-off emails can go out in the subscriber's own
 * language (profiles.language; migration 20261129000000). Pure, and tested
 * (tests/email_words.test.js: both languages have every entry, and the same shape).
 *
 * Only the emails' own wording is here. Place names, addresses and the county names are
 * shown as published, and so is a one-off email's message (the admin writes it in the
 * language they want). Spanish is plain US Spanish, written to avoid "usted".
 *
 * An entry is a string or a function of what it needs. A count with its noun is
 * `count(lang, n, "inspection")`.
 */

export const EMAIL_LANGUAGES = ["en", "es"];
export const DEFAULT_EMAIL_LANGUAGE = "en";

/** A language the emails have, else English (an unknown or empty value is English). */
export const emailLanguage = (code) =>
  EMAIL_LANGUAGES.includes(code) ? code : DEFAULT_EMAIL_LANGUAGE;

const LOCALES = { en: "en-US", es: "es-US" };

// Nouns that are counted: [one, other].
const NOUNS = {
  en: {
    inspection: ["inspection", "inspections"],
    violation: ["violation", "violations"],
    place: ["place", "places"],
    savedPlace: ["saved place", "saved places"],
  },
  es: {
    inspection: ["inspección", "inspecciones"],
    violation: ["infracción", "infracciones"],
    place: ["lugar", "lugares"],
    savedPlace: ["lugar guardado", "lugares guardados"],
  },
};

const en = {
  test: "[Test] ",
  shownAbove: (n) => ` (${n} shown above)`,
  placard: (grade) => `${grade} placard`,
  inspectionsThisWeek: (n, c) => `${c} this week`,
  digestSubject: (c, failing) => `${c} this week, ${failing} failing · Louisville Food Safe`,
  inRegion: (n, region) => `${n} in ${region}`,
  areaCounts: (c, failing) => `${c} this week, ${failing ? `${failing} failing` : "none failing"}`,
  areaNone: "No inspections here this week.",
  savedWhatList: (c) => `${c} in this list`,
  savedWhatYours: (c) => `your ${c}`,
  savedNone: (what, total) =>
    `None of ${what} ${total === 1 ? "was" : "were"} inspected this week.`,
  savedSome: (inspected, what) =>
    `${inspected} of ${what} ${inspected === 1 ? "was" : "were"} inspected this week.`,
  labelList: "Your list",
  labelSaved: "Your saved places",
  labelArea: (miles) => `Your watch area · ${miles} mi`,
  watchArea: "Watch area",
  everywhere: "Everywhere this week",
  moreOnMap: (n) => `and ${n} more on the map →`,
  moreOnMapText: (n) => `and ${n} more on the map`,
  onlyShownAbove: (c) => `Only the ${c} shown above.`,
  nothingUnder: (score) => `Nothing scored under ${score} this week.`,
  failingTitle: (score) => `Scored under ${score} or a C placard`,
  perfectTitle: "Perfect scores",
  everywhereText: "Everywhere. ",
  onlyThoseAbove: "  only those shown above",
  none: "  none",
  textHead: (c, range, counts) =>
    `Louisville Food Safe: ${c} this week (${range})${counts ? `, ${counts}` : ""}`,
  textList: (name, counts) => `${name ? `Your list: ${name}.` : "Your saved places:"} ${counts}`,
  textArea: (name, miles, counts) => `Your watch area: ${name} (${miles} mi). ${counts}`,
  textFailingHead: (everywhere, score) => `${everywhere}Scored under ${score} or a C placard:`,
  textPerfectHead: "Perfect scores:",
  disclaimer:
    "Scores and placards are the health departments' own. Bullitt County posts scores, not placards.",
  unsubscribe: "Unsubscribe",
  unsubscribeText: (url) => `Unsubscribe: ${url}`,
  aboutData: "About the data",
  privacy: "Privacy",
  openMap: "Open the map",
  why: "You're getting this because you subscribed to the Louisville Food Safe weekly digest.",
};

const es = {
  test: "[Prueba] ",
  shownAbove: (n) => ` (${n} ya se ${n === 1 ? "muestra" : "muestran"} arriba)`,
  placard: (grade) => `letrero ${grade}`,
  inspectionsThisWeek: (n, c) => `${c} esta semana`,
  digestSubject: (c, failing) =>
    `${c} esta semana, ${failing} ${failing === 1 ? "reprobada" : "reprobadas"} · Louisville Food Safe`,
  inRegion: (n, region) => `${n} en ${region}`,
  areaCounts: (c, failing) =>
    `${c} esta semana, ${failing ? `${failing} ${failing === 1 ? "reprobada" : "reprobadas"}` : "ninguna reprobada"}`,
  areaNone: "Ninguna inspección aquí esta semana.",
  savedWhatList: (c) => `${c} de esta lista`,
  savedWhatYours: (c) => `tus ${c}`,
  savedNone: (what) => `No se inspeccionó ninguno de ${what} esta semana.`,
  savedSome: (inspected, what) =>
    `${inspected === 1 ? "Se inspeccionó" : "Se inspeccionaron"} ${inspected} de ${what} esta semana.`,
  labelList: "Tu lista",
  labelSaved: "Tus lugares guardados",
  labelArea: (miles) => `Tu zona vigilada · ${miles} mi`,
  watchArea: "Zona vigilada",
  everywhere: "En todas partes esta semana",
  moreOnMap: (n) => `y ${n} más en el mapa →`,
  moreOnMapText: (n) => `y ${n} más en el mapa`,
  onlyShownAbove: (c) => `Solo ${c}, ya en la lista de arriba.`,
  nothingUnder: (score) => `Nada sacó menos de ${score} esta semana.`,
  failingTitle: (score) => `Menos de ${score} o letrero C`,
  perfectTitle: "Puntuaciones perfectas",
  everywhereText: "En todas partes. ",
  onlyThoseAbove: "  solo los que se muestran arriba",
  none: "  ninguno",
  textHead: (c, range, counts) =>
    `Louisville Food Safe: ${c} esta semana (${range})${counts ? `, ${counts}` : ""}`,
  textList: (name, counts) => `${name ? `Tu lista: ${name}.` : "Tus lugares guardados:"} ${counts}`,
  textArea: (name, miles, counts) => `Tu zona vigilada: ${name} (${miles} mi). ${counts}`,
  textFailingHead: (everywhere, score) => `${everywhere}Menos de ${score} o letrero C:`,
  textPerfectHead: "Puntuaciones perfectas:",
  disclaimer:
    "Las puntuaciones y los letreros son los de los departamentos de salud. El condado de Bullitt publica puntuaciones, no letreros.",
  unsubscribe: "Cancelar suscripción",
  unsubscribeText: (url) => `Cancelar suscripción: ${url}`,
  aboutData: "Sobre los datos",
  privacy: "Privacidad",
  openMap: "Abrir el mapa",
  why: "Recibes este correo porque te suscribiste al resumen semanal de Louisville Food Safe.",
};

export const WORDS = { en, es };

/** The wording for a language (English when it isn't one the emails have). */
export const wordsFor = (lang) => WORDS[emailLanguage(lang)];

/** The locale dates are written in. */
export const localeFor = (lang) => LOCALES[emailLanguage(lang)];

/** "3 inspections", "1 inspección". noun: inspection, violation, place or savedPlace. */
export function count(lang, n, noun) {
  const [one, other] = NOUNS[emailLanguage(lang)][noun];
  return `${n} ${n === 1 ? one : other}`;
}

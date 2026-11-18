// Every word of the interface, in each language (lib/i18n.js looks them up). A key is
// "<part>.<what>". A plural is { one, other }, chosen by the number passed as `n`.
// {name} is filled in when the word is used. lib/strings.test.js checks that every
// language has every key, with the same placeholders.
//
// Spanish: written for Spanish speakers in the United States (Louisville's are mostly from
// Mexico, Cuba and Central America): plain, neutral wording; "usted" is avoided by
// writing around it.

const en = {
  // The header
  "header.search": "Search map",
  "header.searchScope": "Searching {on} of {of} place types",
  "header.searchAll": "Search all",
  "header.backToMap": "Back to the map",
  "header.map": "Map",
  "header.learn": "Learn",
  "header.feedback": "Feedback",
  "header.saved": "Saved",
  "header.logIn": "Log in",
  "language.label": "Language",

  // What's New
  "whatsNew.open": "What's New",
  "whatsNew.close": "Close What's New",
  "whatsNew.tab.latest": "Latest",
  "whatsNew.tab.issues": "Violations",
  "whatsNew.tab.perfect": "Top Scores",
  "whatsNew.empty.latest": "No inspections in the last 30 days.",
  "whatsNew.empty.issues": "No flagged inspections in the last 30 days.",
  "whatsNew.empty.perfect": "No perfect scores found.",
  "whatsNew.noLocation": "Location unavailable",
  "whatsNew.loading": "Loading…",
  "whatsNew.error": "Could not load.",
  "whatsNew.showAll": "Show all {n}",
  "whatsNew.showFewer": "Show fewer",
  "whatsNew.posted": "posted {date}",
  violations: { one: "{n} violation", other: "{n} violations" },

  // Map popups
  "popup.inspected": "Inspected: {date}",
  "popup.estimated": "(estimated)",
  "popup.score": "Score: {score}",
  "popup.save": "Save to watchlist",
  "popup.unsave": "Remove from watchlist",
  "popup.overlap": "{n} locations here",
  "popup.alsoListed": "May also be listed as:",

  // The info drawer
  "drawer.score": "Score",
  "drawer.date": "Date",
  "drawer.grade": "Grade",
  "drawer.moreInfo": "More info",
  "drawer.openingDate": "Opening date",
  "drawer.facilityType": "Facility type",
  "drawer.subtype": "Subtype",
  "drawer.permit": "Permit number",
  "drawer.notListed": "not listed",
  "drawer.noLocation": "No map location on file for this establishment.",
  "drawer.close": "Close",
  "drawer.alsoListed": "This address may also be listed under a separate permit record:",
  "drawer.switchTo": "Switch to permit record: {name}",
  "drawer.separateRecords":
    "These are separate health department records shown independently. Inspection histories reflect each permit only. Data is displayed as received from Louisville Metro Health and has not been verified.",
  "drawer.history": "Inspection History",
  "drawer.inspection": "Inspection",
  "drawer.violation": "Violation",
  "drawer.readMore": "Read more",
  "drawer.showLess": "Show less",
  "drawer.collapse": "Collapse",
  "drawer.showAllViolations": "Show all {n}",
  "drawer.expand": "Expand details",
  "drawer.collapseDetails": "Collapse details",

  // The weekly email's language (DigestLanguageOffer.jsx, the Saved panel)
  "digestLang.offer": "Get your weekly email in {language} too?",
  "digestLang.yes": "Yes",
  "digestLang.no": "No thanks",
  "digestLang.error": "Couldn't save that. Try again.",
  "digestLang.row": "Weekly email language: {current}",
  "digestLang.switch": "Send it in {language}",
};

const es = {
  "header.search": "Buscar en el mapa",
  "header.searchScope": "Buscando en {on} de {of} tipos de lugar",
  "header.searchAll": "Buscar en todos",
  "header.backToMap": "Volver al mapa",
  "header.map": "Mapa",
  "header.learn": "Aprende",
  "header.feedback": "Comentarios",
  "header.saved": "Guardados",
  "header.logIn": "Entrar",
  "language.label": "Idioma",

  "whatsNew.open": "Novedades",
  "whatsNew.close": "Cerrar Novedades",
  "whatsNew.tab.latest": "Recientes",
  "whatsNew.tab.issues": "Infracciones",
  "whatsNew.tab.perfect": "Mejores",
  "whatsNew.empty.latest": "No hay inspecciones en los últimos 30 días.",
  "whatsNew.empty.issues": "No hay inspecciones con problemas en los últimos 30 días.",
  "whatsNew.empty.perfect": "No se encontraron puntuaciones perfectas.",
  "whatsNew.noLocation": "Ubicación no disponible",
  "whatsNew.loading": "Cargando…",
  "whatsNew.error": "No se pudo cargar.",
  "whatsNew.showAll": "Ver los {n}",
  "whatsNew.showFewer": "Ver menos",
  "whatsNew.posted": "publicado el {date}",
  violations: { one: "{n} infracción", other: "{n} infracciones" },

  "popup.inspected": "Inspección: {date}",
  "popup.estimated": "(estimada)",
  "popup.score": "Puntuación: {score}",
  "popup.save": "Guardar",
  "popup.unsave": "Quitar de guardados",
  "popup.overlap": "{n} lugares aquí",
  "popup.alsoListed": "También puede figurar como:",

  "drawer.score": "Puntuación",
  "drawer.date": "Fecha",
  "drawer.grade": "Calificación",
  "drawer.moreInfo": "Más información",
  "drawer.openingDate": "Fecha de apertura",
  "drawer.facilityType": "Tipo de establecimiento",
  "drawer.subtype": "Subtipo",
  "drawer.permit": "Número de permiso",
  "drawer.notListed": "no consta",
  "drawer.noLocation": "No hay ubicación en el mapa para este establecimiento.",
  "drawer.close": "Cerrar",
  "drawer.alsoListed": "Esta dirección también puede figurar en otro registro de permiso:",
  "drawer.switchTo": "Ver el registro de permiso: {name}",
  "drawer.separateRecords":
    "Son registros separados del departamento de salud y se muestran por separado. Cada historial de inspecciones corresponde solo a su permiso. Los datos se muestran tal como los publica Louisville Metro Health y no han sido verificados.",
  "drawer.history": "Historial de inspecciones",
  "drawer.inspection": "Inspección",
  "drawer.violation": "Infracción",
  "drawer.readMore": "Leer más",
  "drawer.showLess": "Ver menos",
  "drawer.collapse": "Contraer",
  "drawer.showAllViolations": "Ver las {n}",
  "drawer.expand": "Ampliar detalles",
  "drawer.collapseDetails": "Reducir detalles",

  "digestLang.offer": "¿Quieres recibir también tu resumen semanal en {language}?",
  "digestLang.yes": "Sí",
  "digestLang.no": "No, gracias",
  "digestLang.error": "No se pudo guardar. Inténtalo de nuevo.",
  "digestLang.row": "Idioma del correo semanal: {current}",
  "digestLang.switch": "Enviarlo en {language}",
};

// The other parts live beside this file (strings.<part>.js), one per area of the site, each
// exporting { en, es }; they are merged here. Keys are "<part>.<what>", so parts never collide.
import * as filters from "./strings.filters.js";
import * as table from "./strings.table.js";
import * as saved from "./strings.saved.js";
import * as pages from "./strings.pages.js";

const parts = [filters, table, saved, pages];
export const STRINGS = {
  en: Object.assign({}, en, ...parts.map((p) => p.en)),
  es: Object.assign({}, es, ...parts.map((p) => p.es)),
};

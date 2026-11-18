/**
 * tests/email_words.test.js — the emails' two word lists, and the digest and one-off email
 * rendered in Spanish.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  WORDS,
  EMAIL_LANGUAGES,
  count,
  emailLanguage,
  localeFor,
  wordsFor,
} from "@lfs/core/email/words.js";
import { renderDigest, summarize, groupWatchAreas } from "@lfs/core/email/digest.js";
import { renderCustom } from "@lfs/core/email/custom.js";

const row = (over) => ({
  establishment_id: "1",
  premise_name: "PLACE",
  address: "1 MAIN ST",
  score: 95,
  grade: "A",
  inspection_date: "2026-11-09",
  violation_count: 0,
  region: "jefferson",
  posted_date: null,
  ...over,
});
const ROWS = [
  row({ establishment_id: "a", premise_name: "TACO", score: 78, violation_count: 4 }),
  row({ establishment_id: "b", premise_name: "DINER", score: 92, grade: "C" }),
  row({ establishment_id: "c", premise_name: "CAFE", score: 100 }),
];
const summary = summarize(ROWS, { today: "2026-11-12" });

describe("the word lists", () => {
  it("have the same entries, of the same kind, in every language", () => {
    for (const lang of EMAIL_LANGUAGES) {
      assert.deepEqual(Object.keys(WORDS[lang]).sort(), Object.keys(WORDS.en).sort(), lang);
      for (const [k, v] of Object.entries(WORDS.en)) {
        assert.equal(typeof WORDS[lang][k], typeof v, `${lang} ${k}`);
      }
    }
  });

  it("fall back to English for anything else", () => {
    assert.equal(emailLanguage("es"), "es");
    assert.equal(emailLanguage("fr"), "en");
    assert.equal(emailLanguage(null), "en");
    assert.equal(wordsFor(undefined), WORDS.en);
    assert.equal(localeFor("es"), "es-US");
  });

  it("count a noun in the right form", () => {
    assert.equal(count("en", 1, "inspection"), "1 inspection");
    assert.equal(count("en", 3, "violation"), "3 violations");
    assert.equal(count("es", 1, "inspection"), "1 inspección");
    assert.equal(count("es", 0, "savedPlace"), "0 lugares guardados");
  });
});

describe("the digest in Spanish", () => {
  const { subject, html, text } = renderDigest(summary, {
    lang: "es",
    unsubscribeUrl: "https://x.test/u",
  });

  it("says the subject, headline and sections in Spanish", () => {
    assert.match(subject, /3 inspecciones esta semana, 2 reprobadas · Louisville Food Safe/);
    assert.match(html, /<html lang="es">/);
    assert.match(html, /Puntuaciones perfectas/);
    assert.match(html, /Menos de 85 o letrero C/);
    assert.match(html, /Cancelar suscripción/);
    assert.match(html, /Abrir el mapa/);
    assert.match(text, /Cancelar suscripción: https:\/\/x\.test\/u/);
  });

  it("leaves no English wording behind", () => {
    for (const word of ["this week", "Perfect scores", "Unsubscribe", "Open the map", "placard"]) {
      assert.ok(!html.includes(word), word);
      assert.ok(!text.includes(word), word);
    }
  });

  it("writes dates in Spanish and keeps place names as published", () => {
    assert.match(html, /9 nov/);
    assert.match(html, /TACO/);
    assert.match(html, /4 infracciones/);
  });

  it("marks a test send in Spanish, and is English by default", () => {
    assert.match(renderDigest(summary, { lang: "es", test: true }).subject, /^\[Prueba\] /);
    assert.match(renderDigest(summary).subject, /3 inspections this week, 2 failing/);
  });

  it("words the personal parts in Spanish", () => {
    const areas = [
      ...groupWatchAreas([
        {
          user_id: "u",
          area_id: 1,
          label: "Casa",
          radius_miles: 2,
          area_total: 0,
          area_failing: 0,
        },
        {
          user_id: "u",
          area_id: 2,
          label: null,
          center_address: null,
          radius_miles: 1,
          area_total: 0,
          area_failing: 0,
        },
      ]).values(),
    ][0];
    const mail = renderDigest(summary, { lang: "es", areas });
    assert.match(mail.html, /Tu zona vigilada · 2 mi/);
    assert.match(mail.html, /Ninguna inspección aquí esta semana\./);
    assert.match(mail.html, />Zona vigilada</);
    const saved = [{ id: null, name: null, total: 12, places: [ROWS[0]] }];
    const m2 = renderDigest(summary, { lang: "es", saved });
    assert.match(m2.text, /Se inspeccionó 1 de tus 12 lugares guardados esta semana\./);
  });
});

describe("a one-off email in Spanish", () => {
  it("translates the frame and leaves the message as written", () => {
    const m = renderCustom(
      { subject: "Hola", body: "Mensaje" },
      { lang: "es", unsubscribeUrl: "https://x.test/u", test: true },
    );
    assert.equal(m.subject, "[Prueba] Hola");
    assert.match(m.html, /Recibes este correo porque te suscribiste/);
    assert.match(m.html, /Abrir el mapa/);
    assert.match(m.html, /Privacidad/);
    assert.match(m.text, /Cancelar suscripción:/);
  });
});

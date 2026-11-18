// The privacy page (/?page=privacy). Plain words, and every line has to stay true: when
// the site starts storing or sending something new, say so here and move the date in
// lib/privacy.js. docs/PRIVACY.md lists where each statement comes from in the code.
//
// It only says what the site does by itself. No promises that need a person to keep them
// (a deadline, "ask and it will be deleted", "you will be told"): the owner's call,
// 2026-11-17. If something isn't built, the page says so.
import { privacyUpdatedText } from "../../lib/privacy.js";
import { useT } from "../../I18nContext.jsx";
import "../../styles/PrivacyPage.css";

const REPO = "https://github.com/AndyGutterman/Louisville-Health-Inspection-Map";

function Section({ title, children }) {
  return (
    <section className="pv-section">
      <h2 className="ln-sh">{title}</h2>
      {children}
    </section>
  );
}

/** @param {{ onOpenLearn: Function }} p  opens the Learn page (about the inspection data) */
export default function PrivacyPage({ onOpenLearn }) {
  const { t, locale } = useT();
  const item = (key) => (
    <>
      <dt>{t(`privacy.${key}.dt`)}</dt>
      <dd>{t(`privacy.${key}.dd`)}</dd>
    </>
  );
  return (
    <div className="ln-page-wrap" data-testid="privacy-page">
      <div className="ln-page pv-page">
        <div className="ln-hero">
          <h1 className="ln-hero-title">{t("privacy.title")}</h1>
          <p className="ln-hero-sub">
            {t("privacy.updated", { date: privacyUpdatedText(locale) })}
          </p>
        </div>

        <p className="pv-lead">{t("privacy.lead")}</p>

        <Section title={t("privacy.stored.h")}>
          <dl className="pv-list">
            {item("stored.look")}
            {item("stored.account")}
            {item("stored.language")}
            {item("stored.email")}
            {item("stored.feedback")}
          </dl>
        </Section>

        <Section title={t("privacy.use.h")}>
          <p>{t("privacy.use.p")}</p>
        </Section>

        <Section title={t("privacy.see.h")}>
          <p>{t("privacy.see.p")}</p>
        </Section>

        <Section title={t("privacy.services.h")}>
          <p>{t("privacy.services.intro")}</p>
          <ul className="pv-services">
            <li>
              <strong>Supabase</strong>
              {t("privacy.services.supabase")}
            </li>
            <li>
              <strong>Netlify</strong>
              {t("privacy.services.netlify")}
            </li>
            <li>
              <strong>Google</strong>
              {t("privacy.services.google")}
            </li>
            <li>
              <strong>Geoapify</strong>
              {t("privacy.services.geoapify")}
            </li>
            <li>
              <strong>CARTO</strong>
              {t("privacy.services.carto")}
            </li>
          </ul>
          <p>{t("privacy.services.ip")}</p>
        </Section>

        <Section title={t("privacy.choices.h")}>
          <dl className="pv-list">
            {item("choices.stop")}
            {item("choices.remove")}
            {item("choices.delete")}
          </dl>
        </Section>

        <Section title={t("privacy.data.h")}>
          <p>
            {t("privacy.data.p")}{" "}
            <button type="button" className="pv-link" onClick={onOpenLearn}>
              {t("privacy.data.link")}
            </button>
          </p>
        </Section>

        <Section title={t("privacy.about.h")}>
          <p>
            {t("privacy.about.p1")}
            <a href={REPO} target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
            {t("privacy.about.p2")}
          </p>
        </Section>
      </div>
    </div>
  );
}

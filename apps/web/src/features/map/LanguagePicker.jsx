// The language picker: a small flag for the language shown now (US for English, Spain for
// Spanish), over a native <select> (invisible, covering it), so a tap opens the phone's or
// browser's own list, each language by its own name. The select carries the accessible name
// and the tooltip, so the flag is decoration. Top left of every page, beside the search box or
// the back button. data-map-overlay: using it never closes the info drawer (lib/outsideClick.js).
import { LANGUAGES } from "../../lib/i18n.js";
import { useT } from "../../I18nContext.jsx";

// Inline SVG, so no image is downloaded. 3:2 boxes, drawn small.
export function Flag({ code }) {
  if (code === "es") {
    return (
      <svg viewBox="0 0 30 20" width="24" height="16" aria-hidden="true" className="flag">
        <rect width="30" height="20" fill="#c60b1e" />
        <rect y="5" width="30" height="10" fill="#ffc400" />
      </svg>
    );
  }
  const stripes = [0, 2, 4, 6, 8, 10, 12].map((i) => (
    <rect key={i} y={i * (20 / 13)} width="30" height={20 / 13} fill="#b22234" />
  ));
  return (
    <svg viewBox="0 0 30 20" width="24" height="16" aria-hidden="true" className="flag">
      <rect width="30" height="20" fill="#fff" />
      {stripes}
      <rect width="12" height={(20 / 13) * 7} fill="#3c3b6e" />
    </svg>
  );
}

export default function LanguagePicker() {
  const { lang, setLang, t } = useT();
  const current = LANGUAGES.find((l) => l.code === lang) ?? LANGUAGES[0];
  return (
    <label
      className="header-nav-btn lang-picker"
      title={current.name}
      data-testid="language-flag"
      data-lang={lang}
      data-map-overlay
    >
      <Flag code={lang} />
      <select
        data-testid="language-picker"
        aria-label={t("language.label")}
        title={current.name}
        value={lang}
        onChange={(e) => setLang(e.target.value)}
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code} lang={l.code}>
            {l.name}
          </option>
        ))}
      </select>
    </label>
  );
}

// The header's language picker: a globe and the current language's code, over a native
// <select> (invisible, covering it), so a tap opens the phone's or browser's own list of
// languages, each by its own name. Languages, not flags: a flag stands for a country, and
// Spanish speakers in Louisville come from many (docs/ACCESSIBILITY.md).
// data-map-overlay: using it never closes the info drawer (lib/outsideClick.js).
import { LANGUAGES } from "../../lib/i18n.js";
import { useT } from "../../I18nContext.jsx";

export default function LanguagePicker() {
  const { lang, setLang, t } = useT();
  return (
    <label className="header-nav-btn lang-picker" title={t("language.label")} data-map-overlay>
      <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" className="icon">
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
        <path
          d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        />
      </svg>
      <span className="lang-code" aria-hidden="true">
        {lang.toUpperCase()}
      </span>
      <select
        data-testid="language-picker"
        aria-label={t("language.label")}
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

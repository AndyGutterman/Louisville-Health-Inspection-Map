// The visitor's language for the whole site (lib/i18n.js has the rules, lib/strings.js the
// words). useT() gives { t, lang, setLang, locale }: t("key", vars) is a word in the current
// language. The page's <html lang> follows, so screen readers pronounce it right (WCAG 3.1.1).
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { localeOf, pickLanguage, saveLanguage, translate } from "./lib/i18n.js";

function browserStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const I18n = createContext({
  lang: "en",
  locale: "en-US",
  setLang: () => {},
  t: (key, vars) => translate("en", key, vars),
});

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(() =>
    pickLanguage(browserStorage(), typeof navigator === "undefined" ? [] : navigator.languages),
  );

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((code) => {
    saveLanguage(browserStorage(), code);
    setLangState(code);
  }, []);

  const value = useMemo(
    () => ({
      lang,
      locale: localeOf(lang),
      setLang,
      t: (key, vars) => translate(lang, key, vars),
    }),
    [lang, setLang],
  );
  return <I18n.Provider value={value}>{children}</I18n.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- the hook goes with its provider
export const useT = () => useContext(I18n);

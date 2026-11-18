// Offers a signed-in subscriber the weekly email in the site's language, once, right after
// they switch the site's language to one their email isn't in. Shows nothing to anyone else
// (signed out, not subscribed, or already getting the email in that language), and reads
// nothing until a language switch happens. The Saved panel has the same choice at any time
// (DigestLanguageRow in AccountPage.jsx).
import { useEffect, useState } from "react";
import { useAuth } from "./AuthContext.jsx";
import { useT } from "./I18nContext.jsx";
import { fetchDigestChoice, fetchDigestLanguage, saveDigestLanguage } from "./api/account.js";
import { isSubscribed, markOffered, offeredLanguage, shouldOfferLanguage } from "./lib/digest.js";
import { languageName } from "./lib/i18n.js";
import "./styles/DigestLanguageOffer.css";

export default function DigestLanguageOffer() {
  const { user } = useAuth();
  const { t, lang, switches } = useT();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(false);
  const [asked, setAsked] = useState(0); // the switch the offer was last decided for
  const [profile, setProfile] = useState(null);

  // Read the person's choice only after a switch, and only when signed in.
  useEffect(() => {
    if (!user || switches === 0 || switches === asked) return;
    let live = true;
    Promise.all([fetchDigestChoice(user.id), fetchDigestLanguage(user.id)]).then(
      ([choice, language]) => {
        if (!live) return;
        setAsked(switches);
        const code = language.data?.language;
        if (language.error || !code) return;
        const p = { subscribed: isSubscribed(choice.data), digestLanguage: code };
        setProfile(p);
        setError(false);
        setOpen(shouldOfferLanguage({ ...p, siteLanguage: lang, offeredFor: offeredLanguage() }));
      },
    );
    return () => {
      live = false;
    };
  }, [user, switches, asked, lang]);

  // Signing out, or switching back to the email's own language, takes the offer away.
  const visible =
    open &&
    user &&
    profile &&
    shouldOfferLanguage({ ...profile, siteLanguage: lang, always: true });
  if (!visible) return null;

  const close = () => {
    markOffered(lang);
    setOpen(false);
  };
  const accept = async () => {
    const { error: e } = await saveDigestLanguage(user.id, lang);
    if (e) return setError(true);
    markOffered(lang);
    setOpen(false);
  };

  return (
    <div className="dl-offer" role="status" data-testid="digest-language-offer" data-map-overlay>
      <span className="dl-offer-text">
        {t("digestLang.offer", { language: languageName(lang) })}
      </span>
      {error && <span className="dl-offer-error">{t("digestLang.error")}</span>}
      <button type="button" className="dl-offer-yes" onClick={accept}>
        {t("digestLang.yes")}
      </button>
      <button type="button" className="dl-offer-no" onClick={close}>
        {t("digestLang.no")}
      </button>
    </div>
  );
}

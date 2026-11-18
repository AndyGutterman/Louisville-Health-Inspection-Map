import React, { useEffect, useState } from "react";
import { useT } from "./I18nContext.jsx";
import { useAuth } from "./AuthContext.jsx";
import WatchlistTab from "./features/saved/WatchlistTab.jsx";
import {
  fetchDigestChoice,
  fetchDigestLanguage,
  saveDigestChoice,
  saveDigestLanguage,
} from "./api/account.js";
import { OFF, WEEKLY, isSubscribed, shouldOfferLanguage } from "./lib/digest.js";
import { languageName } from "./lib/i18n.js";
import { PRIVACY_PATH } from "./lib/privacy.js";
import { useIsAdmin } from "./features/admin/useIsAdmin.js";
import "./styles/AccountPage.css";

// For a subscriber whose weekly email is in another language than the site: say which, and
// offer to switch it (profiles.language). Nothing for anyone else, and nothing when the
// database has no language column yet.
function DigestLanguageRow({ user, subscribed }) {
  const { t, lang } = useT();
  const [digestLanguage, setDigestLanguage] = useState(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let live = true;
    fetchDigestLanguage(user.id).then(({ data, error: e }) => {
      if (live && !e) setDigestLanguage(data?.language ?? null);
    });
    return () => {
      live = false;
    };
  }, [user.id]);
  if (!shouldOfferLanguage({ subscribed, digestLanguage, siteLanguage: lang, always: true })) {
    return null;
  }
  const change = async () => {
    setError(false);
    const { error: e } = await saveDigestLanguage(user.id, lang);
    if (e) setError(true);
    else setDigestLanguage(lang);
  };
  return (
    <div className="acct-digest-lang" data-testid="digest-language-row">
      <span>{t("digestLang.row", { current: languageName(digestLanguage) })}</span>
      <button type="button" onClick={change}>
        {t("digestLang.switch", { language: languageName(lang) })}
      </button>
      {error && <span className="acct-digest-error">{t("digestLang.error")}</span>}
    </div>
  );
}

// The weekly digest email, on or off (profiles.alert_frequency, lib/digest.js).
function DigestToggle({ user }) {
  const { t } = useT();
  const [profile, setProfile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let live = true;
    fetchDigestChoice(user.id).then(
      ({ data }) => live && setProfile(data ?? { alert_frequency: OFF }),
    );
    return () => {
      live = false;
    };
  }, [user.id]);

  const on = isSubscribed(profile);
  const toggle = async () => {
    const next = on ? OFF : WEEKLY;
    setSaving(true);
    setError(null);
    const { error: e } = await saveDigestChoice(user.id, next);
    setSaving(false);
    if (e) setError(t("account.digest.error"));
    else setProfile({ alert_frequency: next });
  };

  return (
    <div className="acct-digest" data-testid="digest-toggle">
      <label className="acct-digest-row">
        <input
          type="checkbox"
          checked={on}
          disabled={!profile || saving}
          onChange={toggle}
          aria-label={t("account.digest.title")}
        />
        <span>
          <span className="acct-digest-title">{t("account.digest.title")}</span>
          <span className="acct-digest-sub">{t("account.digest.sub")}</span>
        </span>
      </label>
      {error && <div className="acct-digest-error">{error}</div>}
      <DigestLanguageRow user={user} subscribed={on} />
    </div>
  );
}

// Width of the desktop side panel. Map.jsx uses it to slide the info drawer over.
export const ACCOUNT_PANEL_W = 440;

// variant "page": full-screen overlay (phones). variant "panel": right-hand side panel (desktop).
export default function AccountPage({
  variant = "page",
  onClose,
  onOpenEstablishment,
  activeEid,
  onItemRemoved,
  refreshToken,
  focusAreaId,
  zIndex, // phones: lets Map.jsx put this page above or below the info drawer
  bottomInset, // phones: px of the info drawer sitting over the bottom of this page
  onOpenAdmin, // opens the email admin page; its button shows for admins only
  areaEdit, // passed to WatchlistTab: a watch area just changed on the map
  onAreasChange, // passed to WatchlistTab: its areas changed, so the map's circles follow
}) {
  const { t } = useT();
  const { user, signOut } = useAuth();
  const admin = useIsAdmin(user);
  const side = variant === "panel";

  if (!user) {
    if (side) return null;
    return (
      <div
        className="acct-panel"
        style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        <div style={{ color: "rgba(255,255,255,0.45)", fontSize: ".9rem" }}>
          {t("account.signInPrompt")}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`acct-panel${side ? " side" : ""}`}
      style={{ ...(zIndex != null ? { zIndex } : null), "--acct-w": `${ACCOUNT_PANEL_W}px` }}
    >
      <div
        className="acct-inner"
        style={bottomInset ? { paddingBottom: 80 + bottomInset } : undefined}
      >
        <div className="acct-head">
          <div className="acct-avatar">{(user.email || "?")[0].toUpperCase()}</div>
          <div className="acct-who">
            <div className="acct-title">{t("account.title")}</div>
            <div className="acct-email">{user.email}</div>
          </div>
          <button className="acct-signout" onClick={() => signOut()}>
            {t("account.signOut")}
          </button>
          {side && (
            <button
              className="acct-close"
              onClick={onClose}
              aria-label={t("account.closePanel")}
              title={t("account.close")}
            >
              ×
            </button>
          )}
        </div>
        {admin && onOpenAdmin && (
          <button className="acct-admin-link" data-testid="open-admin" onClick={onOpenAdmin}>
            {t("account.admin")}
          </button>
        )}
        <DigestToggle user={user} />
        <WatchlistTab
          user={user}
          compact={side}
          onOpenEstablishment={onOpenEstablishment}
          activeEid={activeEid}
          onItemRemoved={onItemRemoved}
          refreshToken={refreshToken}
          focusAreaId={focusAreaId}
          areaEdit={areaEdit}
          onAreasChange={onAreasChange}
        />
        <a
          className="privacy-link acct-privacy"
          href={PRIVACY_PATH}
          target="_blank"
          rel="noreferrer"
        >
          {t("account.privacy")}
        </a>
      </div>
    </div>
  );
}

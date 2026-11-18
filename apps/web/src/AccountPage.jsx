import React, { useEffect, useState } from "react";
import { useAuth } from "./AuthContext.jsx";
import WatchlistTab from "./features/saved/WatchlistTab.jsx";
import { fetchDigestChoice, saveDigestChoice } from "./api/account.js";
import { OFF, WEEKLY, isSubscribed } from "./lib/digest.js";
import { PRIVACY_PATH } from "./lib/privacy.js";
import { useIsAdmin } from "./features/admin/useIsAdmin.js";
import "./styles/AccountPage.css";

// The weekly digest email, on or off (profiles.alert_frequency, lib/digest.js).
function DigestToggle({ user }) {
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
    if (e) setError("Couldn't save that. Try again.");
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
          aria-label="Weekly digest email"
        />
        <span>
          <span className="acct-digest-title">Weekly digest email</span>
          <span className="acct-digest-sub">
            This week&apos;s inspections, the ones that failed, and news on your saved places and
            watch areas, every Tuesday morning.
          </span>
        </span>
      </label>
      {error && <div className="acct-digest-error">{error}</div>}
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
          Sign in to manage your account.
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
            <div className="acct-title">My Account</div>
            <div className="acct-email">{user.email}</div>
          </div>
          <button className="acct-signout" onClick={() => signOut()}>
            Sign out
          </button>
          {side && (
            <button
              className="acct-close"
              onClick={onClose}
              aria-label="Close account panel"
              title="Close"
            >
              ×
            </button>
          )}
        </div>
        {admin && onOpenAdmin && (
          <button className="acct-admin-link" data-testid="open-admin" onClick={onOpenAdmin}>
            Email admin
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
          Privacy
        </a>
      </div>
    </div>
  );
}

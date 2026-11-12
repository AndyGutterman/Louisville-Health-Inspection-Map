import React, { useEffect, useState } from "react";
import { useAuth } from "./AuthContext.jsx";
import WatchlistTab from "./WatchlistTab.jsx";
import { OFF, WEEKLY, isSubscribed } from "./lib/digest.js";
import "./styles/AccountPage.css";

// The weekly digest email, on or off (profiles.alert_frequency, lib/digest.js).
function DigestToggle({ supabase, user }) {
  const [profile, setProfile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let live = true;
    supabase
      .from("profiles")
      .select("alert_frequency")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => live && setProfile(data ?? { alert_frequency: OFF }));
    return () => {
      live = false;
    };
  }, [supabase, user.id]);

  const on = isSubscribed(profile);
  const toggle = async () => {
    const next = on ? OFF : WEEKLY;
    setSaving(true);
    setError(null);
    const { error: e } = await supabase
      .from("profiles")
      .update({ alert_frequency: next })
      .eq("id", user.id);
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
            This week&apos;s inspections and the ones that failed, every Tuesday morning.
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
}) {
  const { user, signOut, supabase } = useAuth();
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
        <DigestToggle supabase={supabase} user={user} />
        <WatchlistTab
          supabase={supabase}
          user={user}
          compact={side}
          onOpenEstablishment={onOpenEstablishment}
          activeEid={activeEid}
          onItemRemoved={onItemRemoved}
          refreshToken={refreshToken}
          focusAreaId={focusAreaId}
        />
      </div>
    </div>
  );
}

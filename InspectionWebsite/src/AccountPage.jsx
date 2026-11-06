import React from "react";
import { useAuth } from "./AuthContext.jsx";
import WatchlistTab from "./WatchlistTab.jsx";
import "./styles/AccountPage.css";

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
  zIndex,      // phones: lets Map.jsx put this page above or below the info drawer
  bottomInset, // phones: px of the info drawer sitting over the bottom of this page
}) {
  const { user, signOut, supabase } = useAuth();
  const side = variant === "panel";

  if (!user) {
    if (side) return null;
    return (
      <div className="acct-panel" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "rgba(255,255,255,0.45)", fontSize: ".9rem" }}>Sign in to manage your account.</div>
      </div>
    );
  }

  return (
    <div className={`acct-panel${side ? " side" : ""}`} style={{ ...(zIndex != null ? { zIndex } : null), "--acct-w": `${ACCOUNT_PANEL_W}px` }}>
      <div className="acct-inner" style={bottomInset ? { paddingBottom: 80 + bottomInset } : undefined}>
        <div className="acct-head">
          <div className="acct-avatar">{(user.email || "?")[0].toUpperCase()}</div>
          <div className="acct-who">
            <div className="acct-title">My Account</div>
            <div className="acct-email">{user.email}</div>
          </div>
          <button className="acct-signout" onClick={() => signOut()}>Sign out</button>
          {side && (
            <button className="acct-close" onClick={onClose} aria-label="Close account panel" title="Close">
              ×
            </button>
          )}
        </div>
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
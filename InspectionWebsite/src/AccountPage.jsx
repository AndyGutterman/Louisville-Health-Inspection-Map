import React from "react";
import { useAuth } from "./AuthContext.jsx";
import WatchlistTab from "./WatchlistTab.jsx";

// Width of the desktop side panel. Map.jsx uses it to slide the info drawer over.
export const ACCOUNT_PANEL_W = 440;

const STYLES = `
@keyframes acct-in { from { opacity: 0; transform: translateX(14px); } to { opacity: 1; transform: none; } }

/* Full-page overlay (phones) */
.acct-panel {
  position: fixed; left: 0; right: 0; bottom: 0;
  top: var(--header-h, 80px);
  overflow-y: auto; background: #111115; z-index: 50;
}
.acct-inner { max-width: 620px; margin: 0 auto; padding: 32px 18px 80px; }
.acct-head { display: flex; align-items: center; gap: 14px; margin-bottom: 30px; }
.acct-avatar { width: 46px; height: 46px; border-radius: 50%; flex-shrink: 0;
  background: rgba(52,168,83,0.18); border: 1.5px solid rgba(52,168,83,0.45);
  display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 1.1rem; color: #fff; }
.acct-who { min-width: 0; }
.acct-title { font-size: 1.2rem; font-weight: 700; color: #f0f0f3; }
.acct-email { font-size: 0.82rem; color: rgba(255,255,255,0.45); margin-top: 2px; overflow-wrap: anywhere; }
.acct-signout { margin-left: auto; padding: 7px 16px; border-radius: 6px; cursor: pointer;
  background: rgba(234,67,53,0.10); border: 1px solid rgba(234,67,53,0.22);
  color: rgba(234,67,53,0.85); font-weight: 700; font-size: 0.8rem; font-family: inherit; flex-shrink: 0; }
.acct-signout:hover { background: rgba(234,67,53,0.18); }
.acct-close { display: none; }

/* Side panel (desktop): same shell as the info drawer, sits at the right edge */
.acct-panel.side {
  left: auto; right: 16px;
  top: calc(var(--header-h, var(--mobile-header-h, 64px)) + 10px);
  bottom: 16px;
  width: min(${ACCOUNT_PANEL_W}px, calc(100vw - 32px));
  z-index: 3000;
  background: rgba(18,18,22,0.97);
  backdrop-filter: blur(8px);
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.4);
  display: flex; flex-direction: column; overflow: hidden;
  animation: acct-in .22s ease-out;
}
.acct-panel.side .acct-inner {
  max-width: none; margin: 0; width: 100%; box-sizing: border-box;
  flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain;
  padding: 18px 16px 40px;
}
.acct-panel.side .acct-head { gap: 12px; margin-bottom: 22px; }
.acct-panel.side .acct-who { flex: 1; }
.acct-panel.side .acct-avatar { width: 38px; height: 38px; font-size: 1rem; }
.acct-panel.side .acct-title { font-size: 1.05rem; }
.acct-panel.side .acct-signout { margin-left: 0; padding: 6px 12px; }
.acct-panel.side .acct-close {
  display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
  width: 30px; height: 30px; padding: 0; border: 0; border-radius: 50%;
  background: transparent; color: #ccc; font-size: 22px; line-height: 1; cursor: pointer; font-family: inherit;
}
.acct-panel.side .acct-close:hover { color: #fff; background: rgba(255,255,255,0.08); }

@media (prefers-reduced-motion: reduce) { .acct-panel.side { animation: none; } }
`;

// variant "page": full-screen overlay (phones). variant "panel": right-hand side panel (desktop).
export default function AccountPage({
  variant = "page",
  onClose,
  onOpenEstablishment,
  activeEid,
  onItemRemoved,
  refreshToken,
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
    <div className={`acct-panel${side ? " side" : ""}`}>
      <style>{STYLES}</style>
      <div className="acct-inner">
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
        />
      </div>
    </div>
  );
}
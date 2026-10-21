import React from "react";
import { useAuth } from "./AuthContext.jsx";
import WatchlistTab from "./WatchlistTab.jsx";

const STYLES = `
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
.acct-title { font-size: 1.2rem; font-weight: 700; color: #f0f0f3; }
.acct-email { font-size: 0.82rem; color: rgba(255,255,255,0.45); margin-top: 2px; }
.acct-signout { margin-left: auto; padding: 7px 16px; border-radius: 6px; cursor: pointer;
  background: rgba(234,67,53,0.10); border: 1px solid rgba(234,67,53,0.22);
  color: rgba(234,67,53,0.85); font-weight: 700; font-size: 0.8rem; font-family: inherit; }
.acct-signout:hover { background: rgba(234,67,53,0.18); }
`;

export default function AccountPage() {
  const { user, signOut, supabase } = useAuth();

  if (!user) {
    return (
      <div className="acct-panel" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "rgba(255,255,255,0.45)", fontSize: ".9rem" }}>Sign in to manage your account.</div>
      </div>
    );
  }

  return (
    <div className="acct-panel">
      <style>{STYLES}</style>
      <div className="acct-inner">
        <div className="acct-head">
          <div className="acct-avatar">{(user.email || "?")[0].toUpperCase()}</div>
          <div>
            <div className="acct-title">My Account</div>
            <div className="acct-email">{user.email}</div>
          </div>
          <button className="acct-signout" onClick={() => signOut()}>Sign out</button>
        </div>
        <WatchlistTab supabase={supabase} user={user} />
      </div>
    </div>
  );
}
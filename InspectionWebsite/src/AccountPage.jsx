import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "./AuthContext.jsx";

// ─── Helpers ─────────────────────────────────────────────────────────────────
function toTitleCase(str) {
  if (!str) return str;
  if (str !== str.toUpperCase()) return str;
  const STOP = new Set(['a','an','the','and','but','or','for','on','at','to','by','in','of']);
  return str.toLowerCase().replace(/\b\w+/g, (w, i) =>
    i === 0 || !STOP.has(w) ? w[0].toUpperCase() + w.slice(1) : w
  );
}

// Map a violation_desc to a concise alert keyword
function suggestKeyword(desc) {
  const lower = (desc || "").toLowerCase();
  const rules = [
    [["pest","rodent","vermin","roach","mice","rat ","fly ","flies","bug "],  "rodent"],
    [["temperature","cold hold","hot hold","cooling","reheat","thaw"],        "temperature"],
    [["handwash","hand wash","handwashing"],                                  "handwashing"],
    [["employee","bare hand","glove","hygiene","illness","sick","personal"],  "employee hygiene"],
    [["contamin","raw","cooked","segreg","protect","cover","storage"],        "food storage"],
    [["sanitiz","utensil","food-contact","ware","surface"],                   "sanitization"],
    [["water","plumbing","sewage","backflow","drain"],                        "plumbing"],
    [["permit","license","certif","record","document","label","advisory"],    "permit"],
    [["floor","wall","ceiling","ventilat","structure","repair","maintain"],   "facility"],
  ];
  for (const [matches, kw] of rules)
    if (matches.some(m => lower.includes(m))) return kw;
  const after = lower.includes(":") ? lower.split(":").slice(1).join(" ").trim() : lower;
  return after.split(/\s+/).filter(w => w.length > 4)[0]?.replace(/[^a-z ]/g,"").trim().slice(0,25) || "";
}

const STYLES = `
.acct-wrap {
  position: fixed; inset: 0;
  top: var(--header-h, var(--mobile-header-h, 64px));
  background: #0d0d11; color: #f0f0f3;
  font-family: "Helvetica Neue", Arial, sans-serif;
  overflow-y: auto; z-index: 1050;
  -webkit-overflow-scrolling: touch;
}
.acct-inner { max-width: 640px; margin: 0 auto; padding: 32px 20px 60px; }
.acct-hero { margin-bottom: 28px; }
.acct-avatar {
  width: 48px; height: 48px; border-radius: 50%;
  background: rgba(52,168,83,0.18);
  border: 2px solid rgba(52,168,83,0.35);
  display: flex; align-items: center; justify-content: center;
  font-size: 1.4rem; margin-bottom: 10px;
}
.acct-name { font-size: 1.1rem; font-weight: 700; }
.acct-email { font-size: .82rem; color: rgba(255,255,255,0.45); margin-top: 2px; }
.acct-tabs { display: flex; gap: 4px; border-bottom: 1px solid rgba(255,255,255,0.09); margin-bottom: 24px; }
.acct-tab {
  padding: 8px 16px; border-radius: 8px 8px 0 0;
  background: transparent; border: none; border-bottom: 2px solid transparent;
  color: rgba(255,255,255,0.45); font-size: .84rem; font-weight: 600;
  cursor: pointer; transition: color .15s; margin-bottom: -1px;
}
.acct-tab:hover { color: rgba(255,255,255,0.75); }
.acct-tab.active { color: #34a853; border-bottom-color: #34a853; }
.acct-sh {
  font-size: .62rem; font-weight: 800; letter-spacing: .14em;
  text-transform: uppercase; color: rgba(255,255,255,0.42); margin-bottom: 12px;
  display: flex; align-items: center; gap: 10px;
}
.acct-sh::after { content: ''; flex: 1; height: 1px; background: rgba(255,255,255,0.08); }
.acct-empty { font-size: .83rem; color: rgba(255,255,255,0.32); margin-bottom: 20px; }
.acct-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 24px; }
.acct-item {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 14px; border-radius: 10px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  gap: 10px;
}
.acct-item-name { font-size: .88rem; font-weight: 600; flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.acct-item-sub { font-size: .72rem; color: rgba(255,255,255,0.42); margin-top: 2px; }
.acct-remove {
  background: transparent; border: 1px solid rgba(255,255,255,0.10);
  border-radius: 6px; color: rgba(255,255,255,0.38);
  font-size: .72rem; font-weight: 700; padding: 3px 9px;
  cursor: pointer; flex-shrink: 0; transition: background .12s, color .12s;
}
.acct-remove:hover { background: rgba(234,67,53,0.12); border-color: rgba(234,67,53,0.28); color: #ff9a9a; }
.acct-add-row { display: flex; gap: 8px; margin-bottom: 24px; }
.acct-input {
  flex: 1; height: 38px; border-radius: 8px;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.12);
  color: #f0f0f3; font-size: .86rem; padding: 0 12px; font-family: inherit;
}
.acct-input:focus { outline: none; border-color: rgba(52,168,83,0.45); }
.acct-btn {
  padding: 0 18px; height: 38px; border-radius: 8px;
  background: rgba(52,168,83,0.14);
  border: 1px solid rgba(52,168,83,0.32);
  color: #6fcf8a; font-size: .84rem; font-weight: 700;
  cursor: pointer; transition: background .12s, color .12s; flex-shrink: 0;
}
.acct-btn:hover:not(:disabled) { background: rgba(52,168,83,0.24); color: #8de8a5; }
.acct-btn:disabled { opacity: .45; cursor: not-allowed; }
.acct-radius-presets { display: flex; gap: 6px; flex-wrap: wrap; }
.acct-preset {
  padding: 4px 12px; border-radius: 999px; font-size: .74rem; font-weight: 700;
  background: transparent; border: 1px solid rgba(255,255,255,0.12);
  color: rgba(255,255,255,0.50); cursor: pointer; transition: all .12s;
}
.acct-preset.active, .acct-preset:hover {
  background: rgba(52,168,83,0.14); border-color: rgba(52,168,83,0.32); color: #6fcf8a;
}
.acct-field { margin-bottom: 16px; }
.acct-label { font-size: .68rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: rgba(255,255,255,0.42); margin-bottom: 6px; display: block; }
.acct-select {
  height: 38px; border-radius: 8px; padding: 0 32px 0 12px;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.12);
  color: #f0f0f3; font-size: .86rem; font-family: inherit;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.40)' stroke-width='2.5'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat; background-position: right 10px center; cursor: pointer;
}
.acct-select:focus { outline: none; border-color: rgba(52,168,83,0.45); }
.acct-select option { background: #1a1a1e; }
.acct-signout {
  margin-top: 32px; padding: 9px 22px; border-radius: 999px;
  background: rgba(234,67,53,0.10); border: 1px solid rgba(234,67,53,0.24);
  color: rgba(234,67,53,0.80); font-size: .84rem; font-weight: 700;
  cursor: pointer; transition: background .15s, color .15s;
}
.acct-signout:hover { background: rgba(234,67,53,0.20); color: #ff9a9a; }

/* ── Neon violation chips ── */
.acct-viol-picker {
  margin-bottom: 20px;
  border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; overflow: hidden;
}
.acct-viol-picker-hd {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 14px; cursor: pointer;
  background: rgba(255,255,255,0.03);
  font-size: .78rem; font-weight: 700; color: rgba(255,255,255,0.50);
  user-select: none; transition: background .12s;
}
.acct-viol-picker-hd:hover { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.75); }
.acct-viol-picker-body {
  padding: 12px 14px 14px;
  border-top: 1px solid rgba(255,255,255,0.07);
  display: flex; flex-wrap: wrap; gap: 7px;
}
.acct-viol-chip {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 4px 11px; border-radius: 999px;
  font-size: .71rem; font-weight: 700; letter-spacing: .03em;
  cursor: pointer; transition: all .15s; line-height: 1.5;
  max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.acct-viol-chip.crit {
  color: #ff9a9a; border: 1px solid rgba(234,67,53,0.45);
  background: rgba(234,67,53,0.07);
  box-shadow: 0 0 7px rgba(234,67,53,0.14);
}
.acct-viol-chip.crit:hover:not(.added) {
  background: rgba(234,67,53,0.16); border-color: rgba(234,67,53,0.65);
  box-shadow: 0 0 12px rgba(234,67,53,0.30);
}
.acct-viol-chip.non {
  color: #82b4ff; border: 1px solid rgba(58,134,255,0.38);
  background: rgba(58,134,255,0.06);
  box-shadow: 0 0 7px rgba(58,134,255,0.10);
}
.acct-viol-chip.non:hover:not(.added) {
  background: rgba(58,134,255,0.14); border-color: rgba(58,134,255,0.60);
  box-shadow: 0 0 12px rgba(58,134,255,0.22);
}
.acct-viol-chip.added { opacity: 0.38; cursor: default; }
`;

const RADIUS_PRESETS = [5, 10, 15, 25];

function WatchlistTab({ supabase, user, onOpenEstablishment }) {
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  // Watchlist areas
  const [areas, setAreas] = useState([]);
  const [areaAddr, setAreaAddr] = useState("");
  const [areaLabel, setAreaLabel] = useState("");
  const [areaRadius, setAreaRadius] = useState(5);

  useEffect(() => {
    if (!supabase || !user) return;
    Promise.all([
      supabase.from("watchlist")
        .select("id, establishment_id, created_at, facilities(name, address)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase.from("watchlist_areas")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
    ]).then(([wRes, aRes]) => {
      setItems(wRes.data || []);
      setAreas(aRes.data || []);
      setLoading(false);
    });
  }, [supabase, user]);

  async function removeItem(id) {
    await supabase.from("watchlist").delete().eq("id", id);
    setItems(prev => prev.filter(i => i.id !== id));
  }

  async function addArea() {
    if (!areaAddr.trim()) return;
    const { data } = await supabase.from("watchlist_areas").insert([{
      user_id: user.id,
      label: areaLabel.trim() || null,
      center_address: areaAddr.trim(),
      radius_miles: areaRadius,
    }]).select().single();
    if (data) setAreas(prev => [data, ...prev]);
    setAreaAddr(""); setAreaLabel("");
  }

  async function removeArea(id) {
    await supabase.from("watchlist_areas").delete().eq("id", id);
    setAreas(prev => prev.filter(a => a.id !== id));
  }

  async function updateAreaRadius(id, r) {
    await supabase.from("watchlist_areas").update({ radius_miles: r, updated_at: new Date().toISOString() }).eq("id", id);
    setAreas(prev => prev.map(a => a.id === id ? { ...a, radius_miles: r } : a));
  }

  if (loading) return <div className="acct-empty">Loading…</div>;

  return (
    <>
      <div className="acct-sh">Saved establishments</div>
      {items.length === 0
        ? <div className="acct-empty">No saved establishments yet. Click any map pin to open it, then save it here.</div>
        : (
          <div className="acct-list">
            {items.map(item => (
              <div key={item.id} className="acct-item">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="acct-item-name"
                    style={{ cursor: "pointer" }}
                    onClick={() => onOpenEstablishment?.(item.establishment_id)}
                  >
                    {item.facilities?.name || item.establishment_id}
                  </div>
                  <div className="acct-item-sub">{item.facilities?.address || ""}</div>
                </div>
                <button className="acct-remove" onClick={() => removeItem(item.id)}>Remove</button>
              </div>
            ))}
          </div>
        )
      }

      <div className="acct-sh" style={{ marginTop: 8 }}>Radius watch areas</div>
      <div className="acct-list">
        {areas.map(area => (
          <div key={area.id} className="acct-item" style={{ flexDirection: "column", alignItems: "flex-start", gap: 8 }}>
            <div style={{ display: "flex", width: "100%", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="acct-item-name">{area.label || area.center_address || "Area"}</div>
                <div className="acct-item-sub">{area.center_address}</div>
              </div>
              <button className="acct-remove" onClick={() => removeArea(area.id)}>Remove</button>
            </div>
            <div className="acct-radius-presets">
              {RADIUS_PRESETS.map(r => (
                <button
                  key={r}
                  className={"acct-preset" + (area.radius_miles === r ? " active" : "")}
                  onClick={() => updateAreaRadius(area.id, r)}
                >
                  {r} mi
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginBottom: 8 }}>
        <div className="acct-add-row">
          <input className="acct-input" placeholder="Center address…" value={areaAddr} onChange={e => setAreaAddr(e.target.value)} />
          <input className="acct-input" style={{ maxWidth: 140 }} placeholder="Label (optional)" value={areaLabel} onChange={e => setAreaLabel(e.target.value)} />
        </div>
        <div className="acct-radius-presets" style={{ marginBottom: 8 }}>
          {RADIUS_PRESETS.map(r => (
            <button key={r} className={"acct-preset" + (areaRadius === r ? " active" : "")} onClick={() => setAreaRadius(r)}>{r} mi</button>
          ))}
        </div>
        <button className="acct-btn" onClick={addArea} disabled={!areaAddr.trim()}>Add area</button>
      </div>
    </>
  );
}

function AlertsTab({ supabase, user }) {
  const [keywords, setKeywords]       = useState([]);
  const [alertEmail, setAlertEmail]   = useState("");
  const [freq, setFreq]               = useState("instant");
  const [newKw, setNewKw]             = useState("");
  const [loading, setLoading]         = useState(true);
  const [saved, setSaved]             = useState(false);
  const [pickerOpen, setPickerOpen]   = useState(false);
  const [topViols, setTopViols]       = useState([]);
  const [violsLoading, setViolsLoading] = useState(false);

  useEffect(() => {
    if (!supabase || !user) return;
    Promise.all([
      supabase.from("violation_alerts").select("*").eq("user_id", user.id).order("created_at"),
      supabase.from("profiles").select("alert_email, alert_frequency").eq("id", user.id).single(),
    ]).then(([kRes, pRes]) => {
      setKeywords(kRes.data || []);
      setAlertEmail(pRes.data?.alert_email || user.email || "");
      setFreq(pRes.data?.alert_frequency || "instant");
      setLoading(false);
    });
  }, [supabase, user]);

  // Load top violations the first time the picker opens
  useEffect(() => {
    if (!pickerOpen || !supabase || topViols.length > 0) return;
    setViolsLoading(true);
    supabase.rpc("get_violation_summary", { since_date: null })
      .then(({ data }) => {
        setTopViols((data || []).slice(0, 40));
        setViolsLoading(false);
      });
  }, [pickerOpen, supabase]);

  async function addKeyword(kw) {
    const clean = (kw || newKw).trim().toLowerCase();
    if (!clean || keywords.find(k => k.keyword === clean)) { setNewKw(""); return; }
    const { data } = await supabase.from("violation_alerts")
      .insert([{ user_id: user.id, keyword: clean }]).select().single();
    if (data) setKeywords(prev => [...prev, data]);
    setNewKw("");
  }

  async function removeKeyword(id) {
    await supabase.from("violation_alerts").delete().eq("id", id);
    setKeywords(prev => prev.filter(k => k.id !== id));
  }

  async function saveSettings() {
    await supabase.from("profiles").update({
      alert_email: alertEmail, alert_frequency: freq,
      updated_at: new Date().toISOString(),
    }).eq("id", user.id);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const activeKeywords = new Set(keywords.map(k => k.keyword));

  if (loading) return <div className="acct-empty">Loading…</div>;

  return (
    <>
      <div className="acct-sh">Active keyword alerts</div>
      <div className="acct-empty" style={{ marginBottom: 10 }}>
        Get notified when a new inspection cites a violation matching any of these terms.
      </div>

      {/* Active keywords list */}
      {keywords.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 14 }}>
          {keywords.map(k => (
            <span key={k.id} style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              padding: "4px 10px 4px 12px", borderRadius: 999,
              background: "rgba(52,168,83,0.10)",
              border: "1px solid rgba(52,168,83,0.30)",
              color: "#6fcf8a", fontSize: ".76rem", fontWeight: 700,
            }}>
              {k.keyword}
              <button
                onClick={() => removeKeyword(k.id)}
                style={{ background: "none", border: "none", color: "rgba(52,168,83,0.55)", cursor: "pointer", fontSize: ".80rem", lineHeight: 1, padding: "0 0 0 2px" }}
                aria-label={`Remove ${k.keyword}`}
              >×</button>
            </span>
          ))}
        </div>
      )}

      {/* Keyword text input */}
      <div className="acct-add-row" style={{ marginBottom: 16 }}>
        <input className="acct-input" placeholder="Type a keyword, e.g. rodent, handwash…"
          value={newKw} onChange={e => setNewKw(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") addKeyword(); }} />
        <button className="acct-btn" onClick={() => addKeyword()} disabled={!newKw.trim()}>Add</button>
      </div>

      {/* Common violations picker */}
      <div className="acct-viol-picker">
        <div className="acct-viol-picker-hd" onClick={() => setPickerOpen(v => !v)}>
          <span>Choose from common violations</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            style={{ transform: pickerOpen ? "rotate(180deg)" : "none", transition: "transform .2s" }}>
            <path d="M6 9l6 6 6-6"/>
          </svg>
        </div>
        {pickerOpen && (
          <div className="acct-viol-picker-body">
            {violsLoading ? (
              <span style={{ fontSize: ".78rem", color: "rgba(255,255,255,0.32)" }}>Loading violations…</span>
            ) : topViols.map((v, i) => {
              const isCrit = (v.critical_yn ?? "").toLowerCase().startsWith("y");
              const kw = suggestKeyword(v.violation_desc);
              const alreadyAdded = activeKeywords.has(kw);
              return (
                <button
                  key={i}
                  className={`acct-viol-chip ${isCrit ? "crit" : "non"}${alreadyAdded ? " added" : ""}`}
                  onClick={() => { if (!alreadyAdded && kw) addKeyword(kw); }}
                  title={toTitleCase(v.violation_desc) + (alreadyAdded ? " (already added)" : ` → adds "${kw}"`)}
                  disabled={alreadyAdded}
                >
                  {isCrit ? "⚠ " : ""}{toTitleCase(v.violation_desc)}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="acct-sh">Alert settings</div>
      <div className="acct-field">
        <label className="acct-label">Alert email</label>
        <input className="acct-input" style={{ display: "block", width: "100%", boxSizing: "border-box" }}
          type="email" value={alertEmail} onChange={e => setAlertEmail(e.target.value)} />
      </div>
      <div className="acct-field">
        <label className="acct-label">Frequency</label>
        <select className="acct-select" value={freq} onChange={e => setFreq(e.target.value)}>
          <option value="instant">Instant</option>
          <option value="daily">Daily digest</option>
          <option value="weekly">Weekly digest</option>
        </select>
      </div>
      <button className="acct-btn" onClick={saveSettings}>{saved ? "Saved ✓" : "Save settings"}</button>
    </>
  );
}

function SettingsTab({ user, signOut }) {
  return (
    <>
      <div className="acct-sh">Account</div>
      <div className="acct-item" style={{ marginBottom: 8 }}>
        <div>
          <div className="acct-item-name">{user.email}</div>
          <div className="acct-item-sub">Signed in via magic link</div>
        </div>
      </div>
      <button className="acct-signout" onClick={signOut}>Sign out</button>
    </>
  );
}

export default function AccountPage({ onOpenEstablishment }) {
  const { user, signOut, supabase } = useAuth();
  const [tab, setTab] = useState("watchlist");

  if (!user) return null;

  const avatarLetter = (user.email || "?")[0].toUpperCase();

  return (
    <>
      <style>{STYLES}</style>
      <div className="acct-wrap">
        <div className="acct-inner">
          <div className="acct-hero">
            <div className="acct-avatar">{avatarLetter}</div>
            <div className="acct-name">My Account</div>
            <div className="acct-email">{user.email}</div>
          </div>

          <div className="acct-tabs">
            {[["watchlist", "Watchlist"], ["alerts", "Alerts"], ["settings", "Settings"]].map(([key, label]) => (
              <button key={key} className={"acct-tab" + (tab === key ? " active" : "")} onClick={() => setTab(key)}>
                {label}
              </button>
            ))}
          </div>

          {tab === "watchlist" && <WatchlistTab supabase={supabase} user={user} onOpenEstablishment={onOpenEstablishment} />}
          {tab === "alerts"    && <AlertsTab supabase={supabase} user={user} />}
          {tab === "settings"  && <SettingsTab user={user} signOut={signOut} />}
        </div>
      </div>
    </>
  );
}

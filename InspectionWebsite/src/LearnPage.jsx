import React, { useState, useEffect, useMemo } from "react";
import { useAuth } from "./AuthContext.jsx";

// ─── Styles are scoped with ln- prefix so nothing collides with Map.css ──────
const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Tilt+Neon:XROT,YROT@0,0&display=swap');

.ln-page-wrap {
  position: fixed;
  inset: 0;
  top: var(--header-h, var(--mobile-header-h, 64px));
  background: #0d0d11;
  color: #f0f0f3;
  font-family: "Helvetica Neue", Arial, sans-serif;
  overflow-y: auto;
  z-index: 1050;
  -webkit-overflow-scrolling: touch;
}

.ln-page {
  max-width: 680px;
  margin: 0 auto;
  padding: 36px 20px 60px;
}

/* ── Hero ── */
.ln-hero { text-align: center; margin-bottom: 40px; }
.ln-hero-title {
  font-family: 'Tilt Neon', sans-serif;
  font-size: clamp(20px, 4vw, 32px);
  font-weight: 600; margin-bottom: 8px; line-height: 1.15;
}
.ln-hero-sub {
  font-size: .88rem; color: rgba(255,255,255,0.52);
  line-height: 1.6; max-width: 460px; margin: 0 auto;
}

/* ── Section heading ── */
.ln-sh {
  font-size: .64rem; font-weight: 800; letter-spacing: .15em;
  text-transform: uppercase; color: rgba(255,255,255,0.52);
  margin-bottom: 14px;
  display: flex; align-items: center; gap: 10px;
}
.ln-sh::after {
  content: ''; flex: 1; height: 1px;
  background: rgba(255,255,255,0.09);
}

/* ── Grade trio ── */
.ln-trio {
  display: grid; grid-template-columns: repeat(3, 1fr);
  gap: 10px; margin-bottom: 12px;
}
.ln-gcard {
  border-radius: 14px; overflow: hidden;
  border: 1px solid var(--gbd); background: var(--gbg);
}
.ln-gcard.ga {
  --gbd: rgba(52,168,83,0.26); --gbg: rgba(52,168,83,0.08);
}
.ln-gcard.gb {
  --gbd: rgba(58,134,255,0.26); --gbg: rgba(58,134,255,0.08);
}
.ln-gcard.gc {
  --gbd: rgba(234,67,53,0.26); --gbg: rgba(234,67,53,0.08);
}
.ln-gtop {
  padding: 14px 14px 10px;
  border-bottom: 1px solid rgba(255,255,255,0.07);
}
.ln-gletter {
  font-family: 'Tilt Neon', sans-serif;
  font-size: 2.6rem; font-weight: 600; line-height: 1; margin-bottom: 2px;
}
.ln-gcard.ga .ln-gletter { color: #34a853; text-shadow: 0 0 12px #34a853; }
.ln-gcard.gb .ln-gletter { color: #3a86ff; text-shadow: 0 0 12px #3a86ff; }
.ln-gcard.gc .ln-gletter { color: #ea4335; text-shadow: 0 0 12px #ea4335; }
.ln-gplacard {
  font-size: .62rem; font-weight: 700;
  text-transform: uppercase; letter-spacing: .07em; opacity: .60;
}
.ln-gbody {
  padding: 12px 14px 14px;
  display: flex; flex-direction: column; gap: 8px;
}
.ln-gfield-lbl {
  font-size: .60rem; font-weight: 800; text-transform: uppercase;
  letter-spacing: .08em; color: rgba(255,255,255,0.52); margin-bottom: 2px;
}
.ln-gfield-val { font-size: .82rem; font-weight: 600; }
.ln-gcriteria { font-size: .76rem; color: rgba(255,255,255,0.52); line-height: 1.5; }
.ln-gcriteria li {
  list-style: none; padding-left: 10px;
  position: relative; margin-bottom: 2px;
}
.ln-gcriteria li::before { content: '–'; position: absolute; left: 0; opacity: .5; }

/* ── Callout ── */
.ln-callout {
  border-radius: 12px; padding: 14px 16px; margin-bottom: 32px;
  border: 1px solid rgba(255,255,255,0.12);
  background: rgba(255,255,255,0.04);
  font-size: .83rem; line-height: 1.6; color: rgba(255,255,255,0.80);
}
.ln-callout-label {
  font-size: .62rem; font-weight: 800; letter-spacing: .12em;
  text-transform: uppercase; color: rgba(255,255,255,0.52); margin-bottom: 6px;
}

/* ── Duration table ── */
.ln-ptable {
  width: 100%; border-collapse: collapse; margin-bottom: 10px;
  border-radius: 12px; overflow: hidden;
  border: 1px solid rgba(255,255,255,0.10);
}
.ln-ptable th {
  background: rgba(255,255,255,0.06); padding: 10px 14px;
  text-align: left; font-size: .65rem; font-weight: 800;
  letter-spacing: .10em; text-transform: uppercase; color: rgba(255,255,255,0.52);
}
.ln-ptable td {
  padding: 11px 14px; font-size: .84rem;
  border-top: 1px solid rgba(255,255,255,0.07);
  color: #f0f0f3;
}
.ln-grade-cell {
  font-family: 'Tilt Neon', sans-serif;
  font-size: 1.4rem; font-weight: 600;
}
.ln-grade-cell.ga { color: #34a853; }
.ln-grade-cell.gb { color: #3a86ff; }
.ln-grade-cell.gc { color: #ea4335; }
.ln-table-note {
  font-size: .74rem; color: rgba(255,255,255,0.52);
  line-height: 1.5; margin-bottom: 32px;
}

/* ── Violation types ── */
.ln-vtwo {
  display: grid; grid-template-columns: 1fr 1fr;
  gap: 10px; margin-bottom: 32px;
}
.ln-vcard {
  border-radius: 12px; padding: 14px;
  border: 1px solid rgba(255,255,255,0.09);
  background: rgba(255,255,255,0.04);
  display: flex; flex-direction: column; gap: 5px;
}
.ln-vcard.crit {
  background: rgba(234,67,53,0.08);
  border-color: rgba(234,67,53,0.22);
}
.ln-vchip {
  display: inline-flex; padding: 2px 9px; border-radius: 999px;
  font-size: .62rem; font-weight: 800;
  letter-spacing: .08em; text-transform: uppercase; width: fit-content;
}
.ln-vchip.crit {
  background: rgba(234,67,53,0.18); color: #ff9a9a;
  border: 1px solid rgba(234,67,53,0.34);
}
.ln-vchip.non {
  background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.68);
  border: 1px solid rgba(255,255,255,0.13);
}
.ln-vtitle { font-weight: 700; font-size: .88rem; }
.ln-vdesc  { font-size: .78rem; color: rgba(255,255,255,0.52); line-height: 1.45; }

/* ── Source ── */
.ln-src {
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 10px; padding: 12px 14px;
  font-size: .74rem; color: rgba(255,255,255,0.52); line-height: 1.55;
}
.ln-src a { color: #3a86ff; }

/* ── Violation drill-down panel ── */
.ln-vdb-row { cursor: pointer; }
.ln-vdb-row.expanded { background: rgba(58,134,255,0.06) !important; }
.ln-vdb-drill {
  border-top: 1px solid rgba(255,255,255,0.06);
  padding: 14px 16px 16px;
  background: rgba(255,255,255,0.02);
  display: flex; flex-direction: column; gap: 8px;
}
.ln-vdb-drill-title {
  font-size: .68rem; font-weight: 800; letter-spacing: .10em;
  text-transform: uppercase; color: rgba(255,255,255,0.42); margin-bottom: 4px;
}
.ln-vdb-drill-loading {
  font-size: .80rem; color: rgba(255,255,255,0.35);
}
.ln-vdb-drill-chips {
  display: flex; flex-wrap: wrap; gap: 6px;
}
.ln-vdb-chip {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 4px 11px; border-radius: 999px;
  background: rgba(255,255,255,0.07);
  border: 1px solid rgba(255,255,255,0.13);
  color: rgba(255,255,255,0.80); font-size: .76rem; font-weight: 600;
  cursor: pointer; transition: background .12s, color .12s;
  max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ln-vdb-chip:hover { background: rgba(58,134,255,0.18); border-color: rgba(58,134,255,0.32); color: #82b4ff; }
.ln-vdb-chip-score {
  font-size: .66rem; opacity: .65; flex-shrink: 0;
}
.ln-vdb-drill-more {
  font-size: .72rem; color: rgba(255,255,255,0.35); margin-top: 2px;
}

/* ── Violation database ── */
.ln-vdb-header {
  display: flex; gap: 8px; align-items: center; margin-bottom: 12px; flex-wrap: wrap;
}
.ln-vdb-search {
  flex: 1; min-width: 180px;
  height: 36px; border-radius: 999px;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.12);
  color: #fff; padding: 0 14px 0 36px;
  font-size: .84rem; font-weight: 500;
  position: relative;
}
.ln-vdb-search:focus { outline: none; border-color: rgba(255,255,255,0.28); }
.ln-vdb-search-wrap {
  position: relative; flex: 1; min-width: 180px;
}
.ln-vdb-search-icon {
  position: absolute; left: 12px; top: 50%; transform: translateY(-50%);
  opacity: .5; pointer-events: none; width: 15px; height: 15px;
}
.ln-vdb-tabs {
  display: flex; gap: 4px;
}
.ln-vdb-tab {
  padding: 5px 12px; border-radius: 999px; font-size: .72rem; font-weight: 700;
  border: 1px solid rgba(255,255,255,0.10);
  background: transparent; color: rgba(255,255,255,0.45);
  cursor: pointer; transition: all .15s; white-space: nowrap;
}
.ln-vdb-tab:hover {
  background: rgba(255,255,255,0.06);
  color: rgba(255,255,255,0.75);
}
.ln-vdb-tab.active-all {
  background: rgba(255,255,255,0.09);
  border-color: rgba(255,255,255,0.20); color: #fff;
}
.ln-vdb-tab.active-crit {
  background: rgba(234,67,53,0.14);
  border-color: rgba(234,67,53,0.32); color: #ff9a9a;
}
.ln-vdb-tab.active-non {
  background: rgba(58,134,255,0.12);
  border-color: rgba(58,134,255,0.28); color: #82b4ff;
}
.ln-vdb-list {
  border: 1px solid rgba(255,255,255,0.09);
  border-radius: 12px; overflow: hidden;
  margin-bottom: 10px;
}
.ln-vdb-row {
  display: flex; align-items: center;
  padding: 12px 16px; gap: 12px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  transition: background .12s;
}
.ln-vdb-row:last-child { border-bottom: none; }
.ln-vdb-row:hover { background: rgba(255,255,255,0.04); }
.ln-vdb-row.is-crit { background: rgba(234,67,53,0.04); }
.ln-vdb-row.is-crit:hover { background: rgba(234,67,53,0.08); }
.ln-vdb-dot {
  width: 8px; height: 8px; border-radius: 50%;
  flex-shrink: 0; margin-top: 5px;
}
.ln-vdb-dot.crit { background: #ea4335; box-shadow: 0 0 4px #ea4335; }
.ln-vdb-dot.non  { background: rgba(255,255,255,0.20); }
.ln-vdb-desc {
  flex: 1; font-size: .86rem; line-height: 1.4;
  color: rgba(255,255,255,0.92); font-weight: 500;
}
.ln-vdb-count {
  font-size: .72rem; font-weight: 700;
  color: rgba(255,255,255,0.35); white-space: nowrap;
  padding-top: 3px;
}
.ln-vdb-count.crit { color: rgba(234,67,53,0.60); }
.ln-vdb-crit-badge {
  display: inline-block; margin-left: 8px;
  font-size: .58rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase;
  color: #ff9a9a; background: rgba(234,67,53,0.14);
  border: 1px solid rgba(234,67,53,0.28);
  border-radius: 999px; padding: 1px 6px;
  vertical-align: middle; line-height: 1.6;
}
.ln-vdb-empty {
  padding: 28px 16px; text-align: center;
  font-size: .83rem; color: rgba(255,255,255,0.35);
}
.ln-vdb-stats {
  display: flex; gap: 14px; margin-bottom: 14px; flex-wrap: wrap;
}
.ln-vdb-stat {
  font-size: .74rem; color: rgba(255,255,255,0.45);
}
.ln-vdb-stat strong { color: rgba(255,255,255,0.78); }
.ln-vdb-loading {
  border: 1px solid rgba(255,255,255,0.09); border-radius: 12px;
  padding: 36px; text-align: center;
  font-size: .83rem; color: rgba(255,255,255,0.35); margin-bottom: 10px;
}
.ln-vdb-show-more {
  width: 100%; padding: 10px; border-radius: 8px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.09);
  color: rgba(255,255,255,0.52); font-size: .78rem; font-weight: 600;
  cursor: pointer; margin-bottom: 32px;
  transition: background .15s, color .15s;
}
.ln-vdb-show-more:hover {
  background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.82);
}

/* ── Timeline controls ── */
.ln-vdb-timeline {
  display: flex; gap: 6px; align-items: center;
  margin-bottom: 10px; flex-wrap: wrap;
}
.ln-vdb-tl-label {
  font-size: .64rem; font-weight: 800; letter-spacing: .10em;
  text-transform: uppercase; color: rgba(255,255,255,0.38);
  white-space: nowrap;
}
.ln-vdb-tl-btn {
  padding: 4px 11px; border-radius: 999px; font-size: .70rem; font-weight: 700;
  border: 1px solid rgba(255,255,255,0.10);
  background: transparent; color: rgba(255,255,255,0.42);
  cursor: pointer; transition: all .15s; white-space: nowrap;
}
.ln-vdb-tl-btn:hover { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.70); }
.ln-vdb-tl-btn.tl-active {
  background: rgba(52,168,83,0.12);
  border-color: rgba(52,168,83,0.30); color: #6fcf8a;
}
.ln-vdb-scope-note {
  font-size: .70rem; color: rgba(255,255,255,0.32);
  margin-bottom: 12px; margin-top: -4px; line-height: 1.5;
}

/* ── Login modal ── */
.ln-mback {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.70); backdrop-filter: blur(6px);
  z-index: 9000; display: flex; align-items: center; justify-content: center;
  padding: 20px;
}
.ln-modal {
  background: rgba(20,20,24,0.99);
  border: 1px solid rgba(255,255,255,0.13);
  border-radius: 18px; padding: 26px 22px;
  width: 100%; max-width: 340px; position: relative;
  color: #f0f0f3;
}
.ln-modal-x {
  position: absolute; top: 12px; right: 14px;
  background: transparent; border: none;
  color: rgba(255,255,255,0.40); font-size: 20px; cursor: pointer; line-height: 1;
}
.ln-modal-x:hover { color: #fff; }
.ln-modal-title {
  font-family: 'Tilt Neon', sans-serif; font-size: 1.3rem; font-weight: 600;
  color: #34a853; text-shadow: 0 0 12px #34a853; margin-bottom: 4px;
}
.ln-modal-sub { font-size: .78rem; color: rgba(255,255,255,0.52); margin-bottom: 18px; line-height: 1.5; }
.ln-modal-box {
  background: rgba(255,255,255,0.04);
  border: 1px dashed rgba(255,255,255,0.14);
  border-radius: 12px; padding: 18px; text-align: center;
  display: flex; flex-direction: column; gap: 7px; align-items: center;
}
.ln-modal-icon { font-size: 1.5rem; }
.ln-modal-bt   { font-weight: 700; font-size: .84rem; }
.ln-modal-bd   { font-size: .74rem; color: rgba(255,255,255,0.52); line-height: 1.45; }

/* ── Responsive ── */
@media (max-width: 480px) {
  .ln-trio { grid-template-columns: 1fr; }
  .ln-vtwo { grid-template-columns: 1fr; }
  .ln-ptable th:last-child,
  .ln-ptable td:last-child { display: none; }
  .ln-vdb-header { flex-direction: column; align-items: stretch; }
  .ln-vdb-tabs { justify-content: flex-start; }
}
`;

// ─── Helpers ─────────────────────────────────────────────────────────────────
// Convert ALL-CAPS violation descriptions to Title Case for readability
function toTitleCase(str) {
  if (!str) return str;
  // If the string is not all-caps (mixed case already), leave it alone
  if (str !== str.toUpperCase()) return str;
  const STOP = new Set(['a','an','the','and','but','or','for','nor','on','at','to','by','in','of','up','as','is','it']);
  return str.toLowerCase().replace(/\b\w+/g, (word, idx) =>
    idx === 0 || !STOP.has(word) ? word[0].toUpperCase() + word.slice(1) : word
  );
}

// ─── Violation category keywords → label ─────────────────────────────────────
const CATEGORY_RULES = [
  { label: "Pest / Rodent",         keywords: ["pest","rodent","vermin","insect","roach","mice","rat","fly","flies","bug"] },
  { label: "Temperature Control",   keywords: ["temperature","temp","hot hold","cold hold","cooling","reheating","thaw","reheat"] },
  { label: "Handwashing",           keywords: ["handwash","hand wash","hand-wash","handwashing"] },
  { label: "Employee Hygiene",      keywords: ["employee","personnel","bare hand","glove","hair","illness","sick","hygiene","personal"] },
  { label: "Food Storage",          keywords: ["storage","store","stored","separation","segreg","raw","cooked","contamin","protect","cover"] },
  { label: "Equipment Sanitation",  keywords: ["equipment","utensil","sanitiz","clean","wash","ware","surface","food-contact"] },
  { label: "Water / Plumbing",      keywords: ["water","plumbing","sewage","drain","backflow","cross-connect","supply"] },
  { label: "Documentation / Permit",keywords: ["permit","license","certif","record","document","posting","label","consumer advisory"] },
  { label: "Facility / Structure",  keywords: ["floor","wall","ceiling","light","ventilat","structure","facility","repair","maintain","pest-proof"] },
];

function categorize(desc) {
  if (!desc) return "Other";
  const lower = desc.toLowerCase();
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some(kw => lower.includes(kw))) return rule.label;
  }
  return "Other";
}

// ─── Subcomponents ───────────────────────────────────────────────────────────

function ComingSoonBadge() {
  return (
    <span style={{
      fontSize: ".60rem", fontWeight: 700,
      padding: "2px 8px", borderRadius: 999,
      background: "rgba(251,188,5,0.12)",
      border: "1px solid rgba(251,188,5,0.28)",
      color: "#fbbc05", letterSpacing: ".06em",
      textTransform: "uppercase", verticalAlign: "middle", marginLeft: 6,
    }}>
      Coming soon
    </span>
  );
}

export function LoginModal({ onClose }) {
  const { user, sendMagicLink, signOut, loading } = useAuth();
  const [authError, setAuthError] = useState(null);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div className="ln-mback" onClick={onClose}>
      <div className="ln-modal" onClick={(e) => e.stopPropagation()}>
        <button className="ln-modal-x" onClick={onClose} aria-label="Close">×</button>
        <div className="ln-modal-title">Sign in</div>
        <div className="ln-modal-sub">
          Create a free account to save your favorite restaurants and get placard alerts.
        </div>

        {loading ? (
          <div style={{ textAlign: "center", color: "rgba(255,255,255,0.40)", fontSize: ".84rem", padding: "16px 0" }}>Loading…</div>
        ) : user ? (
          <div className="ln-modal-box" style={{ alignItems: "flex-start", textAlign: "left" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, width: "100%" }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(52,168,83,0.18)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "1rem", flexShrink: 0 }}>
                {(user.email || "?")[0].toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: ".88rem" }}>My Account</div>
                <div style={{ fontSize: ".74rem", color: "rgba(255,255,255,0.45)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{user.email}</div>
              </div>
            </div>
            <button
              onClick={() => { signOut(); onClose(); }}
              style={{ marginTop: 14, width: "100%", padding: "9px 0", borderRadius: 8, background: "rgba(234,67,53,0.10)", border: "1px solid rgba(234,67,53,0.22)", color: "rgba(234,67,53,0.80)", fontWeight: 700, fontSize: ".84rem", cursor: "pointer", fontFamily: "inherit" }}
            >
              Sign out
            </button>
          </div>
        ) : sent ? (
          /* ── Sent confirmation ── */
          <div style={{ textAlign: "center", padding: "8px 0 4px" }}>
            <div style={{ fontSize: "2rem", marginBottom: 8 }}>✉️</div>
            <div style={{ fontWeight: 700, fontSize: ".92rem", marginBottom: 6 }}>Check your email</div>
            <div style={{ fontSize: ".80rem", color: "rgba(255,255,255,0.48)", lineHeight: 1.55, maxWidth: 240, margin: "0 auto 16px" }}>
              We sent a sign-in link to <strong style={{ color: "rgba(255,255,255,0.70)" }}>{email}</strong>.
              Click it to sign in — no password needed.
            </div>
            <button
              onClick={() => { setSent(false); setEmail(""); setAuthError(null); }}
              style={{ fontSize: ".76rem", color: "rgba(255,255,255,0.38)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
            >
              Use a different email
            </button>
          </div>
        ) : (
          /* ── Email input ── */
          <>
            <div style={{ fontSize: ".80rem", color: "rgba(255,255,255,0.48)", marginBottom: 14, lineHeight: 1.5 }}>
              Enter your email and we'll send you a sign-in link. No password, no third-party account needed.
            </div>

            {authError && (
              <div style={{ fontSize: ".74rem", color: "#ff9a9a", background: "rgba(234,67,53,0.09)", border: "1px solid rgba(234,67,53,0.20)", borderRadius: 8, padding: "8px 11px", marginBottom: 12 }}>
                {authError}
              </div>
            )}

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!email.trim() || sending) return;
                setAuthError(null);
                setSending(true);
                const { error } = await sendMagicLink(email.trim());
                setSending(false);
                if (error) {
                  setAuthError(error.message || "Couldn't send the link. Try again.");
                } else {
                  setSent(true);
                }
              }}
            >
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => { setEmail(e.target.value); setAuthError(null); }}
                autoFocus
                required
                style={{
                  display: "block", width: "100%", boxSizing: "border-box",
                  height: 40, borderRadius: 8, padding: "0 12px",
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.14)",
                  color: "#f0f0f3", fontSize: ".88rem", fontFamily: "inherit",
                  marginBottom: 10, outline: "none",
                }}
                onFocus={e => { e.target.style.borderColor = "rgba(52,168,83,0.50)"; }}
                onBlur={e => { e.target.style.borderColor = "rgba(255,255,255,0.14)"; }}
              />
              <button
                type="submit"
                disabled={!email.trim() || sending}
                style={{
                  display: "block", width: "100%",
                  padding: "10px 0", borderRadius: 8,
                  background: "rgba(52,168,83,0.16)",
                  border: "1px solid rgba(52,168,83,0.34)",
                  color: "#6fcf8a", fontWeight: 700, fontSize: ".88rem",
                  cursor: sending || !email.trim() ? "not-allowed" : "pointer",
                  opacity: !email.trim() ? 0.45 : 1,
                  transition: "background .15s, opacity .15s",
                  fontFamily: "inherit",
                }}
                onMouseEnter={e => { if (email.trim() && !sending) e.target.style.background = "rgba(52,168,83,0.26)"; }}
                onMouseLeave={e => { e.target.style.background = "rgba(52,168,83,0.16)"; }}
              >
                {sending ? "Sending…" : "Send sign-in link"}
              </button>
            </form>

            <div style={{ marginTop: 12, fontSize: ".68rem", color: "rgba(255,255,255,0.22)", textAlign: "center", lineHeight: 1.5 }}>
              Free account · No password · Unsubscribe anytime
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Timeline options ────────────────────────────────────────────────────────
const TIMELINE_OPTS = [
  { key: "all",  label: "All time",  days: null, note: "Every recorded citation since data collection began." },
  { key: "12mo", label: "12 months", days: 365,  note: "Citations from the past 12 months only." },
  { key: "6mo",  label: "6 months",  days: 182,  note: "Citations from the past 6 months only." },
  { key: "3mo",  label: "3 months",  days: 91,   note: "Citations from the past 3 months only." },
];

// ─── Violations database section ─────────────────────────────────────────────
const PAGE_SIZE = 40;

function ViolationDatabase({ supabase, initialCutoffDate, onOpenEstablishment }) {
  const [rows, setRows]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [search, setSearch]     = useState("");
  const [tab, setTab]           = useState("all");   // "all" | "crit" | "non"
  const [timeline, setTimeline] = useState("all");   // TIMELINE_OPTS key
  const [showAll, setShowAll]   = useState(false);

  // Drill-down: which violation row is expanded + its establishments list
  const [expandedDesc, setExpandedDesc]       = useState(null);
  const [drillData, setDrillData]             = useState([]); // [{establishment_id, premise_name, address, score_recent}]
  const [drillLoading, setDrillLoading]       = useState(false);
  const [drillTotal, setDrillTotal]           = useState(0);

  async function handleRowClick(desc) {
    if (!supabase) return;
    if (expandedDesc === desc) { setExpandedDesc(null); return; }
    setExpandedDesc(desc);
    setDrillLoading(true);
    setDrillData([]);
    setDrillTotal(0);
    try {
      const { data, error } = await supabase.rpc("get_establishments_for_violation", {
        p_violation_desc: desc,
        p_since_date: cutoffDate ?? null,
      });
      if (error) throw error;
      setDrillData(data || []);
      setDrillTotal((data || []).length);
    } catch (e) {
      console.error("drill-down fetch error", e);
    } finally {
      setDrillLoading(false);
    }
  }

  // ISO cutoff date — use the more restrictive of map filter or local timeline
  const cutoffDate = useMemo(() => {
    const opt = TIMELINE_OPTS.find(o => o.key === timeline);
    const localCutoff = (opt && opt.days)
      ? (() => { const d = new Date(); d.setDate(d.getDate() - opt.days); return d.toISOString().slice(0, 10); })()
      : null;
    if (localCutoff && initialCutoffDate) return localCutoff > initialCutoffDate ? localCutoff : initialCutoffDate;
    return localCutoff ?? initialCutoffDate ?? null;
  }, [timeline, initialCutoffDate]);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    setRows([]);
    setShowAll(false);

    (async () => {
      try {
        const { data, error: err } = await supabase.rpc("get_violation_summary", {
          since_date: cutoffDate ?? null,
        });

        if (err) {
          // Schema cache miss means the migration hasn't been applied yet.
          // Fall back to the direct paginated query so the page still works.
          if (err.message?.includes("schema cache") || err.message?.includes("Could not find")) {
            throw new Error("MIGRATION_PENDING");
          }
          throw err;
        }

        const mapped = (data || []).map((r) => ({
          desc:     r.violation_desc,
          critical: (r.critical_yn ?? "").toLowerCase().startsWith("y"),
          count:    Number(r.cnt),
        }));

        setRows(mapped);
        setError(null);
      } catch (e) {
        if (e.message === "MIGRATION_PENDING") {
          // Fallback: paginated direct query (pre-RPC behavior)
          try {
            const BATCH = 1000;
            const acc   = new Map();
            let offset  = 0;
            while (true) {
              let q = supabase
                .from("inspection_violations")
                .select("violation_desc, critical_yn")
                .not("violation_desc", "is", null);
              if (cutoffDate) q = q.gte("inspection_date", cutoffDate);
              q = q.range(offset, offset + BATCH - 1);
              const { data, error: qErr } = await q;
              if (qErr) throw qErr;
              if (!data || data.length === 0) break;
              for (const r of data) {
                const isCrit = (r.critical_yn ?? "").toLowerCase().startsWith("y");
                const key = r.violation_desc + "||" + (isCrit ? "Y" : "N");
                if (acc.has(key)) acc.get(key).count++;
                else acc.set(key, { desc: r.violation_desc, critical: isCrit, count: 1 });
              }
              if (data.length < BATCH) break;
              offset += BATCH;
            }
            setRows([...acc.values()].sort((a, b) => b.count - a.count));
            setError(null);
          } catch (fallbackErr) {
            setError(fallbackErr.message || "Failed to load violations");
          }
        } else {
          setError(e.message || "Failed to load violations");
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [supabase, cutoffDate]);

  // Word-boundary regex — "rat" won't match inside "temperature"
  const searchRegex = useMemo(() => {
    const q = search.trim();
    if (!q) return null;
    try { return new RegExp("\\b" + q.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&"), "i"); }
    catch { return null; }
  }, [search]);

  const filtered = useMemo(() => rows.filter(r => {
    if (tab === "crit" && !r.critical) return false;
    if (tab === "non"  &&  r.critical) return false;
    if (searchRegex && !searchRegex.test(r.desc)) return false;
    return true;
  }), [rows, searchRegex, tab]);

  const visible        = showAll ? filtered : filtered.slice(0, PAGE_SIZE);
  const critCount      = rows.filter(r =>  r.critical).length;
  const nonCount       = rows.filter(r => !r.critical).length;
  const totalCitations = rows.reduce((s, r) => s + r.count, 0);
  const scopeNote      = TIMELINE_OPTS.find(o => o.key === timeline)?.note ?? "";

  function Highlighted({ text }) {
    if (!searchRegex) return <>{text}</>;
    const parts   = text.split(searchRegex);
    const matches = text.match(searchRegex) || [];
    return (
      <>
        {parts.map((p, i) => (
          <React.Fragment key={i}>
            {p}
            {matches[i] && (
              <mark style={{ background: "rgba(251,188,5,0.28)", color: "#fbbc05", borderRadius: 2, padding: "0 1px" }}>
                {matches[i]}
              </mark>
            )}
          </React.Fragment>
        ))}
      </>
    );
  }

  if (!supabase) return (
    <div className="ln-vdb-loading">Violation database unavailable — supabase prop not provided.</div>
  );

  return (
    <>
      {/* Timeline selector */}
      <div className="ln-vdb-timeline">
        <span className="ln-vdb-tl-label">Showing</span>
        {TIMELINE_OPTS.map(opt => (
          <button
            key={opt.key}
            className={"ln-vdb-tl-btn" + (timeline === opt.key ? " tl-active" : "")}
            onClick={() => { setTimeline(opt.key); setSearch(""); setTab("all"); }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="ln-vdb-loading">Loading violations…</div>
      ) : error ? (
        <div className="ln-vdb-loading" style={{ color: "#ff9a9a" }}>Error: {error}</div>
      ) : (
        <>
          <p className="ln-vdb-scope-note">{scopeNote}</p>

          {/* Stats */}
          <div className="ln-vdb-stats">
            <span className="ln-vdb-stat"><strong>{rows.length.toLocaleString()}</strong> distinct violation types</span>
            <span className="ln-vdb-stat"><strong style={{ color: "#ff9a9a" }}>{critCount}</strong> critical</span>
            <span className="ln-vdb-stat"><strong>{nonCount}</strong> non-critical</span>
            <span className="ln-vdb-stat">
              <strong>{totalCitations.toLocaleString()}</strong> total citations
              {timeline !== "all" && <span style={{ color: "rgba(255,255,255,0.30)", fontWeight: 400 }}> in window</span>}
            </span>
          </div>

          {/* Search + severity tabs */}
          <div className="ln-vdb-header">
            <div className="ln-vdb-search-wrap">
              <svg className="ln-vdb-search-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M15.5 14h-.79l-.28-.27A6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79L20 21.5 21.5 20zM9.5 14A4.5 4.5 0 1 1 14 9.5 4.505 4.505 0 0 1 9.5 14z" fill="currentColor" />
              </svg>
              <input
                className="ln-vdb-search"
                type="text"
                placeholder="Search violations…"
                value={search}
                onChange={e => { setSearch(e.target.value); setShowAll(false); }}
              />
            </div>
            <div className="ln-vdb-tabs">
              <button className={"ln-vdb-tab " + (tab === "all"  ? "active-all"  : "")} onClick={() => { setTab("all");  setShowAll(false); }}>All</button>
              <button className={"ln-vdb-tab " + (tab === "crit" ? "active-crit" : "")} onClick={() => { setTab("crit"); setShowAll(false); }}>⚠ Critical</button>
              <button className={"ln-vdb-tab " + (tab === "non"  ? "active-non"  : "")} onClick={() => { setTab("non");  setShowAll(false); }}>Non-critical</button>
            </div>
          </div>

          {/* List */}
          {filtered.length === 0 ? (
            <div className="ln-vdb-loading">
              No violations match "{search}"{tab !== "all" ? ` in the ${tab === "crit" ? "critical" : "non-critical"} tab` : ""}.<br />
              <span style={{ fontSize: ".76rem", color: "rgba(255,255,255,0.30)" }}>Try a broader term or switch to All.</span>
            </div>
          ) : (
            <div className="ln-vdb-list">
              {visible.map((r, i) => {
                const isExpanded = expandedDesc === r.desc;
                return (
                  <React.Fragment key={i}>
                    <div
                      className={"ln-vdb-row" + (r.critical ? " is-crit" : "") + (isExpanded ? " expanded" : "")}
                      onClick={() => handleRowClick(r.desc)}
                      title="Click to see establishments with this violation"
                      role="button"
                      tabIndex={0}
                      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") handleRowClick(r.desc); }}
                    >
                      <div className={"ln-vdb-dot " + (r.critical ? "crit" : "non")} title={r.critical ? "Critical violation" : "Non-critical"} />
                      <div className="ln-vdb-desc">
                        <Highlighted text={toTitleCase(r.desc)} />
                        {r.critical && <span className="ln-vdb-crit-badge">critical</span>}
                      </div>
                      <div className={"ln-vdb-count" + (r.critical ? " crit" : "")}>
                        {r.count.toLocaleString()}×
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="ln-vdb-drill">
                        <div className="ln-vdb-drill-title">Establishments with this violation</div>
                        {drillLoading ? (
                          <div className="ln-vdb-drill-loading">Loading…</div>
                        ) : drillData.length === 0 ? (
                          <div className="ln-vdb-drill-loading">No results found in this time window.</div>
                        ) : (
                          <>
                            <div className="ln-vdb-drill-chips">
                              {drillData.map((est) => (
                                <button
                                  key={est.establishment_id}
                                  className="ln-vdb-chip"
                                  title={est.address || ""}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onOpenEstablishment?.(est.establishment_id);
                                  }}
                                >
                                  <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                                    {est.premise_name || est.establishment_id}
                                  </span>
                                  {est.score_recent != null && (
                                    <span className="ln-vdb-chip-score">
                                      {est.score_recent}
                                    </span>
                                  )}
                                </button>
                              ))}
                            </div>
                            {drillTotal >= 50 && (
                              <div className="ln-vdb-drill-more">Showing top 50 results — search to narrow down.</div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          )}

          {!showAll && filtered.length > PAGE_SIZE && (
            <button className="ln-vdb-show-more" onClick={() => setShowAll(true)}>
              Show all {filtered.length.toLocaleString()} results
            </button>
          )}
          {showAll && filtered.length > PAGE_SIZE && (
            <button className="ln-vdb-show-more" onClick={() => setShowAll(false)}>Collapse</button>
          )}
        </>
      )}
    </>
  );
}

// ─── Main export ─────────────────────────────────────────────────────────────
// Props:
//   loginOpen       boolean  — whether the login modal is open
//   onCloseLogin    fn       — called to close the modal
//   supabase        client   — supabase client for violations query (optional)
//   mapCutoffDate   string   — ISO date from map's "Since" filter (optional)
//   onOpenEstablishment fn   — (eid) called to close Learn and open drawer
export default function LearnPage({ loginOpen, onCloseLogin, supabase, mapCutoffDate, onOpenEstablishment }) {
  return (
    <>
      <style>{STYLES}</style>
      <div className="ln-page-wrap">
        <div className="ln-page">

          {/* Hero */}
          <div className="ln-hero">
            <h1 className="ln-hero-title">Understanding Louisville Food Inspections</h1>
            <p className="ln-hero-sub">
              This is how the Louisville Health Department uses scores and violations to determine the resulting placard.
            </p>
          </div>

          {/* Grade cards */}
          <div className="ln-sh">The three placards</div>
          <div className="ln-trio">
            <div className="ln-gcard ga">
              <div className="ln-gtop">
                <div className="ln-gletter">A</div>
                <div className="ln-gplacard">Green placard</div>
              </div>
              <div className="ln-gbody">
                <div>
                  <div className="ln-gfield-lbl">Score</div>
                  <div className="ln-gfield-val">85 – 100</div>
                </div>
                <div>
                  <div className="ln-gfield-lbl">Condition</div>
                  <ul className="ln-gcriteria"><li>No critical violations</li></ul>
                </div>
              </div>
            </div>

            <div className="ln-gcard gb">
              <div className="ln-gtop">
                <div className="ln-gletter">B</div>
                <div className="ln-gplacard">Blue placard</div>
              </div>
              <div className="ln-gbody">
                <div>
                  <div className="ln-gfield-lbl">Score</div>
                  <div className="ln-gfield-val">Below 85, no critical violations</div>
                </div>
                <div>
                  <div className="ln-gfield-lbl">Also issued when</div>
                  <ul className="ln-gcriteria">
                    <li>Failed 2 consecutive routine inspections, then passed follow-up</li>
                    <li>Closed for imminent hazard, then passed follow-up</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="ln-gcard gc">
              <div className="ln-gtop">
                <div className="ln-gletter">C</div>
                <div className="ln-gplacard">Red placard</div>
              </div>
              <div className="ln-gbody">
                <div>
                  <div className="ln-gfield-lbl">Score</div>
                  <div className="ln-gfield-val">84 or below</div>
                </div>
                <div>
                  <div className="ln-gfield-lbl">Condition</div>
                  <ul className="ln-gcriteria">
                    <li>Any critical violation present</li>
                    <li>Failed minimum KY Food Code requirements</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Key callout */}
          <div className="ln-callout">
            <div className="ln-callout-label">⚠ Score alone does not always determine the grade</div>
            <p>
              A facility scoring 90 with a critical violation still receives a{" "}
              <strong>C (red) placard</strong>. A facility scoring 82 with{" "}
              <em>no</em> critical violations receives a <strong>B (blue) placard</strong>,
              not a C. The grade reflects both score and violation severity together.
            </p>
            <p style={{ marginTop: 8, color: "rgba(255,255,255,0.45)", fontSize: ".78rem" }}>
              Note: The official placard colors are <strong>green, blue, and red,</strong> 
              the colors on the map screen reflect the <strong>score only</strong> and can be customized by changing the thresholds.
              
            </p>
          </div>

          {/* Duration table */}
          <div className="ln-sh">How long each placard is posted</div>
          <table className="ln-ptable">
            <thead>
              <tr>
                <th>Grade</th>
                <th>Color</th>
                <th>Duration</th>
                <th>What ends it</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><span className="ln-grade-cell ga">A</span></td>
                <td>Green</td>
                <td>Until next routine inspection</td>
                <td>Next scheduled routine visit</td>
              </tr>
              <tr>
                <td><span className="ln-grade-cell gb">B</span></td>
                <td>Blue</td>
                <td>3 To 6 Months</td>
                <td>The health department forces a mandatory regular inspection within this window.</td>
              </tr>
              <tr>
                <td><span className="ln-grade-cell gc">C</span></td>
                <td>Red</td>
                <td>Min 7 days, max 10 days</td>
                <td>Follow-up inspection required; new placard posted after</td>
              </tr>
            </tbody>
          </table>
          <p className="ln-table-note">
            Per official policy, B remains posted "until the facility passes their next regular
            inspection." Routine frequency varies by facility risk level and is not defined in the
            placard policy. Interim visits don't change the posted placard.
          </p>

          {/* Violation types */}
          <div className="ln-sh">Critical vs. non-critical violations</div>
          <div className="ln-vtwo">
            <div className="ln-vcard crit">
              <span className="ln-vchip crit">⚠ Critical</span>
              <div className="ln-vtitle">Direct foodborne illness risk</div>
              <p className="ln-vdesc">
                A violation of a Kentucky Food Code provision that directly eliminates,
                prevents, or reduces a foodborne illness hazard with no other provision
                more directly controlling it.
                <br /><br />
                Any critical violation = C placard, regardless of score.
              </p>
            </div>
            <div className="ln-vcard">
              <span className="ln-vchip non">Non-critical</span>
              <div className="ln-vtitle">Operational or structural</div>
              <p className="ln-vdesc">
                Violations related to upkeep, documentation, or equipment.
                These lower your score but don't automatically trigger a C.
                Enough of them can push you below 85 into B territory.
              </p>
            </div>
          </div>
          <p className="ln-table-note">
          Note: While the health department legally changed the 
          term "Critical Violation" to "Priority Violation" (and "Non-Critical" to "Core Violation"), 
          the basic rules remain the same. We prefer the traditional terms, though both refer 
          to the exact same food safety risks.
          </p>

          {/* Violations database */}
          <div className="ln-sh" style={{ marginBottom: 10 }}>
            Violation database
          </div>
          <ViolationDatabase
            supabase={supabase}
            initialCutoffDate={mapCutoffDate ?? null}
            onOpenEstablishment={onOpenEstablishment}
          />

          {/* Source */}
          <div className="ln-src">
            <strong style={{ color: "rgba(255,255,255,0.65)" }}>Source:</strong>{" "}
            Louisville Metro Health Dept. ABC Placard Issuance Policy (effective March 14, 2016,
            updated June 7, 2019) and Kentucky Food Code. All information is derived directly
            from the official policy document.{" "}
            <a
              href="https://louisvilleky.gov/sites/default/files/2021-12/abc-placard-issuance_pol_env_20190607.pdf"
              target="_blank" rel="noopener noreferrer"
            >
              View official policy →
            </a>
          </div>

        </div>
      </div>

      {loginOpen && <LoginModal onClose={onCloseLogin} />}
    </>
  );
}
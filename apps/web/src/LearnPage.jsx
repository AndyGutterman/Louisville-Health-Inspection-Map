import { summarizeViolations } from "./lib/violationSummary.js";
import React, { useState, useEffect, useMemo } from "react";
import { useAuth } from "./AuthContext.jsx";
import { cleanCode, isCompleteCode } from "./lib/authCode.js";
import DataSources from "./DataSources.jsx";
import "./styles/LearnPage.css";

// ─── Helpers ─────────────────────────────────────────────────────────────────
// Convert ALL-CAPS violation descriptions to Title Case for readability
function toTitleCase(str) {
  if (!str) return str;
  // If the string is not all-caps (mixed case already), leave it alone
  if (str !== str.toUpperCase()) return str;
  const STOP = new Set([
    "a",
    "an",
    "the",
    "and",
    "but",
    "or",
    "for",
    "nor",
    "on",
    "at",
    "to",
    "by",
    "in",
    "of",
    "up",
    "as",
    "is",
    "it",
  ]);
  return str
    .toLowerCase()
    .replace(/\b\w+/g, (word, idx) =>
      idx === 0 || !STOP.has(word) ? word[0].toUpperCase() + word.slice(1) : word,
    );
}

// ─── Violation category keywords → label ─────────────────────────────────────
const CATEGORY_RULES = [
  {
    label: "Pest / Rodent",
    keywords: ["pest", "rodent", "vermin", "insect", "roach", "mice", "rat", "fly", "flies", "bug"],
  },
  {
    label: "Temperature Control",
    keywords: [
      "temperature",
      "temp",
      "hot hold",
      "cold hold",
      "cooling",
      "reheating",
      "thaw",
      "reheat",
    ],
  },
  { label: "Handwashing", keywords: ["handwash", "hand wash", "hand-wash", "handwashing"] },
  {
    label: "Employee Hygiene",
    keywords: [
      "employee",
      "personnel",
      "bare hand",
      "glove",
      "hair",
      "illness",
      "sick",
      "hygiene",
      "personal",
    ],
  },
  {
    label: "Food Storage",
    keywords: [
      "storage",
      "store",
      "stored",
      "separation",
      "segreg",
      "raw",
      "cooked",
      "contamin",
      "protect",
      "cover",
    ],
  },
  {
    label: "Equipment Sanitation",
    keywords: [
      "equipment",
      "utensil",
      "sanitiz",
      "clean",
      "wash",
      "ware",
      "surface",
      "food-contact",
    ],
  },
  {
    label: "Water / Plumbing",
    keywords: ["water", "plumbing", "sewage", "drain", "backflow", "cross-connect", "supply"],
  },
  {
    label: "Documentation / Permit",
    keywords: [
      "permit",
      "license",
      "certif",
      "record",
      "document",
      "posting",
      "label",
      "consumer advisory",
    ],
  },
  {
    label: "Facility / Structure",
    keywords: [
      "floor",
      "wall",
      "ceiling",
      "light",
      "ventilat",
      "structure",
      "facility",
      "repair",
      "maintain",
      "pest-proof",
    ],
  },
];

// ─── Subcomponents ───────────────────────────────────────────────────────────

function ComingSoonBadge() {
  return (
    <span
      style={{
        fontSize: ".60rem",
        fontWeight: 700,
        padding: "2px 8px",
        borderRadius: 999,
        background: "rgba(251,188,5,0.12)",
        border: "1px solid rgba(251,188,5,0.28)",
        color: "#fbbc05",
        letterSpacing: ".06em",
        textTransform: "uppercase",
        verticalAlign: "middle",
        marginLeft: 6,
      }}
    >
      Coming soon
    </span>
  );
}

// Styles scoped to LoginModal — injected here so the modal works whether rendered
// inside LearnPage OR standalone from the map header (which doesn't load LearnPage).
// The sign-in form's digest checkbox, kept until the code is verified (lib/digest.js).
import { rememberDigestOptIn } from "./lib/digest.js";

export function LoginModal({ onClose }) {
  const { user, sendMagicLink, verifyCode, signOut, loading } = useAuth();
  const [authError, setAuthError] = useState(null);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [digest, setDigest] = useState(true); // the weekly email; applied once signed in
  // The code from the email, typed here. A link opened from a phone's mail app signs in
  // the mail app's own browser, not this one; the code signs in wherever it's typed.
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [codeError, setCodeError] = useState(null);

  async function submitCode(e) {
    e.preventDefault();
    if (!isCompleteCode(code) || verifying) return;
    setCodeError(null);
    setVerifying(true);
    const { error } = await verifyCode(email.trim(), code);
    setVerifying(false);
    if (error) {
      setCodeError("That code didn't work. Check it, or send a new one.");
      return;
    }
    onClose(); // signed in: the header switches to Saved on its own
  }

  useEffect(() => {
    const h = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <>
      <div className="ln-mback" onClick={onClose}>
        <div className="ln-modal" onClick={(e) => e.stopPropagation()}>
          <button className="ln-modal-x" onClick={onClose} aria-label="Close">
            ×
          </button>
          <div className="ln-modal-title">Sign in</div>
          <div className="ln-modal-sub">
            Create a free account to save your favorite restaurants and get the weekly digest.
          </div>

          {loading ? (
            <div
              style={{
                textAlign: "center",
                color: "rgba(255,255,255,0.40)",
                fontSize: ".84rem",
                padding: "16px 0",
              }}
            >
              Loading…
            </div>
          ) : user ? (
            <div className="ln-modal-box" style={{ alignItems: "flex-start", textAlign: "left" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, width: "100%" }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    background: "rgba(52,168,83,0.18)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 700,
                    fontSize: "1rem",
                    flexShrink: 0,
                  }}
                >
                  {(user.email || "?")[0].toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: ".88rem" }}>My Account</div>
                  <div
                    style={{
                      fontSize: ".74rem",
                      color: "rgba(255,255,255,0.45)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {user.email}
                  </div>
                </div>
              </div>
              <button
                onClick={() => {
                  signOut();
                  onClose();
                }}
                style={{
                  marginTop: 14,
                  width: "100%",
                  padding: "9px 0",
                  borderRadius: 8,
                  background: "rgba(234,67,53,0.10)",
                  border: "1px solid rgba(234,67,53,0.22)",
                  color: "rgba(234,67,53,0.80)",
                  fontWeight: 700,
                  fontSize: ".84rem",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Sign out
              </button>
            </div>
          ) : sent ? (
            /* ── Sent: type the code from the email ── */
            <div className="ln-code" data-testid="sign-in-code-step">
              <div className="ln-code-icon" aria-hidden="true">
                ✉️
              </div>
              <div className="ln-code-title">Check your email</div>
              <div className="ln-code-text">
                We sent a sign-in code to <strong>{email}</strong>. Type it here.
              </div>
              <form onSubmit={submitCode}>
                <input
                  className="ln-code-input"
                  aria-label="Sign-in code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="123456"
                  value={code}
                  onChange={(e) => {
                    setCode(cleanCode(e.target.value));
                    setCodeError(null);
                  }}
                  autoFocus
                />
                {codeError && (
                  <div className="ln-code-error" role="alert">
                    {codeError}
                  </div>
                )}
                <button
                  type="submit"
                  className="ln-code-submit"
                  disabled={!isCompleteCode(code) || verifying}
                >
                  {verifying ? "Checking…" : "Sign in"}
                </button>
              </form>
              <div className="ln-code-hint">
                On a computer you can tap the link in the email instead.
              </div>
              <button
                type="button"
                className="ln-code-other"
                onClick={() => {
                  setSent(false);
                  setEmail("");
                  setCode("");
                  setCodeError(null);
                  setAuthError(null);
                }}
              >
                Use a different email
              </button>
            </div>
          ) : (
            /* ── Email input ── */
            <>
              <div
                style={{
                  fontSize: ".80rem",
                  color: "rgba(255,255,255,0.48)",
                  marginBottom: 14,
                  lineHeight: 1.5,
                }}
              >
                Enter your email and we'll send you a sign-in code. No password, no third-party
                account needed.
              </div>

              {authError && (
                <div
                  style={{
                    fontSize: ".74rem",
                    color: "#ff9a9a",
                    background: "rgba(234,67,53,0.09)",
                    border: "1px solid rgba(234,67,53,0.20)",
                    borderRadius: 8,
                    padding: "8px 11px",
                    marginBottom: 12,
                  }}
                >
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
                    setAuthError(error.message || "Couldn't send the code. Try again.");
                  } else {
                    rememberDigestOptIn(digest);
                    setSent(true);
                  }
                }}
              >
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setAuthError(null);
                  }}
                  autoFocus
                  required
                  style={{
                    display: "block",
                    width: "100%",
                    boxSizing: "border-box",
                    height: 40,
                    borderRadius: 8,
                    padding: "0 12px",
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.14)",
                    color: "#f0f0f3",
                    fontSize: ".88rem",
                    fontFamily: "inherit",
                    marginBottom: 10,
                    outline: "none",
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = "rgba(52,168,83,0.50)";
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = "rgba(255,255,255,0.14)";
                  }}
                />
                <label className="ln-digest-opt">
                  <input
                    type="checkbox"
                    checked={digest}
                    onChange={(e) => setDigest(e.target.checked)}
                  />
                  <span>
                    Email me the weekly digest: this week&apos;s inspections, the ones that failed.
                    Tuesdays, unsubscribe anytime.
                  </span>
                </label>
                <button
                  type="submit"
                  disabled={!email.trim() || sending}
                  style={{
                    display: "block",
                    width: "100%",
                    padding: "10px 0",
                    borderRadius: 8,
                    background: "rgba(52,168,83,0.16)",
                    border: "1px solid rgba(52,168,83,0.34)",
                    color: "#6fcf8a",
                    fontWeight: 700,
                    fontSize: ".88rem",
                    cursor: sending || !email.trim() ? "not-allowed" : "pointer",
                    opacity: !email.trim() ? 0.45 : 1,
                    transition: "background .15s, opacity .15s",
                    fontFamily: "inherit",
                  }}
                  onMouseEnter={(e) => {
                    if (email.trim() && !sending)
                      e.target.style.background = "rgba(52,168,83,0.26)";
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.background = "rgba(52,168,83,0.16)";
                  }}
                >
                  {sending ? "Sending…" : "Email me a code"}
                </button>
              </form>

              <div
                style={{
                  marginTop: 12,
                  fontSize: ".68rem",
                  color: "rgba(255,255,255,0.22)",
                  textAlign: "center",
                  lineHeight: 1.5,
                }}
              >
                Free account · No password · Unsubscribe anytime
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Timeline options ────────────────────────────────────────────────────────
const TIMELINE_OPTS = [
  {
    key: "all",
    label: "All time",
    days: null,
    note: "Every recorded citation since data collection began.",
  },
  { key: "12mo", label: "12 months", days: 365, note: "Citations from the past 12 months only." },
  { key: "6mo", label: "6 months", days: 182, note: "Citations from the past 6 months only." },
  { key: "3mo", label: "3 months", days: 91, note: "Citations from the past 3 months only." },
];

// ─── Violations database section ─────────────────────────────────────────────
const PAGE_SIZE = 40;

function ViolationDatabase({ supabase, initialCutoffDate, onOpenEstablishment }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [timeline, setTimeline] = useState("all"); // TIMELINE_OPTS key
  const [showAll, setShowAll] = useState(false);

  // Drill-down: which violation row is expanded + its establishments list
  const [expandedDesc, setExpandedDesc] = useState(null);
  const [drillData, setDrillData] = useState([]); // [{establishment_id, premise_name, address, score_recent}]
  const [drillLoading, setDrillLoading] = useState(false);
  const [drillTotal, setDrillTotal] = useState(0);

  async function handleRowClick(desc) {
    if (!supabase) return;
    if (expandedDesc === desc) {
      setExpandedDesc(null);
      return;
    }
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
    const opt = TIMELINE_OPTS.find((o) => o.key === timeline);
    const localCutoff =
      opt && opt.days
        ? (() => {
            const d = new Date();
            d.setDate(d.getDate() - opt.days);
            return d.toISOString().slice(0, 10);
          })()
        : null;
    if (localCutoff && initialCutoffDate)
      return localCutoff > initialCutoffDate ? localCutoff : initialCutoffDate;
    return localCutoff ?? initialCutoffDate ?? null;
  }, [timeline, initialCutoffDate]);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setRows([]);
    setShowAll(false);

    (async () => {
      try {
        const { data, error: err } = await supabase.rpc("get_violation_summary", {
          since_date: cutoffDate ?? null,
        });

        if (err) throw err;

        setRows(
          summarizeViolations((data || []).map((r) => ({ desc: r.violation_desc, count: r.cnt }))),
        );
        setError(null);
      } catch (e) {
        // No fallback that pages through inspection_violations: one failed request used
        // to start a download of the whole table, a page at a time.
        setError(e.message || "Failed to load violations");
      } finally {
        setLoading(false);
      }
    })();
  }, [supabase, cutoffDate]);

  // Word-boundary regex — "rat" won't match inside "temperature"
  const searchRegex = useMemo(() => {
    const q = search.trim();
    if (!q) return null;
    try {
      return new RegExp("\\b" + q.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&"), "i");
    } catch {
      return null;
    }
  }, [search]);

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (searchRegex && !searchRegex.test(r.desc)) return false;
        return true;
      }),
    [rows, searchRegex],
  );

  const visible = showAll ? filtered : filtered.slice(0, PAGE_SIZE);
  const totalCitations = rows.reduce((s, r) => s + r.count, 0);
  const scopeNote = TIMELINE_OPTS.find((o) => o.key === timeline)?.note ?? "";

  function Highlighted({ text }) {
    if (!searchRegex) return <>{text}</>;
    const parts = text.split(searchRegex);
    const matches = text.match(searchRegex) || [];
    return (
      <>
        {parts.map((p, i) => (
          <React.Fragment key={i}>
            {p}
            {matches[i] && (
              <mark
                style={{
                  background: "rgba(251,188,5,0.28)",
                  color: "#fbbc05",
                  borderRadius: 2,
                  padding: "0 1px",
                }}
              >
                {matches[i]}
              </mark>
            )}
          </React.Fragment>
        ))}
      </>
    );
  }

  if (!supabase)
    return (
      <div className="ln-vdb-loading">
        Violation database unavailable — supabase prop not provided.
      </div>
    );

  return (
    <>
      {/* Timeline selector */}
      <div className="ln-vdb-timeline">
        <span className="ln-vdb-tl-label">Showing</span>
        {TIMELINE_OPTS.map((opt) => (
          <button
            key={opt.key}
            className={"ln-vdb-tl-btn" + (timeline === opt.key ? " tl-active" : "")}
            onClick={() => {
              setTimeline(opt.key);
              setSearch("");
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="ln-vdb-loading">Loading violations…</div>
      ) : error ? (
        <div className="ln-vdb-loading" style={{ color: "#ff9a9a" }}>
          Error: {error}
        </div>
      ) : (
        <>
          <p className="ln-vdb-scope-note">{scopeNote}</p>

          {/* Stats */}
          <div className="ln-vdb-stats">
            <span className="ln-vdb-stat">
              <strong>{rows.length.toLocaleString()}</strong> distinct violation types
            </span>
            <span className="ln-vdb-stat">
              <strong>{totalCitations.toLocaleString()}</strong> total citations
              {timeline !== "all" && (
                <span style={{ color: "rgba(255,255,255,0.30)", fontWeight: 400 }}> in window</span>
              )}
            </span>
          </div>

          {/* Search */}
          <div className="ln-vdb-header">
            <div className="ln-vdb-search-wrap">
              <svg className="ln-vdb-search-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M15.5 14h-.79l-.28-.27A6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79L20 21.5 21.5 20zM9.5 14A4.5 4.5 0 1 1 14 9.5 4.505 4.505 0 0 1 9.5 14z"
                  fill="currentColor"
                />
              </svg>
              <input
                className="ln-vdb-search"
                type="text"
                placeholder="Search violations…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setShowAll(false);
                }}
              />
            </div>
          </div>

          {/* List */}
          {filtered.length === 0 ? (
            <div className="ln-vdb-loading">
              No violations match "{search}".
              <br />
              <span style={{ fontSize: ".76rem", color: "rgba(255,255,255,0.30)" }}>
                Try a broader term.
              </span>
            </div>
          ) : (
            <div className="ln-vdb-list">
              {visible.map((r, i) => {
                const isExpanded = expandedDesc === r.desc;
                return (
                  <React.Fragment key={i}>
                    <div
                      className={"ln-vdb-row" + (isExpanded ? " expanded" : "")}
                      onClick={() => handleRowClick(r.desc)}
                      title="Click to see establishments with this violation"
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") handleRowClick(r.desc);
                      }}
                    >
                      <div className="ln-vdb-dot non" />
                      <div className="ln-vdb-desc">
                        <Highlighted text={toTitleCase(r.desc)} />
                      </div>
                      <div className="ln-vdb-count">{r.count.toLocaleString()}×</div>
                    </div>

                    {isExpanded && (
                      <div className="ln-vdb-drill">
                        <div className="ln-vdb-drill-title">Establishments with this violation</div>
                        {drillLoading ? (
                          <div className="ln-vdb-drill-loading">Loading…</div>
                        ) : drillData.length === 0 ? (
                          <div className="ln-vdb-drill-loading">
                            No results found in this time window.
                          </div>
                        ) : (
                          <>
                            <div className="ln-vdb-drill-chips">
                              {drillData.map((est) => {
                                const vDate = est.violation_date
                                  ? new Date(est.violation_date).toLocaleDateString(undefined, {
                                      month: "short",
                                      day: "numeric",
                                      year: "2-digit",
                                      timeZone: "UTC",
                                    })
                                  : null;
                                const vScore = est.violation_score ?? est.score_recent;
                                return (
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
                                    {(vDate || vScore != null) && (
                                      <span
                                        className="ln-vdb-chip-score"
                                        title="Score · date when cited"
                                      >
                                        {vScore != null ? vScore : ""}
                                        {vDate ? ` · ${vDate}` : ""}
                                      </span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                            {drillTotal >= 50 && (
                              <div className="ln-vdb-drill-more">
                                Showing top 50 results — search to narrow down.
                              </div>
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
            <button className="ln-vdb-show-more" onClick={() => setShowAll(false)}>
              Collapse
            </button>
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
export default function LearnPage({
  loginOpen,
  onCloseLogin,
  supabase,
  mapCutoffDate,
  onOpenEstablishment,
}) {
  return (
    <>
      <div className="ln-page-wrap">
        <div className="ln-page">
          {/* Hero */}
          <div className="ln-hero">
            <h1 className="ln-hero-title">Understanding Louisville Food Inspections</h1>
            <p className="ln-hero-sub">
              How Louisville Metro Public Health and Wellness scores an inspection and decides which
              placard a place has to post.
            </p>
          </div>

          {/* Grade cards (Placard Issuance Policy, June 7, 2019) */}
          <div className="ln-sh">The three placards</div>
          <p className="ln-table-note" style={{ marginTop: 0, marginBottom: 14 }}>
            Placards are Louisville Metro&apos;s program. Bullitt County posts scores but no letter
            grades, so its places show a score only.
          </p>
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
                  <div className="ln-gfield-lbl">And</div>
                  <ul className="ln-gcriteria">
                    <li>No priority violations</li>
                  </ul>
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
                  <div className="ln-gfield-lbl">Based on</div>
                  <div className="ln-gfield-val">Recent history</div>
                </div>
                <div>
                  <div className="ln-gfield-lbl">After any of these</div>
                  <ul className="ln-gcriteria">
                    <li>Failing 2 inspections in a row</li>
                    <li>A closure for an imminent health hazard</li>
                    <li>A regular inspection scored below 60</li>
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
                  <div className="ln-gfield-val">Below 85</div>
                </div>
                <div>
                  <div className="ln-gfield-lbl">Or</div>
                  <ul className="ln-gcriteria">
                    <li>One or more priority violations, whatever the score</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Key callout */}
          <div className="ln-callout">
            <div className="ln-callout-label">⚠ Score alone does not decide the placard</div>
            <p>
              A place can score 90 and still get a <strong>C (red) placard</strong> if the inspector
              found a priority violation. A B placard is about history: it is posted once a place
              passes its follow-up and reopens after a closure, a score below 60, or two failed
              inspections in a row.
            </p>
            <p style={{ marginTop: 8, color: "rgba(255,255,255,0.45)", fontSize: ".78rem" }}>
              Pin colors on the map show the <strong>score only</strong>, and you can adjust them. A
              amber ring means at least one violation was cited on the latest inspection. Rings are
              not placards: the grade in a place&apos;s details is the one the health department
              recorded. Bullitt County&apos;s rings are light blue: its sheet lists every form item
              marked at a visit, including routine ones Louisville&apos;s data doesn&apos;t publish,
              so rings are far more common there and don&apos;t mean a place is worse. From afar
              only the places with several violations show a ring; zoom in to see them all.
            </p>
          </div>

          {/* Duration table */}
          <div className="ln-sh">How long each placard is posted</div>
          <table className="ln-ptable">
            <thead>
              <tr>
                <th>Grade</th>
                <th>Color</th>
                <th>Posted for</th>
                <th>What comes next</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <span className="ln-grade-cell ga">A</span>
                </td>
                <td>Green</td>
                <td>Until the next regular inspection</td>
                <td>The next regular inspection</td>
              </tr>
              <tr>
                <td>
                  <span className="ln-grade-cell gb">B</span>
                </td>
                <td>Blue</td>
                <td>At least 3 months, at most 6</td>
                <td>A regular inspection within 3 to 6 months of reopening</td>
              </tr>
              <tr>
                <td>
                  <span className="ln-grade-cell gc">C</span>
                </td>
                <td>Red</td>
                <td>At least 7 days, at most 10</td>
                <td>A follow-up inspection within 7 to 10 days</td>
              </tr>
            </tbody>
          </table>
          <p className="ln-table-note">
            A placard is issued after every scored inspection except opening and survey inspections.
            A place that moves, covers or alters a B or C placard must keep it up 7 more days. Two
            failed inspections in a row mean more frequent inspections; three in a row lead to a
            state hearing and a notice of intent to suspend the permit.
          </p>

          {/* Score rules (902 KAR 45:005, Section 6 and 7) */}
          <div className="ln-sh">How the score works</div>
          <p className="ln-table-note" style={{ marginTop: 0, marginBottom: 10 }}>
            Every inspection starts at 100. Each violation takes off the points the state inspection
            form sets for that item. Whatever the score, priority violations must be fixed within 10
            days.
          </p>
          <table className="ln-ptable ln-ptable--all-cols">
            <thead>
              <tr>
                <th>Score</th>
                <th>What happens</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>85 – 100</td>
                <td>
                  Passes (unless there is a priority violation). One-point items are due by the next
                  regular inspection.
                </td>
              </tr>
              <tr>
                <td>70 – 84</td>
                <td>Fails, C placard. One-point items must be fixed within 30 days.</td>
              </tr>
              <tr>
                <td>Below 70</td>
                <td>The state issues a notice of intent to suspend the permit.</td>
              </tr>
              <tr>
                <td>Below 60</td>
                <td>
                  The permit is suspended immediately, as it is for an imminent health hazard.
                </td>
              </tr>
            </tbody>
          </table>

          {/* Violations */}
          <div className="ln-sh">Violations</div>
          <p className="ln-table-note" style={{ marginTop: 0, marginBottom: 32 }}>
            Inspectors cite each problem against a section of the Kentucky Food Code, and each one
            takes points off the score. The placard policy treats a <strong>priority</strong>{" "}
            violation as an automatic C. It defines one as breaking a rule &ldquo;whose application
            contributes directly to the elimination, prevention or reduction to an acceptable level,
            hazards associated with foodborne illness or injury and there is no other provision that
            more directly controls the hazard.&rdquo; The public data this site uses doesn&apos;t
            clearly mark which violations were priority ones, so we list every citation simply as a
            violation. A place&apos;s score and grade come straight from the health
            department&apos;s records.
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

          {/* About the data */}
          <div className="ln-sh">About this data</div>
          <p className="ln-table-note" style={{ marginTop: 0, marginBottom: 16 }}>
            This site is an independent project and is not affiliated with Louisville Metro
            Government or any county health department. Inspection data comes from each
            county&apos;s public records, listed below. It is refreshed regularly but can lag behind
            the latest inspections, and it may contain errors. The placard posted at the business
            and the official inspection report are the final word.
          </p>

          {/* Data sources: one link per county and what its data includes (lib/regions.js) */}
          <div className="ln-sh">Data sources</div>
          <p className="ln-table-note" style={{ marginTop: 0, marginBottom: 12 }}>
            Each county publishes its inspections differently, so the same details aren&apos;t
            available everywhere.
          </p>
          <DataSources />

          {/* Source */}
          <div className="ln-src">
            <strong style={{ color: "rgba(255,255,255,0.65)" }}>Rules cited above:</strong>{" "}
            <a
              href="https://louisvilleky.gov/sites/default/files/2021-12/abc-placard-issuance_pol_env_20190607.pdf"
              target="_blank"
              rel="noopener noreferrer"
            >
              Louisville Metro Placard Issuance Policy
            </a>{" "}
            (approved June 7, 2019);{" "}
            <a
              href="https://apps.legislature.ky.gov/law/kar/titles/902/045/005/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Kentucky Food Code, 902 KAR 45:005
            </a>
            .
          </div>
        </div>
      </div>

      {loginOpen && <LoginModal onClose={onCloseLogin} />}
    </>
  );
}

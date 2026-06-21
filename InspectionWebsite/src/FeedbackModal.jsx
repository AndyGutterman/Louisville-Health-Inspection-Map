import React, { useState, useEffect, useRef } from "react";

// ─── Styles (scoped with fb- prefix) ─────────────────────────────────────────
const STYLES = `
.fb-back {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.72); backdrop-filter: blur(6px);
  z-index: 9100; display: flex; align-items: center; justify-content: center;
  padding: 20px;
}

.fb-modal {
  background: rgba(20,20,24,0.99);
  border: 1px solid rgba(255,255,255,0.13);
  border-radius: 18px; padding: 28px 24px 24px;
  width: 100%; max-width: 400px; position: relative;
  color: #f0f0f3;
  box-shadow: 0 24px 64px rgba(0,0,0,0.55);
}

.fb-x {
  position: absolute; top: 12px; right: 14px;
  background: transparent; border: none;
  color: rgba(255,255,255,0.38); font-size: 20px;
  cursor: pointer; line-height: 1; padding: 4px 6px;
  border-radius: 6px; transition: color .15s, background .15s;
}
.fb-x:hover { color: #fff; background: rgba(255,255,255,0.08); }

.fb-title {
  font-family: 'Tilt Neon', sans-serif;
  font-size: 1.25rem; font-weight: 600;
  color: #34a853; text-shadow: 0 0 12px #34a853;
  margin-bottom: 4px;
}
.fb-sub {
  font-size: .78rem; color: rgba(255,255,255,0.48);
  line-height: 1.5; margin-bottom: 20px;
}

/* ── Field group ── */
.fb-field { margin-bottom: 14px; }
.fb-label {
  display: block; font-size: .62rem; font-weight: 800;
  letter-spacing: .10em; text-transform: uppercase;
  color: rgba(255,255,255,0.48); margin-bottom: 5px;
}
.fb-label span {
  font-size: .58rem; opacity: .7; letter-spacing: 0;
  text-transform: none; font-weight: 600; margin-left: 4px;
}

.fb-input, .fb-select, .fb-textarea {
  width: 100%; box-sizing: border-box;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.11);
  border-radius: 10px;
  color: #f0f0f3; font-size: .88rem; font-family: inherit;
  transition: border-color .15s, background .15s;
}
.fb-input:focus, .fb-select:focus, .fb-textarea:focus {
  outline: none;
  border-color: rgba(52,168,83,0.50);
  background: rgba(255,255,255,0.07);
}
.fb-input, .fb-select {
  height: 40px; padding: 0 12px;
}
.fb-select {
  appearance: none; cursor: pointer;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.40)' stroke-width='2.5'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  padding-right: 32px;
}
.fb-select option { background: #1a1a1e; }
.fb-textarea {
  padding: 10px 12px; resize: vertical;
  min-height: 110px; max-height: 260px;
  line-height: 1.5;
}
.fb-textarea::placeholder, .fb-input::placeholder {
  color: rgba(255,255,255,0.25);
}

/* ── Char count ── */
.fb-char {
  text-align: right; font-size: .66rem;
  color: rgba(255,255,255,0.28); margin-top: 3px;
  transition: color .15s;
}
.fb-char.warn { color: rgba(234,67,53,0.70); }

/* ── Honeypot (screen readers and bots see it; humans don't) ── */
.fb-trap {
  position: absolute; left: -9999px; top: -9999px;
  width: 1px; height: 1px; overflow: hidden; opacity: 0;
  pointer-events: none; tab-index: -1;
  aria-hidden: true;
}

/* ── Submit row ── */
.fb-row {
  display: flex; align-items: center;
  justify-content: space-between; gap: 12px; margin-top: 8px;
}
.fb-note {
  font-size: .68rem; color: rgba(255,255,255,0.30); line-height: 1.4;
}

.fb-submit {
  padding: 9px 22px; border-radius: 999px;
  background: rgba(52,168,83,0.16);
  border: 1px solid rgba(52,168,83,0.34);
  color: #6fcf8a; font-size: .84rem; font-weight: 700;
  cursor: pointer; white-space: nowrap; flex-shrink: 0;
  transition: background .15s, border-color .15s, color .15s, opacity .15s;
}
.fb-submit:hover:not(:disabled) {
  background: rgba(52,168,83,0.26);
  border-color: rgba(52,168,83,0.55); color: #8de8a5;
}
.fb-submit:disabled { opacity: 0.45; cursor: not-allowed; }

/* ── States ── */
.fb-error {
  font-size: .76rem; color: #ff9a9a;
  background: rgba(234,67,53,0.10);
  border: 1px solid rgba(234,67,53,0.22);
  border-radius: 8px; padding: 8px 12px; margin-bottom: 10px;
}
.fb-success {
  text-align: center; padding: 24px 0 8px;
  display: flex; flex-direction: column; align-items: center; gap: 8px;
}
.fb-success-icon { font-size: 2.4rem; }
.fb-success-title { font-weight: 700; font-size: 1rem; }
.fb-success-sub {
  font-size: .80rem; color: rgba(255,255,255,0.48);
  max-width: 280px; line-height: 1.5;
}
.fb-success-close {
  margin-top: 16px; padding: 8px 24px; border-radius: 999px;
  background: rgba(255,255,255,0.07);
  border: 1px solid rgba(255,255,255,0.14);
  color: rgba(255,255,255,0.70); font-size: .84rem; font-weight: 600;
  cursor: pointer; transition: background .15s, color .15s;
}
.fb-success-close:hover { background: rgba(255,255,255,0.12); color: #fff; }

/* ── Cooldown strip ── */
.fb-cooldown {
  font-size: .72rem; color: rgba(255,255,255,0.35);
  text-align: center; margin-top: 10px;
}

@media (max-width: 480px) {
  .fb-modal { padding: 22px 16px 18px; border-radius: 14px; }
  .fb-row { flex-direction: column-reverse; align-items: stretch; }
  .fb-submit { text-align: center; }
}
`;

// ─── Constants ────────────────────────────────────────────────────────────────
const COOLDOWN_MS = 30_000; // 30 seconds between submissions
const MAX_MSG     = 1200;
const MAX_NAME    = 80;
const MAX_EMAIL   = 120;

const FEEDBACK_TYPES = [
  { value: "",                    label: "Select a type…" },
  { value: "bug",                 label: "🐛  Bug report" },
  { value: "wrong_data",          label: "📍  Incorrect restaurant info" },
  { value: "feature",             label: "💡  Feature request" },
  { value: "general",             label: "💬  General feedback" },
];

const FEEDBACK_FN_URL = import.meta.env.VITE_FEEDBACK_FUNCTION_URL;

// ─── FeedbackModal ────────────────────────────────────────────────────────────
/**
 * Props:
 *   supabase  – Supabase client (kept for fallback; primary path uses edge fn)
 *   onClose   – fn called to dismiss
 */
export default function FeedbackModal({ supabase, onClose }) {
  const [name,      setName]      = useState("");
  const [email,     setEmail]     = useState("");
  const [fbType,    setFbType]    = useState("");
  const [message,   setMessage]   = useState("");
  const [trap,      setTrap]      = useState(""); // honeypot
  const [submitting, setSubmitting] = useState(false);
  const [success,   setSuccess]   = useState(false);
  const [error,     setError]     = useState("");
  const [cooldown,  setCooldown]  = useState(0);  // seconds remaining
  const timerRef = useRef(null);

  // Escape key
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  // Cooldown tick
  useEffect(() => {
    if (cooldown <= 0) return;
    timerRef.current = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timerRef.current);
  }, [cooldown]);

  const msgLen  = message.length;
  const canSend = fbType && message.trim().length >= 10 && !submitting && cooldown === 0;

  async function handleSubmit() {
    setError("");

    // Honeypot check — silently succeed so bots think it worked
    if (trap) {
      setSuccess(true);
      return;
    }

    if (!fbType)                          return setError("Please select a feedback type.");
    if (message.trim().length < 10)       return setError("Message is too short (10 chars min).");
    if (msgLen > MAX_MSG)                 return setError(`Message is too long (${MAX_MSG} chars max).`);

    // Basic email format check
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return setError("That email address doesn't look right.");
    }

    setSubmitting(true);
    try {
      const payload = {
        name:          name.trim().slice(0, MAX_NAME)   || null,
        email:         email.trim().slice(0, MAX_EMAIL) || null,
        feedback_type: fbType,
        message:       message.trim().slice(0, MAX_MSG),
        user_agent:    navigator.userAgent.slice(0, 300),
      };

      if (FEEDBACK_FN_URL) {
        // Primary path: edge function with IP-based rate limiting
        const res = await fetch(FEEDBACK_FN_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.status === 429) {
          const body = await res.json().catch(() => ({}));
          const wait = body.retryAfter ?? 60;
          setError(`Too many submissions. Please wait ${wait} seconds.`);
          setCooldown(wait);
          return;
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
      } else {
        // Fallback: direct Supabase insert (dev / edge fn not deployed yet)
        const { error: sbErr } = await supabase.from("feedback").insert([payload]);
        if (sbErr) throw sbErr;
      }

      setSuccess(true);
      setCooldown(COOLDOWN_MS / 1000);
    } catch (err) {
      console.error("Feedback submit error:", err);
      setError("Something went wrong. Please try again in a moment.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <style>{STYLES}</style>

      {/* Backdrop */}
      <div
        className="fb-back"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        role="dialog"
        aria-modal="true"
        aria-label="Send feedback"
      >
        <div className="fb-modal">
          <button className="fb-x" onClick={onClose} aria-label="Close">×</button>

          {success ? (
            <div className="fb-success">
              <div className="fb-success-icon">✓</div>
              <div className="fb-success-title">Thanks for the feedback!</div>
              <div className="fb-success-sub">
                We read every submission. If you left an email we may follow up.
              </div>
              <button className="fb-success-close" onClick={onClose}>Close</button>
            </div>
          ) : (
            <>
              <div className="fb-title">Feedback</div>
              <div className="fb-sub">
                Found a bug, wrong data, or have a suggestion? Let us know.
              </div>

              {error && <div className="fb-error" role="alert">{error}</div>}

              {/* Type */}
              <div className="fb-field">
                <label className="fb-label" htmlFor="fb-type">
                  Type <span>(required)</span>
                </label>
                <select
                  id="fb-type"
                  className="fb-select"
                  value={fbType}
                  onChange={(e) => setFbType(e.target.value)}
                >
                  {FEEDBACK_TYPES.map((t) => (
                    <option key={t.value} value={t.value} disabled={!t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Message */}
              <div className="fb-field">
                <label className="fb-label" htmlFor="fb-msg">
                  Message <span>(required, 10–{MAX_MSG} chars)</span>
                </label>
                <textarea
                  id="fb-msg"
                  className="fb-textarea"
                  placeholder={
                    fbType === "wrong_data"
                      ? "Which restaurant? What's incorrect? (e.g. wrong score, address, missing data)"
                      : fbType === "bug"
                      ? "What happened? Steps to reproduce if possible."
                      : "Describe your feedback…"
                  }
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  maxLength={MAX_MSG + 50}
                />
                <div className={`fb-char ${msgLen > MAX_MSG ? "warn" : ""}`}>
                  {msgLen} / {MAX_MSG}
                </div>
              </div>

              {/* Name */}
              <div className="fb-field">
                <label className="fb-label" htmlFor="fb-name">
                  Name <span>(optional)</span>
                </label>
                <input
                  id="fb-name"
                  className="fb-input"
                  type="text"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={MAX_NAME}
                />
              </div>

              {/* Email */}
              <div className="fb-field">
                <label className="fb-label" htmlFor="fb-email">
                  Email <span>(optional — only if you want a reply)</span>
                </label>
                <input
                  id="fb-email"
                  className="fb-input"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  maxLength={MAX_EMAIL}
                  autoComplete="email"
                />
              </div>

              {/* Honeypot — hidden from real users */}
              <div className="fb-trap" aria-hidden="true">
                <label htmlFor="fb-website">Website</label>
                <input
                  id="fb-website"
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={trap}
                  onChange={(e) => setTrap(e.target.value)}
                />
              </div>

              <div className="fb-row">
                <div className="fb-note">
                  Anonymous feedback is fine. No account required.
                </div>
                <button
                  className="fb-submit"
                  onClick={handleSubmit}
                  disabled={!canSend}
                >
                  {submitting ? "Sending…" : cooldown > 0 ? `Wait ${cooldown}s` : "Send"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

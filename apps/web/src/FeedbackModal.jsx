import React, { useState, useEffect, useRef } from "react";
import "./styles/FeedbackModal.css";

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

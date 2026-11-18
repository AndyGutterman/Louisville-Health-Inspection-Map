import React, { useState, useEffect, useRef } from "react";
import "./styles/FeedbackModal.css";
import { useT } from "./I18nContext.jsx";
import { useDialogFocus } from "./hooks/useDialogFocus.js";
import { PRIVACY_PATH } from "./lib/privacy.js";

// ─── Constants ────────────────────────────────────────────────────────────────
const COOLDOWN_MS = 30_000; // 30 seconds between submissions
const MAX_MSG = 1200;
const MAX_NAME = 80;
const MAX_EMAIL = 120;

// The values sent to the function; the labels are feedback.type.<value> words.
const FEEDBACK_TYPES = ["", "bug", "wrong_data", "feature", "general"];

// The submit-feedback edge function. Its address follows from the Supabase project's, so
// VITE_FEEDBACK_FUNCTION_URL is only for pointing somewhere else. The function is the only
// way in: the database refuses a direct insert (migration 20261106120000).
const FEEDBACK_FN_URL =
  import.meta.env.VITE_FEEDBACK_FUNCTION_URL ||
  `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit-feedback`;

// ─── FeedbackModal ────────────────────────────────────────────────────────────
/**
 * Props:
 *   onClose   – fn called to dismiss
 */
export default function FeedbackModal({ onClose }) {
  const { t } = useT();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [fbType, setFbType] = useState("");
  const [message, setMessage] = useState("");
  const [trap, setTrap] = useState(""); // honeypot
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0); // seconds remaining
  const timerRef = useRef(null);

  // Focus into the dialog, kept inside, Escape to close, back to the opener (WCAG 2.4.3).
  const modalRef = useRef(null);
  useDialogFocus(modalRef, onClose);

  // Cooldown tick
  useEffect(() => {
    if (cooldown <= 0) return;
    timerRef.current = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timerRef.current);
  }, [cooldown]);

  const msgLen = message.length;
  const canSend = fbType && message.trim().length >= 10 && !submitting && cooldown === 0;

  async function handleSubmit() {
    setError("");

    // Honeypot check — silently succeed so bots think it worked
    if (trap) {
      setSuccess(true);
      return;
    }

    if (!fbType) return setError(t("feedback.err.type"));
    if (message.trim().length < 10) return setError(t("feedback.err.short"));
    if (msgLen > MAX_MSG) return setError(t("feedback.err.long", { max: MAX_MSG }));

    // Basic email format check
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return setError(t("feedback.err.email"));
    }

    setSubmitting(true);
    try {
      const payload = {
        name: name.trim().slice(0, MAX_NAME) || null,
        email: email.trim().slice(0, MAX_EMAIL) || null,
        feedback_type: fbType,
        message: message.trim().slice(0, MAX_MSG),
        user_agent: navigator.userAgent.slice(0, 300),
      };

      // The edge function rate-limits by IP and writes the row.
      const res = await fetch(FEEDBACK_FN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.status === 429) {
        const body = await res.json().catch(() => ({}));
        const wait = body.retryAfter ?? 60;
        // The function allows 3 a minute and 20 a day (submit-feedback).
        if (wait > 120) {
          setError(t("feedback.err.day"));
          return;
        }
        setError(t("feedback.err.rate", { n: wait }));
        setCooldown(wait);
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }

      setSuccess(true);
      setCooldown(COOLDOWN_MS / 1000);
    } catch (err) {
      console.error("Feedback submit error:", err);
      setError(t("feedback.err.generic"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fb-back"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
        role="dialog"
        aria-modal="true"
        aria-label={t("feedback.dialog")}
      >
        <div className="fb-modal" ref={modalRef} tabIndex={-1}>
          <button className="fb-x" onClick={onClose} aria-label={t("feedback.close")}>
            ×
          </button>

          {success ? (
            <div className="fb-success">
              <div className="fb-success-icon">✓</div>
              <div className="fb-success-title">{t("feedback.thanks")}</div>
              <div className="fb-success-sub">{t("feedback.thanksSub")}</div>
              <button className="fb-success-close" onClick={onClose}>
                {t("feedback.close")}
              </button>
            </div>
          ) : (
            <>
              <div className="fb-title">{t("feedback.title")}</div>
              <div className="fb-sub">{t("feedback.sub")}</div>

              {error && (
                <div className="fb-error" role="alert">
                  {error}
                </div>
              )}

              {/* Type */}
              <div className="fb-field">
                <label className="fb-label" htmlFor="fb-type">
                  {t("feedback.typeLabel")} <span>{t("feedback.required")}</span>
                </label>
                <select
                  id="fb-type"
                  data-autofocus
                  className="fb-select"
                  value={fbType}
                  onChange={(e) => setFbType(e.target.value)}
                >
                  {FEEDBACK_TYPES.map((v) => (
                    <option key={v} value={v} disabled={!v}>
                      {t(v ? `feedback.type.${v}` : "feedback.type.select")}
                    </option>
                  ))}
                </select>
              </div>

              {/* Message */}
              <div className="fb-field">
                <label className="fb-label" htmlFor="fb-msg">
                  {t("feedback.messageLabel")}{" "}
                  <span>{t("feedback.messageHint", { max: MAX_MSG })}</span>
                </label>
                <textarea
                  id="fb-msg"
                  className="fb-textarea"
                  placeholder={
                    fbType === "wrong_data"
                      ? t("feedback.ph.wrong_data")
                      : fbType === "bug"
                        ? t("feedback.ph.bug")
                        : t("feedback.ph.other")
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
                  {t("feedback.nameLabel")} <span>{t("feedback.optional")}</span>
                </label>
                <input
                  id="fb-name"
                  className="fb-input"
                  type="text"
                  placeholder={t("feedback.namePh")}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={MAX_NAME}
                />
              </div>

              {/* Email */}
              <div className="fb-field">
                <label className="fb-label" htmlFor="fb-email">
                  {t("feedback.emailLabel")} <span>{t("feedback.optional")}</span>
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
                <label htmlFor="fb-website">{t("feedback.website")}</label>
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
                  {t("feedback.note")}{" "}
                  <a className="privacy-link" href={PRIVACY_PATH} target="_blank" rel="noreferrer">
                    {t("feedback.privacy")}
                  </a>
                </div>
                <button className="fb-submit" onClick={handleSubmit} disabled={!canSend}>
                  {submitting
                    ? t("feedback.sending")
                    : cooldown > 0
                      ? t("feedback.wait", { n: cooldown })
                      : t("feedback.send")}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

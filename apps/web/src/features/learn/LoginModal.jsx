// The sign-in form: an email, then the 6-digit code from it (AuthContext.jsx), with the
// weekly digest opt-in. Opened from the map header and from the Learn page.
import React, { useState, useEffect } from "react";
import { useAuth } from "../../AuthContext.jsx";
import { cleanCode, isCompleteCode } from "../../lib/authCode.js";
// The sign-in form's digest checkbox, kept until the code is verified (lib/digest.js).
import { rememberDigestOptIn } from "../../lib/digest.js";
import { PRIVACY_PATH } from "../../lib/privacy.js";
import "../../styles/LearnPage.css";

export default function LoginModal({ onClose }) {
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
                {/* Asked at every sign-in, ticked unless they untick it (lib/digest.js). */}
                <label className="ln-digest-opt" data-testid="digest-opt-in">
                  <input
                    type="checkbox"
                    checked={digest}
                    onChange={(e) => setDigest(e.target.checked)}
                    aria-label="Email me the weekly digest"
                  />
                  <span>
                    <span className="ln-digest-opt-title">Email me the weekly digest</span>
                    This week&apos;s inspections, the ones that failed, and news on your saved
                    places and watch areas. Tuesdays. Unsubscribe anytime.
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
                Free account · No password · Unsubscribe anytime ·{" "}
                <a className="privacy-link" href={PRIVACY_PATH} target="_blank" rel="noreferrer">
                  Privacy
                </a>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

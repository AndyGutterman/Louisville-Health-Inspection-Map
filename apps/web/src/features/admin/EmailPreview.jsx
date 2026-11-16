import { useState } from "react";
import { useDebounced } from "../../hooks/useDebounced.js";
import { previewDoc } from "../../lib/adminEmail.js";

/**
 * An email as its reader would see it: the subject, then the HTML in a sandboxed frame
 * (no scripts, links open in a new tab), or the plain-text version some clients show.
 * @param {{ email: {subject, html, text}|null, loading?: boolean, note?: string }} p
 */
export default function EmailPreview({ email, loading = false, note }) {
  const [plain, setPlain] = useState(false);
  // A frame reloads whenever its document changes. While a message is being typed that
  // is every letter, so the frame follows a moment after the typing stops.
  const html = useDebounced(email?.html ?? "", 200);
  if (!email) {
    return (
      <div className="adm-preview adm-preview--empty" data-testid="email-preview">
        {loading ? "Building the preview…" : note || "Nothing to preview yet."}
      </div>
    );
  }
  return (
    <div className="adm-preview" data-testid="email-preview">
      <div className="adm-preview-bar">
        <div className="adm-preview-subject">
          <span className="adm-dim">Subject</span>
          <span data-testid="email-preview-subject">{email.subject}</span>
        </div>
        <div className="adm-seg" role="group" aria-label="Preview as">
          <button
            type="button"
            className={`adm-seg-btn${plain ? "" : " on"}`}
            aria-pressed={!plain}
            onClick={() => setPlain(false)}
          >
            Email
          </button>
          <button
            type="button"
            className={`adm-seg-btn${plain ? " on" : ""}`}
            aria-pressed={plain}
            onClick={() => setPlain(true)}
          >
            Plain text
          </button>
        </div>
      </div>
      {plain ? (
        <pre className="adm-preview-text" data-testid="email-preview-text">
          {email.text}
        </pre>
      ) : (
        <iframe
          className="adm-preview-frame"
          title="Email preview"
          sandbox="allow-popups allow-popups-to-escape-sandbox"
          srcDoc={previewDoc(html || email.html)}
        />
      )}
    </div>
  );
}

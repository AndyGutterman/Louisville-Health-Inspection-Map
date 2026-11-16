// The email admin page (/?page=admin, docs/EMAIL_ADMIN.md): preview anyone's weekly
// digest, send tests and one-off emails, and see what was sent. Loaded on demand, so
// visitors never download it.
//
// What is shown here is a convenience. The lock is in the database: every admin_* call
// checks the signed-in person against admin_users (migration 20261125000000).
import { useCallback, useState } from "react";
import { checkJob } from "@lfs/core/email/jobs.js";
import { useAuth } from "../../AuthContext.jsx";
import { queueEmail, startSender } from "../../api/admin.js";
import { EMPTY_MESSAGE, OUTBOX_WORKFLOW_URL, queuedNotice } from "../../lib/adminEmail.js";
import DigestTab from "./DigestTab.jsx";
import WriteTab from "./WriteTab.jsx";
import SentTab from "./SentTab.jsx";
import { useIsAdmin } from "./useIsAdmin.js";
import "../../styles/AdminPage.css";

const TABS = [
  ["digest", "Digest"],
  ["write", "Write"],
  ["sent", "Sent"],
];

function Shell({ children }) {
  return (
    <div className="adm-wrap" data-testid="admin-page">
      <div className="adm-page">{children}</div>
    </div>
  );
}

function Gate({ title, children }) {
  return (
    <Shell>
      <div className="adm-gate" data-testid="admin-gate">
        <div className="adm-title">{title}</div>
        {children}
      </div>
    </Shell>
  );
}

function Admin({ user }) {
  const [tab, setTab] = useState("digest");
  const [seen, setSeen] = useState(() => new Set(["digest"])); // tabs stay mounted once opened
  const [notice, setNotice] = useState(null);
  const [message, setMessage] = useState(EMPTY_MESSAGE);
  const [sentKey, setSentKey] = useState(0);
  const [subscribers, setSubscribers] = useState(null); // how many get the weekly digest

  const open = useCallback((name) => {
    setTab(name);
    setSeen((s) => (s.has(name) ? s : new Set(s).add(name)));
  }, []);

  // Queue an email, ask the sender to start, and show the Sent tab. Throws what the
  // database refused, for the form that asked to show beside its button.
  const send = useCallback(
    async (job, expectCount = null) => {
      const problem = checkJob(job);
      if (problem) throw new Error(problem);
      const id = await queueEmail(job, expectCount);
      setNotice(queuedNotice(await startSender(id)));
      setSentKey((n) => n + 1);
      open("sent");
    },
    [open],
  );

  return (
    <Shell>
      <div className="adm-head">
        <div className="adm-title">Email admin</div>
        <div className="adm-dim">{user.email}</div>
      </div>
      <div className="adm-tabs" role="tablist" aria-label="Email admin">
        {TABS.map(([name, label]) => (
          <button
            key={name}
            type="button"
            role="tab"
            id={`adm-tab-${name}`}
            aria-controls={`adm-panel-${name}`}
            aria-selected={tab === name}
            className={`adm-tab${tab === name ? " on" : ""}`}
            onClick={() => open(name)}
          >
            {label}
          </button>
        ))}
      </div>
      {notice && (
        <div
          className={`adm-notice${notice.ok ? "" : " adm-notice--warn"}`}
          role="status"
          data-testid="admin-notice"
        >
          <span>
            {notice.text}{" "}
            {!notice.ok && (
              <a href={OUTBOX_WORKFLOW_URL} target="_blank" rel="noreferrer">
                Email outbox on GitHub
              </a>
            )}
          </span>
          <button
            type="button"
            className="adm-notice-x"
            aria-label="Dismiss"
            onClick={() => setNotice(null)}
          >
            ×
          </button>
        </div>
      )}
      <div
        role="tabpanel"
        id="adm-panel-digest"
        aria-labelledby="adm-tab-digest"
        hidden={tab !== "digest"}
      >
        <DigestTab me={user} send={send} onSubscribers={setSubscribers} />
      </div>
      {seen.has("write") && (
        <div
          role="tabpanel"
          id="adm-panel-write"
          aria-labelledby="adm-tab-write"
          hidden={tab !== "write"}
        >
          <WriteTab
            me={user}
            message={message}
            onChange={setMessage}
            subscribers={subscribers}
            send={send}
          />
        </div>
      )}
      {seen.has("sent") && (
        <div
          role="tabpanel"
          id="adm-panel-sent"
          aria-labelledby="adm-tab-sent"
          hidden={tab !== "sent"}
        >
          <SentTab
            refreshKey={sentKey}
            onNotice={setNotice}
            onDraft={(job) => {
              if (!job) return;
              setMessage({
                ...EMPTY_MESSAGE,
                subject: job.subject ?? "",
                body: job.body ?? "",
                button: job.with_button ?? true,
              });
              open("write");
            }}
          />
        </div>
      )}
    </Shell>
  );
}

/** @param {{ onLogIn: Function }} p  opens the site's sign-in form */
export default function AdminPage({ onLogIn }) {
  const { user, loading } = useAuth();
  const admin = useIsAdmin(user);

  if (loading || (user && admin === null)) return <Gate title="Checking…" />;
  if (!user) {
    return (
      <Gate title="Email admin">
        <p className="adm-dim">Sign in with an admin account to manage the site&apos;s email.</p>
        <button type="button" className="adm-btn adm-btn--go" onClick={onLogIn}>
          Log in
        </button>
      </Gate>
    );
  }
  if (!admin) {
    return (
      <Gate title="Admins only">
        <p className="adm-dim">{user.email} isn&apos;t an admin of this site.</p>
      </Gate>
    );
  }
  return <Admin user={user} />;
}

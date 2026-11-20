// The email admin page (/?page=admin, docs/EMAIL_ADMIN.md): preview anyone's weekly
// digest, send tests and one-off emails, and see what was sent. Loaded on demand, so
// visitors never download it.
//
// Who may see it: AdminGate.jsx (the lock itself is in the database).
import { useCallback, useState } from "react";
import { checkJob } from "@lfs/core/email/jobs.js";
import { queueEmail, startSender } from "../../api/admin.js";
import {
  EMPTY_MESSAGE,
  OUTBOX_WORKFLOW_URL,
  nextTab,
  queuedNotice,
  scheduledText,
} from "../../lib/adminEmail.js";
import DigestPause from "./DigestPause.jsx";
import DigestTab from "./DigestTab.jsx";
import WriteTab from "./WriteTab.jsx";
import SentTab from "./SentTab.jsx";
import AdminGate, { AdminShell } from "./AdminGate.jsx";

const TABS = [
  ["digest", "Digest"],
  ["write", "Write"],
  ["sent", "Sent"],
];

function Admin({ user, onOpenPins }) {
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
      // A scheduled email waits for its time: the sender checks every 15 minutes, so there
      // is nothing to start now.
      if (job.send_at) {
        setNotice({ ok: true, text: `Scheduled for ${scheduledText(job.send_at)}.` });
      } else {
        setNotice(queuedNotice(await startSender(id)));
      }
      setSentKey((n) => n + 1);
      open("sent");
    },
    [open],
  );

  return (
    <AdminShell>
      <div className="adm-head">
        <div className="adm-title">Email admin</div>
        <div className="adm-dim">
          {user.email}
          {onOpenPins && (
            <>
              {" · "}
              <button type="button" className="adm-textlink" onClick={onOpenPins}>
                Pin control center
              </button>
            </>
          )}
        </div>
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
            tabIndex={tab === name ? 0 : -1}
            className={`adm-tab${tab === name ? " on" : ""}`}
            onClick={() => open(name)}
            onKeyDown={(e) => {
              // The ARIA tabs pattern: arrows, Home and End move between tabs.
              const to = nextTab(
                TABS.map(([t]) => t),
                name,
                e.key,
              );
              if (!to) return;
              e.preventDefault();
              open(to);
              document.getElementById(`adm-tab-${to}`)?.focus();
            }}
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
        <DigestPause />
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
    </AdminShell>
  );
}

/** @param {{ onLogIn: Function, onOpenPins?: Function }} p  onLogIn opens the site's sign-in form */
export default function AdminPage({ onLogIn, onOpenPins }) {
  return (
    <AdminGate title="Email admin" purpose="manage the site's email" onLogIn={onLogIn}>
      {(user) => <Admin user={user} onOpenPins={onOpenPins} />}
    </AdminGate>
  );
}

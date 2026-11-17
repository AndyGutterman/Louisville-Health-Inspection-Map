import { useCallback, useEffect, useRef, useState } from "react";
import { canRetry, describeJob, isActive, statusLabel } from "@lfs/core/email/jobs.js";
import {
  cancelJob,
  fetchDeliveries,
  fetchJob,
  fetchJobs,
  retryJob,
  startSender,
} from "../../api/admin.js";
import {
  OUTBOX_WORKFLOW_URL,
  countsText,
  errorText,
  queuedNotice,
  whenText,
} from "../../lib/adminEmail.js";

// While something is queued or sending the list checks back by itself: a few rows every
// few seconds, and only for a few minutes, so a forgotten tab can't keep reading.
const POLL_MS = 6000;
const MAX_POLLS = 40;

const SOURCES = { schedule: "Tuesday's send", manual: "run by hand" };

function Deliveries({ jobId }) {
  const [state, setState] = useState({ rows: null, error: null });
  useEffect(() => {
    let live = true;
    fetchDeliveries(jobId).then(
      (rows) => live && setState({ rows, error: null }),
      (e) => live && setState({ rows: null, error: errorText(e) }),
    );
    return () => {
      live = false;
    };
  }, [jobId]);
  if (state.error) return <div className="adm-error">{state.error}</div>;
  if (!state.rows) return <div className="adm-dim">Reading…</div>;
  if (!state.rows.length) return <div className="adm-dim">Nothing delivered yet.</div>;
  return (
    <ul className="adm-deliveries" data-testid="admin-deliveries">
      {state.rows.map((d) => (
        <li key={d.email}>
          <span className={`adm-chip${d.status === "sent" ? " adm-chip--on" : " adm-chip--bad"}`}>
            {d.status === "sent" ? "Sent" : "Failed"}
          </span>
          <span className="adm-delivery-email">{d.email}</span>
          {d.error && <span className="adm-dim">{d.error}</span>}
        </li>
      ))}
    </ul>
  );
}

function JobCard({ job, onChanged, onDraft, onNotice }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const act = async (work) => {
    setBusy(true);
    setError(null);
    try {
      await work();
      onChanged();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const again = () =>
    act(async () => {
      if (await retryJob(job.id)) onNotice(queuedNotice(await startSender(job.id)));
    });
  const tone = { sent: "on", partial: "warn", failed: "bad", expired: "bad" }[job.status] ?? "";
  const counts = countsText(job);
  const waiting = job.status === "queued" && Date.now() - new Date(job.queued_at) > 90_000;

  return (
    <li className="adm-job" data-testid="admin-job" data-status={job.status}>
      <div className="adm-job-top">
        <span className={`adm-chip${tone ? ` adm-chip--${tone}` : ""}`}>{statusLabel(job)}</span>
        <span className="adm-dim">{whenText(job.created_at)}</span>
        {SOURCES[job.source] && <span className="adm-dim">· {SOURCES[job.source]}</span>}
      </div>
      <div className="adm-job-what">{describeJob(job)}</div>
      {job.as_user_email && <div className="adm-dim">Written as {job.as_user_email}</div>}
      {counts && <div className="adm-dim">{counts}</div>}
      {job.error && <div className="adm-error">{job.error}</div>}
      {waiting && (
        <div className="adm-dim">
          Still waiting for the sender.{" "}
          <a href={OUTBOX_WORKFLOW_URL} target="_blank" rel="noreferrer">
            Start it on GitHub
          </a>
        </div>
      )}
      <div className="adm-actions">
        {job.status === "queued" && (
          <button
            type="button"
            className="adm-btn adm-btn--quiet"
            disabled={busy}
            onClick={() => act(() => cancelJob(job.id))}
          >
            Cancel
          </button>
        )}
        {canRetry(job) && (
          <button type="button" className="adm-btn" disabled={busy} onClick={again}>
            Send again
          </button>
        )}
        <button
          type="button"
          className="adm-btn adm-btn--quiet"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? "Hide who got it" : "Who got it"}
        </button>
        {job.kind === "custom" && (
          <button
            type="button"
            className="adm-btn adm-btn--quiet"
            disabled={busy}
            onClick={() => act(async () => onDraft(await fetchJob(job.id)))}
          >
            Write from this
          </button>
        )}
        {job.run_url && (
          <a className="adm-link" href={job.run_url} target="_blank" rel="noreferrer">
            Run log
          </a>
        )}
      </div>
      {canRetry(job) && job.status !== "cancelled" && job.status !== "expired" && (
        <div className="adm-dim">Send again only goes to the addresses it hasn&apos;t reached.</div>
      )}
      {error && <div className="adm-error">{error}</div>}
      {open && <Deliveries jobId={job.id} />}
    </li>
  );
}

/**
 * Everything sent or waiting, newest first: Tuesday's sends and anything queued here.
 * @param {{ refreshKey: number, onDraft: Function, onNotice: Function }} p  refreshKey
 *   changes when a new email is queued: read again and start checking back.
 */
export default function SentTab({ refreshKey, onDraft, onNotice }) {
  const [state, setState] = useState({ jobs: null, error: null });
  const [round, setRound] = useState(0); // bumping it reads again
  const polls = useRef(0);

  const refresh = useCallback(() => {
    polls.current = 0;
    setRound((n) => n + 1);
  }, []);
  useEffect(refresh, [refreshKey, refresh]);

  useEffect(() => {
    if (!round) return;
    let live = true;
    fetchJobs().then(
      (jobs) => live && setState({ jobs, error: null }),
      (e) => live && setState((s) => ({ ...s, error: errorText(e) })),
    );
    return () => {
      live = false;
    };
  }, [round]);

  const { jobs } = state;
  const active = !!jobs?.some((j) => isActive(j));
  useEffect(() => {
    if (!active || polls.current >= MAX_POLLS) return;
    const t = setTimeout(() => {
      polls.current++;
      setRound((n) => n + 1);
    }, POLL_MS);
    return () => clearTimeout(t);
  }, [active, round]);
  const gaveUp = active && polls.current >= MAX_POLLS;

  return (
    <section className="adm-card">
      <div className="adm-sent-head">
        <div>
          <div className="adm-card-title">Sent and waiting</div>
          <div className="adm-dim" role="status">
            {gaveUp
              ? "Stopped checking. Refresh to look again."
              : active
                ? "Checking every few seconds while something is on its way."
                : "The last 10 sends."}
          </div>
        </div>
        <button type="button" className="adm-btn adm-btn--quiet" onClick={refresh}>
          Refresh
        </button>
      </div>
      {state.error && (
        <div className="adm-error" role="alert">
          {state.error}
        </div>
      )}
      {jobs && !jobs.length && <div className="adm-dim">Nothing has been sent from here yet.</div>}
      {!jobs && !state.error && <div className="adm-dim">Reading…</div>}
      <ul className="adm-jobs">
        {(jobs ?? []).map((job) => (
          <JobCard
            key={job.id}
            job={job}
            onChanged={refresh}
            onDraft={onDraft}
            onNotice={onNotice}
          />
        ))}
      </ul>
    </section>
  );
}

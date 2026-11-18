// The pin control center (/?page=pins, docs/PINS.md): an admin works through the places
// with no pin, or a doubtful one, county by county. Each can get a corrected address (for
// the geocoder; the site keeps the source's), a pin placed by hand, be left off the map,
// or be skipped. Geocode now looks up the corrected addresses right away. Loaded on
// demand, so visitors never download it.
//
// Who may see it: features/admin/AdminGate.jsx (the lock is in the database).
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchPinCounts, fetchPinQueue } from "../../api/pins.js";
import {
  PIN_JOB_URL,
  bucketLabel,
  countsByRegion,
  firstBucket,
  pendingCount,
  regionChoices,
} from "../../lib/pinQueue.js";
import AdminGate, { AdminShell } from "../admin/AdminGate.jsx";
import PinQueue from "./PinQueue.jsx";
import PlaceEditor from "./PlaceEditor.jsx";
import { usePinJob } from "./usePinJob.js";
import "../../styles/PinsPage.css";

const STATUS_TEXT = {
  pending: "looking it up…",
  found: "found, on the map",
  outside: "found outside the county: check it",
  not_found: "not found: place it by hand",
};

function Pins({ user, onOpenEmail }) {
  const [byRegion, setByRegion] = useState(null);
  const [region, setRegion] = useState(null);
  const [bucket, setBucket] = useState("missing");
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [reload, setReload] = useState(0);
  const [notice, setNotice] = useState(null);
  const [error, setError] = useState(null);

  // The counts: every county's queues (a few dozen rows).
  useEffect(() => {
    let live = true;
    fetchPinCounts()
      .then((rows) => live && setByRegion(countsByRegion(rows)))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [reload]);

  const choices = useMemo(() => regionChoices(byRegion ?? {}), [byRegion]);

  // Open on the county with the most to look at, on its first queue with anything in it.
  useEffect(() => {
    if (!byRegion || region) return;
    const busiest = [...choices].sort((a, b) => b.todo - a.todo)[0];
    setRegion(busiest.id);
    setBucket(firstBucket(busiest.counts));
  }, [byRegion, choices, region]);

  // One page of the queue.
  useEffect(() => {
    if (!region) return;
    let live = true;
    setRows(null);
    fetchPinQueue({ region, bucket, offset })
      .then((page) => {
        if (!live) return;
        setRows(page);
        setSelectedId((id) => (page.some((r) => r.id === id) ? id : (page[0]?.id ?? null)));
      })
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [region, bucket, offset, reload]);

  const refresh = useCallback(() => setReload((n) => n + 1), []);
  const job = usePinJob(byRegion ?? {}, refresh);

  // After a save the place leaves this queue: select the one that took its place.
  const onDone = (result) => {
    setNotice(result);
    const i = rows?.findIndex((r) => r.id === selectedId) ?? -1;
    const next = rows?.[i + 1] ?? rows?.[i - 1];
    setSelectedId(next?.id ?? null);
    refresh();
  };

  const chooseRegion = (id) => {
    setRegion(id);
    setBucket(firstBucket(byRegion?.[id]));
    setOffset(0);
    setSelectedId(null);
  };
  const chooseBucket = (key) => {
    setBucket(key);
    setOffset(0);
    setSelectedId(null);
  };

  const selected = rows?.find((r) => r.id === selectedId) ?? null;
  const pending = pendingCount(byRegion ?? {});
  const shownNotice = job.notice ?? notice;

  return (
    <AdminShell wide>
      <div className="adm-head">
        <div className="adm-title">Pin control center</div>
        <div className="adm-dim">
          {user.email}
          {onOpenEmail && (
            <>
              {" · "}
              <button type="button" className="adm-textlink" onClick={onOpenEmail}>
                Email admin
              </button>
            </>
          )}
        </div>
      </div>

      <div className="pins-job adm-card" data-testid="pin-job">
        <div className="pins-job-head">
          <span>
            {pending
              ? `${pending} address ${pending === 1 ? "fix" : "fixes"} waiting to be looked up.`
              : "No address fixes waiting."}
          </span>
          <button
            type="button"
            className="adm-btn adm-btn--go"
            disabled={!pending || job.run?.watching}
            onClick={() => job.start().catch((e) => setError(e.message))}
          >
            {job.run?.watching ? "Looking up…" : "Geocode now"}
          </button>
        </div>
        {job.run && (
          <ul className="pins-job-list" aria-live="polite" data-testid="pin-job-list">
            {job.run.places.map((p) => (
              <li key={p.id} className={`pins-job-${p.status}`}>
                <strong>{p.name}</strong>: {STATUS_TEXT[p.status] ?? p.status}
              </li>
            ))}
          </ul>
        )}
      </div>

      {shownNotice && (
        <div
          className={`adm-notice${shownNotice.ok ? "" : " adm-notice--warn"}`}
          role="status"
          data-testid="pins-notice"
        >
          <span>
            {shownNotice.text}{" "}
            {!shownNotice.ok && (
              <a href={PIN_JOB_URL} target="_blank" rel="noreferrer">
                Pin fixes on GitHub
              </a>
            )}
          </span>
          <button
            type="button"
            className="adm-notice-x"
            aria-label="Dismiss"
            onClick={() => {
              job.clearNotice();
              setNotice(null);
            }}
          >
            ×
          </button>
        </div>
      )}
      {error && (
        <div className="adm-notice adm-notice--warn" role="alert">
          <span>{error}</span>
          <button
            type="button"
            className="adm-notice-x"
            aria-label="Dismiss"
            onClick={() => setError(null)}
          >
            ×
          </button>
        </div>
      )}

      {!byRegion ? (
        <p className="adm-dim">Loading…</p>
      ) : (
        <div className="pins-split">
          <PinQueue
            choices={choices}
            region={region}
            onRegion={chooseRegion}
            bucket={bucket}
            onBucket={chooseBucket}
            rows={rows}
            selectedId={selectedId}
            onSelect={setSelectedId}
            offset={offset}
            onPage={setOffset}
          />
          {selected ? (
            <PlaceEditor key={selected.id} place={selected} onDone={onDone} />
          ) : (
            <div className="adm-card adm-dim">
              {rows?.length === 0
                ? `Nothing in “${bucketLabel(bucket)}” for this county.`
                : "Pick a place."}
            </div>
          )}
        </div>
      )}
    </AdminShell>
  );
}

/** @param {{ onLogIn: Function, onOpenEmail?: Function }} p */
export default function PinsPage({ onLogIn, onOpenEmail }) {
  return (
    <AdminGate title="Pin control center" purpose="fix the map's pins" onLogIn={onLogIn}>
      {(user) => <Pins user={user} onOpenEmail={onOpenEmail} />}
    </AdminGate>
  );
}

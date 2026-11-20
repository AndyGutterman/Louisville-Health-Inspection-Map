// Pause or resume Tuesday's weekly digest (docs/EMAIL_ADMIN.md). Pausing stops only the
// scheduled send: a digest started by hand, from the workflow or this page, still goes.
import { useEffect, useState } from "react";
import { fetchDigestPaused, setDigestPaused } from "../../api/admin.js";
import { errorText } from "../../lib/adminEmail.js";

export default function DigestPause() {
  const [paused, setPaused] = useState(null); // null until read
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let live = true;
    fetchDigestPaused().then(
      (p) => live && setPaused(p),
      (e) => live && setError(errorText(e)),
    );
    return () => {
      live = false;
    };
  }, []);

  const toggle = async () => {
    setBusy(true);
    setError(null);
    try {
      setPaused(await setDigestPaused(!paused));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const state =
    paused == null
      ? error
        ? ""
        : "Reading…"
      : paused
        ? "Paused. Tuesday's send won't go out until you resume it."
        : "On. It goes out on Tuesday mornings, to every subscriber.";

  return (
    <section className="adm-card" aria-labelledby="adm-pause-title">
      <div className="adm-sent-head">
        <div>
          <div className="adm-card-title" id="adm-pause-title">
            Tuesday&apos;s digest
          </div>
          <div className="adm-dim" role="status" data-testid="digest-pause-state">
            {state}
          </div>
        </div>
        <button
          type="button"
          className={`adm-btn ${paused ? "adm-btn--go" : "adm-btn--quiet"}`}
          disabled={busy || paused == null}
          onClick={toggle}
        >
          {paused ? "Resume" : "Pause"}
        </button>
      </div>
      {paused && <div className="adm-dim">Sending the digest by hand still works.</div>}
      {error && (
        <div className="adm-error" role="alert">
          {error}
        </div>
      )}
    </section>
  );
}

// One place in the pin control center: what the source says, and the four ways to fix
// it (docs/PINS.md). The source's address is shown as it is and never changed; a
// corrected address only feeds the geocoder.
import { useState } from "react";
import { formatLatLon } from "@lfs/core/coords.js";
import { clearPlaceFix, savePlaceFix } from "../../api/pins.js";
import {
  bucketLabel,
  editorStart,
  fixArgs,
  inRegionBox,
  mapsSearchUrl,
  outcomeText,
  pinSource,
  readPasted,
  sourceLine,
  startPin,
} from "../../lib/pinQueue.js";
import PinMap from "./PinMap.jsx";

const SAVED = {
  address: "Address saved. Press Geocode now to look it up.",
  pin: "Pin saved: it is on the map now.",
  hide: "Left off the map.",
  skip: "Skipped.",
};

/**
 * @param {object} p
 * @param {object} p.place     an admin_pin_queue row
 * @param {Function} p.onDone  ({ text, ok }) after a save or undo: the page reloads
 */
export default function PlaceEditor({ place, onDone }) {
  const [form, setForm] = useState(() => editorStart(place));
  const [point, setPoint] = useState(() => startPin(place));
  const [pasted, setPasted] = useState("");
  const [pasteError, setPasteError] = useState(null);
  const [alsoOthers, setAlsoOthers] = useState(false);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  const others = place.same_address ?? [];
  const outcome = outcomeText(place);
  const pinPicked = point && point.kind !== "now";
  const offCounty = point && !inRegionBox(place.region, point);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const pick = (p) => {
    setPoint({ ...p, kind: "new" });
    setPasted(formatLatLon(p));
    setPasteError(null);
  };
  const paste = (text) => {
    setPasted(text);
    const { point: p, error: e } = readPasted(text);
    setPasteError(e);
    if (p) setPoint({ ...p, kind: "pasted" }); // the map goes to it, to check the spot
  };

  async function save(action) {
    const args = fixArgs(action, place, {
      ...form,
      point: point && { lon: point.lon, lat: point.lat },
      also: alsoOthers ? others : [],
    });
    if (args.error) return setError(args.error);
    setBusy(action);
    setError(null);
    try {
      const n = await savePlaceFix(args);
      const more = n > 1 ? ` (${n} places)` : "";
      onDone({ ok: true, text: `${place.name}: ${SAVED[action]}${more}` });
    } catch (e) {
      setError(e.message);
      setBusy(null);
    }
  }

  async function undo() {
    setBusy("undo");
    setError(null);
    try {
      await clearPlaceFix(place.id);
      onDone({ ok: true, text: `${place.name}: fix undone, back as it was.` });
    } catch (e) {
      setError(e.message);
      setBusy(null);
    }
  }

  return (
    <div className="pins-editor" data-testid="place-editor">
      <div className="adm-card">
        <div className="pins-name">{place.name}</div>
        <dl className="pins-facts">
          <dt>As the source lists it</dt>
          <dd data-testid="source-address">{sourceLine(place) || "No address"}</dd>
          <dt>Pin now</dt>
          <dd>{pinSource(place)}</dd>
          {place.last_inspected && (
            <>
              <dt>Last inspected</dt>
              <dd>{place.last_inspected}</dd>
            </>
          )}
          {place.fix_action && (
            <>
              <dt>Fix</dt>
              <dd data-testid="fix-state">
                {bucketLabel(place.bucket)}
                {outcome ? `: ${outcome}` : ""}
                {place.result_query ? ` (looked up “${place.result_query}”)` : ""}
              </dd>
            </>
          )}
          {place.fix_note && (
            <>
              <dt>Note</dt>
              <dd>{place.fix_note}</dd>
            </>
          )}
        </dl>
        <a href={mapsSearchUrl(place)} target="_blank" rel="noreferrer">
          Search for it on Google Maps
        </a>
        {others.length > 0 && (
          <label className="adm-check">
            <input
              type="checkbox"
              checked={alsoOthers}
              onChange={(e) => setAlsoOthers(e.target.checked)}
            />
            Apply my fix to the {others.length} other {others.length === 1 ? "place" : "places"} at
            this address too
          </label>
        )}
      </div>

      <section className="adm-card" aria-labelledby="pins-address-h">
        <h3 className="adm-card-title" id="pins-address-h">
          Fix the address
        </h3>
        <p className="adm-dim">
          For the geocoder only: the site keeps showing the address as the source lists it.
        </p>
        <div className="pins-address">
          <label className="adm-field">
            <span className="adm-label">Street address</span>
            <input className="adm-input" value={form.address} onChange={set("address")} />
          </label>
          <label className="adm-field">
            <span className="adm-label">Town</span>
            <input className="adm-input" value={form.city} onChange={set("city")} />
          </label>
        </div>
        <div className="adm-actions">
          <button
            type="button"
            className="adm-btn adm-btn--go"
            disabled={!!busy}
            onClick={() => save("address")}
          >
            {busy === "address" ? "Saving…" : "Save address"}
          </button>
        </div>
      </section>

      <section className="adm-card" aria-labelledby="pins-pin-h">
        <h3 className="adm-card-title" id="pins-pin-h">
          Place the pin
        </h3>
        <p className="adm-dim">
          For an address that is right but that no geocoder finds. Click the map or drag the pin, or
          paste a latitude, longitude (right-click the building in Google Maps to copy it).
        </p>
        <PinMap region={place.region} point={point} onPick={pick} />
        <label className="adm-field">
          <span className="adm-label">Latitude, longitude</span>
          <input
            className="adm-input"
            value={pasted}
            onChange={(e) => paste(e.target.value)}
            placeholder="38.30833, -85.49152"
            aria-invalid={!!pasteError}
            aria-describedby={pasteError ? "pins-paste-error" : undefined}
          />
        </label>
        {pasteError && (
          <p className="pins-warn" id="pins-paste-error" role="alert">
            {pasteError}
          </p>
        )}
        {offCounty && (
          <p className="pins-warn" role="status">
            That spot is outside this county. Check it before saving.
          </p>
        )}
        <div className="adm-actions">
          <button
            type="button"
            className="adm-btn adm-btn--go"
            disabled={!!busy || !pinPicked}
            onClick={() => save("pin")}
          >
            {busy === "pin" ? "Saving…" : "Use this pin"}
          </button>
        </div>
      </section>

      <section className="adm-card" aria-labelledby="pins-other-h">
        <h3 className="adm-card-title" id="pins-other-h">
          Or
        </h3>
        <label className="adm-field">
          <span className="adm-label">Note (optional, for you)</span>
          <input
            className="adm-input"
            value={form.note}
            onChange={set("note")}
            placeholder="Food truck based in Indiana"
          />
        </label>
        <div className="adm-actions">
          <button
            type="button"
            className="adm-btn adm-btn--warn"
            disabled={!!busy}
            onClick={() => save("hide")}
          >
            {busy === "hide" ? "Saving…" : "Leave off map"}
          </button>
          <button type="button" className="adm-btn" disabled={!!busy} onClick={() => save("skip")}>
            {busy === "skip" ? "Saving…" : "Skip"}
          </button>
          {place.fix_action && (
            <button type="button" className="adm-btn" disabled={!!busy} onClick={undo}>
              {busy === "undo" ? "Undoing…" : "Undo fix"}
            </button>
          )}
        </div>
        {error && (
          <p className="pins-warn" role="alert" data-testid="editor-error">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}

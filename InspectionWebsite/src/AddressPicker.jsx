import React, { useState, useEffect, useRef } from "react";

// Address autocomplete, called directly from the browser.
// Needs VITE_GEOAPIFY_KEY in .env (local) and in Netlify (production).
// The key must be referrer-restricted to localhost:5173 and your Netlify domain.
// Only a confirmed pick (click or Enter on a suggestion) produces a value.

const KEY = import.meta.env.VITE_GEOAPIFY_KEY;
const BOUNDS = { w: -86.15, s: 37.85, e: -85.3, n: 38.5 };
const CENTER = { lon: -85.7585, lat: 38.2527 };

const MESSAGES = {
  nokey: "Address search isn't configured. Add VITE_GEOAPIFY_KEY to .env, then restart the dev server.",
  error: "Address search is unavailable right now. Try again in a moment.",
};

// Results are cached per query, so repeat lookups don't spend quota.
const cache = new Map();
const CACHE_MAX = 100;

const STYLES = `
.ap-wrap { position: relative; width: 100%; }
.ap-field { position: relative; }
.ap-field input { padding-right: 36px; }
.ap-check { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); color: #6fcf8a; font-weight: 800; pointer-events: none; }
.ap-list {
  position: absolute; left: 0; right: 0; top: calc(100% + 6px); z-index: 30;
  margin: 0; padding: 4px; list-style: none; max-height: 260px; overflow-y: auto;
  background: #17171c; border: 1px solid rgba(255,255,255,0.14);
  border-radius: 10px; box-shadow: 0 12px 32px rgba(0,0,0,0.55);
}
.ap-opt { padding: 10px 11px; border-radius: 7px; cursor: pointer; font-size: 0.86rem; line-height: 1.35; color: rgba(255,255,255,0.84); }
.ap-opt.on, .ap-opt:hover { background: rgba(52,168,83,0.16); color: #fff; }
.ap-opt small { display: block; color: rgba(255,255,255,0.42); font-size: 0.72rem; margin-top: 1px; }
.ap-msg { padding: 10px 11px; font-size: 0.8rem; color: rgba(255,255,255,0.50); line-height: 1.45; }
.ap-msg.err { color: #ff9a9a; }
.ap-credit { font-size: 0.64rem; color: rgba(255,255,255,0.28); margin-top: 6px; }
.ap-credit a { color: inherit; }
@media (max-width: 560px) { .ap-opt { padding: 12px 11px; } }
`;

const inBounds = (lat, lon) =>
  lat >= BOUNDS.s && lat <= BOUNDS.n && lon >= BOUNDS.w && lon <= BOUNDS.e;

async function search(q, signal) {
  const url = new URL("https://api.geoapify.com/v1/geocode/autocomplete");
  url.searchParams.set("text", q);
  url.searchParams.set("filter", `rect:${BOUNDS.w},${BOUNDS.s},${BOUNDS.e},${BOUNDS.n}`);
  url.searchParams.set("bias", `proximity:${CENTER.lon},${CENTER.lat}`);
  url.searchParams.set("limit", "5");
  url.searchParams.set("lang", "en");
  url.searchParams.set("apiKey", KEY);

  const res = await fetch(url, { signal });
  if (!res.ok) throw Object.assign(new Error(`Geoapify ${res.status}`), { code: "error" });
  const data = await res.json();
  const features = data.features || [];

  const results = features
    .map((f) => f.properties)
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon) && inBounds(p.lat, p.lon))
    .map((p) => ({
      address: p.formatted,
      primary: p.address_line1 || p.name || p.formatted,
      secondary: p.address_line2 || "",
      lat: p.lat,
      lon: p.lon,
    }));

  return { results, upstream: features.length };
}

export default function AddressPicker({ value, onChange, inputClass = "wl-input" }) {
  const [text, setText] = useState(value?.address || "");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [active, setActive] = useState(-1);
  const abortRef = useRef(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (value && text === value.address) return;
    const q = text.trim();
    if (q.length < 4) {
      setResults([]);
      setNotice("");
      setBusy(false);
      return;
    }

    const t = setTimeout(async () => {
      if (!KEY) {
        setResults([]);
        setNotice(MESSAGES.nokey);
        setOpen(true);
        return;
      }
      if (cache.has(q)) {
        setResults(cache.get(q));
        setNotice("");
        setActive(-1);
        setOpen(true);
        return;
      }
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setBusy(true);
      try {
        const body = await search(q, ctrl.signal);
        const list = body.results;
        if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
        cache.set(q, list);
        setResults(list);
        // Geoapify found places, but none inside our bounds
        setNotice(!list.length && body.upstream > 0 ? "Found places, but none inside Louisville Metro." : "");
        setActive(-1);
        setOpen(true);
      } catch (err) {
        if (err.name === "AbortError") return;
        setResults([]);
        setNotice(MESSAGES[err.code] || MESSAGES.error);
        setOpen(true);
      } finally {
        if (!ctrl.signal.aborted) setBusy(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [text, value]);

  useEffect(() => {
    const h = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  function pick(r) {
    setText(r.address);
    setOpen(false);
    setResults([]);
    onChange({ address: r.address, lat: r.lat, lon: r.lon });
  }

  function onKeyDown(e) {
    if (!open || (!results.length && !notice)) {
      if (e.key === "Enter") e.preventDefault();
      return;
    }
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => (results.length ? (i + 1) % results.length : -1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => (i <= 0 ? results.length - 1 : i - 1)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      if (results.length) pick(results[active >= 0 ? active : 0]);
    }
    else if (e.key === "Escape") setOpen(false);
  }

  const noMatch = open && !value && !busy && !notice && !results.length && text.trim().length >= 4;
  const showList = open && !value && (busy || results.length > 0 || notice || noMatch);

  return (
    <div className="ap-wrap" ref={wrapRef}>
      <style>{STYLES}</style>
      <div className="ap-field">
        <input
          className={inputClass}
          placeholder="Search a Louisville address"
          value={text}
          role="combobox"
          aria-expanded={showList}
          aria-autocomplete="list"
          autoComplete="off"
          onChange={(e) => {
            setText(e.target.value);
            if (value) onChange(null);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          onFocus={() => { if (results.length || notice) setOpen(true); }}
        />
        {value && <span className="ap-check" aria-label="Address confirmed">✓</span>}
      </div>

      {showList && (
        <ul className="ap-list" role="listbox">
          {busy && !results.length && <li className="ap-msg">Searching…</li>}
          {results.map((r, i) => (
            <li
              key={`${r.lat},${r.lon},${i}`}
              role="option"
              aria-selected={i === active}
              className={"ap-opt" + (i === active ? " on" : "")}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => { e.preventDefault(); pick(r); }}
            >
              {r.primary}
              {r.secondary && <small>{r.secondary}</small>}
            </li>
          ))}
          {!busy && notice && <li className="ap-msg err">{notice}</li>}
          {noMatch && (
            <li className="ap-msg">
              No matches in Louisville. Try the full street name and number.
            </li>
          )}
        </ul>
      )}

      <div className="ap-credit">
        Address search by <a href="https://www.geoapify.com/" target="_blank" rel="noreferrer">Geoapify</a> ·{" "}
        © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors
      </div>
    </div>
  );
}
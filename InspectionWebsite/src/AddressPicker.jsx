import React, { useState, useEffect, useRef } from "react";
import { searchAddresses } from "./lib/geocode.js";
import "./styles/AddressPicker.css";
// Address autocomplete, called directly from the browser.
// Needs VITE_GEOAPIFY_KEY in .env (local) and in Netlify (production).
// The key must be referrer-restricted to localhost:5173 and your Netlify domain.
// Only a confirmed pick (click or Enter on a suggestion) produces a value.

const KEY = import.meta.env.VITE_GEOAPIFY_KEY;
const MESSAGES = {
  nokey: "Address search isn't configured. Add VITE_GEOAPIFY_KEY to .env, then restart the dev server.",
  error: "Address search is unavailable right now. Try again in a moment.",
};

// Results are cached per query, so repeat lookups don't spend quota.
const cache = new Map();
const CACHE_MAX = 100;

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
        const body = await searchAddresses(q, { key: KEY, signal: ctrl.signal });
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
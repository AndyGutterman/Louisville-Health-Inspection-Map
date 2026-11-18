// The data behind the Digest tab: the week's inspections (the one read of any size, so
// it's asked for once per window and kept for the page's life), the accounts list, and
// the picked person's own parts of the email (saved places, watch areas).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { summarize } from "@lfs/core/email/digest.js";
import {
  SUBSCRIBERS_PAGE,
  fetchDigestSaved,
  fetchSubscribers,
  fetchWatchAreas,
  fetchWeekRows,
} from "../../api/admin.js";
import { useLatest } from "../../hooks/useLatest.js";
import { errorText, louisvilleToday } from "../../lib/adminEmail.js";

const weeks = new Map(); // "2026-11-10:7" -> Promise of rows
const personal = new Map(); // "2026-11-10:7:<user id>" -> Promise of { areas, saved }

function once(cache, key, read) {
  if (!cache.has(key)) {
    const promise = read();
    promise.catch(() => cache.delete(key)); // a failed read can be tried again
    cache.set(key, promise);
  }
  return cache.get(key);
}

// Runs `read` whenever `key` changes; the answer belongs to the key it was asked for.
function useKeyed(key, read) {
  const [state, setState] = useState({ key: null, data: null, error: null });
  const readRef = useLatest(read);
  useEffect(() => {
    if (key == null) return;
    let live = true;
    readRef.current().then(
      (data) => live && setState({ key, data, error: null }),
      (e) => live && setState({ key, data: null, error: errorText(e) }),
    );
    return () => {
      live = false;
    };
  }, [key, readRef]);
  const mine = state.key === key;
  return {
    data: mine ? state.data : null,
    error: mine ? state.error : null,
    loading: key != null && !mine,
  };
}

/** What the digest says for the last `days` days: { summary, error, loading }. */
export function useWeekSummary(days) {
  const today = louisvilleToday();
  const key = `${today}:${days}`;
  const { data, error, loading } = useKeyed(key, () =>
    once(weeks, key, () => fetchWeekRows(today, days)),
  );
  const summary = useMemo(
    () => (data ? summarize(data, { today, days }) : null),
    [data, today, days],
  );
  return { summary, error, loading };
}

/**
 * A person's own parts of the email for the window: { areas, saved }, read side by side.
 * Nobody picked (the generic digest): no areas, no saved places.
 */
export function usePersonalParts(userId, days) {
  const key = userId ? `${louisvilleToday()}:${days}:${userId}` : null;
  const { data, error, loading } = useKeyed(key, () =>
    once(personal, key, async () => {
      const [areas, saved] = await Promise.all([
        fetchWatchAreas(userId, days),
        fetchDigestSaved(userId, days),
      ]);
      return { areas, saved };
    }),
  );
  if (!userId) return { areas: [], saved: [], error: null, loading: false };
  return { areas: data?.areas ?? null, saved: data?.saved ?? [], error, loading };
}

/** The accounts list: searched in the database, a page at a time. */
export function usePeople() {
  const [search, setSearch] = useState("");
  const [state, setState] = useState({ rows: [], loading: true, error: null });
  const asked = useRef(0);

  const load = useCallback(async (term, offset) => {
    const mine = ++asked.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const page = await fetchSubscribers({ search: term, offset });
      if (mine !== asked.current) return; // a newer search has been asked since
      setState((s) => ({
        rows: offset ? [...s.rows, ...page] : page,
        loading: false,
        error: null,
      }));
    } catch (e) {
      if (mine === asked.current) setState((s) => ({ ...s, loading: false, error: errorText(e) }));
    }
  }, []);

  // The first page at once; a typed search after a pause, so each letter isn't a read.
  const first = useRef(true);
  useEffect(() => {
    const wait = first.current ? 0 : 350;
    first.current = false;
    const t = setTimeout(() => load(search, 0), wait);
    return () => clearTimeout(t);
  }, [search, load]);

  const { rows } = state;
  const total = Number(rows[0]?.total ?? 0);
  // Every row carries the count of subscribers; it's kept apart so a search that finds
  // nobody doesn't lose it, and so switching someone on or off here moves it.
  const [subscribers, setSubscribers] = useState(null);
  useEffect(() => {
    if (rows.length) setSubscribers(Number(rows[0].subscribers));
  }, [rows]);
  return {
    ...state,
    search,
    setSearch,
    total,
    subscribers,
    hasMore: rows.length < total && rows.length % SUBSCRIBERS_PAGE === 0,
    more: () => load(search, rows.length),
    // After putting someone on or off the digest: their row and the count, without a read.
    setWeekly: (userId, on) =>
      setState((s) => {
        const was = s.rows.find((r) => r.user_id === userId)?.alert_frequency === "weekly";
        const count = Number(s.rows[0]?.subscribers ?? 0) + (on === was ? 0 : on ? 1 : -1);
        return {
          ...s,
          rows: s.rows.map((r) => ({
            ...r,
            subscribers: count,
            ...(r.user_id === userId ? { alert_frequency: on ? "weekly" : "off" } : null),
          })),
        };
      }),
  };
}

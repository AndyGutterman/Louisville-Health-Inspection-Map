// The pin control center's queue: a county, one of its queues (lib/pinQueue.js BUCKETS),
// and a page of places, most recently inspected first. A county is a drop-down, not a
// row of buttons, so the list still works with every county in Kentucky.
import { BUCKETS, PAGE_SIZE, sourceLine } from "../../lib/pinQueue.js";

/**
 * @param {object} p
 * @param {object[]} p.choices   lib/pinQueue.js regionChoices(...)
 * @param {string} p.region
 * @param {string} p.bucket
 * @param {object[]|null} p.rows null while loading
 * @param {string|null} p.selectedId
 * @param {number} p.offset
 */
export default function PinQueue({
  choices,
  region,
  onRegion,
  bucket,
  onBucket,
  rows,
  selectedId,
  onSelect,
  offset,
  onPage,
}) {
  const counts = choices.find((c) => c.id === region)?.counts ?? {};
  const total = counts[bucket] ?? 0;
  const shown = BUCKETS.filter((b) => b.key === bucket || b.key === "missing" || counts[b.key] > 0);

  return (
    <div className="pins-queue" data-testid="pin-queue">
      <label className="adm-field">
        <span className="adm-label">County</span>
        <select
          className="adm-select"
          value={region}
          onChange={(e) => onRegion(e.target.value)}
          data-testid="pin-county"
        >
          {choices.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.todo ? ` (${c.todo.toLocaleString("en-US")} to look at)` : ""}
            </option>
          ))}
        </select>
      </label>

      <div className="adm-chips" role="group" aria-label="Queue">
        {shown.map((b) => (
          <button
            key={b.key}
            type="button"
            className={`adm-chip${b.key === bucket ? " adm-chip--on" : ""}`}
            aria-pressed={b.key === bucket}
            onClick={() => onBucket(b.key)}
          >
            {b.label} {(counts[b.key] ?? 0).toLocaleString("en-US")}
          </button>
        ))}
      </div>

      {rows === null ? (
        <p className="adm-dim">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="adm-dim" data-testid="pin-queue-empty">
          Nothing here.
        </p>
      ) : (
        <ul className="pins-list">
          {rows.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className={`pins-row${r.id === selectedId ? " on" : ""}`}
                aria-current={r.id === selectedId ? "true" : undefined}
                onClick={() => onSelect(r.id)}
              >
                <span className="pins-row-name">{r.name}</span>
                <span className="pins-row-addr">{sourceLine(r) || "No address"}</span>
                {r.last_inspected && (
                  <span className="pins-row-date">Inspected {r.last_inspected}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {total > PAGE_SIZE && (
        <div className="pins-pager">
          <button
            type="button"
            className="adm-btn"
            disabled={offset === 0}
            onClick={() => onPage(Math.max(0, offset - PAGE_SIZE))}
          >
            Previous
          </button>
          <span className="adm-dim">
            {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total.toLocaleString("en-US")}
          </span>
          <button
            type="button"
            className="adm-btn"
            disabled={offset + PAGE_SIZE >= total}
            onClick={() => onPage(offset + PAGE_SIZE)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

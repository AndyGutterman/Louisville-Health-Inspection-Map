// The Learn page's "Data sources" list: one expandable group per county, then the sources
// every county shares. Built from lib/regions.js, so a county added there (with its
// `agency` and `sources`) shows up here with no other change.
import { SHARED_SOURCES, enabledRegions } from "./lib/regions.js";

function SourceList({ sources }) {
  return (
    <ul className="ln-sources-list">
      {sources.map((s) => (
        <li key={s.url + s.name}>
          <a href={s.url} target="_blank" rel="noopener noreferrer">
            {s.name}
          </a>
          {s.about && <span className="ln-sources-about">{s.about}</span>}
        </li>
      ))}
    </ul>
  );
}

export default function DataSources({ regions = enabledRegions(), shared = SHARED_SOURCES }) {
  return (
    <div className="ln-sources" data-testid="data-sources">
      {regions.map((r, i) => (
        <details key={r.id} className="ln-sources-group" open={i === 0}>
          <summary>
            <span className="ln-sources-name">{r.name}</span>
            <span className="ln-sources-count">
              {r.sources.length} {r.sources.length === 1 ? "source" : "sources"}
            </span>
          </summary>
          <p className="ln-sources-agency">
            Inspections by the{" "}
            <a href={r.agency.url} target="_blank" rel="noopener noreferrer">
              {r.agency.name}
            </a>
            .
          </p>
          <SourceList sources={r.sources} />
        </details>
      ))}
      <details className="ln-sources-group">
        <summary>
          <span className="ln-sources-name">Map and locations</span>
          <span className="ln-sources-count">{shared.length} sources</span>
        </summary>
        <SourceList sources={shared} />
      </details>
    </div>
  );
}

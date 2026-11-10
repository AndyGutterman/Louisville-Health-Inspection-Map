// The Learn page's "Data sources" list: one link per county and a line on what its data
// includes, since the counties publish different things (Bullitt has no inspection dates,
// grades or inspector comments). Built from lib/regions.js, so a county added there with
// a `source` and `dataNote` shows up here with no other change.
import { enabledRegions } from "./lib/regions.js";

export default function DataSources({ regions = enabledRegions() }) {
  return (
    <ul className="ln-sources" data-testid="data-sources">
      {regions.map((r) => (
        <li key={r.id} className="ln-sources-item">
          <div className="ln-sources-head">
            <span className="ln-sources-name">{r.name}</span>
            <a href={r.source.url} target="_blank" rel="noopener noreferrer">
              {r.source.name}
            </a>
          </div>
          <p className="ln-sources-note">{r.dataNote}</p>
        </li>
      ))}
    </ul>
  );
}

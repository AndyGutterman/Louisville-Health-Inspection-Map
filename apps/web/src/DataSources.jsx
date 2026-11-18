// The Learn page's "Data sources" list: one link per county and a line on what its data
// includes, since the counties publish different things (Bullitt has no grades or
// inspector comments, and dates only through the state's portal). Built from lib/regions.js, so a county added there with
// a `source` and `dataNote` shows up here with no other change.
import { enabledRegions } from "./lib/regions.js";
import { useT } from "./I18nContext.jsx";

export default function DataSources({ regions = enabledRegions() }) {
  const { t } = useT();
  // The words come from lib/strings.pages.js ("regions.<id>.source" / ".dataNote"); a county
  // without them there shows the English in lib/regions.js.
  const say = (key, fallback) => {
    const text = t(key);
    return text === key ? fallback : text;
  };
  return (
    <ul className="ln-sources" data-testid="data-sources">
      {regions.map((r) => (
        <li key={r.id} className="ln-sources-item">
          <div className="ln-sources-head">
            <span className="ln-sources-name">{r.name}</span>
            <a href={r.source.url} target="_blank" rel="noopener noreferrer">
              {say(`regions.${r.id}.source`, r.source.name)}
            </a>
          </div>
          <p className="ln-sources-note">{say(`regions.${r.id}.dataNote`, r.dataNote)}</p>
        </li>
      ))}
    </ul>
  );
}

// The Learn page (/?page=learn): how inspections are scored and graded, the violation
// database (ViolationDatabase), and where the data comes from (DataSources).
// LearnPage.css is imported first: Map.jsx relies on it loading before MapLibre's CSS.
import "../../styles/LearnPage.css";
import React from "react";
import DataSources from "../../DataSources.jsx";
import LoginModal from "./LoginModal.jsx";
import ViolationDatabase from "./ViolationDatabase.jsx";

// The map header opens the same sign-in form.
export { LoginModal };

// ─── Main export ─────────────────────────────────────────────────────────────
// Props:
//   loginOpen       boolean  — whether the login modal is open
//   onCloseLogin    fn       — called to close the modal
//   mapCutoffDate   string   — ISO date from map's "Since" filter (optional)
//   onOpenEstablishment fn   — (eid) called to close Learn and open drawer
export default function LearnPage({
  loginOpen,
  onCloseLogin,
  mapCutoffDate,
  onOpenEstablishment,
  onOpenPrivacy,
}) {
  return (
    <>
      <div className="ln-page-wrap">
        <div className="ln-page">
          {/* Hero */}
          <div className="ln-hero">
            <h1 className="ln-hero-title">Understanding Louisville Food Inspections</h1>
            <p className="ln-hero-sub">
              How Louisville Metro Public Health and Wellness scores an inspection and decides which
              placard a place has to post.
            </p>
          </div>

          {/* Grade cards (Placard Issuance Policy, June 7, 2019) */}
          <div className="ln-sh">The three placards</div>
          <p className="ln-table-note" style={{ marginTop: 0, marginBottom: 14 }}>
            Placards are Louisville Metro&apos;s program. Bullitt County posts scores but no letter
            grades, so its places show a score only.
          </p>
          <div className="ln-trio">
            <div className="ln-gcard ga">
              <div className="ln-gtop">
                <div className="ln-gletter">A</div>
                <div className="ln-gplacard">Green placard</div>
              </div>
              <div className="ln-gbody">
                <div>
                  <div className="ln-gfield-lbl">Score</div>
                  <div className="ln-gfield-val">85 – 100</div>
                </div>
                <div>
                  <div className="ln-gfield-lbl">And</div>
                  <ul className="ln-gcriteria">
                    <li>No priority violations</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="ln-gcard gb">
              <div className="ln-gtop">
                <div className="ln-gletter">B</div>
                <div className="ln-gplacard">Blue placard</div>
              </div>
              <div className="ln-gbody">
                <div>
                  <div className="ln-gfield-lbl">Based on</div>
                  <div className="ln-gfield-val">Recent history</div>
                </div>
                <div>
                  <div className="ln-gfield-lbl">After any of these</div>
                  <ul className="ln-gcriteria">
                    <li>Failing 2 inspections in a row</li>
                    <li>A closure for an imminent health hazard</li>
                    <li>A regular inspection scored below 60</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="ln-gcard gc">
              <div className="ln-gtop">
                <div className="ln-gletter">C</div>
                <div className="ln-gplacard">Red placard</div>
              </div>
              <div className="ln-gbody">
                <div>
                  <div className="ln-gfield-lbl">Score</div>
                  <div className="ln-gfield-val">Below 85</div>
                </div>
                <div>
                  <div className="ln-gfield-lbl">Or</div>
                  <ul className="ln-gcriteria">
                    <li>One or more priority violations, whatever the score</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Key callout */}
          <div className="ln-callout">
            <div className="ln-callout-label">⚠ Score alone does not decide the placard</div>
            <p>
              A place can score 90 and still get a <strong>C (red) placard</strong> if the inspector
              found a priority violation. A B placard is about history: it is posted once a place
              passes its follow-up and reopens after a closure, a score below 60, or two failed
              inspections in a row.
            </p>
            <p style={{ marginTop: 8, color: "rgba(255,255,255,0.62)", fontSize: ".78rem" }}>
              Pin colors on the map show the <strong>score only</strong>, and you can adjust them. A
              amber ring means at least one violation was cited on the latest inspection. Rings are
              not placards: the grade in a place&apos;s details is the one the health department
              recorded. Bullitt County&apos;s rings are light blue: its sheet lists every form item
              marked at a visit, including routine ones Louisville&apos;s data doesn&apos;t publish,
              so rings are far more common there and don&apos;t mean a place is worse. From afar
              only the places with several violations show a ring; zoom in to see them all.
            </p>
          </div>

          {/* Duration table */}
          <div className="ln-sh">How long each placard is posted</div>
          <table className="ln-ptable">
            <thead>
              <tr>
                <th>Grade</th>
                <th>Color</th>
                <th>Posted for</th>
                <th>What comes next</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <span className="ln-grade-cell ga">A</span>
                </td>
                <td>Green</td>
                <td>Until the next regular inspection</td>
                <td>The next regular inspection</td>
              </tr>
              <tr>
                <td>
                  <span className="ln-grade-cell gb">B</span>
                </td>
                <td>Blue</td>
                <td>At least 3 months, at most 6</td>
                <td>A regular inspection within 3 to 6 months of reopening</td>
              </tr>
              <tr>
                <td>
                  <span className="ln-grade-cell gc">C</span>
                </td>
                <td>Red</td>
                <td>At least 7 days, at most 10</td>
                <td>A follow-up inspection within 7 to 10 days</td>
              </tr>
            </tbody>
          </table>
          <p className="ln-table-note">
            A placard is issued after every scored inspection except opening and survey inspections.
            A place that moves, covers or alters a B or C placard must keep it up 7 more days. Two
            failed inspections in a row mean more frequent inspections; three in a row lead to a
            state hearing and a notice of intent to suspend the permit.
          </p>

          {/* Score rules (902 KAR 45:005, Section 6 and 7) */}
          <div className="ln-sh">How the score works</div>
          <p className="ln-table-note" style={{ marginTop: 0, marginBottom: 10 }}>
            Every inspection starts at 100. Each violation takes off the points the state inspection
            form sets for that item. Whatever the score, priority violations must be fixed within 10
            days.
          </p>
          <table className="ln-ptable ln-ptable--all-cols">
            <thead>
              <tr>
                <th>Score</th>
                <th>What happens</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>85 – 100</td>
                <td>
                  Passes (unless there is a priority violation). One-point items are due by the next
                  regular inspection.
                </td>
              </tr>
              <tr>
                <td>70 – 84</td>
                <td>Fails, C placard. One-point items must be fixed within 30 days.</td>
              </tr>
              <tr>
                <td>Below 70</td>
                <td>The state issues a notice of intent to suspend the permit.</td>
              </tr>
              <tr>
                <td>Below 60</td>
                <td>
                  The permit is suspended immediately, as it is for an imminent health hazard.
                </td>
              </tr>
            </tbody>
          </table>

          {/* Violations */}
          <div className="ln-sh">Violations</div>
          <p className="ln-table-note" style={{ marginTop: 0, marginBottom: 32 }}>
            Inspectors cite each problem against a section of the Kentucky Food Code, and each one
            takes points off the score. The placard policy treats a <strong>priority</strong>{" "}
            violation as an automatic C. It defines one as breaking a rule &ldquo;whose application
            contributes directly to the elimination, prevention or reduction to an acceptable level,
            hazards associated with foodborne illness or injury and there is no other provision that
            more directly controls the hazard.&rdquo; The public data this site uses doesn&apos;t
            clearly mark which violations were priority ones, so we list every citation simply as a
            violation. A place&apos;s score and grade come straight from the health
            department&apos;s records.
          </p>

          {/* Violations database */}
          <div className="ln-sh" style={{ marginBottom: 10 }}>
            Violation database
          </div>
          <ViolationDatabase
            initialCutoffDate={mapCutoffDate ?? null}
            onOpenEstablishment={onOpenEstablishment}
          />

          {/* About the data */}
          <div className="ln-sh">About this data</div>
          <p className="ln-table-note" style={{ marginTop: 0, marginBottom: 16 }}>
            This site is an independent project and is not affiliated with Louisville Metro
            Government or any county health department. Inspection data comes from each
            county&apos;s public records, listed below. It is refreshed regularly but can lag behind
            the latest inspections, and it may contain errors. The placard posted at the business
            and the official inspection report are the final word.
          </p>

          {/* Data sources: one link per county and what its data includes (lib/regions.js) */}
          <div className="ln-sh">Data sources</div>
          <p className="ln-table-note" style={{ marginTop: 0, marginBottom: 12 }}>
            Each county publishes its inspections differently, so the same details aren&apos;t
            available everywhere.
          </p>
          <DataSources />

          {/* Source */}
          <div className="ln-src">
            <strong style={{ color: "rgba(255,255,255,0.65)" }}>Rules cited above:</strong>{" "}
            <a
              href="https://louisvilleky.gov/sites/default/files/2021-12/abc-placard-issuance_pol_env_20190607.pdf"
              target="_blank"
              rel="noopener noreferrer"
            >
              Louisville Metro Placard Issuance Policy
            </a>{" "}
            (approved June 7, 2019);{" "}
            <a
              href="https://apps.legislature.ky.gov/law/kar/titles/902/045/005/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Kentucky Food Code, 902 KAR 45:005
            </a>
            .
          </div>

          <p className="ln-privacy">
            <button type="button" className="privacy-link" onClick={onOpenPrivacy}>
              Privacy: what this site stores about you
            </button>
          </p>
        </div>
      </div>

      {loginOpen && <LoginModal onClose={onCloseLogin} />}
    </>
  );
}

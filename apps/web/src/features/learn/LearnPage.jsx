// The Learn page (/?page=learn): how inspections are scored and graded, the violation
// database (ViolationDatabase), and where the data comes from (DataSources).
// LearnPage.css is imported first: Map.jsx relies on it loading before MapLibre's CSS.
import "../../styles/LearnPage.css";
import React from "react";
import DataSources from "../../DataSources.jsx";
import LoginModal from "./LoginModal.jsx";
import ViolationDatabase from "./ViolationDatabase.jsx";
import Bold from "./Bold.jsx";
import { useT } from "../../I18nContext.jsx";

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
  const { t } = useT();
  return (
    <>
      <div className="ln-page-wrap">
        <div className="ln-page">
          {/* Hero */}
          <div className="ln-hero">
            <h1 className="ln-hero-title">{t("learn.title")}</h1>
            <p className="ln-hero-sub">{t("learn.sub")}</p>
          </div>

          {/* Grade cards (Placard Issuance Policy, June 7, 2019) */}
          <div className="ln-sh">{t("learn.placards.h")}</div>
          <p className="ln-table-note" style={{ marginTop: 0, marginBottom: 14 }}>
            {t("learn.placards.note")}
          </p>
          <div className="ln-trio">
            <div className="ln-gcard ga">
              <div className="ln-gtop">
                <div className="ln-gletter">A</div>
                <div className="ln-gplacard">{t("learn.green")}</div>
              </div>
              <div className="ln-gbody">
                <div>
                  <div className="ln-gfield-lbl">{t("learn.field.score")}</div>
                  <div className="ln-gfield-val">{t("learn.score.r1")}</div>
                </div>
                <div>
                  <div className="ln-gfield-lbl">{t("learn.field.and")}</div>
                  <ul className="ln-gcriteria">
                    <li>{t("learn.a.noPriority")}</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="ln-gcard gb">
              <div className="ln-gtop">
                <div className="ln-gletter">B</div>
                <div className="ln-gplacard">{t("learn.blue")}</div>
              </div>
              <div className="ln-gbody">
                <div>
                  <div className="ln-gfield-lbl">{t("learn.field.basedOn")}</div>
                  <div className="ln-gfield-val">{t("learn.b.history")}</div>
                </div>
                <div>
                  <div className="ln-gfield-lbl">{t("learn.field.afterAny")}</div>
                  <ul className="ln-gcriteria">
                    <li>{t("learn.b.c1")}</li>
                    <li>{t("learn.b.c2")}</li>
                    <li>{t("learn.b.c3")}</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="ln-gcard gc">
              <div className="ln-gtop">
                <div className="ln-gletter">C</div>
                <div className="ln-gplacard">{t("learn.red")}</div>
              </div>
              <div className="ln-gbody">
                <div>
                  <div className="ln-gfield-lbl">{t("learn.field.score")}</div>
                  <div className="ln-gfield-val">{t("learn.c.range")}</div>
                </div>
                <div>
                  <div className="ln-gfield-lbl">{t("learn.field.or")}</div>
                  <ul className="ln-gcriteria">
                    <li>{t("learn.c.priority")}</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Key callout */}
          <div className="ln-callout">
            <div className="ln-callout-label">{t("learn.callout.label")}</div>
            <p>
              <Bold text={t("learn.callout.p1")} />
            </p>
            <p style={{ marginTop: 8, color: "rgba(255,255,255,0.62)", fontSize: ".78rem" }}>
              <Bold text={t("learn.callout.p2")} />
            </p>
          </div>

          {/* Duration table */}
          <div className="ln-sh">{t("learn.duration.h")}</div>
          <table className="ln-ptable">
            <thead>
              <tr>
                <th>{t("learn.th.grade")}</th>
                <th>{t("learn.th.color")}</th>
                <th>{t("learn.th.postedFor")}</th>
                <th>{t("learn.th.next")}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <span className="ln-grade-cell ga">A</span>
                </td>
                <td>{t("learn.color.green")}</td>
                <td>{t("learn.a.posted")}</td>
                <td>{t("learn.a.next")}</td>
              </tr>
              <tr>
                <td>
                  <span className="ln-grade-cell gb">B</span>
                </td>
                <td>{t("learn.color.blue")}</td>
                <td>{t("learn.b.posted")}</td>
                <td>{t("learn.b.next")}</td>
              </tr>
              <tr>
                <td>
                  <span className="ln-grade-cell gc">C</span>
                </td>
                <td>{t("learn.color.red")}</td>
                <td>{t("learn.c.posted")}</td>
                <td>{t("learn.c.next")}</td>
              </tr>
            </tbody>
          </table>
          <p className="ln-table-note">{t("learn.duration.note")}</p>

          {/* Score rules (902 KAR 45:005, Section 6 and 7) */}
          <div className="ln-sh">{t("learn.score.h")}</div>
          <p className="ln-table-note" style={{ marginTop: 0, marginBottom: 10 }}>
            {t("learn.score.note")}
          </p>
          <table className="ln-ptable ln-ptable--all-cols">
            <thead>
              <tr>
                <th>{t("learn.score.th.score")}</th>
                <th>{t("learn.score.th.what")}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{t("learn.score.r1")}</td>
                <td>{t("learn.score.r1.what")}</td>
              </tr>
              <tr>
                <td>{t("learn.score.r2")}</td>
                <td>{t("learn.score.r2.what")}</td>
              </tr>
              <tr>
                <td>{t("learn.score.r3")}</td>
                <td>{t("learn.score.r3.what")}</td>
              </tr>
              <tr>
                <td>{t("learn.score.r4")}</td>
                <td>{t("learn.score.r4.what")}</td>
              </tr>
            </tbody>
          </table>

          {/* Violations */}
          <div className="ln-sh">{t("learn.violations.h")}</div>
          <p className="ln-table-note" style={{ marginTop: 0, marginBottom: 32 }}>
            <Bold text={t("learn.violations.p")} />
          </p>

          {/* Violations database */}
          <div className="ln-sh" style={{ marginBottom: 10 }}>
            {t("learn.vdb.h")}
          </div>
          <ViolationDatabase
            initialCutoffDate={mapCutoffDate ?? null}
            onOpenEstablishment={onOpenEstablishment}
          />

          {/* About the data */}
          <div className="ln-sh">{t("learn.about.h")}</div>
          <p className="ln-table-note" style={{ marginTop: 0, marginBottom: 16 }}>
            {t("learn.about.p")}
          </p>

          {/* Data sources: one link per county and what its data includes (lib/regions.js) */}
          <div className="ln-sh">{t("learn.sources.h")}</div>
          <p className="ln-table-note" style={{ marginTop: 0, marginBottom: 12 }}>
            {t("learn.sources.note")}
          </p>
          <DataSources />

          {/* Source */}
          <div className="ln-src">
            <strong style={{ color: "rgba(255,255,255,0.65)" }}>{t("learn.rules.label")}</strong>{" "}
            <a
              href="https://louisvilleky.gov/sites/default/files/2021-12/abc-placard-issuance_pol_env_20190607.pdf"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("learn.rules.placard")}
            </a>
            {t("learn.rules.placardDate")}
            <a
              href="https://apps.legislature.ky.gov/law/kar/titles/902/045/005/"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("learn.rules.code")}
            </a>
            .
          </div>

          <p className="ln-privacy">
            <button type="button" className="privacy-link" onClick={onOpenPrivacy}>
              {t("learn.privacyLink")}
            </button>
          </p>
        </div>
      </div>

      {loginOpen && <LoginModal onClose={onCloseLogin} />}
    </>
  );
}

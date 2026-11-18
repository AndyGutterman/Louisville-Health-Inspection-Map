// The privacy page (/?page=privacy). Plain words, and every line has to stay true: when
// the site starts storing or sending something new, say so here and move the date in
// lib/privacy.js. docs/PRIVACY.md lists where each statement comes from in the code.
//
// It only says what the site does by itself. No promises that need a person to keep them
// (a deadline, "ask and it will be deleted", "you will be told"): the owner's call,
// 2026-11-17. If something isn't built, the page says so.
import { PRIVACY_UPDATED } from "../../lib/privacy.js";
import "../../styles/PrivacyPage.css";

const REPO = "https://github.com/AndyGutterman/Louisville-Health-Inspection-Map";

function Section({ title, children }) {
  return (
    <section className="pv-section">
      <h2 className="ln-sh">{title}</h2>
      {children}
    </section>
  );
}

/** @param {{ onOpenLearn: Function }} p  opens the Learn page (about the inspection data) */
export default function PrivacyPage({ onOpenLearn }) {
  return (
    <div className="ln-page-wrap" data-testid="privacy-page">
      <div className="ln-page pv-page">
        <div className="ln-hero">
          <h1 className="ln-hero-title">Privacy</h1>
          <p className="ln-hero-sub">Last updated {PRIVACY_UPDATED}</p>
        </div>

        <p className="pv-lead">
          Louisville Food Safe is a free project run by one person. It has no ads and no tracking,
          and it doesn&apos;t sell or share your information. You can use the whole map without an
          account.
        </p>

        <Section title="What is stored">
          <dl className="pv-list">
            <dt>If you just look at the map</dt>
            <dd>
              Nothing about you. There are no analytics and no advertising or tracking cookies. Your
              browser keeps a few things on your own device so the site loads faster and remembers
              your choices: which counties and place types are switched on, and a copy of the
              map&apos;s data. Clearing your browser&apos;s site data removes them.
            </dd>
            <dt>If you make an account</dt>
            <dd>
              Your email address, the places you save, your watch areas (the address or spot you
              picked and how wide the circle is), and whether you want the weekly email. Signing in
              is remembered in your browser until you sign out.
            </dd>
            <dt>If you get the weekly email</dt>
            <dd>
              The site keeps a log of which emails went to your address and when. It does this by
              itself, so that nobody is sent the same email twice.
            </dd>
            <dt>If you send feedback</dt>
            <dd>
              Your message, plus your name and email if you choose to give them. To keep spam out,
              your browser type and a scrambled form of your IP address are kept with it. The IP
              address itself is not stored.
            </dd>
          </dl>
        </Section>

        <Section title="What it is used for">
          <p>
            Only to run the site: signing you in, showing your saved places and watch areas, and
            sending the weekly digest if you asked for it. Feedback is used to fix and improve the
            site. People who get the digest may occasionally get another email about the site
            itself. The digest and those emails each have an unsubscribe link.
          </p>
        </Section>

        <Section title="Who can see it">
          <p>
            The person who runs the site can see account emails, saved places, watch areas and
            feedback. So can the services listed below, as far as each needs to for its job. It is
            not sold and not used for advertising.
          </p>
        </Section>

        <Section title="Services the site runs on">
          <p>Each one handles only what it needs to do its job:</p>
          <ul className="pv-services">
            <li>
              <strong>Supabase</strong> stores accounts, saved places, watch areas and feedback, and
              sends the sign-in code.
            </li>
            <li>
              <strong>Netlify</strong> hosts the site.
            </li>
            <li>
              <strong>Google</strong> sends the weekly email (Gmail) and serves the site&apos;s
              lettering (Google Fonts).
            </li>
            <li>
              <strong>Geoapify</strong> finds addresses: when you search for one to set a watch
              area, what you type is sent to it.
            </li>
            <li>
              <strong>CARTO</strong> serves the background map, drawn from OpenStreetMap.
            </li>
          </ul>
          <p>
            As with any website, these services see your IP address when your browser asks them for
            something.
          </p>
        </Section>

        <Section title="Your choices">
          <dl className="pv-list">
            <dt>Stop the weekly email</dt>
            <dd>
              Use the Unsubscribe link at the bottom of any digest, or the switch in Saved. It takes
              effect at once.
            </dd>
            <dt>Remove a saved place or a watch area</dt>
            <dd>Remove it in Saved. It is deleted straight away.</dd>
            <dt>Deleting the account itself</dt>
            <dd>
              There is no way to do that yet. Switching the weekly email off and removing your saved
              places and watch areas leaves your email address and the log of emails sent to it.
              Nothing is deleted on a schedule: what you don&apos;t remove stays.
            </dd>
          </dl>
        </Section>

        <Section title="The inspection data">
          <p>
            The scores, placards and violations on the map are public records published by the
            county health departments. They are about businesses, not about you.{" "}
            <button type="button" className="pv-link" onClick={onOpenLearn}>
              About the data
            </button>
          </p>
        </Section>

        <Section title="About this page">
          <p>
            This page describes the site as it was on the date at the top. To report a problem, use
            the Feedback button at the top of the site. The site&apos;s code is public on{" "}
            <a href={REPO} target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
            , so anyone can check what it does.
          </p>
        </Section>
      </div>
    </div>
  );
}

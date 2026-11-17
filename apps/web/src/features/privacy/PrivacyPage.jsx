// The privacy page (/?page=privacy). Plain words, and every line has to stay true: when
// the site starts storing or sending something new, say so here and move the date in
// lib/privacy.js. docs/PRIVACY.md lists where each statement comes from in the code, and
// how to handle a request to delete someone's data.
import { CONTACT_EMAIL, PRIVACY_UPDATED } from "../../lib/privacy.js";
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
  const mail = <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;
  return (
    <div className="ln-page-wrap" data-testid="privacy-page">
      <div className="ln-page pv-page">
        <div className="ln-hero">
          <h1 className="ln-hero-title">Privacy</h1>
          <p className="ln-hero-sub">Last updated {PRIVACY_UPDATED}</p>
        </div>

        <p className="pv-lead">
          Louisville Food Safe is a free project run by one person. It has no ads and no tracking,
          and it never sells or shares your information. You can use the whole map without an
          account.
        </p>

        <Section title="What is collected">
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
            <dd>A record of which emails were sent to your address, and when.</dd>
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
            Only to run the site: signing you in, showing your saved places and watch areas, sending
            the weekly digest you asked for, and reading your feedback. Subscribers may now and then
            get a short note about the site itself, such as a new county. Every email has an
            unsubscribe link.
          </p>
        </Section>

        <Section title="Who can see it">
          <p>
            The person who runs the site can see account emails, saved places and watch areas, to
            keep the service working and to fix problems. Nobody else. It is not sold, not shared
            and not used for advertising.
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
            <li>
              <strong>Upstash</strong> counts feedback messages per scrambled IP address, to limit
              spam.
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
            <dt>Delete your account, or ask what is held about you</dt>
            <dd>
              Email {mail} from the address on the account. Your account, saved places, watch areas
              and email record are deleted within 30 days, usually much sooner.
            </dd>
          </dl>
        </Section>

        <Section title="How long it is kept">
          <p>
            Account information is kept for as long as you have the account. Feedback is kept so it
            can be acted on; ask and yours will be deleted.
          </p>
        </Section>

        <Section title="Children">
          <p>
            The site is not meant for children under 13 and does not knowingly collect information
            from them.
          </p>
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

        <Section title="Changes and contact">
          <p>
            If this page changes in a way that matters, the date at the top changes and subscribers
            are told by email. Questions go to {mail}. The site&apos;s code is public on{" "}
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

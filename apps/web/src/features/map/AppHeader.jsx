// The top bar: search (or "back to map" off the map), the brand, and Learn / Feedback /
// Log in or Saved. Publishes its height and the search box's left edge as CSS variables
// (--header-h, --mobile-header-h, --controls-left) that other panels position against.
import { useEffect, useRef } from "react";
import { useT } from "../../I18nContext.jsx";
import LanguagePicker from "./LanguagePicker.jsx";

// Lucide-style stroke icon, 14px unless sized otherwise.
function Icon({ size = 14, strokeWidth = 2.2, children }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/**
 * @param {object} p
 * @param {"map"|"learn"|"admin"|"pins"|"privacy"} p.page
 * @param {boolean} p.showSearch     false off the map and on the phone account page
 * @param {string} p.searchTerm
 * @param {Function} p.onSearchChange
 * @param {{on: number, of: number}|null} [p.searchScope]  set while a search is only
 *   looking through some of the place types (the categories switched on)
 * @param {Function} [p.onSearchAll]  switches every category on
 * @param {Function} p.onBackToMap
 * @param {Function} p.onOpenLearn
 * @param {Function} p.onOpenFeedback
 * @param {object|null} p.user       signed-in user, or null
 * @param {boolean} p.accountActive  the Saved panel is open
 * @param {Function} p.onToggleAccount
 * @param {Function} p.onLogIn
 */
export default function AppHeader(p) {
  const headerRef = useRef(null);
  const { t } = useT();

  useEffect(() => {
    const root = document.documentElement.style;
    const publish = () => {
      const header = headerRef.current;
      const h = header ? Math.round(header.getBoundingClientRect().height) : 72;
      root.setProperty("--mobile-header-h", `${h}px`);
      root.setProperty("--header-h", `${h}px`);
      const search = header?.querySelector(".header-search .search-wrap");
      root.setProperty(
        "--controls-left",
        `${search ? Math.round(search.getBoundingClientRect().left) : 16}px`,
      );
    };
    publish();
    window.addEventListener("resize", publish);
    return () => window.removeEventListener("resize", publish);
  }, []);

  return (
    <header className="app-header" ref={headerRef}>
      <div className="header-inner">
        {/* Left: the language flag, then search on the map or a way back to the map elsewhere.
            The flag is first on every page, so it never moves. */}
        <div className="header-search">
          <LanguagePicker />
          {p.showSearch ? (
            <div className="search-wrap">
              <svg viewBox="0 0 24 24" className="icon" aria-hidden="true">
                <path
                  d="M15.5 14h-.79l-.28-.27A6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79L20 21.5 21.5 20zM9.5 14A4.5 4.5 0 1 1 14 9.5 4.505 4.505 0 0 1 9.5 14z"
                  fill="currentColor"
                />
              </svg>
              <input
                type="text"
                placeholder={t("header.search")}
                value={p.searchTerm}
                onChange={(e) => p.onSearchChange(e.target.value)}
              />
              {p.searchScope && (
                <div className="search-scope" data-testid="search-scope" role="status">
                  <span>
                    {t("header.searchScope", { on: p.searchScope.on, of: p.searchScope.of })}
                  </span>
                  <button type="button" data-testid="search-all" onClick={p.onSearchAll}>
                    {t("header.searchAll")}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              className="header-nav-btn"
              onClick={p.onBackToMap}
              style={{ gap: 5 }}
              aria-label={t("header.backToMap")}
            >
              <Icon size={13} strokeWidth={2.5}>
                <path d="M19 12H5M12 5l-7 7 7 7" />
              </Icon>
              <span className="nav-btn-label">{t("header.map")}</span>
            </button>
          )}
        </div>

        {/* Centre: the brand, which also goes back to the map */}
        <div
          className="brand"
          style={{ cursor: "pointer" }}
          onClick={p.onBackToMap}
          title="Louisville Food Safe — back to map"
        >
          <span className="brand-louisville">LOUISVILLE</span>
          <span className="brand-food">FOOD</span>
          <span className="brand-safe">SAFE</span>
        </div>

        {/* Right: Learn, Feedback, and Saved (signed in) or Log in */}
        <div className="header-actions">
          <button
            className={`header-nav-btn${p.page === "learn" ? " active" : ""}`}
            onClick={p.onOpenLearn}
            aria-label={t("header.learn")}
          >
            <Icon>
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
            </Icon>
            <span className="nav-btn-label learn-label">{t("header.learn")}</span>
          </button>
          {/* Phones hide the text labels, so each button carries its name itself. */}
          <button
            className="header-nav-btn"
            onClick={p.onOpenFeedback}
            aria-label={t("header.feedback")}
          >
            <Icon>
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </Icon>
            <span className="nav-btn-label">{t("header.feedback")}</span>
          </button>
          {p.user ? (
            <button
              className={`header-nav-btn header-nav-btn--account${p.accountActive ? " active" : ""}`}
              onClick={p.onToggleAccount}
              title={p.user.email}
              aria-label={t("header.saved")}
            >
              {/* The account's initial is decoration: the button's name is "Saved". It is
                  drawn by CSS (.acct-initial::before), so it isn't part of the button's text,
                  which must match its name (WCAG 2.5.3). */}
              <span
                aria-hidden="true"
                className="acct-initial"
                data-initial={(p.user.email || "?")[0].toUpperCase()}
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  background: "rgba(52,168,83,0.30)",
                  border: "1.5px solid rgba(52,168,83,0.55)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: ".65rem",
                  fontWeight: 800,
                  flexShrink: 0,
                }}
              />
              <span className="nav-btn-label">{t("header.saved")}</span>
            </button>
          ) : (
            <button
              className="header-nav-btn header-nav-btn--login"
              onClick={p.onLogIn}
              aria-label={t("header.logIn")}
            >
              <Icon>
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </Icon>
              <span className="nav-btn-label">{t("header.logIn")}</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

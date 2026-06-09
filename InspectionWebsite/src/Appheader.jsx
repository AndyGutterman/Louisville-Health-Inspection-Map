/**
 * AppHeader.jsx
 *
 * Extracted header / nav bar for Louisville Food Safe.
 * Self-contained owns no state, receives everything via props.
 *
 * Props:
 *   page          "map" | "learn"
 *   onSetPage     (page: string) => void
 *   searchTerm    string
 *   onSearch      (term: string) => void
 *   onLoginClick  () => void
 *
 * Future pages will need a new entry in NAV_ITEMS and a matching
 * case in Map.jsx's render block.
 */
import React from "react";

const SearchIcon = () => (
  <svg viewBox="0 0 24 24" className="icon" aria-hidden="true" width="16" height="16">
    <path
      d="M15.5 14h-.79l-.28-.27A6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79L20 21.5 21.5 20zM9.5 14A4.5 4.5 0 1 1 14 9.5 4.505 4.505 0 0 1 9.5 14z"
      fill="currentColor"
    />
  </svg>
);

const UserIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"
    strokeLinejoin="round" aria-hidden="true">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>
);

// to add future nav items here ─────────────────────────────────────────────
const NAV_ITEMS = [
  { id: "map",   label: "Map"   },
  { id: "learn", label: "Learn" },
];

export default function AppHeader({ page, onSetPage, searchTerm, onSearch, onLoginClick }) {
  const isMap = page === "map";

  return (
    <header className="app-header">
      <div className="header-inner">

        {/*  LEFT: search box (dimmed + disabled when not on map)  */}
        <div className={`header-search${isMap ? "" : " header-search--dim"}`}>
          <div className="search-wrap">
            <SearchIcon />
            <input
              type="text"
              placeholder="Search map"
              value={searchTerm}
              onChange={(e) => onSearch(e.target.value)}
              disabled={!isMap}
              tabIndex={isMap ? 0 : -1}
              aria-label="Search map"
            />
          </div>
        </div>

        {/*  CENTRE: brand always visible, click → map  */}
        <div
          className="brand"
          style={{ cursor: "pointer" }}
          onClick={() => onSetPage("map")}
          role="link"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter") onSetPage("map"); }}
          title="Louisville Food Safe back to map"
          aria-label="Louisville Food Safe, go to map"
        >
          <span className="brand-louisville">LOUISVILLE</span>
          <span className="brand-food">FOOD</span>
          <span className="brand-safe">SAFE</span>
        </div>

        {/*  RIGHT: nav tabs + login always visible  */}
        <div className="header-actions">
          {NAV_ITEMS.map(({ id, label }) => (
            <button
              key={id}
              className={`header-nav-btn${page === id ? " active" : ""}`}
              onClick={() => onSetPage(id)}
              aria-current={page === id ? "page" : undefined}
            >
              {label}
            </button>
          ))}
          {/* TODO make login button behavior same on learn page as it is on map screen, make it function as an overlay actually */}
          <button
            className="header-nav-btn header-nav-btn--login"
            onClick={onLoginClick}
            aria-label="Log in"
          >
            <UserIcon />
            <span className="nav-btn-label">Log in</span>
          </button>
        </div>

      </div>
    </header>
  );
}
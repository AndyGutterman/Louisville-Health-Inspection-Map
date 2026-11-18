// The privacy page's facts that other files need (features/privacy/PrivacyPage.jsx).
// The day the page's wording was last checked against the code (ISO). Move it when the page changes.
export const PRIVACY_UPDATED = "2026-11-19";

/** The date above in the visitor's language, e.g. "November 19, 2026" / "19 de noviembre de 2026". */
export function privacyUpdatedText(locale = "en-US", iso = PRIVACY_UPDATED) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

// Opens the page from anywhere (lib/deepLink.js). Forms link to it in a new tab, so a
// half-filled form isn't lost.
export const PRIVACY_PATH = "/?page=privacy";

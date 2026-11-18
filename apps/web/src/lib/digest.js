// The weekly digest email subscription: profiles.alert_frequency is 'weekly' or 'off'
// (migration 20261116000000). The sign-in form's checkbox is remembered here until the
// account exists, then AuthContext applies it. Pure apart from the storage passed in.

const KEY = "lfs_digest_optin";

export const WEEKLY = "weekly";
export const OFF = "off";

export const isSubscribed = (profile) => profile?.alert_frequency === WEEKLY;

// Remember the checkbox while the sign-in email is on its way.
export function rememberDigestOptIn(wanted, storage = globalThis.localStorage) {
  try {
    if (wanted) storage.setItem(KEY, "1");
    else storage.removeItem(KEY);
  } catch {
    /* private mode: the account toggle still works */
  }
}

// True once, the first time it's asked after a remembered opt-in.
export function takeDigestOptIn(storage = globalThis.localStorage) {
  try {
    const wanted = storage.getItem(KEY) === "1";
    storage.removeItem(KEY);
    return wanted;
  } catch {
    return false;
  }
}

// ── The language of the weekly email (profiles.language, migration 20261129000000) ─────

const SIGNUP_LANGUAGE_KEY = "lfs_signup_lang";
const OFFERED_KEY = "lfs_digest_lang_offered";
const NEW_ACCOUNT_MS = 15 * 60 * 1000;

// The site's language when the sign-in email was asked for, kept until the account exists.
export function rememberSignupLanguage(lang, storage = globalThis.localStorage) {
  try {
    storage.setItem(SIGNUP_LANGUAGE_KEY, lang);
  } catch {
    /* private mode: the account keeps English, and the offer can change it */
  }
}

// The remembered language, once; null when there is none.
export function takeSignupLanguage(storage = globalThis.localStorage) {
  try {
    const lang = storage.getItem(SIGNUP_LANGUAGE_KEY);
    storage.removeItem(SIGNUP_LANGUAGE_KEY);
    return lang || null;
  } catch {
    return null;
  }
}

// An account made in the last few minutes: only these take the sign-up language. Someone
// who already had an account keeps their email's language until they say otherwise.
export const isNewAccount = (user, now = Date.now()) => {
  const made = Date.parse(user?.created_at ?? "");
  return Number.isFinite(made) && now - made < NEW_ACCOUNT_MS;
};

/**
 * Whether to offer the weekly email in the site's language: only to a signed-in
 * subscriber whose email is in another language. After "switched" (they just changed the
 * site's language) it is offered once per language; the Saved panel shows it any time
 * (`always`).
 * @param {{subscribed: boolean, digestLanguage: string|null, siteLanguage: string,
 *   offeredFor?: string|null, always?: boolean}} o
 */
export function shouldOfferLanguage({
  subscribed,
  digestLanguage,
  siteLanguage,
  offeredFor = null,
  always = false,
}) {
  if (!subscribed || !digestLanguage || digestLanguage === siteLanguage) return false;
  return always || offeredFor !== siteLanguage;
}

export const offeredLanguage = (storage = globalThis.localStorage) => {
  try {
    return storage.getItem(OFFERED_KEY);
  } catch {
    return null;
  }
};
export const markOffered = (lang, storage = globalThis.localStorage) => {
  try {
    storage.setItem(OFFERED_KEY, lang);
  } catch {
    /* it may be offered again: harmless */
  }
};

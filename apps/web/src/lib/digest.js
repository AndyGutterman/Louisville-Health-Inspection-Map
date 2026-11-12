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

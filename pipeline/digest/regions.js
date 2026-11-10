// County names for the email. apps/web/src/lib/regions.js is the site's registry; the
// pipeline keeps this short copy because the website package isn't importable from here.
const NAMES = { jefferson: "Jefferson County", bullitt: "Bullitt County" };
export const regionName = (id) => NAMES[id] ?? id;

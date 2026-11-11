// The one-time sign-in code from the email. Supabase sends 6 digits by default (the
// project can be set to send up to 10), so accept 6 to 10 and ignore spaces or dashes
// that come along when the code is pasted.

/** Keeps only the digits of what was typed or pasted, at most 10. */
export const cleanCode = (raw) =>
  String(raw ?? "")
    .replace(/\D/g, "")
    .slice(0, 10);

/** True once the code is long enough to send for checking. */
export const isCompleteCode = (code) => /^\d{6,10}$/.test(code);

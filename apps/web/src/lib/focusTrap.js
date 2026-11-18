// Keeps Tab inside a dialog (WCAG 2.4.3). Pure: the DOM side is hooks/useDialogFocus.js.

export const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Where Tab (or Shift+Tab) should go from `active`, when it would leave the dialog: the
 * first item after the last (Tab), or the last before the first (Shift+Tab). null when
 * the browser's own move stays inside, so it should be left alone.
 * @param {Array} items   the dialog's focusable elements, in order
 * @param {*} active      the focused element
 * @param {boolean} shift
 */
export function wrapTarget(items, active, shift) {
  if (!items.length) return null;
  const first = items[0];
  const last = items[items.length - 1];
  const at = items.indexOf(active);
  if (shift) return at <= 0 ? last : null; // on the first, or not inside at all
  return at === -1 || active === last ? first : null;
}

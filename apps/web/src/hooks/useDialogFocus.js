// Focus for a modal dialog (WCAG 2.4.3, 2.1.2): on open, focus moves into it (to the field
// that asks for focus, else its first control, else the dialog itself); Tab stays inside;
// Escape closes it; and on close, focus goes back to what opened it.
import { useEffect, useState } from "react";
import { FOCUSABLE, wrapTarget } from "../lib/focusTrap.js";

/**
 * @param {{current: HTMLElement|null}} ref  the dialog's box
 * @param {() => void} onClose
 */
export function useDialogFocus(ref, onClose) {
  // Read while the dialog first renders: a field with autoFocus takes focus before effects run.
  const [opener] = useState(() => document.activeElement);
  useEffect(() => {
    const box = ref.current;
    const items = () =>
      [...(box?.querySelectorAll(FOCUSABLE) ?? [])].filter(
        (el) => !el.hidden && el.tabIndex >= 0 && !el.closest("[aria-hidden=true]"),
      );
    if (box && !box.contains(document.activeElement)) {
      (box.querySelector("[data-autofocus]") ?? items()[0] ?? box).focus({ preventScroll: true });
    }

    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      } else if (e.key === "Tab" && box) {
        const target = wrapTarget(items(), document.activeElement, e.shiftKey);
        if (target) {
          e.preventDefault();
          target.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      // Back to what opened it, unless that has gone (or focus is already somewhere real).
      if (opener instanceof HTMLElement && document.contains(opener)) opener.focus();
    };
    // onClose is read when a key is pressed; a new function each render shouldn't reopen the
    // dialog's focus handling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, opener]);
}

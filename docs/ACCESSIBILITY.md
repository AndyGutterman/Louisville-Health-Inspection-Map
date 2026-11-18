# Accessibility

The goal is WCAG 2.2 level AA (issue #8).

## Checked automatically

`apps/web/e2e/a11y.spec.js` runs [axe-core](https://github.com/dequelabs/axe-core) on every
main view, on a desktop and a phone screen, in every pull request's e2e run: the map, the
open filter card, What's New, the info drawer, Table View, the sign-in and feedback forms,
the Learn page, the privacy page, and the Saved panel signed in. Any WCAG A or AA
violation fails the test, with the element and (for contrast) the colours it found.
`A11Y_ALL=1 npm run e2e` lists every failing element instead of the first of each kind.

One exemption: the neon "LOUISVILLE FOOD SAFE" header is the site's logo, and WCAG 1.4.3
exempts text that is part of a logo from the contrast minimum. Every other check still
covers it.

## Rules the code follows

- **Muted text** on the dark panels is at least 55% white (`rgba(255, 255, 255, 0.55)` or
  more), about 5.5:1. Lower values looked fine and failed 4.5:1.
- **Score badges with white numbers** use a darker green (`#188038`) and red (`#d93025`)
  than the map pins. The pins are graphics and only need 3:1; text needs 4.5:1.
- **A button's visible words are part of its name** (2.5.3). An icon-only button on phones
  carries `aria-label`; decoration inside a button is drawn with CSS, not text.
- **No controls inside a control.** A clickable card that holds buttons is not itself a
  `role="button"`; it gets a real button for the keyboard (the drawer's "More info").
- **Anything clickable is reachable with Tab** and opens with Enter (Table View rows, What's
  New rows, Saved rows), with a visible focus outline: the table's and Saved's are a light
  blue (`#8ab4f8`, over 3:1 on the panels, 1.4.11); What's New uses the browser's own.

## Keyboard path to a place

Map pins are drawn on a canvas, so the keyboard can't step through them. Every place is
reachable another way: the search box, Table View (each row opens the drawer), What's New,
and Saved.

## Not checked yet

To do by hand, from WCAG's quick reference: zoom to 200% and a 320px-wide window without
losing content (1.4.4, 1.4.10), `prefers-reduced-motion` for the drawer and panel
animations (2.3.3), focus moving into and back out of the dialogs (2.4.3), and tap targets
of at least 24px (2.5.8).

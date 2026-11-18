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

## Checked by the e2e suite too (part 2)

`apps/web/e2e/a11y-part2.spec.js`, on a desktop and a phone screen, in every pull request:

- **Reflow (1.4.10) and 200% zoom (1.4.4):** every main view (the map, the open filter card,
  What's New, the drawer, the sign-in and feedback forms, the Learn and privacy pages) at
  320 x 640 and at 640 x 360 (a 1280px window zoomed to 200%) has no sideways scrolling and
  nothing past the right edge. Table View is left out: WCAG allows a data table to scroll in
  two directions. At 320px the name in the header shrinks to fit and the filter card's toggles
  wrap onto a second line.
- **Reduced motion (2.3.3):** with `prefers-reduced-motion: reduce`, no element has a
  transition or animation longer than a hundredth of a second (one rule in `index.css`), and
  the map's own camera moves and smooth scrolling are skipped (`lib/motion.js`: `cameraOptions`,
  `scrollBehavior`). A second test checks the site does animate without the setting, so the
  first one means something.
- **Focus in and out of dialogs (2.4.3, 2.1.2):** the sign-in and feedback dialogs
  (`hooks/useDialogFocus.js`) take focus when they open (the feedback form's first field, the
  sign-in form's email box), keep Tab and Shift+Tab inside, close on Escape, and give focus back
  to the button that opened them. The sign-in form is a `role="dialog"` named by its title.
- **Tap targets (2.5.8):** every button, link, field and switch on those views, and the Saved
  panel and Table View, is at least 24 x 24 CSS pixels. Exempt, as in WCAG: links inside a
  sentence, the checkbox inside a label (the label is the target), and MapLibre's credit links.
  The score switches are 40 x 24 (they were 36 x 20).

## Not checked yet

By hand only: the Table View's two-direction scrolling at 320px (allowed, but worth looking
at on a real phone), the drawer's bottom sheet with a screen reader (its drag handle is
pointer-only; the "Close" button is the keyboard path), and the dialogs' focus with a screen
reader (a real VoiceOver or TalkBack pass). The info drawer and the Saved panel are panels,
not modal dialogs, so they don't trap focus.

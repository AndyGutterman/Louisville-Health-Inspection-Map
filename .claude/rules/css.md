---
paths:
  - "apps/web/src/**/*.css"
  - "apps/web/index.html"
---

# CSS

- **Global CSS leaks into inline-styled elements.** `index.css` has a global `button` rule (padding, background). Inline-styled buttons must set `padding: 0` and sizing explicitly. A selector like `.info-drawer [style]` once forced padding onto every inline-styled element in the drawer and broke the bookmark button; never use broad `[style]` selectors (the `no-broad-style-selectors` rule catches it).
- **`!important` beats inline styles.** Check CSS files before debugging layout in JSX.
- Component CSS goes in `src/styles/<Component>.css`, imported by the component. No CSS inside JS template strings.
- **Map popups** sit under every panel: `.map-container` has `z-index: 0`, so it is its own stacking context.
- **Contrast** (WCAG 2.2 AA, `docs/ACCESSIBILITY.md`): muted text is at least 55% white; white text on a score colour uses the darker badge shades. Layouts reflow at 320px, tap targets are at least 24px, and motion respects `prefers-reduced-motion` (`e2e/a11y-part2.spec.js` checks all three).

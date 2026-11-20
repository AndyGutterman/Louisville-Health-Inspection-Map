---
paths:
  - "**/*.test.{js,jsx,mjs}"
  - "apps/web/e2e/**"
  - "pipeline/tests/**"
  - "packages/core/tests/**"
---

# Tests

- **Where:** website tests sit beside the file (`foo.js` + `foo.test.js`). Pipeline tests live in `pipeline/tests/`, core tests in `packages/core/tests/` (both `node --test`). Keep that split.
- **Component tests** (`Foo.test.jsx` beside `Foo.jsx`): first line `// @vitest-environment jsdom`, Testing Library, and `vi.mock` the component's `api/` module so nothing reaches Supabase. Example: `WhatsNew.test.jsx`.
- **A bug fix starts with a test that fails** without the fix. A test that passes either way is not a test of the change.
- **e2e** (`apps/web/e2e/`, Playwright, desktop and phone):
  - Select by role or `data-testid`, never by canvas pins.
  - Data comes from `apps/web/e2e/support/fixtures.js` (Supabase is mocked). A new Supabase call needs a fixture entry, or the load test fails on purpose.
  - `openApp(page, { counties: [...] })` starts with counties switched on; `openApp` starts with every category on, `categories: null` gives a first visit; `answers: { "rpc/is_admin": true }` plus `mockAuth`/`signIn` for the admin page.
  - A change to the map, drawer, filters or What's New adds or updates a test in `smoke.spec.js`. A new view gets a line in `a11y.spec.js` (axe, in English and Spanish).
  - Screenshots land in `apps/web/e2e/screenshots/` as JPEGs; read the ones for views you changed.
  - `apps/web/e2e/admin.spec.js` "taking them off the digest is one tap" has flaked on the phone project under a full run. Report a flake; never skip it.
- **Fixtures are byte for byte:** running Prettier from inside `pipeline/` once reformatted `pipeline/tests/fixtures/kyportal_oldham.html` and broke 13 tests. Run `npm run format` from the repo root only.

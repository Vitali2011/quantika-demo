# Test Assumptions — Phase 2a (Test Author — Sentry Wiring)

## Sentry Wiring

1. **@testing-library/react unavailable**: `node_modules/@testing-library/react` is absent
   in this environment. Full component rendering tests (C2 captureException via DOM) are
   simulated by mocking `react.useEffect` directly and invoking the component as a plain
   function. The impl agent must verify the real useEffect+captureException wiring works
   in a jsdom environment or browser.

2. **testEnvironment is 'node'**: Jest is configured with `testEnvironment: 'node'`, not
   jsdom. JSX components cannot be fully mounted. Tests for `global-error.tsx` and
   `error.tsx` are limited to module-export and structural checks. React hooks such as
   `useEffect` are mocked using `jest.doMock('react', ...)` to simulate their execution
   within the Node environment.

3. **instrumentation-client.ts is a module with side effects at import time**: The spec
   requires that `Sentry.init` is called (or not called) during the module load phase,
   not via an exported function. Tests use `jest.resetModules()` + `jest.doMock()` +
   dynamic `import()` to re-execute the module in a fresh registry for each test case.
   If impl wraps the init call in an exported function instead of top-level code, the
   tests will fail and the contract must be renegotiated.

4. **sentry.server.config.ts follows the same module-level side-effect pattern**: The
   existing server config file is expected to call `Sentry.init` at the top level
   (not inside a function export), consistent with how @sentry/nextjs configurations
   are typically structured and consistent with the spec's description of the existing
   files.

5. **Empty string for NEXT_PUBLIC_SENTRY_DSN must suppress Sentry.init**: In Next.js,
   `NEXT_PUBLIC_*` vars are inlined at build time. In a Jest/Node context,
   `process.env.NEXT_PUBLIC_SENTRY_DSN = ""` is a valid falsy assignment. The guard in
   `instrumentation-client.ts` must use a falsy check (`if (!dsn)`) rather than a strict
   `=== undefined` check.

6. **React mock isolation**: Each test in the global-error/error suites calls
   `jest.resetModules()` (via `beforeEach`) and `jest.doMock('react', ...)`. This is
   necessary because `next/jest` may pre-load React. Any React internals that depend on
   module singletons (context, hooks registry) are not exercised in these tests.

---

# Previous Phase Assumptions

## Upgrade Page

1. **Static tier data, no backend call**: The three tiers (Free/Pro/Enterprise) are rendered
   from a static in-module array or constant — no `fetch()`, no API route. Tests do not mock
   any network requests. If the implementation fetches from an API, the matches-page empty-state
   test will still pass (DEMO_MATCHES would be empty), but upgrade tests will require network
   mocking.

2. **"Contact Sales" is the sole primary CTA**: The spec lists one CTA button linking to
   `mailto:sales@quantika.org`. Tests use `getByRole('link', { name: /contact sales/i })` and
   assert a single element. If the implementation renders multiple "Contact Sales" links (e.g.,
   one per tier card), `getByRole` will throw "found multiple". The test will need `getAllByRole`
   and assertions on each element.

3. **`sm:` breakpoint classes live on a wrapper element**: Mobile-responsiveness is implemented
   via a Tailwind grid with `grid-cols-1 sm:grid-cols-3` (or similar) on a containing `<div>`.
   The test scans all `[class]` elements for any `sm:` prefix. If responsiveness is achieved
   purely via CSS media queries in a separate `.css` file (no Tailwind utility classes in JSX),
   test 6 will fail even though the page IS responsive — this assumption would need revisiting.

## Matches Page

4. **Empty state is rendered when DEMO_MATCHES is empty or has no items visible in jsdom**:
   The spec says the page uses a static `DEMO_MATCHES` array. The test assumes this array is
   empty (length 0) in the default export, so the empty-state branch ("No matches yet") renders.
   If DEMO_MATCHES contains pre-populated demo data, test 2 and test 3 will fail because the
   empty state block won't render. The implementation must either export an empty DEMO_MATCHES
   or gate the empty state on `DEMO_MATCHES.length === 0`.

5. **`/request` route exists and is in-app navigation (Next.js Link)**: The CTA links to
   `/request` via `<Link href="/request">`. The mock replaces `next/link` with a plain `<a>`,
   so the test asserts `href="/request"` on the anchor. If the CTA uses a `<button>` with a
   router.push() instead of a Link, `getByRole('link')` will return nothing and tests 3 will
   fail — the implementation must use `<Link>` (or `<a>`) for the CTA.

## Spec Ambiguities Noted

- **Matches page with data**: The spec says "When data present: list of matches (vessel, route,
  score, date)" but the Phase 2a scope only tests the empty state. Tests for the populated state
  (rendering vessel/route/score/date rows) are deferred; they require either a test data fixture
  or a way to inject DEMO_MATCHES. This is intentional — no tests are written for the populated
  state in this phase to keep the RED surface minimal.

- **Free tier vs Pro CTA**: Only Enterprise/Pro tiers would logically have a "Contact Sales" CTA
  in a real product. The spec lists one global CTA. This is assumed to be a page-level button,
  not per-card. If the design puts "Contact Sales" only on the Enterprise card, the test still
  passes as long as exactly one matching link exists.

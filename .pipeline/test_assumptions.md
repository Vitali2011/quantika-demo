# Test Assumptions — Phase 2a (Test Author)

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

# Test Assumptions — Phase 2a (Test Author — Coverage Backfill)

## Coverage Backfill (10 API route test files, 38 tests)

1. **demo-scenarios fixture IDs are full slugs, not short numeric codes**: The spec said valid IDs are '01', '05', '08', '11', '15'. The actual JSON fixture files embed full slug IDs like `01-karasu-mykolaiv-idle` and `05-ru-flag-mykolaiv-sanctioned`. Verified by reading both the loader and JSON files directly. Tests use the actual slugs.

2. **economics route cache isolation via jest.doMock after resetModules**: The economics route holds an in-process `Map` cache keyed by route+date. After `jest.resetModules()`, re-importing creates a fresh Map. Tests use `jest.doMock()` per-test after `resetModules` to ensure both CSRF and computeEconomics mocks are fresh — avoiding stale mock references from top-level `jest.mock()` hoisting.

3. **audit uses checkCsrfRequest, economics uses validateCsrf**: Both exports from `@/lib/csrf` but different functions. Confirmed by reading each route's import. Tests mock the correct function for each endpoint.

4. **port-da repository uses getDatabase() not getDb()**: Confirmed by reading `lib/port-da/repository.ts`. The session-store mock must expose `getDatabase` (not `getDb` as the upload-csv route uses). Tests set up the mock accordingly.

5. **DELETE /api/session is always-200, no auth required**: Design intent: best-effort cookie cleanup. If no session_id cookie is present, deleteSession is not called but 200 is still returned. Tests verify both paths.

6. **admin/upload-csv already had comprehensive coverage**: The file `__tests__/api/admin/market/upload-csv.test.ts` existed with 16 tests covering all boundary classes before this phase. Not re-created. Counted as already-covered for the 11-route list.

---

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

---

# Phase 2a — Matches M1 Assumptions

1. **POST /api/matches assigns score/reason defaults**: The spec says POST accepts only
   `cargo_id` and `vessel_id`. The test assumes the implementation assigns a sensible default
   score (e.g., 0 or 50) and an empty-object reason (`"{}"`) when creating a match via the
   API. If the route requires score/reason in the body as well, the POST happy-path test must
   be updated to include those fields.

2. **Empty string cargo_id/vessel_id is rejected by POST validation (400)**: The spec says
   "missing cargo_id or vessel_id → 400" but does not address empty-string values explicitly.
   Tests assume that `""` is semantically equivalent to "missing" and should also return 400.
   If the impl accepts empty strings, two tests in the POST suite will fail and the spec should
   be revisited.

3. **updateMatchStatus throws an Error whose message contains "Invalid transition"**: The spec
   says 'Throws error (with message "Invalid transition")'. Tests use `.toThrow(/Invalid
transition/i)`. If the implementation throws a different error subclass (e.g., a custom
   `TransitionError`) whose `.message` doesn't contain that phrase, 8 repository transition
   tests will fail — the contract should be clarified.

4. **timestamps (created_at, updated_at) are Unix milliseconds (INTEGER)**: The schema shows
   `created_at INTEGER NOT NULL`. Tests insert `Date.now()` (milliseconds) and assert that
   `typeof created_at === 'number'`. If the implementation stores epoch seconds (UNIX_TIMESTAMP)
   or ISO strings, timestamp assertions will need adjustment.

5. **MatchesClient.tsx receives initial matches as a prop named `initialMatches` or `matches`**:
   The spec says "server fetch" in page.tsx and "optimistic update" in MatchesClient. Tests
   assume the server component fetches matches and passes them as a prop. If the client
   component fetches independently via useEffect, the page.tsx assertion
   `MatchesClient.*matches` will fail and the prop-passing contract must be renegotiated.

6. **Status filter in MatchesClient is a client-side filter over the initial prop data**:
   Tests assert state management (`useState`) for the filter. If the implementation triggers
   a server roundtrip (e.g., router.push with ?status= query) for filtering instead of local
   state filtering, the `useState.*status` regex test will fail.

7. **migration032 has `name: "matches"` (exactly that string)**: The test asserts
   `migration032.name === 'matches'`. Some migrations in this codebase use hyphenated names
   (e.g., "email-cache"). If the impl uses "032-matches" or another variation, that test fails.

## Spec Ambiguities Flagged — M1

- **POST body: score and reason fields unspecified**: The spec's POST contract only lists
  `cargo_id` and `vessel_id` as required body fields. It does not specify how score and reason
  are populated. Tests assume API-assigned defaults (not client-supplied).

- **GET response envelope**: The spec shows `{ matches: StoredMatch[] }` as the response shape.
  Tests assert this exact envelope. Any additional wrapper fields (e.g., `total`, `pagination`)
  are not tested but would not break these tests as long as `matches` key is present.

- **archived → saved is the only valid transition out of archived**: The spec lists
  `archived → saved` but does not explicitly state that `archived → dismissed` is invalid
  until the invalid-transitions list. Tests cover both the explicit valid and all explicit
  invalid transitions from the spec.

---

# Phase 2a — Matches M3 Backend Assumptions

1. **Empty ids array in bulk endpoints is rejected with 400**: The spec does not define
   behavior for an empty `ids` array in PATCH or DELETE bulk. Tests assume `{ ids: [] }`
   is rejected with 400 (a no-op bulk action is likely a client mistake). If the
   implementation treats it as a valid no-op returning 200 with `updated: []` or
   `deleted: []`, two tests must be updated to use `expect(res.status).toBe(200)`.

2. **Negative score_min is treated as 0 (applies no effective filter)**: The spec says
   `score >= score_min` but does not specify how to handle negative values. Tests assume
   negative score_min is silently clamped to 0, so all rows qualify. If the impl rejects
   negative score_min with 400, tests in the repository and API filter suites must be
   updated accordingly.

3. **PATCH /api/matches/bulk rejects 'shortlist' as target status with 400**: The spec
   states valid body statuses are `saved|dismissed|archived`. Tests assume 'shortlist'
   as a target is invalid (400), consistent with the spec's enumeration. If the impl
   accepts any valid MatchStatus including 'shortlist' as a target (and validates
   transitions individually), this specific test needs revision.

4. **Laycan filter uses range-overlap semantics (not containment)**: The spec states
   `laycan_start <= laycan_to AND laycan_end >= laycan_from`. Tests encode this as
   "the match's laycan window overlaps with the query window" — a match starting before
   the query window but ending within it IS included. Rows with null laycan_start or
   laycan_end are excluded when any laycan filter is active.

5. **Route filter searches load_port OR discharge_port with LIKE '%route%'**: The spec
   explicitly states this. Tests verify both fields independently and case-insensitively.
   The assumption is that SQLite LIKE is used (case-insensitive by default for ASCII).
   If non-ASCII port names are used, LOWER() wrapping may be needed.

6. **DELETE /api/matches/bulk uses requireAdmin mock, not real X-Admin-Token header
   matching**: Tests mock `requireAdmin` directly at the module level. The mock returns
   null (allowed) by default and returns 401/500 responses when configured. This means
   tests verify that the route handler correctly passes the result of `requireAdmin` to
   the caller — they do NOT test that `requireAdmin` itself reads the header correctly
   (that is covered by `lib/auth/admin.ts` unit tests elsewhere).

7. **PATCH /api/matches/bulk accepts `saved|dismissed|archived` as valid target statuses
   only**: The spec body definition says `status: 'saved'|'dismissed'|'archived'`. Tests
   verify that 'shortlist' and non-enum values like 'pending' or 'save' are rejected with 400. If the spec is amended to allow 'shortlist' as a bulk target (e.g., to un-shortlist
   matching), tests Class 6 assertions will need revision.

---

# Phase 2a — Matches M3 UI Assumptions

1. **Score breakdown state persisted in component-level useState (not URL or localStorage)**:
   The spec says either URL `?breakdown=<id>` or localStorage is acceptable. Tests assert
   a state variable named `expandedBreakdown` (or similar) exists at the component level.
   Assumption: the impl agent uses `useState` for this. If the impl uses URL params instead,
   tests for `expandedBreakdown` will fail and the contract is still met via the URL state
   assertions (which also cover this indirectly). The impl agent should document the actual
   choice in a comment in MatchesClient.tsx.

2. **Bulk checkbox visibility is always-visible (not hidden until another is selected)**:
   The spec says "hidden when no other checkboxes selected OR always visible — document
   choice". Tests assert `type="checkbox"` appears in the source without conditional hide
   logic. If the impl hides checkboxes behind a hover/first-selection interaction, the
   checkbox tests still pass (the `type="checkbox"` attribute must appear in the JSX
   regardless of visibility logic). The impl agent must document the choice.

3. **Delete (admin) button is always rendered but disabled without admin token**:
   The spec says "visible but disabled unless user has provided admin token OR always
   visible". Tests only verify the button text "Delete" and the word "admin" appear; they
   do not assert `disabled` attribute or token-checking logic. If the impl conditionally
   renders Delete only when an admin token is present, the test will fail when no token is
   in state (because the Delete text won't appear). The impl must always render the button.

4. **Filter API call is triggered after "Apply" click, not on each keystroke**:
   The spec says filter changes trigger an API call to `/api/matches?<filter_params>`.
   Tests assert that `/api/matches?` or `/api/matches${` appears in the source. This does
   not mandate debouncing or immediate-change behavior. The impl agent may choose either
   pattern (Apply-button-triggered or debounced-input-triggered) — tests only verify the
   URL pattern exists in the source.

5. **"Archive All when N > 5" confirm check uses `> 5`, not `>= 5` or `> 4`**:
   The spec says "when N > 5". Tests assert the literal `> 5` pattern in source. If the
   impl uses `>= 6` (equivalent but not literally `> 5`), the source-level regex will
   fail. The impl should use `> 5` explicitly.

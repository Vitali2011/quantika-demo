# RSC Boundary, Client-Bundle & Hydration Audit — 2026-05-28

| | |
|---|---|
| **Scope** | `app/**`, `components/**`, `lib/**` — all `.tsx`/`.ts` in the App Router |
| **App** | Next.js 16.2 / React 19.2 (App Router) |
| **Inventory** | 738 source files; **71** carry `'use client'`; **187** nondeterministic-value sites across 93 files |
| **Method** | Read-only multi-agent workflow: 10 client-file clusters analyzed → every finding adversarially re-verified (try-to-refute) → 12 render-path hydration files swept → 4 large boundaries analyzed for push-down. 44 agents. |
| **Result** | **18 candidate findings → 15 confirmed, 3 refuted.** Plus 4 boundary push-down analyses. |
| **Mode** | READ-ONLY. No source files modified. |

---

## TL;DR

1. **One fix dominates everything: `posthog-js` is statically imported at module top of `lib/analytics.ts`.** With **zero code-splitting in the entire repo** (no `next/dynamic`, no `React.lazy` anywhere), that ~55 KB-gzipped SDK ships **eagerly** in the critical bundle of **7+ routes** (`/dashboard`, `/vessel/[id]`, `/fixture/[id]`, `/cargo/[id]`, `/match/[id]` via `AnalyticsTracker`, plus `/processing` and the landing page). Converting that single import to a deferred `import('posthog-js')` inside `initAnalytics`/`track` (both only ever called in `useEffect`/handlers) removes it from every one of those bundles — **behavior-preserving, ~1-line change, ~55 KB recovered.**
2. **8 components carry `'use client'` but have no client features at all** (pure presentational renders). 3 of them (`DashboardKpiStrip`, `MarketIntelligence`, `clickable-field`) sit under *server* parents → immediate bundle win. The other 5 sit under client parents today → win is unlocked by the boundary push-downs below.
3. **Hydration is mostly handled well** — the `#543` `clientNow=0` + `suppressHydrationWarning` pattern is correctly applied in `MatchesClient`, `market/page`, `SubsCountdown`, `SubsCountdownWidget`, and `toLocaleString` is almost always pinned to `'en-US'`+`timeZone:'UTC'`. **One real latent bug remains:** `lib/utils/fmt-laycan.ts` formats a date **without a timezone**, rendered directly in the SSR'd matches table → off-by-one-day mismatch near midnight (same class as `#543`).
4. **Architecture is fundamentally sound:** `matches`/`cargo`/`vessels` already fetch data in *server* `page.tsx` and pass it to client islands. The boundaries are *justified but placed too high* — push-downs are maintainability/altitude wins more than large KB wins (except `/market`, which fetches client-side).

**Estimated total removable from eager client bundles: ≈ 76 KB gzipped — of which ~55 KB (72%) is the single `posthog-js` deferral (high-confidence, low-effort); the remaining ~21 KB is contingent on the boundary/leaf refactors.**

---

## Top 10 by bundle impact

| # | Issue | File(s) | Group | Est. KB (gz) | Effort | Confidence |
|---|---|---|---|---:|---|---|
| 1 | `posthog-js` eager top-level import → ships on 7+ routes | `lib/analytics.ts` (via `lib/analytics-tracker.tsx`, `app/processing/page.tsx`, `LandingPageClient.tsx`, `EmailUploadCTA.tsx`) | D | **~55** | low | high |
| 2 | `/market` route is fully client; fetches client-side + drags 3 static sections | `app/market/page.tsx` (+ `RoutesSection`/`FixturesSection`/`KnowledgeFeed`) | B | **~9** | med | high |
| 3 | `CargoClient` presentational leaves shippable as Server Components | `app/cargo/CargoClient.tsx` | B | **~4** | med | high |
| 4 | `VesselsClient` static shell + chrome shippable to server | `app/vessels/VesselsClient.tsx` | B | **~3** | med | high |
| 5 | `CharterersTable` — pure render, `'use client'` redundant | `components/charterers/CharterersTable.tsx` | A | **~2.6** | low | high |
| 6 | `KnowledgeFeed` — static list, no client features | `components/market/KnowledgeFeed.tsx` | A | **~1.3** | low | high |
| 7 | `RoutesSection` — static table, no client features | `components/market/RoutesSection.tsx` | A | **~1.3** | low | high |
| 8 | `FixturesSection` — static list, no client features | `components/market/FixturesSection.tsx` | A | **~1** | low | high |
| 9 | `DashboardKpiStrip` — no client features, under server parent (immediate) | `components/dashboard/DashboardKpiStrip.tsx` | A | **~0.6** | low | high |
| 10 | `clickable-field` — no client features, callers are server (immediate) | `components/clickable-field.tsx` | A | **~0.6** | low | high |

> Items 6–8 (the three static `/market` sections, ~3.6 KB) are realized *as part of* item 2's `/market` conversion — counted once in the total, not double-counted.

---

## (A) Unnecessary client components

Components that declare `'use client'` but use **no** hook, event handler, browser API, or React Context. Each was re-verified by an independent agent that searched the full file for any client-only feature.

| File | Why it's unnecessary | Real bundle win today? | Est. KB (gz) |
|---|---|---|---:|
| `components/charterers/CharterersTable.tsx` | Pure `<table>` render of `charterers` prop; only import is `next/link`; `avatarColor` hash is deterministic | Not until parent `app/charterers/page.tsx` (itself client) is converted; 3 test files already import it directly | ~2.6 |
| `components/market/KnowledgeFeed.tsx` | Maps a hardcoded `ARTICLES` const; `cursor-pointer` is CSS-only (no `onClick`); dates are literal strings | Unlocked by `/market` push-down (B) | ~1.3 |
| `components/market/RoutesSection.tsx` | Maps a hardcoded `ROUTES` const + pure `DeltaBadge`; only `next/link` | Unlocked by `/market` push-down (B) | ~1.3 |
| `components/market/FixturesSection.tsx` | Maps a hardcoded `FIXTURES` const; only `next/link` | Unlocked by `/market` push-down (B) | ~1.0 |
| `components/dashboard/DashboardKpiStrip.tsx` | No client features; imports `KpiCard` (client) — but a Server Component **may** render a Client child. Parent `app/dashboard/page.tsx` is already `async` server | **Yes — immediate** | ~0.6 |
| `components/clickable-field.tsx` | Pure render that conditionally renders client child `SourceQuotePopover`; callers `app/vessel/[id]`, `app/cargo/[id]` are Server Components | **Yes — immediate** | ~0.6 |
| `components/dashboard/MarketIntelligence.tsx` | Static grid wrapping client `KpiCard` islands | Currently unused outside tests; convert for correctness | ~0.5 |
| `components/market/MarketBenchmarkChart.tsx` | Table fallback (no recharts); reads `process.env.NEXT_PUBLIC_*` (server-safe), `.toFixed` (locale-independent) | Not until parent `MetricHistoryPanel` (client) is split | ~0 |
| `components/match/SourceAttribution.tsx` | Pure `highlightQuote` + static JSX from props | Not until parent `SourceAttributionSection` (client) is split | ~0 |

**Pattern:** the recurring root cause is treating "imports a client component" as "must be a client component." A Server Component is allowed to import and render a Client Component — the `'use client'` belongs on the leaf that owns the state, not on every wrapper above it.

---

## (B) Boundary push-down opportunities

The three big `*Client.tsx` files already receive server-fetched data as props (good) — their `'use client'` is *justified but placed at the very top*, so all presentational markup ships too. `/market` is the outlier: it fetches client-side.

### B1 — `app/market/page.tsx` (entire route is client) — **~9 KB, med effort, biggest structural win**
- **Current:** whole route is `'use client'`; loads 4 datasets in a `useEffect` (`/api/market/indices` ×3 + `/api/market/baltic-kpi`); drags in `RoutesSection`/`FixturesSection`/`KnowledgeFeed` (all needlessly client) plus feature-gate/loading/error/empty branches as client markup.
- **Push down:** make the page an `async` Server Component that reads the feature flag + fetches the 4 datasets server-side, renders static chrome + the 3 static sections as Server Components, and pushes `'use client'` into a small `MarketKpiStrip` island owning only `activeKpi`/`now`/the tile grid + conditional `MetricHistoryPanel`. Loading → `loading.tsx` Suspense.
- **Serverable:** feature-gate / loading / error / empty branches, `<header>`+stale indicator, the 3 static sections, the 4 fetches, `isStale` computation (removes the `requestAnimationFrame` clock hack).
- **Risk:** relative `fetch` → absolute URL or direct data-layer call server-side; `isStale` timing shifts from mount to request-time. Dropping `'use client'` from the 3 static sections is a safe standalone quick win.

### B2 — `app/cargo/CargoClient.tsx` (669 LOC) — **~4 KB, med effort**
- Extract pure leaves to non-`'use client'` modules: `CommodityBadge`, `StatusPill`, the `SidePanel` read-only `<dl>` body, the static `<colgroup>`/`<thead>`, the page header + caption, the per-row cell markup. Keep the client island = filter/search/selection state + AI parse bar + `NewCargoPanel` form + CSV import + toast.
- **Constraint:** the `filtered` `useMemo` and row selection are inherently client, so `<tbody>` orchestration stays client — but cell/badge **definitions** move server-side.
- **Note:** `CommodityBadge`/`StatusPill`/`SidePanel` are duplicated verbatim in `VesselsClient` → extracting to a shared presentational module is a good side-effect (widens blast radius).

### B3 — `app/vessels/VesselsClient.tsx` (385 LOC) — **~3 KB, low-moderate effort**
- `page.tsx` already builds the full `VesselRow[]` server-side. Move the static chrome (parse-bar shell, header with title/count/buttons — **the Import/New buttons have no handlers**, `<colgroup>`+`<thead>`, caption) to the server; keep a ~150-line `VesselsInteractive` island (search/status filter, `<tbody>` rows, `SidePanel` wiring).
- **Risk:** `app/vessels/__tests__/vessels-client.test.tsx` renders `<VesselsClient rows total>` directly — splitting changes that import contract.

### B4 — `app/matches/MatchesClient.tsx` (1026 LOC) — **~1 KB, treat as maintainability, not bundle**
- This is the **rare justified high boundary**: ~13 state slices, 5 hooks (incl. `useLiveJobs` SSE), per-row handlers, the `clientNow` clock — nearly every section is genuinely interactive and data is *already* server-fetched.
- **Recommendation:** extract pure helpers (`scoreClass`, `vesselInitials`, `formatAge`, `fmtDwt`, `fmtTce`, `isFreshMatch`, `effectiveScore`, `reason_structured` parsing) to `lib/matching/match-display.ts` — but **expect ~nil KB**.
- **⚠ PI3 caution:** 30+ tests `fs.readFileSync` this file and regex-match its **source text** (`data-testid`, `minWidth 970px`, `toLocaleString('en-US')`, `effectiveScore`/laycan guards, `useSearchParams`). Splitting will break many structural assertions despite unchanged runtime behavior. Two hydration regressions (`#543` clientNow, `#426` locale pin) are encoded here — any extraction must preserve the post-mount clock or React `#418` returns.

---

## (C) Hydration risks

| File:line | Nondeterministic value | Why it differs server↔client | Severity | Verdict |
|---|---|---|---|---|
| `lib/utils/fmt-laycan.ts:4` | `new Date(ts*1000).toLocaleDateString('en-US', {month:'short', day:'numeric'})` — **no `timeZone`** | Locale is pinned but the **calendar day is timezone-resolved**. Called in render at `MatchesClient.tsx:909` inside the SSR'd table (`quickFilter='all'` → identical row set on first paint, so it *is* on the hydration path). SSR=UTC (VPS), client=browser tz → for a laycan near midnight, server emits `May 25` while client emits `May 26` (off-by-one, or month at boundaries). Reproduced: `2026-05-26T00:30Z` → `May 26` (UTC) vs `May 25` (America/New_York). Unlike `isFreshMatch`/`effectiveScore` in the same file, this is **not** guarded by the `clientNow` sentinel. | **HIGH** | confirmed |
| `app/admin/knowledge/_components/SourceTable.tsx:159` | `source.row_count?.toLocaleString()` — **no locale arg** | Number grouping separators are locale-dependent (`1,000` en-US vs `1.000` de-DE vs `1 000` fr-FR). Client component, rendered on initial render; `row_count` is a stored integer SSR'd then re-rendered. Only surfaces for values ≥1000 in non-en-US browsers (Node ICU commonly defaults en-US). The sibling date on line 150 correctly pins `'en-US'`+`timeZone:'UTC'` — this is the only unpinned formatter. | LOW | confirmed |

**Fix for both:** pass an explicit `timeZone`/locale so server and client agree — e.g. `fmtLaycan` → add `timeZone: 'UTC'`; `row_count` → `.toLocaleString('en-US')`.

**Refuted (correctly not a risk):** `components/economics/PriceSourceBadge.tsx` — `Date.now()` runs in a `useMemo`, but the derived value is bucketed to 7/30-day age **categories**, so server and client agree except in a vanishing sub-second window at a threshold; verifier downgraded to non-issue. (2 other low-confidence candidates were likewise refuted.)

**Already-correct hydration patterns observed (no action):** `MatchesClient` (`clientNow`/`nowUtc` start at `0`/`''` matching SSR, set post-mount), `market/page` (`now` via `requestAnimationFrame`, init `0`), `SubsCountdown` & `SubsCountdownWidget` (null sentinel + `suppressHydrationWarning` placeholder), `audit-trail`/`source-quote-popover`/`VesselsTab`/`EconomicsTab`/`MatchDetailPanel` (all `toLocaleString` pinned to `en-US`, often `+timeZone:'UTC'`), and all `*.toLocale*`/`Date.now()` inside `useEffect`/handlers or post-fetch `{data && …}` blocks.

---

## (D) Heavy client imports

**Root cause amplifier: the repo has ZERO `next/dynamic` and ZERO `React.lazy`** — every heavy import lands eagerly in the route's client JS.

| File | Heavy import | How it reaches the bundle | Est. KB (gz) | Severity |
|---|---|---|---:|---|
| `lib/analytics.ts:1` → `lib/analytics-tracker.tsx:4` | `import posthog from 'posthog-js'` (top-level static) | `<AnalyticsTracker>` is rendered by 5 server pages: `dashboard`, `vessel/[id]`, `fixture/[id]`, `cargo/[id]`, `match/[id]` → posthog in each route's eager chunk | **~50–55** | **HIGH** |
| `app/processing/page.tsx:5` | `import { track } from '@/lib/analytics'` | Same chain; ships posthog into the `/processing` bundle | ~55 *(shared)* | MED |
| `components/onboarding/EmailUploadCTA.tsx:6` | `import { initAnalytics, track } from '@/lib/analytics'` | Same chain (measured posthog@1.376.0 module entry: 192 KB raw / **~63 KB gz**). **Note: component is currently unreferenced by any route — dead code today**, but the import-chain defect is real and live via the other importers. | ~63 *(shared)* | MED |
| `components/LandingPageClient.tsx` | `initAnalytics` via `@/lib/analytics` | Ships posthog into the landing/public bundle | ~55 *(shared)* | MED |

**The fix is singular and central:** in `lib/analytics.ts`, replace the top-level `import posthog from 'posthog-js'` with a lazy `const posthog = (await import('posthog-js')).default` inside `initAnalytics()`/`track()`. Both are only ever invoked inside `useEffect`/event handlers behind a `typeof window` guard, so deferral is **behavior-preserving** and removes posthog from the critical bundle of **all** the routes above at once.

**Not heavy (verified, no action):** `lucide-react` is per-icon tree-shaken (callers import 3–4 icons each); `@sentry/nextjs` in error boundaries reuses the app-wide-initialized browser SDK (`instrumentation-client.ts`) — no extra per-boundary cost, and error boundaries can't be code-split anyway; `MarketBenchmarkChart` is an explicit *no-recharts* table fallback; `@base-ui/react` primitives are legitimately client.

---

## (E) Server/client data leak

| File | What leaks | Mechanism | Severity | Verdict |
|---|---|---|---|---|
| `app/admin/knowledge/_components/SourceTable.tsx` (via `app/admin/knowledge/page.tsx:17`) | Full `SourceRow[]` — incl. `refresh_command` (internal shell/sync command strings, e.g. `npm run knowledge:refresh ofac`, `npx tsx scripts/knowledge/cron/refresh-bunker.ts`) and `last_error` (raw upstream error text / potential stack traces & internal paths) | Server `page.tsx` calls `listSources(db)` (selects all 13 columns) and passes the whole array as the `sources` prop. React serializes **every** prop field into the RSC/Flight payload regardless of which the client reads — `SourceTable` only renders `slug`/`name`/`category`/`health_signal`/`last_synced_at`/`row_count`, but `refresh_command`, `last_error`, `upstream_version`, `status`, `refresh_mode`, etc. all reach the browser. | **MED** | confirmed |

- **Mitigating factors:** route is `/admin` (admin-gated, not public); `refresh_command` values are benign tooling strings with **no secrets/tokens/credentials** embedded. So this is operational-metadata over-exposure to authenticated admins, not a credential leak.
- **Fix:** project a narrow DTO before the client boundary — e.g. `sources.map(({ slug, name, category, health_signal, last_synced_at, row_count }) => …)` — so internal columns never cross to the browser.

No secret/token/credential leaks were found in any other client component. Props across all other boundaries are domain data or non-sensitive identifiers (`emailId`, `matchDbId`, `user_id`, callbacks).

---

## Systemic observations

- **No code-splitting anywhere.** The single biggest leverage point in the app is introducing `next/dynamic` for the analytics SDK (and as a pattern for any future heavy client dep). This one gap is what turns the posthog import into a ~55 KB tax on 7 routes.
- **The `'use client' over-wrapping` anti-pattern** recurs (Group A): wrappers are marked client merely because they render a client child. A targeted lint (`'use client'` + no hook/handler/browser-API/context = warn) would prevent regressions.
- **Hydration discipline is good** and the `#543` lesson clearly propagated — the remaining gaps (`fmt-laycan`, `row_count`) are unpinned `toLocale*` calls, the same class. A shared `formatDate`/`formatNumber` helper that always pins `en-US`+`UTC` would close the category.
- **Data-fetch placement is correct** for the heavy list routes (server `page.tsx` → client island), so most boundary work is altitude/maintainability, not raw KB.

---

## Methodology & coverage

- **Phase A** — 71 `'use client'` files in 10 clusters; each file checked for unnecessary-client / hydration / heavy-import / data-leak; **every** raw finding handed to an independent verifier prompted to *refute* it (default-refuted on uncertainty).
- **Phase B** — 12 render-path files swept for nondeterministic values: 5 server components/pages (`app/layout.tsx`, `match/[id]`, `upgrade`, `MorningHeader`, `VoyageBreakdownChart`) + 7 shared utils (`clock`, `currency`, `utils`, `fmt-laycan`, `date-parsing`, `parse-cargo-helpers`, `roi-metrics`). The ~80 other `lib/*` files containing `new Date()`/`Date.now()` were triaged out as **server-only IO** (data adapters, DB queries, cron, auth, rate-limit, sanctions, pipedrive, whatsapp, migrations) — never in a React render path, so irrelevant to hydration.
- **Phase C** — 4 boundary analyses (`MatchesClient`, `CargoClient`, `VesselsClient`, `/market`).
- **Outcome:** 18 candidate findings → **15 confirmed, 3 refuted** (refuted: `PriceSourceBadge` hydration + 2 low-confidence). 44 agents, ~1.35 M tokens, ~11 min.
- **Caveat:** KB figures are gzipped estimates from line counts, import graphs, and the measured posthog SDK size — directional, not from a production `next build --analyze`. Confirm with the bundle analyzer before/after.

---

## Estimated total removable client KB (gzipped)

| Bucket | Items | Est. KB |
|---|---:|---:|
| **Immediate, high-confidence** | `posthog-js` deferral (~55) + `DashboardKpiStrip` (~0.6) + `MarketIntelligence` (~0.5) + `clickable-field` (~0.6) | **~56.7** |
| **Contingent on boundary/leaf refactors** | `/market` conversion incl. 3 static sections (~9) + `CargoClient` leaves (~4) + `VesselsClient` shell (~3) + `CharterersTable` (~2.6) + `MatchesClient` helpers (~1) | **~19.6** |
| **Total** | | **≈ 76 KB** |

> **~55 KB (72%) is the single `posthog-js` dynamic-import fix** — high-confidence, ~1-line, behavior-preserving, and the recommended first action. The remaining ~21 KB requires component extraction and is bounded by the fact that the heavy list routes carry no other heavy libraries (their weight is JSX markup + Tailwind class strings). Also fix the **HIGH-severity `fmt-laycan.ts` hydration bug** (correctness, not bundle) and the **MED `SourceTable` data over-exposure** as part of the same pass.

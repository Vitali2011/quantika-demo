# Enable ready-but-off: command-palette nav + TMI benchmark Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: subagent-driven-development. Steps use `- [ ]`.
> Before using Next.js/React APIs introduced or changed after v14 — WebFetch the relevant nextjs.org/react.dev docs page first.

**Goal:** Surface three already-built-but-dark capabilities: (1) `/clauses /laytime /psc /commission` in the ⌘K command palette; (2) the TMI chart on `/market` (seed `market_indices.tmi`); (3) the Toepfer-TMI line in the quote prompt + `/api/market/benchmark` (DB fallback when the scraper returns null).

**Architecture:** Next.js 16 + React 19. Nav lives in `design-system/patterns/`. Market data in `market_indices` (chart) + `baltic_indices` (quote benchmark anchor). Seed scripts mirror `scripts/demo-seed/seed-charterers.ts`.

**Ground truth (verified this session, do NOT re-derive):**

- `design-system/patterns/PaletteTabs/NavigateTab.tsx` — `ROUTES` array (lines 4-15) currently lists dashboard/matches/cargo/vessels/market/charterers/recap/email/settings/upgrade. Missing: clauses, laytime, psc, commission.
- `design-system/patterns/TopNav.tsx` `MORE_ITEMS` already lists all four + gates laytime on `process.env.NEXT_PUBLIC_LAYTIME_ENGINE_ENABLED === 'true'` (MoreDropdown filter, lines 75-77). Mirror that gating in the palette.
- `lib/market/market-indices-repository.ts`: `MarketIndexRow = {id,index_name,index_date,value,unit,source,fetched_at}`; `upsertIndex(db,row)` is idempotent `ON CONFLICT(index_name,index_date)`, validates `value>=0` finite, requires id/index_name/index_date/source. `getLatestIndex(db,name)`, `getIndexHistory(db,name,days)` ORDER BY index_date DESC LIMIT days.
- `app/api/market/indices/route.ts:80` serves `getIndexHistory(db,'tmi',days)` behind `MARKET_BENCHMARK_FULL_ENABLED==='true'` (TRUE on prod). `/market` page fetches `?name=tmi&days=30` (page.tsx:143) and renders `MarketBenchmarkChart` only when `tmiData.length>0` (page.tsx:337).
- Prod `market_indices.tmi` = 0 rows (chart silently absent); `baltic_indices` has one `TOEPFER_TMI = 12683 @ 2026-05-09 (static-seed)` from migration 020; migration 043 anchors $/day rates to TOEPFER_TMI≈12,683. **Oracle = 12683 USD/day.**
- `demo_seed_meta(id=1, frozen_date TEXT, ...)` holds the demo "today" (local=2026-05-10; prod newer — read from the target DB at apply time).
- `lib/market/benchmark.ts` `getCurrentBenchmark('TOEPFER_TMI')` → scraper `fetchToepferTmi()` only; returns null on prod (no network) → quote line dropped (`lib/quote-jobs/match-context.ts:32,41`) + `/api/market/benchmark?indicator=TOEPFER_TMI` 404. NO DB path today. Callers (non-test): benchmark.ts, quote-jobs/match-context.ts, app/api/market/benchmark/route.ts.
- `MarketBenchmark = {indicator, value, unit, period, sourceUrl, fetchedAt, stale?}` (lib/types.ts:136).

**Sanctioned spec changes:** none of these change existing tested behavior except where listed — only ADD palette entries, ADD a seed script, and ADD a DB fallback that fires only when the scraper returns null (the no-network prod path). Existing scraper-success behavior is unchanged. Tests that pin the old "scraper null → getCurrentBenchmark null with empty cache" must be updated to the new "scraper null → DB fallback" behavior (Task 3).

---

### Task 1: Command-palette routes (UI, low risk)

**Files:**

- Modify: `design-system/patterns/PaletteTabs/NavigateTab.tsx`
- Test: `design-system/patterns/PaletteTabs/__tests__/NavigateTab.test.tsx` (create if absent; check for an existing test first)

- [ ] **Step 1: Failing test** — render `<NavigateTab query="" onSelect={()=>{}} />`, assert links for `/clauses`, `/psc`, `/commission` present; assert `/laytime` present when `process.env.NEXT_PUBLIC_LAYTIME_ENGINE_ENABLED==='true'` and absent when unset (set/restore env in the test).
- [ ] **Step 2: Run, see fail.**
- [ ] **Step 3: Implement** — add to `ROUTES` (keep grouping consistent with `MORE_ITEMS` labels): `{href:'/charterers'...}` already present; ADD `{href:'/laytime',label:'Laytime'}`, `{href:'/psc',label:'PSC'}`, `{href:'/commission',label:'Commission'}`, `{href:'/clauses',label:'Clauses'}`. Filter `/laytime` out when `process.env.NEXT_PUBLIC_LAYTIME_ENGINE_ENABLED!=='true'` (mirror TopNav MoreDropdown). Keep the existing `query` filter behavior.
- [ ] **Step 4: Run, pass.** Plus run any existing palette/CmdK tests so the change doesn't break them.
- [ ] **Step 5: Commit** — `feat(nav): surface clauses/laytime/psc/commission in ⌘K palette`.

### Task 2: Seed TMI into market_indices (data — the /market 3rd chart)

**Files:**

- Create: `scripts/demo-seed/tmi-fixture.ts` (pure, testable)
- Create: `scripts/demo-seed/seed-tmi.ts` (CLI, mirrors `seed-charterers.ts`)
- Test: `scripts/demo-seed/__tests__/tmi-fixture.test.ts`

- [ ] **Step 1: Failing test** for `buildTmiRows(frozenDate: string, count=30): MarketIndexRow[]`: returns `count` rows; every `value` in `[12000,13500]` and finite; `index_name==='tmi'`, `unit==='USD/day'`, `source==='demo-seed'`; dates are consecutive daily, ascending, the LAST equal to `frozenDate`; ids unique & stable (`tmi-<date>`); deterministic (two calls equal) so re-seeding is idempotent; values centred near 12683 (assert mean within ±800 of 12683).
- [ ] **Step 2: Run, see fail.**
- [ ] **Step 3: Implement `tmi-fixture.ts`** — deterministic series (no Math.random): `value = round(12683 + 600*sin(i*0.5) + 120*((i%5)-2))` clamped to `[12000,13500]`; daily dates ending at `frozenDate` (use a pure date helper, UTC, no `Date.now()` baked into values); `fetched_at = frozenDate + 'T12:00:00.000Z'`.
- [ ] **Step 4: Implement `seed-tmi.ts`** — CLI mirroring `seed-charterers.ts`: read `frozen_date` from `demo_seed_meta` (fallback to latest `market_indices` date, then today) of the target DB; build rows; `seedTmiWithDb(db)` wraps `upsertIndex` per row in a single `db.transaction`; `--dry-run` opens readonly and reports existing `tmi` count + what would be written (no writes); `--db` arg, default `data/demo-seed.db`; print `done — upserted N tmi row(s), table now M`. Export `seedTmiWithDb` + `buildTmiRows` re-export for tests.
- [ ] **Step 5: Run test, pass.** `npx tsc --noEmit` for the two new files (NODE_OPTIONS=--max-old-space-size=8192).
- [ ] **Step 6: Commit** — `feat(seed): targeted tmi market-index seed (does not touch bhsi/drewry)`.

### Task 3: Quote/benchmark TMI DB fallback (value-bearing code)

**Files:**

- Create: `lib/market/tmi-benchmark-fallback.ts` (DB reader → `MarketBenchmark`)
- Modify: `lib/market/benchmark.ts` (use fallback when scraper null)
- Test: `lib/__tests__/benchmark-db-fallback.test.ts` (+ update any existing benchmark test pinning the old null behavior)

- [ ] **Step 1: Failing test** — with a temp DB seeded with `baltic_indices` TOEPFER_TMI=12683@2026-05-09 (and optionally a recent `market_indices.tmi` row), mock `fetchToepferTmi` to return null, `_clearCacheForTesting()`, then `getCurrentBenchmark('TOEPFER_TMI')` resolves to a `MarketBenchmark` with `value===12683` (or the latest `market_indices.tmi` value if present), `indicator==='TOEPFER_TMI'`, `unit==='USD/day'`, `stale===true`, non-empty `period`. Also assert: scraper SUCCESS still wins over DB; non-TMI indicators with scraper null + no cache still return null (unchanged).
- [ ] **Step 2: Run, see fail.**
- [ ] **Step 3: Implement `tmi-benchmark-fallback.ts`** — `getTmiBenchmarkFromDb(db): MarketBenchmark | null`: prefer `getLatestIndex(db,'tmi')`; else latest `baltic_indices` row WHERE index_code='TOEPFER_TMI' (ORDER BY price_date DESC LIMIT 1); map to `MarketBenchmark` (`value`, `unit:'USD/day'`, `period` = "Mon YYYY" from the date, `sourceUrl:''`, `fetchedAt:` row's date ISO, `stale:true`); return null if neither exists. Pure read, guarded.
- [ ] **Step 4: Modify `benchmark.ts`** — in `getCurrentBenchmark`, for `indicator==='TOEPFER_TMI'`, after the scraper returns null AND before returning the final `null`, try `getTmiBenchmarkFromDb(getStore().getDatabase())` inside try/catch (DB failure → continue to existing null/stale-cache path). Do NOT change the scraper-success or fresh-cache paths. Keep `getStore` import lazy-safe.
- [ ] **Step 5: Run tests, pass** — new test + the existing benchmark test suite (update the pinned-null case per Sanctioned spec changes). `npx tsc --noEmit`.
- [ ] **Step 6: Commit** — `feat(market): DB fallback for Toepfer-TMI benchmark when scraper is unavailable`.

---

## Self-review checklist

- Palette mirrors `MORE_ITEMS` (laytime gated identically). ✓ type-consistent `{href,label}`.
- `buildTmiRows` deterministic + idempotent (re-seed converges via `ON CONFLICT`). ✓ does not write bhsi/drewry.
- benchmark DB fallback fires only on scraper-null TOEPFER_TMI; other indicators + scraper-success unchanged. ✓ value = real 12683 anchor (oracle).
- No `Date.now()` baked into seeded values (frozen-date anchored → no ROI-style aging time-bomb).

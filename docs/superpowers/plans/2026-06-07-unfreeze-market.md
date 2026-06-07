# Unfreeze Demo Market Data (Lane C) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh the demo's frozen market prices (Baltic freight indices, bunker, EUA/carbon) by re-running the *existing* scrapers against the demo seed DB — no new scraping logic, no prod write.

**Architecture:** The three production cron scripts already scrape free public mirrors and `upsert` into whatever DB `getStore()` resolves (`SESSIONS_DB_PATH`). The demo is frozen only because nothing ever runs those crons against `data/demo-seed.db` — it ships a `static-seed` snapshot (2026-05-09 / EUA 2026-05-04). "Unfreeze" = run the same crons with `SESSIONS_DB_PATH=data/demo-seed.db`, let the repos' `ORDER BY price_date DESC` surface the fresher rows, then fold the new freight into the combined match regen. This Lane touches only data + one thin wrapper script; it is code-independent of Lanes A/B and joins them at the final regen.

**Tech Stack:** TypeScript / `tsx`, `better-sqlite3`, existing adapters in `lib/market/*` and `lib/knowledge/{bunker,eua}/*`, existing crons in `scripts/knowledge/cron/*`.

---

## Decision Section (FOUNDER FORK — read first)

The demo prices are **deliberately** frozen: a curated, reproducible snapshot so live demos show identical numbers every time. Unfreezing trades reproducibility for freshness. Two options:

### Option 1 — One-time refresh + re-freeze ✅ RECOMMENDED
Run the scrapers **once**, write fresh Baltic/bunker/EUA into `data/demo-seed.db`, then keep the demo frozen on the new (fresher) snapshot. Re-run the match regen so freight-coupled rankings stay consistent. Numbers are newer but still stable/identical across showings.

- **Risk:** LOW. One controlled write, reviewable diff, fully reproducible afterward.
- **Cost:** A human (or orchestrator) re-runs this step whenever the snapshot feels stale (e.g. monthly).
- **Why default:** Demos need determinism. A stale-but-fixed number is a smaller problem than numbers that move mid-pitch or vanish when a free mirror is down.

### Option 2 — Live unfreeze
Enable the systemd timers (`quantika-market-indices-refresh.timer` 06:00, `quantika-bunker-refresh.timer` 05:00, `quantika-eua-refresh.timer` 04:00) to refresh the demo DB on a schedule. Always fresh.

- **Risk:** MEDIUM. (a) Numbers move between showings — reproducibility lost. (b) Depends on free-mirror scrape reliability (handybulk.com, tradingeconomics.com, USDA/OilMonster/Ship&Bunker, EEX/ICAP/TradingEconomics). A mirror outage = partial or no refresh, and **freight drift silently shifts match rankings** (see Coupling) without a regen, so the demo can show prices and rankings that disagree.
- **Cost:** Ongoing operational fragility; every refresh that changes Baltic indices *should* trigger a regen to keep TCE/ranking coherent, which timers do not do today.

**Recommendation:** Ship **Option 1** unless the founder explicitly wants always-live numbers and accepts non-reproducible demos + mirror-dependency. This plan implements **Option 1**; an Option-2 appendix (Task 5) documents the timer-enable path so the choice stays reversible.

### Coupling (applies to BOTH options)
Freight feeds TCE: `regenerate-matches.ts` → `lib/matching/pair-analyzer.ts` → `lib/matching/freight-resolver.ts` (`resolveFreightRate`) reads `baltic_indices` values. Refreshing Baltic indices shifts TCE → shifts fit/ranking. Therefore **Lane C's data output is NOT applied in isolation** — it must fold into the *same* final prod-regen as Lanes A/B. This plan stops at writing fresh prices into the seed + previewing the ranking shift; the orchestrator owns the single combined regen (handoff note in Task 4).

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `scripts/demo-seed/unfreeze-market.ts` | Thin wrapper: run the 3 existing crons against a target DB (default `data/demo-seed.db`), report per-source success/failure, never rebuild scraping. | **Create** |
| `scripts/demo-seed/__tests__/unfreeze-market.test.ts` | Behavioral tests: wrapper targets the right DB, surfaces per-source failures, defaults the path, honors `--db`. | **Create** |
| `docs/superpowers/plans/2026-06-07-unfreeze-market.md` | This plan. | **Create** (done) |

No production code (`lib/**`, `app/**`) is modified. The crons and adapters are reused as-is.

### Why a wrapper instead of "just run the crons"
The three crons each call `process.exit()` and resolve their DB only from `SESSIONS_DB_PATH`. Running them ad-hoc works but is (a) undocumented, (b) easy to point at the wrong DB (e.g. `sessions.db`), (c) gives no single roll-up of which mirror was down. The wrapper is a ~40-line orchestration of `main()` exports with an explicit `--db` flag and a roll-up summary. It adds **no scraping logic**.

---

## Task 1: Wrapper script skeleton + DB targeting

**Files:**
- Create: `scripts/demo-seed/unfreeze-market.ts`
- Test: `scripts/demo-seed/__tests__/unfreeze-market.test.ts`

The crons resolve their DB via `getStore()` → `SESSIONS_DB_PATH` (`lib/session-store.ts:15`). The wrapper must set that env to the target seed **before** any cron imports `getStore`, so the wrapper computes the path, sets `process.env.SESSIONS_DB_PATH`, and only then dynamically imports the cron `main` functions.

- [ ] **Step 1: Write the failing test**

```ts
// scripts/demo-seed/__tests__/unfreeze-market.test.ts
import * as path from 'path';
import { resolveTargetDb } from '../unfreeze-market';

describe('unfreeze-market: DB targeting', () => {
  it('defaults to data/demo-seed.db', () => {
    expect(resolveTargetDb([])).toBe(path.resolve(process.cwd(), 'data/demo-seed.db'));
  });

  it('honors --db flag', () => {
    const p = resolveTargetDb(['--db', '/tmp/x.db']);
    expect(p).toBe(path.resolve('/tmp/x.db'));
  });

  it('refuses to target sessions.db (guard against clobbering live sessions)', () => {
    expect(() => resolveTargetDb(['--db', 'data/sessions.db'])).toThrow(/refuse/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --findRelatedTests scripts/demo-seed/unfreeze-market.ts scripts/demo-seed/__tests__/unfreeze-market.test.ts --maxWorkers=1 --no-coverage`
Expected: FAIL — `Cannot find module '../unfreeze-market'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// scripts/demo-seed/unfreeze-market.ts
#!/usr/bin/env tsx
/**
 * Unfreeze demo market data (Lane C).
 *
 * Re-runs the EXISTING market/bunker/EUA cron scripts against the demo seed DB,
 * writing fresh scraped prices over the frozen static-seed snapshot. Adds NO
 * scraping logic — it only points SESSIONS_DB_PATH at the seed and rolls up
 * per-source success/failure.
 *
 * Usage:
 *   npx tsx scripts/demo-seed/unfreeze-market.ts [--db data/demo-seed.db]
 *
 * After this runs, the freight refresh shifts TCE → re-run
 * scripts/demo-seed/regenerate-matches.ts (orchestrator owns the combined regen).
 */
import * as path from 'path';

export function resolveTargetDb(argv: string[]): string {
  const i = argv.indexOf('--db');
  const raw = i === -1 ? 'data/demo-seed.db' : argv[i + 1];
  const resolved = path.resolve(raw);
  if (resolved.endsWith(path.sep + 'sessions.db')) {
    throw new Error('refuse: will not unfreeze into sessions.db (live sessions). Use data/demo-seed.db.');
  }
  return resolved;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --findRelatedTests scripts/demo-seed/unfreeze-market.ts scripts/demo-seed/__tests__/unfreeze-market.test.ts --maxWorkers=1 --no-coverage`
Expected: PASS — `Tests: 3 passed`.

- [ ] **Step 5: Commit**

```bash
git add scripts/demo-seed/unfreeze-market.ts scripts/demo-seed/__tests__/unfreeze-market.test.ts
git commit -m "feat(demo-seed): unfreeze-market DB targeting + sessions.db guard"
```

---

## Task 2: Run the three crons against the target DB + roll-up

**Files:**
- Modify: `scripts/demo-seed/unfreeze-market.ts`
- Test: `scripts/demo-seed/__tests__/unfreeze-market.test.ts`

The crons each call `process.exit()` in their `main()` and at module-load when `require.main === module`. We need their `main` logic without the `process.exit`. Each cron file `export`s `main` and only exits inside the `if (require.main === module)` block, so importing `main` and awaiting it is safe — but `main` itself calls `process.exit` at the end. To keep the wrapper alive across all three, run each cron in a **child process** (`spawnSync`) with `SESSIONS_DB_PATH` injected, capturing exit codes. This also gives clean per-source isolation (one cron crashing cannot abort the others) and matches the existing `seed-all.ts` pattern (`spawnSync('npx', ['tsx', ...])`).

- [ ] **Step 1: Write the failing test**

```ts
// add to scripts/demo-seed/__tests__/unfreeze-market.test.ts
import { CRON_STEPS } from '../unfreeze-market';

describe('unfreeze-market: cron roster', () => {
  it('runs exactly the three existing crons (no new scrapers)', () => {
    expect(CRON_STEPS.map((s) => s.script)).toEqual([
      'scripts/knowledge/cron/refresh-market-indices.ts',
      'scripts/knowledge/cron/refresh-bunker.ts',
      'scripts/knowledge/cron/refresh-eua.ts',
    ]);
  });

  it('labels each step for the roll-up summary', () => {
    expect(CRON_STEPS.map((s) => s.label)).toEqual(['baltic', 'bunker', 'eua']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --findRelatedTests scripts/demo-seed/unfreeze-market.ts --maxWorkers=1 --no-coverage`
Expected: FAIL — `CRON_STEPS` is not exported.

- [ ] **Step 3: Write minimal implementation**

```ts
// append to scripts/demo-seed/unfreeze-market.ts
import { spawnSync } from 'child_process';

export const CRON_STEPS: ReadonlyArray<{ label: string; script: string }> = [
  { label: 'baltic', script: 'scripts/knowledge/cron/refresh-market-indices.ts' },
  { label: 'bunker', script: 'scripts/knowledge/cron/refresh-bunker.ts' },
  { label: 'eua',    script: 'scripts/knowledge/cron/refresh-eua.ts' },
];

export function runUnfreeze(targetDb: string): { label: string; ok: boolean }[] {
  const env = { ...process.env, SESSIONS_DB_PATH: targetDb };
  return CRON_STEPS.map(({ label, script }) => {
    console.log(`\n[unfreeze] ▶ ${label}: ${script} → ${targetDb}`);
    const r = spawnSync('npx', ['tsx', script], { stdio: 'inherit', env });
    const ok = r.status === 0;
    console.log(`[unfreeze] ${ok ? '✓' : '✗'} ${label} (exit ${r.status})`);
    return { label, ok };
  });
}

if (require.main === module) {
  const targetDb = resolveTargetDb(process.argv.slice(2));
  const results = runUnfreeze(targetDb);
  const failed = results.filter((r) => !r.ok).map((r) => r.label);
  console.log('\n[unfreeze] summary:', results.map((r) => `${r.label}=${r.ok ? 'ok' : 'FAIL'}`).join(' '));
  if (failed.length) {
    console.warn(`[unfreeze] ⚠ down mirror(s): ${failed.join(', ')} — fresh prices NOT written for these. Re-run later or note in handoff.`);
  }
  // Exit 0 if at least one source refreshed (partial unfreeze still useful);
  // exit 1 only if ALL failed (nothing fresh written).
  process.exit(results.some((r) => r.ok) ? 0 : 1);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --findRelatedTests scripts/demo-seed/unfreeze-market.ts --maxWorkers=1 --no-coverage`
Expected: PASS — `Tests: 5 passed` (3 from Task 1 + 2 here).

- [ ] **Step 5: Commit**

```bash
git add scripts/demo-seed/unfreeze-market.ts scripts/demo-seed/__tests__/unfreeze-market.test.ts
git commit -m "feat(demo-seed): run existing crons against seed + per-source roll-up"
```

---

## Task 3: Verify the scrape against free mirrors (manual, gated)

**Files:** none (verification step — record results in the PR / handoff).

This task confirms the mirrors are reachable and the seed actually changed. It is **manual** (network-dependent) — do NOT bake live network into jest. Run it once at execution time and paste the output into the PR.

- [ ] **Step 1: Snapshot current frozen prices**

```bash
sqlite3 data/demo-seed.db \
  "SELECT 'baltic' t, index_code, value, price_date, source FROM baltic_indices
   UNION ALL SELECT 'bunker', port||'/'||grade, price, price_date, source FROM bunker_prices
   UNION ALL SELECT 'eua', product, price, price_date, source FROM eua_prices
   ORDER BY 1,2;" > /tmp/unfreeze-before.txt
cat /tmp/unfreeze-before.txt
```
Expected: rows with `source` = `static-seed` / `eex-auction-static-seed`, dates 2026-05-09 / 2026-05-04.

- [ ] **Step 2: Run the unfreeze against a COPY first (safety)**

```bash
cp data/demo-seed.db /tmp/demo-seed.unfreeze-test.db
npx tsx scripts/demo-seed/unfreeze-market.ts --db /tmp/demo-seed.unfreeze-test.db
```
Expected: per-source `✓`/`✗` lines + a `summary:` line. Record which (if any) mirror is down. `baltic=ok` requires handybulk.com OR tradingeconomics.com; `eua=ok` requires EEX OR ICAP OR TradingEconomics; `bunker=ok` requires any of USDA / Ship&Bunker / OilMonster.

- [ ] **Step 3: Diff the copy to confirm fresh rows landed**

```bash
sqlite3 /tmp/demo-seed.unfreeze-test.db \
  "SELECT index_code, value, price_date, source FROM baltic_indices
   WHERE source <> 'static-seed' ORDER BY price_date DESC LIMIT 10;"
```
Expected: rows with `source` like `handybulk.com` / `tradingeconomics.com` and a `price_date` newer than 2026-05-09. Repos (`getLatestBalticIndex`, `getLatestBunkerPrice`, `getLatestEuaPrice`) `ORDER BY price_date DESC`, so these now win over the static-seed rows automatically — no DELETE of the snapshot required.

- [ ] **Step 4: Record verification in PR body**

Paste the before/after and the `summary:` line. If a mirror is down, state it explicitly (it does not block Option 1 — partial freshness is acceptable; note it for re-run).

> ⚠ **TC-dayrate caveat to verify:** `baltic_indices` also holds TC `$/day` codes (`BHSI_TC`, `BSI_TC`, `BPI_TC`, `TOEPFER_TMI`) seeded as `static-seed` by migrations 020/043. The handybulk scraper refreshes **index points** (`BDI/BCI/BSI/BHSI`) + `BHSI` into `market_indices`, **not** the `_TC` $/day codes. Confirm at execution time which codes `resolveFreightRate` actually consumes (`lib/matching/freight-resolver.ts` is DB-free; the value is supplied by its caller in `pair-analyzer.ts` / `regenerate-matches.ts`). If TCE reads `_TC`/`TOEPFER_TMI`, those stay frozen and the freight shift is smaller than the points suggest — **report this to the orchestrator** so the combined-regen decision is informed. Do NOT add new scraping for `_TC` (out of scope — that is the Baltic-Exchange paid lane L4).

---

## Task 4: Handoff note — fold fresh freight into the combined regen

**Files:** none (documentation in this plan + PR body).

Lane C writes fresh **prices**; it does NOT regenerate matches. Because freight feeds TCE → ranking, the orchestrator must run the single combined regen that also carries Lanes A/B. Handoff:

- [ ] **Step 1: Preview the ranking shift (read-only, no write)**

```bash
npx tsx scripts/demo-seed/preview-ranking-shift.ts --db /tmp/demo-seed.unfreeze-test.db
```
Expected: a report of how fit/ranking would move under the fresher freight. Attach to PR so the founder sees the magnitude before any prod regen.

- [ ] **Step 2: Write the orchestrator handoff block**

Add to the PR body verbatim:

```
LANE C HANDOFF → combined regen
1. Lane C output = fresh baltic_indices / bunker_prices / eua_prices in data/demo-seed.db
   (source != static-seed, price_date > 2026-05-09). Produced by:
     npx tsx scripts/demo-seed/unfreeze-market.ts --db data/demo-seed.db
2. Do NOT apply in isolation: fresh Baltic shifts TCE → fit/ranking.
   Fold into the SAME final regen as Lanes A/B:
     npx tsx scripts/demo-seed/regenerate-matches.ts --db data/demo-seed.db
3. Validate: npx tsx scripts/demo-seed/validators.ts --db data/demo-seed.db
4. Prod-apply (orchestrator only): per scripts/demo-seed/apply-to-prod.md
   (backup prod demo-seed.db, scp, restart with DEMO_MODE=true).
5. Lane C is code-independent of A/B (different files) → can run in parallel;
   only the DATA output must merge at the regen.
```

- [ ] **Step 3: Commit the plan/doc updates if any**

```bash
git add docs/superpowers/plans/2026-06-07-unfreeze-market.md
git commit -m "docs(plan): Lane C combined-regen handoff note"
```

---

## Task 5: Option-2 appendix — live-unfreeze path (documentation only, NOT executed)

**Files:** none (kept in this plan so the founder choice is reversible).

If the founder picks Option 2 instead, the live path reuses the same crons via systemd (already installed, not enabled for the demo DB):

1. Ensure the demo service env points the timers' DB at the demo seed: the `quantika-*-refresh.service` units must run with `SESSIONS_DB_PATH=<prod demo-seed path>` (see `scripts/demo-seed/deploy.sh` / `apply-to-prod.md` for where `DEMO_DB_REMOTE` lives). **Verify the unit files' `Environment=` / `EnvironmentFile=` before enabling** — pointing them at `sessions.db` would corrupt live sessions.
2. `systemctl enable --now quantika-market-indices-refresh.timer quantika-bunker-refresh.timer quantika-eua-refresh.timer`.
3. **Gap to close before Option 2 is safe:** timers refresh prices but never re-run `regenerate-matches.ts`, so Baltic drift desyncs prices from rankings. Option 2 would need a 4th timer (or an added regen step in the refresh service) to keep TCE/ranking coherent. This is extra work Option 1 avoids — call it out to the founder.
4. Accept reproducibility loss: demo numbers move between showings; a down mirror = partial/no refresh with no fixed fallback.

No code is written for Option 2 in this plan; it is documented only.

---

## Self-Review

**Spec coverage:**
- "Repeatable script to run existing scrapers into the seed" → Tasks 1–2 (`unfreeze-market.ts`, reuses crons, no new scraping). ✅
- "Verify scrape works against free mirrors / note if any down" → Task 3 (snapshot → run on copy → diff → record down mirrors). ✅
- "Define how fresher freight feeds the combined regen (handoff)" → Task 4 (preview + verbatim handoff block) + Coupling section. ✅
- "Present BOTH options + recommendation" → Decision Section (Opt1 recommended, Opt2 appendix Task 5). ✅
- Scope OUT honored: no Baltic-Exchange paid lane, no new scraping logic, no prod write (orchestrator regen). ✅
- Independent of A/B (different files), joins at regen → stated in Architecture + handoff step 5. ✅

**Placeholder scan:** No TBD/TODO/"handle edge cases" — every code step shows full code; verification steps show exact SQL/commands + expected output. ✅

**Type consistency:** `resolveTargetDb(argv: string[]): string`, `CRON_STEPS: {label,script}[]`, `runUnfreeze(targetDb: string)` — names/signatures match across Tasks 1–2 and tests. ✅

**Note on TDD scope:** Behavioral tests (PI2) target real wrapper functions (`resolveTargetDb`, `CRON_STEPS`, the `sessions.db` guard) — not string-matching. Live-network scrape verification is deliberately kept OUT of jest (Task 3 is manual) to avoid flaky CI on free-mirror availability.

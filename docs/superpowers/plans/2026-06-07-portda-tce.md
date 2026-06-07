# port-DA → match-list TCE (Lane A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the already-built port disbursement (DA) data into the match-list TCE so the per-day voyage profit that ranks matches (post-#846) stops treating port-call cost as $0.

**Architecture:** The TCE engine (`calculateTCE`) already consumes `input.daUsd` (voyage-calculator.ts:165) — it is fed `undefined` today because `buildCanonicalTceInputs` omits it. We thread a resolved `daUsd` number down the existing match path the same way `canalUsd` already flows: `pair-analyzer.computeMatchEconomicsFor` (where `db` + ports + dwt + cargoType are already in scope) computes the DA total via a new pure helper, then passes it as a plain number through `buildMatchEconomics → computeEstimatedTce → buildCanonicalTceInputs`. The economics layer stays DB-free; only the match path (which already holds the db handle) calls `getPortDa`.

**Tech Stack:** TypeScript, better-sqlite3, Jest (`--maxWorkers=1 --forceExit`), existing `lib/port-da/repository.ts` + `lib/ports/resolve.ts`.

---

## Why this approach (design decisions)

**1. DA total = sum of `totalFixedUsd` over load + discharge ports.** This mirrors the detail page exactly (`app/api/voyage/tce/route.ts:120-140` `resolveDaUsd`), which sums `da.totalFixedUsd` (port_dues + pilotage + tugs) for `[origin, destination]`. We deliberately exclude `stevedoringUsdPerMt` to match the detail page — list and detail TCE MUST agree (brief DIVERGENCE note). Stevedoring is a separate per-mt term neither surface currently applies; adding it is out of scope.

**2. Compute DA in `pair-analyzer`, not in `buildMatchEconomics`.** `buildMatchEconomics` is intentionally DB-free (its `canalUsd` uses `quoteSuez` via its own store). `getPortDa` needs the db handle, which is already a parameter of `computeMatchEconomicsFor` and already used there (`getBalticDayRate(db, ecoDwt)`, pair-analyzer.ts:288). So DA is computed alongside `resolvedFreight`/`ballastDistanceNm` and passed in as a number — matching the established "resolve in pair-analyzer, pass scalar into buildMatchEconomics" pattern.

**3. Port-name → portCode resolution.** The match path holds free-text port *names* (`cfValue(cargo.originPort)`), but `port_da_estimates.port_code` is UNLOCODE. Detail page resolves to `ResolvedPort` first. We do the same via `resolvePort(name)` (lib/ports/resolve.ts:134), which returns `{ portCode, ... } | null`.

**4. No-DA-for-port fallback: contribute 0, never crash, never fake.** Mirrors detail page: each port wrapped in try/catch; `getPortDa` returning `null` (port absent / dwt out of band) → 0 contribution; unresolvable port name → 0 contribution. Justification: a partial DA (one port known, one not) is still strictly more accurate than $0, and the gradient/breakeven floor degrade gracefully. We never invent a number for an unknown port.

**5. cargoType mapping.** `getPortDa` accepts cargoType from `VALID_CARGO_TYPES = {general, bulk, container, tanker}` and falls back to `'general'` for anything else. The match path's `cargoType` is a free-text shipping class (BULK/GRAIN/COAL/...). We pass it through lower-cased; non-matching values land on `'general'` inside `getPortDa` (its existing behavior) — no new mapping table needed, matching detail-page laxity.

---

## File Structure

- **Create** `lib/port-da/match-da.ts` — pure helper `sumMatchPortDaUsd(ports, vesselDwt, cargoType, db)`; resolves names → portCodes, sums `totalFixedUsd`, swallows per-port errors. One responsibility: turn match-path port names into a DA total USD.
- **Create** `lib/port-da/__tests__/match-da.test.ts` — behavioral tests against an in-memory seeded `port_da_estimates` table (real `getPortDa` call, not string-match).
- **Modify** `lib/economics/canonical-tce-inputs.ts` — add `daUsd?: number` to `CanonicalTceInputArgs`, pass through to `VoyageInput.daUsd`.
- **Modify** `lib/economics/__tests__/canonical-tce-inputs.test.ts` — add daUsd passthrough test.
- **Modify** `lib/matching/tce-calculator.ts` — add `da_usd?` param to `computeEstimatedTce`; add `daUsd?` to `MatchEconomicsInput`; thread through `buildMatchEconomics`.
- **Modify** `lib/matching/__tests__/tce-calculator.test.ts` (or existing equivalent) — add test that `daUsd` lowers `tceUsdPerDay` and raises `totalUsd`.
- **Modify** `lib/matching/pair-analyzer.ts` — in `computeMatchEconomicsFor`, compute DA via `sumMatchPortDaUsd(..., db)` and pass into `buildMatchEconomics`.

---

## Task 1: DA passthrough in canonical TCE inputs

**Files:**
- Modify: `lib/economics/canonical-tce-inputs.ts`
- Test: `lib/economics/__tests__/canonical-tce-inputs.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `lib/economics/__tests__/canonical-tce-inputs.test.ts` inside the `describe` block:

```typescript
  test('threads daUsd through to VoyageInput', () => {
    const out = buildCanonicalTceInputs({ ...baseInput, daUsd: 45_000 });
    expect(out.daUsd).toBe(45_000);
  });

  test('daUsd is undefined when not provided (back-compat)', () => {
    const out = buildCanonicalTceInputs(baseInput);
    expect(out.daUsd).toBeUndefined();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest lib/economics/__tests__/canonical-tce-inputs.test.ts -t daUsd --maxWorkers=1 --no-coverage --forceExit`
Expected: FAIL — `out.daUsd` is `undefined` for the 45_000 case (property not passed through).

- [ ] **Step 3: Write minimal implementation**

In `lib/economics/canonical-tce-inputs.ts`, add the field to `CanonicalTceInputArgs` (after `canalUsd?`):

```typescript
  /** Pre-computed canal dues (USD) — Suez/Panama/Bosporus for both legs combined. */
  canalUsd?: number;
  /** Pre-computed port disbursement total (USD) — load + discharge fixed costs. */
  daUsd?: number;
}
```

And add it to the returned `VoyageInput` (after `canalUsd: args.canalUsd,`):

```typescript
    durationDays,
    canalUsd: args.canalUsd,
    daUsd: args.daUsd,
  };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest lib/economics/__tests__/canonical-tce-inputs.test.ts --maxWorkers=1 --no-coverage --forceExit`
Expected: PASS (all cases, including the two new ones).

- [ ] **Step 5: Commit**

```bash
git add lib/economics/canonical-tce-inputs.ts lib/economics/__tests__/canonical-tce-inputs.test.ts
git commit -m "feat(economics): thread daUsd through buildCanonicalTceInputs"
```

---

## Task 2: DA helper for the match path

**Files:**
- Create: `lib/port-da/match-da.ts`
- Test: `lib/port-da/__tests__/match-da.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/port-da/__tests__/match-da.test.ts`:

```typescript
import Database from 'better-sqlite3';
import { sumMatchPortDaUsd } from '@/lib/port-da/match-da';

// Minimal in-memory port_da_estimates fixture mirroring the seed schema.
function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE port_da_estimates (
      port_code TEXT, vessel_dwt_min INTEGER, vessel_dwt_max INTEGER,
      port_dues_usd REAL, pilotage_usd REAL, tugs_usd REAL,
      stevedoring_usd_per_mt REAL, cargo_type TEXT, confidence TEXT, source TEXT
    );
  `);
  const ins = db.prepare(`INSERT INTO port_da_estimates
    (port_code,vessel_dwt_min,vessel_dwt_max,port_dues_usd,pilotage_usd,tugs_usd,
     stevedoring_usd_per_mt,cargo_type,confidence,source) VALUES (?,?,?,?,?,?,?,?,?,?)`);
  // Constanta (ROCND): 10k + 5k + 3k = 18k fixed
  ins.run('ROCND', 0, 100000, 10000, 5000, 3000, 2, 'general', 'verified', 'seed');
  // Marmara (TRMAR): 8k + 4k + 2k = 14k fixed
  ins.run('TRMAR', 0, 100000, 8000, 4000, 2000, 2, 'general', 'verified', 'seed');
  return db;
}

describe('sumMatchPortDaUsd', () => {
  test('sums totalFixedUsd across both resolvable ports', () => {
    const db = makeDb();
    // resolvePort maps these names to ROCND / TRMAR UNLOCODEs.
    const total = sumMatchPortDaUsd(['constanta', 'marmara'], 30000, 'bulk', db);
    expect(total).toBe(18000 + 14000);
    db.close();
  });

  test('unknown port contributes 0, known port still counts', () => {
    const db = makeDb();
    const total = sumMatchPortDaUsd(['constanta', 'no-such-port-xyz'], 30000, 'bulk', db);
    expect(total).toBe(18000);
    db.close();
  });

  test('returns 0 when no ports resolve (never crashes, never fakes)', () => {
    const db = makeDb();
    const total = sumMatchPortDaUsd(['no-such-port-xyz', 'also-fake'], 30000, 'bulk', db);
    expect(total).toBe(0);
    db.close();
  });

  test('null/empty port names are skipped', () => {
    const db = makeDb();
    const total = sumMatchPortDaUsd(['constanta', null, ''], 30000, 'bulk', db);
    expect(total).toBe(18000);
    db.close();
  });
});
```

> NOTE before writing: verify the UNLOCODEs `resolvePort('constanta')` / `resolvePort('marmara')` actually return (`ROCND` / `TRMAR`). If the port DB resolves them to different codes, set the fixture `port_code` values to the codes `resolvePort` returns for these names (run a one-off `node -e` against `lib/ports/resolve`). The assertion numbers stay the same; only the fixture `port_code` strings must match what `resolvePort` produces.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest lib/port-da/__tests__/match-da.test.ts --maxWorkers=1 --no-coverage --forceExit`
Expected: FAIL — `Cannot find module '@/lib/port-da/match-da'`.

- [ ] **Step 3: Write minimal implementation**

Create `lib/port-da/match-da.ts`:

```typescript
import type Database from 'better-sqlite3';
import { getPortDa } from './repository';
import { resolvePort } from '@/lib/ports/resolve';

/**
 * Sum port disbursement (fixed) cost across a set of match-path port NAMES.
 *
 * Mirrors the detail-page resolveDaUsd (app/api/voyage/tce/route.ts) so the
 * match-LIST TCE and the voyage detail page agree: both sum getPortDa().totalFixedUsd
 * (port dues + pilotage + tugs) for the load and discharge ports, and both treat a
 * missing/unresolvable port as a 0 contribution rather than crashing or inventing a number.
 *
 * @param portNames  free-text port names (load, discharge); null/empty entries skipped
 * @param vesselDwt  vessel DWT for the DA band lookup
 * @param cargoType  free-text cargo class; getPortDa maps unknown → 'general'
 * @param db         match-path db handle (port_da_estimates lives in demo-seed.db)
 */
export function sumMatchPortDaUsd(
  portNames: Array<string | null | undefined>,
  vesselDwt: number,
  cargoType: string | null | undefined,
  db: Database.Database,
): number {
  let total = 0;
  for (const name of portNames) {
    if (!name) continue;
    try {
      const resolved = resolvePort(name);
      if (!resolved) continue;
      const da = getPortDa(
        { port: resolved, vesselDwt, cargoType: cargoType?.toLowerCase() },
        db,
      );
      if (da) total += da.totalFixedUsd;
    } catch {
      // Unresolvable port / lookup failure → 0 contribution (matches detail page).
    }
  }
  return total;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest lib/port-da/__tests__/match-da.test.ts --maxWorkers=1 --no-coverage --forceExit`
Expected: PASS (4 tests). If the resolve-codes NOTE applied, fixture codes already adjusted.

- [ ] **Step 5: Commit**

```bash
git add lib/port-da/match-da.ts lib/port-da/__tests__/match-da.test.ts
git commit -m "feat(port-da): sumMatchPortDaUsd helper mirroring detail-page DA"
```

---

## Task 3: Thread daUsd through computeEstimatedTce + buildMatchEconomics

**Files:**
- Modify: `lib/matching/tce-calculator.ts`
- Test: `lib/matching/__tests__/tce-calculator.test.ts`

> Before writing the test, confirm the test file path: `ls lib/matching/__tests__/ | grep -i tce`. If the buildMatchEconomics tests live in a differently named file, add the new test there instead of creating a new file.

- [ ] **Step 1: Write the failing test**

Add to the `buildMatchEconomics` describe block in `lib/matching/__tests__/tce-calculator.test.ts`:

```typescript
  test('daUsd lowers tceUsdPerDay and raises totalUsd vs zero-DA baseline', () => {
    const base = {
      cargoType: 'BULK',
      distanceNm: 1200,
      vesselDwt: 30000,
      quantityMt: 28000,
      speedKts: 12,
      consumptionMt: 22,
      loadPort: 'constanta',
      dischargePort: 'alexandria',
      calculatedAt: '2026-06-07T00:00:00.000Z',
    };
    const noDa = buildMatchEconomics({ ...base });
    const withDa = buildMatchEconomics({ ...base, daUsd: 40000 });
    expect(noDa).not.toBeNull();
    expect(withDa).not.toBeNull();
    // DA is a cost → total goes up, per-day TCE goes down.
    expect(withDa!.totalUsd).toBeGreaterThan(noDa!.totalUsd);
    expect(withDa!.tceUsdPerDay).toBeLessThan(noDa!.tceUsdPerDay);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest lib/matching/__tests__/tce-calculator.test.ts -t "daUsd lowers" --maxWorkers=1 --no-coverage --forceExit`
Expected: FAIL — `withDa.totalUsd` equals `noDa.totalUsd` (daUsd ignored), assertion `toBeGreaterThan` fails.

- [ ] **Step 3: Write minimal implementation**

In `lib/matching/tce-calculator.ts`:

(a) Add `da_usd` param to `computeEstimatedTce` (after `canal_usd?: number,`):

```typescript
export function computeEstimatedTce(
  freightRate: FreightRateEstimate,
  distance_nm: number,
  vessel_dwt: number,
  quantity_mt: number,
  speed_kts: number = DEFAULT_SPEED_KTS,
  consumption_mt_per_day: number = DEFAULT_CONSUMPTION_MT_PER_DAY,
  ballast_distance_nm?: number,
  canal_usd?: number,
  da_usd?: number,
): TceEstimate {
```

(b) Pass it into `buildCanonicalTceInputs` (after `canalUsd: canal_usd,`):

```typescript
    ballastDistanceNm: ballast_distance_nm,
    canalUsd: canal_usd,
    daUsd: da_usd,
  });
```

(c) Add `daUsd?` to `MatchEconomicsInput` (after the `ballastDistanceNm?` field):

```typescript
  ballastDistanceNm?: number | null;
  /** Pre-resolved port disbursement total (USD), load + discharge. Unknown/zero → omitted. */
  daUsd?: number | null;
}
```

(d) Pass it from `buildMatchEconomics` into `computeEstimatedTce` (extend the existing call):

```typescript
  const tce = computeEstimatedTce(
    freight,
    input.distanceNm,
    input.vesselDwt,
    input.quantityMt,
    input.speedKts,
    input.consumptionMt,
    ballastNm ?? undefined,
    canalUsd > 0 ? canalUsd : undefined,
    input.daUsd != null && input.daUsd > 0 ? input.daUsd : undefined,
  );
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest lib/matching/__tests__/tce-calculator.test.ts --maxWorkers=1 --no-coverage --forceExit`
Expected: PASS (new test + all existing — no expectation rewrites; daUsd defaults to undefined so legacy behavior is unchanged).

- [ ] **Step 5: Commit**

```bash
git add lib/matching/tce-calculator.ts lib/matching/__tests__/tce-calculator.test.ts
git commit -m "feat(match): accept daUsd in buildMatchEconomics/computeEstimatedTce"
```

---

## Task 4: Wire DA into the match enrichment loop

**Files:**
- Modify: `lib/matching/pair-analyzer.ts`

> This task has no new unit test of its own — `computeMatchEconomicsFor` is an internal helper exercised end-to-end by the existing pair-analyzer / match-realism suites and by the Task 5 dry measurement. Behavior is locked by Task 2 (helper) + Task 3 (threading). Verify by running the existing pair-analyzer suite green (Step 3).

- [ ] **Step 1: Add the import**

At the top of `lib/matching/pair-analyzer.ts`, with the other `lib/` imports:

```typescript
import { sumMatchPortDaUsd } from '@/lib/port-da/match-da';
```

- [ ] **Step 2: Compute and pass daUsd in `computeMatchEconomicsFor`**

In `computeMatchEconomicsFor` (pair-analyzer.ts ~252-319), after `ballastDistanceNm` is computed and before the `buildMatchEconomics({...})` call, add:

```typescript
  // Port disbursement (DA): load + discharge fixed costs from getPortDa.
  // db is the match-path handle (already used above for getBalticDayRate).
  // Unknown ports / no db → 0 (graceful), matching the voyage detail page.
  const daUsd = db ? sumMatchPortDaUsd([loadPort, dischargePort], ecoDwt, cargoType, db) : 0;
```

Then add `daUsd` to the `buildMatchEconomics({...})` argument object (after `ballastDistanceNm,`):

```typescript
    ballastDistanceNm,
    daUsd,
  });
```

- [ ] **Step 3: Run the affected suites to verify no regression**

Run: `npx jest --findRelatedTests lib/matching/pair-analyzer.ts lib/port-da/match-da.ts lib/economics/canonical-tce-inputs.ts lib/matching/tce-calculator.ts --maxWorkers=1 --no-coverage --forceExit`
Expected: PASS. (`db` is optional in the analyze path; when absent, `daUsd=0` preserves legacy output.)

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add lib/matching/pair-analyzer.ts
git commit -m "feat(match): feed port-DA into match-list TCE via pair-analyzer"
```

---

## Task 5: Before/after money-impact measurement (READ-ONLY)

**Goal:** Quantify the TCE + bucket-count shift on the prod demo-seed so the founder sees the money impact BEFORE any regen. Strictly read-only — uses `--dry`, writes nothing.

**Files:** none modified. This task runs commands and records output in the PR description.

- [ ] **Step 1: Confirm the prod demo-seed path and that `--dry` writes nothing**

Run: `grep -n "demo-seed.db\|--dry\|opts.dry" scripts/demo-seed/regenerate-matches.ts | head`
Expected: default `--db data/demo-seed.db`; `--dry` short-circuits writes (regenerate-matches.ts:106 `if (opts.dry) return;`). Confirm before running against prod data.

- [ ] **Step 2: Capture BEFORE (current HEAD / main behavior)**

From a clean checkout of `main` (or stash the branch), run:

```bash
npx tsx scripts/demo-seed/regenerate-matches.ts --db data/demo-seed.db --dry 2>&1 | tee /tmp/portda-before.txt
```

Record: count of matches, distribution across fit buckets, and a sample of `tce_usd_per_day` values for 5-10 representative matches (load+discharge ports that exist in `port_da_estimates`).

> If `regenerate-matches.ts --dry` does not by itself print per-match TCE/bucket counts, add a tiny read-only reporting block to the dry path is OUT OF SCOPE (no prod code edits). Instead, query the db directly read-only:
> ```bash
> sqlite3 -readonly data/demo-seed.db \
>   "SELECT match_level, COUNT(*), ROUND(AVG(tce_usd_per_day)) FROM matches GROUP BY match_level;"
> ```
> (Adjust column/table names to the actual schema — confirm with `sqlite3 -readonly data/demo-seed.db '.schema matches'`.)

- [ ] **Step 3: Capture AFTER (this branch)**

On `plan/portda-tce` with Tasks 1-4 implemented, recompute in-memory (dry) and capture the same metrics:

```bash
npx tsx scripts/demo-seed/regenerate-matches.ts --db data/demo-seed.db --dry 2>&1 | tee /tmp/portda-after.txt
```

- [ ] **Step 4: Diff and record the money impact**

```bash
diff /tmp/portda-before.txt /tmp/portda-after.txt | head -60
```

Record in the PR description: average `tce_usd_per_day` delta (expected: down by ~DA/voyage-days), how many matches changed `match_level`/bucket, and which buckets shrank/grew. This is the founder-facing "money number got more honest" evidence.

> Read-only guarantee: never run `regenerate-matches.ts` WITHOUT `--dry` against `data/demo-seed.db` in this task. Prod regen is the orchestrator's job later (brief Scope OUT).

---

## Self-Review (completed against the brief)

**Spec coverage:**
- Scope IN "add daUsd to canonical TCE inputs sourced from getPortDa for load+discharge, keyed as getPortDa expects" → Tasks 1, 2, 4. Keying: `resolvePort(name) → portCode` (Task 2).
- Scope IN "thread db handle to where getPortDa is callable, match existing db pattern" → Task 4 (db already a `computeMatchEconomicsFor` param, used like `getBalticDayRate(db,...)`).
- Scope IN "no-DA fallback, decide+justify, prefer detail-page behavior, don't crash/fake" → Task 2 (try/catch, null→0) + design decision #4.
- Scope IN "daUsd flows into total voyage cost AND tceUsdPerDay" → `calculateTCE` already subtracts `da_usd` from costs and divides into per-day (voyage-calculator.ts:165-166, 198+); verified by Task 3 test (both `totalUsd↑` and `tceUsdPerDay↓`).
- Deliverable "before/after dry measurement, READ-ONLY" → Task 5.
- Scope OUT (bunker/EUA/war-risk-per-day/canal-beyond-Suez, fit-factor weight ~18, prod regen) → untouched; only the TCE input gains DA.

**Placeholder scan:** no TBD/TODO; every code step has full code; two NOTEs flag pre-write verifications (resolve UNLOCODEs, test-file path, schema column names) — these are discovery checks, not placeholders.

**Type consistency:** `daUsd` (camelCase) on `CanonicalTceInputArgs`/`VoyageInput`/`MatchEconomicsInput`; `da_usd` (snake) as the `computeEstimatedTce` positional param matching its sibling `canal_usd`; helper `sumMatchPortDaUsd(portNames, vesselDwt, cargoType, db)` signature consistent between Task 2 definition and Task 4 call site. `getPortDa({ port: ResolvedPort, vesselDwt, cargoType }, db)` matches repository.ts:56-59 overload.

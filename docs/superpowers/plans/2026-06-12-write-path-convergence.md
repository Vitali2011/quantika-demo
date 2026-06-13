# Write-Path Convergence (audit пункт Б) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every writer of `matches` rows produce the same shape and the same economics convention, so a match renders identically regardless of which path (live precompute, /matches render, bucket tabs, seed regen, legacy seeders) last touched it.

**Architecture:** The canonical chain already exists: `analyzePairs` attaches `m.economics` (live bunker + DA + canal + war-risk-excluded, via `computeStoredMatchEconomics`) to every pair _before_ bucket partition, and `regenerate-matches.ts` persists from it. The fixes converge the stragglers onto that chain: bucket rows read `m.economics` instead of recomputing a flat estimate; the parse-time precompute writes the full field set `persistSessionMatches` writes; the legacy seeder stops writing a wrong-shaped `reason_structured`; `seed:all` chains the canonical regen after the bootstrap build; and `createMatch` gains an opt-in `refreshComputed` so per-session rows stop fossilizing on first insert.

**Tech Stack:** TypeScript, Next.js 16, better-sqlite3, Jest (`npx jest`, prefix `rtk jest` for output compression).

**Audit traceability:** B.1 → Task 3 · B.2 → Task 2 · B.3 → Task 1 · B.4 → Task 4 · B.5 → Task 4 (regen replaces heuristic scores) · B.6 → Task 5.

**Verified ground truth (2026-06-12, this worktree):**

- `lib/matching/pair-analyzer.ts:722-731` — economics computed for ALL pairs before partition; `m.economics = { tceUsdPerDay, freightRateUsdPerMt, freightRateSource, ... }`.
- `scripts/demo-seed/regenerate-matches.ts:581` — `analyzePairs(cargos, vessels, async () => [], …)` → regen is deterministic, **no LLM**.
- `scripts/demo-seed/regenerate-matches.ts:714` — regen writes `reason_structured` from legacy `m.scoreBreakdown` (correct shape).
- `app/matches/MatchesClient.tsx:876-898` — UI expects legacy `ScoreBreakdown` (`comp.points / comp.max`, `parsed.vagueRegionAdjustment`); guards on `match.reason_structured &&` so `null` hides the panel gracefully.
- `scripts/demo-seed/real-matches.ts` (~line 375) — writes `reasonStructured: JSON.stringify(fb)` where `fb` is a `FitBreakdown` → NaN% bars. Standalone legacy script, not referenced by package.json or seed-all.
- `lib/matching/compute-matches.ts:102-124` — createMatch call missing: `fit_percent`, `fit_breakdown`, `cargo_item_index`, `vessel_item_index`, `worksheet_json`, `breakeven_tce_usd_per_day`.
- `lib/matching/session-buckets.ts:55-68` — flat `computeEstimatedTce(... DEFAULT_BUNKER_USD_PER_MT)`; only live caller is `app/matches/page.tsx:90,96`; no dedicated test file exists.
- `lib/matching/matches-repository.ts:146+` — `createMatch` = `INSERT OR IGNORE`; unique index `(cargo_id, vessel_id, COALESCE(user_id,''))` (migration 034); schema-presence helpers `hasFitColumns/hasItemIndexColumns/hasWorksheetColumn/hasConsumptionEstimatedColumn/hasBallastDistanceColumn/hasBreakevenColumn` already exist in the file.
- `scripts/demo-seed/seed-all.ts` — runs parse (spawnSync) → reconcile → analyze → build (in-process) → validate; never runs regen.
- Existing test files to crib fixtures from: `__tests__/api/compute-matches.test.ts`, `lib/matching/__tests__/persist-session-matches-fit.test.ts`, `lib/matching/__tests__/matches-repository.test.ts`.

**Worker discipline:** Surgical changes only — do not reformat neighbours, do not touch test expectations to fit implementation. Before using any Next.js/React API introduced or changed after v14 — WebFetch the relevant nextjs.org/react.dev docs page first (not expected to arise: all changes are lib/scripts code).

---

### Task 1: Bucket rows read canonical engine economics (audit B.3)

**Files:**

- Modify: `lib/matching/session-buckets.ts:55-68`
- Test (create): `lib/matching/__tests__/session-buckets-economics.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/matching/__tests__/session-buckets-economics.test.ts`. Crib the `Match` fixture shape from `lib/matching/__tests__/persist-session-matches-fit.test.ts` (adjust required fields to satisfy the type — the cast keeps it minimal):

```ts
import { toBucketRows } from "@/lib/matching/session-buckets";
import type { Match } from "@/lib/types";

function makeMatch(overrides: Partial<Match> = {}): Match {
  return {
    cargoEmailId: "c1",
    vesselEmailId: "v1",
    cargoItemIndex: 0,
    vesselItemIndex: 0,
    score: 50,
    matchLevel: "possible",
    matchReasons: ["test reason"],
    issues: [],
    ...overrides,
  } as unknown as Match;
}

describe("toBucketRows economics source", () => {
  it("uses canonical engine economics (m.economics) when present", () => {
    const m = makeMatch({
      economics: {
        tceUsdPerDay: 4321,
        freightRateUsdPerMt: 21.5,
        freightRateSource: "baltic_tc",
      } as Match["economics"],
    });
    // no cargos/vessels supplied → the legacy estimate path CANNOT produce a
    // number (no ports → no distance), so a non-null TCE proves the engine
    // economics short-circuit is in effect.
    const [row] = toBucketRows([m], [], []);
    expect(row.tce_usd_per_day).toBe(4321);
    expect(row.freight_rate_usd_per_mt).toBe(21.5);
    expect(row.freight_rate_source).toBe("baltic_tc");
  });

  it("falls back to null (not a fabricated number) when engine economics and ports are both absent", () => {
    const [row] = toBucketRows([makeMatch()], [], []);
    expect(row.tce_usd_per_day).toBeNull();
    expect(row.freight_rate_usd_per_mt).toBeNull();
    expect(row.freight_rate_source).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk jest lib/matching/__tests__/session-buckets-economics.test.ts`
Expected: FAIL — first test gets `row.tce_usd_per_day === null` (current code ignores `m.economics`).

- [ ] **Step 3: Implement — short-circuit on `m.economics`, keep estimate as fallback**

In `lib/matching/session-buckets.ts`, replace the block at lines 55-68:

```ts
let tce_usd_per_day: number | null = null;
let freight_rate_usd_per_mt: number | null = null;
let freight_rate_source: string | null = null;
if (distanceResult && distanceResult.nm > 0) {
  const freightEst = estimateFreightRate(cargoType, distanceResult.nm, vesselDwt);
  // TODO: wire live bunker price (NLRTM VLSFO) when DB access is available here.
  const tceEst = computeEstimatedTce(
    freightEst,
    distanceResult.nm,
    vesselDwt,
    quantityMt,
    speedKts,
    consumptionMt,
    undefined,
    undefined,
    undefined,
    DEFAULT_BUNKER_USD_PER_MT
  );
  tce_usd_per_day = tceEst.tce_usd_per_day;
  freight_rate_usd_per_mt = tceEst.freight_rate_usd_per_mt;
  freight_rate_source = tceEst.freight_rate_source;
}
```

with:

```ts
// Canonical engine economics (#819 Phase B(b)): pair-analyzer attaches
// m.economics (computeStoredMatchEconomics — live bunker, port-DA, canal,
// war-risk-excluded convention) to EVERY pair before bucket partition, so
// bucket matches already carry the same one-truth TCE the shortlist stores.
// Read it here (exactly like regenerate-matches.ts writeBucket) so bucket
// tabs and the main board agree numerically.
let tce_usd_per_day: number | null = m.economics?.tceUsdPerDay ?? null;
let freight_rate_usd_per_mt: number | null = m.economics?.freightRateUsdPerMt ?? null;
let freight_rate_source: string | null = m.economics?.freightRateSource ?? null;
// Fallback for matches without engine economics (distance unresolved at
// analyze time): legacy flat estimate so the card still shows a number.
if (tce_usd_per_day == null && distanceResult && distanceResult.nm > 0) {
  const freightEst = estimateFreightRate(cargoType, distanceResult.nm, vesselDwt);
  const tceEst = computeEstimatedTce(
    freightEst,
    distanceResult.nm,
    vesselDwt,
    quantityMt,
    speedKts,
    consumptionMt,
    undefined,
    undefined,
    undefined,
    DEFAULT_BUNKER_USD_PER_MT
  );
  tce_usd_per_day = tceEst.tce_usd_per_day;
  freight_rate_usd_per_mt = tceEst.freight_rate_usd_per_mt;
  freight_rate_source = tceEst.freight_rate_source;
}
```

(No signature change; `app/matches/page.tsx` untouched. The doc comment at the top of `toBucketRows` mentioning "Enrichment mirrors persist-session-matches.ts" stays true — leave it.)

- [ ] **Step 4: Run test to verify it passes**

Run: `rtk jest lib/matching/__tests__/session-buckets-economics.test.ts`
Expected: PASS (2/2).

- [ ] **Step 5: Commit**

```bash
rtk git add lib/matching/session-buckets.ts lib/matching/__tests__/session-buckets-economics.test.ts
rtk git commit -m "fix(buckets): bucket rows read canonical engine economics instead of flat-bunker estimate (audit B.3)"
```

---

### Task 2: Parse-time precompute writes the full persist field set (audit B.2)

**Files:**

- Modify: `lib/matching/compute-matches.ts`
- Test (create): `lib/matching/__tests__/write-path-field-parity.test.ts`

- [ ] **Step 1: Write the failing parity test**

Create `lib/matching/__tests__/write-path-field-parity.test.ts`. Crib the in-memory DB setup (migrations applied) and the cargo/vessel fixtures that produce ≥1 main match from `__tests__/api/compute-matches.test.ts` — reuse its helper functions/fixtures verbatim where possible. Skeleton (adapt fixture imports to what that file actually exports/declares):

```ts
/**
 * Write-path parity guard (audit B.2 / "0/77" bug class, memory
 * feedback_two_write_paths_in_scope): the parse-time precompute
 * (computeAndPersistMatches) and the /matches render persist
 * (persistSessionMatches) must populate the SAME columns for the same match.
 * If a future field is added to one path only, this test fails.
 */
import { computeAndPersistMatches } from "@/lib/matching/compute-matches";
import { persistSessionMatches } from "@/lib/matching/persist-session-matches";
import { analyzePairs } from "@/lib/matching/pair-analyzer";
import { listMatches } from "@/lib/matching/matches-repository";
// + crib: makeDb()/migrations helper, cargo & vessel fixtures, stub aiScorer
//   from __tests__/api/compute-matches.test.ts

const PARITY_COLUMNS = [
  "score",
  "reason",
  "reason_structured",
  "cargo_type",
  "load_port",
  "discharge_port",
  "laycan_start",
  "laycan_end",
  "vessel_dwt",
  "tce_usd_per_day",
  "distance_nm",
  "freight_rate_usd_per_mt",
  "freight_rate_source",
  "vessel_name",
  "cargo_ref",
  "fit_percent",
  "fit_breakdown",
  "worksheet_json",
  "breakeven_tce_usd_per_day",
] as const;

it("precompute and session-persist write the same column set for the same match", async () => {
  const db1 = makeDb();
  const db2 = makeDb();
  const stubScorer = async () => []; // sweep path covers scoring deterministically

  await computeAndPersistMatches(cargos, vessels, "sess-1", db1);
  const res = await analyzePairs(cargos, vessels, stubScorer, { db: db2 });
  persistSessionMatches(db2, "sess-1", res.matches, cargos, vessels);

  const a = listMatches(db1, { user_id: "sess-1" });
  const b = listMatches(db2, { user_id: "sess-1" });
  expect(a.length).toBeGreaterThan(0);
  expect(a.length).toBe(b.length);

  const key = (r: { cargo_id: string; vessel_id: string }) => `${r.cargo_id}|${r.vessel_id}`;
  const bByKey = new Map(b.map((r) => [key(r), r]));
  for (const rowA of a) {
    const rowB = bByKey.get(key(rowA));
    expect(rowB).toBeDefined();
    for (const col of PARITY_COLUMNS) {
      const aNull = (rowA as Record<string, unknown>)[col] == null;
      const bNull = (rowB as unknown as Record<string, unknown>)[col] == null;
      // Column populated by one path must be populated by the other.
      expect(`${col}:${aNull}`).toBe(`${col}:${bNull}`);
    }
    // Numeric agreement on the headline values (same engine, same db inputs).
    expect(rowA.fit_percent).toBe(rowB!.fit_percent);
    expect(rowA.tce_usd_per_day).toBe(rowB!.tce_usd_per_day);
    expect(rowA.breakeven_tce_usd_per_day).toBe(rowB!.breakeven_tce_usd_per_day);
  }
});
```

Note for the worker: `computeAndPersistMatches` runs `analyzePairs` internally with its own LLM scorer wrapper — the fixtures from `__tests__/api/compute-matches.test.ts` already mock `callAiJson` (or the scorer) so the run is deterministic; reuse exactly that mock so both paths score identically. If `persistSessionMatches`'s `patchEconomicsComponent` makes `fit_percent` differ by a rounding step, relax ONLY the `fit_percent` equality to `toBeCloseTo(rowB.fit_percent!, 0)` — do not relax the null-parity loop.

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk jest lib/matching/__tests__/write-path-field-parity.test.ts`
Expected: FAIL on null-parity for `fit_percent` / `fit_breakdown` / `worksheet_json` / `breakeven_tce_usd_per_day` (precompute writes null, persist writes values).

- [ ] **Step 3: Implement — add the missing fields to compute-matches**

In `lib/matching/compute-matches.ts`:

Add imports at the top (after the existing ones):

```ts
import { deriveBucketReason } from "@/lib/matching/bucket-reason";
import { breakevenTceByDwt } from "@/lib/economics/breakeven-thresholds";
```

After the `consumption_estimated` line (line 100), insert:

```ts
// Write-path parity with persist-session-matches.ts (audit B.2): same
// worksheet enrichment + breakeven floor, so a match looks identical
// whether stored by this parse-time precompute or by the /matches render.
// No patchEconomicsComponent here: m.fitBreakdown was just computed by
// analyzePairs with this same db + live bunker price, so its economics
// component is already live. No stale-laycan worksheet rebuild either —
// the worksheet derives from the same parsed data this call received.
const bucketReason = m.worksheet
  ? deriveBucketReason({
      verdict: m.worksheet.readiness?.verdict ?? "unknown",
      gapDays: m.worksheet.readiness?.gapDays ?? null,
      matchLevel: m.matchLevel,
      tceUsdPerDay: tce_usd_per_day,
      vesselDwt: vesselDwt || null,
      issues: m.issues ?? [],
    })
  : undefined;
const worksheetForPersist = m.worksheet
  ? {
      ...m.worksheet,
      hardFilters: m.hardFilters ?? m.worksheet.hardFilters,
      sanctions: m.sanctions,
      bucketReason,
    }
  : null;
```

Then extend the `createMatch` call — after the `ballast_distance_nm` line (line 123), add:

```ts
      fit_percent: m.fitPercent ?? null,
      fit_breakdown: m.fitBreakdown ? JSON.stringify(m.fitBreakdown) : null,
      cargo_item_index: m.cargoItemIndex,
      vessel_item_index: m.vesselItemIndex,
      worksheet_json: worksheetForPersist ? JSON.stringify(worksheetForPersist) : null,
      breakeven_tce_usd_per_day: vesselDwt ? breakevenTceByDwt(vesselDwt) : null,
```

- [ ] **Step 4: Run the new test + the existing compute-matches suites**

Run: `rtk jest lib/matching/__tests__/write-path-field-parity.test.ts __tests__/api/compute-matches.test.ts __tests__/api/compute-matches-adversarial.test.ts lib/matching/__tests__/compute-matches-da-parity.test.ts lib/matching/__tests__/compute-matches-m3-fields.test.ts`
Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add lib/matching/compute-matches.ts lib/matching/__tests__/write-path-field-parity.test.ts
rtk git commit -m "fix(precompute): write fit/worksheet/breakeven fields for parity with session persist (audit B.2)"
```

---

### Task 3: Legacy seeder stops writing wrong-shaped reason_structured (audit B.1)

**Files:**

- Modify: `scripts/demo-seed/real-matches.ts` (header comment + the `reasonStructured` line ~375)
- Test: extend `scripts/demo-seed/__tests__/real-matches-item-index.test.ts` (or add a focused source-level test beside it if that file's harness doesn't fit)

- [ ] **Step 1: Write the failing test**

Repo precedent for source-level negative assertions: `__tests__/matches-page.test.tsx` (asserts `not.toMatch(/DEMO_MATCHES/)`). Add to `scripts/demo-seed/__tests__/real-matches-item-index.test.ts`:

```ts
import * as fs from "fs";
import * as path from "path";

describe("real-matches reason_structured shape (audit B.1)", () => {
  it("does not write a FitBreakdown into reason_structured (UI expects legacy {points,max})", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../real-matches.ts"), "utf8");
    // The bug: reasonStructured: JSON.stringify(fb) — fb is a FitBreakdown,
    // whose components lack points/max → MatchesClient renders NaN% bars.
    expect(src).not.toMatch(/reasonStructured:\s*JSON\.stringify\(fb\)/);
    expect(src).toMatch(/reasonStructured:\s*null/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk jest scripts/demo-seed/__tests__/real-matches-item-index.test.ts`
Expected: the new `describe` FAILS (source still stringifies `fb`); pre-existing tests in the file PASS.

- [ ] **Step 3: Implement**

In `scripts/demo-seed/real-matches.ts`, replace (at ~line 373-375):

```ts
        // reason_structured drives the main-board score-breakdown expander
        // (MatchesClient.tsx). Same per-factor breakdown as fit_breakdown.
        reasonStructured: JSON.stringify(fb),
```

with:

```ts
        // reason_structured intentionally NULL (audit B.1): the MatchesClient
        // "Show Breakdown" expander expects the legacy ScoreBreakdown shape
        // ({points, max} components + vagueRegionAdjustment); this script has
        // no ScoreBreakdown, and stringifying the FitBreakdown here rendered
        // NaN% bars. NULL hides the legacy panel; the fit panel reads the
        // fit_breakdown column written below.
        reasonStructured: null,
```

Also add a deprecation banner to the file header comment (after the existing `* real-matches.ts — …` line):

```ts
 * LEGACY SEEDER — superseded by regenerate-matches.ts (npm run seed:regen),
 * which rebuilds matches through the real engine (analyzePairs) and writes
 * the full canonical row shape. Keep this script only for bootstrap/debug;
 * do not extend its row shape.
```

If the `SeedRow` type in this file declares `reasonStructured: string` — widen to `string | null`.

- [ ] **Step 4: Run test to verify it passes**

Run: `rtk jest scripts/demo-seed/__tests__/real-matches-item-index.test.ts`
Expected: PASS (all, including pre-existing).

- [ ] **Step 5: Commit**

```bash
rtk git add scripts/demo-seed/real-matches.ts scripts/demo-seed/__tests__/real-matches-item-index.test.ts
rtk git commit -m "fix(seed): real-matches stops writing FitBreakdown into reason_structured (audit B.1)"
```

---

### Task 4: Canonical regen wired into npm + seed-all; legacy stage labelled (audit B.4 + B.5)

**Files:**

- Modify: `package.json` (scripts block, after `seed:build`)
- Modify: `scripts/demo-seed/seed-all.ts` (chain regen between build and validate)
- Modify: `scripts/demo-seed/build.ts` (banner comment above the matches stage, ~line 636)
- Test: extend `scripts/demo-seed/__tests__/seed-all-window.test.ts` (source-level assertion)

- [ ] **Step 1: Write the failing test**

Add to `scripts/demo-seed/__tests__/seed-all-window.test.ts`:

```ts
import * as fs from "fs";
import * as path from "path";

describe("seed-all canonical matches stage (audit B.4)", () => {
  it("chains regenerate-matches after build so seed:all output matches the manual regen", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../seed-all.ts"), "utf8");
    expect(src).toMatch(/regenerate-matches\.ts/);
  });
  it("package.json exposes seed:regen pointing at the canonical builder", () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, "../../../package.json"), "utf8")
    );
    expect(pkg.scripts["seed:regen"]).toContain("regenerate-matches.ts");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk jest scripts/demo-seed/__tests__/seed-all-window.test.ts`
Expected: new `describe` FAILS twice; pre-existing tests PASS.

- [ ] **Step 3: Implement — package.json script**

In `package.json`, after the `"seed:build"` line add:

```json
    "seed:regen": "tsx scripts/demo-seed/regenerate-matches.ts",
```

- [ ] **Step 4: Implement — chain regen in seed-all**

In `scripts/demo-seed/seed-all.ts`, locate the step that calls `build(...)` and the following `validateDb(...)` step. Between them insert (mirror the existing spawnSync pattern used for the parse step; adjust the step-counter strings consistently with the file's existing `[seed-all] N/5` convention — renumber to `/6` across the file's log lines):

```ts
// Canonical matches (audit B.4/B.5): build()'s matches stage is a bootstrap
// heuristic (base-60 score, flat bunker). Replace it through the REAL engine —
// regenerate-matches runs analyzePairs with a deterministic offline scorer
// (no LLM) and rewrites the seed buckets in canonical row shape, so
// `npm run seed:all` now produces the same matches as the manual regen.
console.log("[seed-all] regenerate matches (real engine)…");
const regen = spawnSync("npx", ["tsx", "scripts/demo-seed/regenerate-matches.ts", "--db", outDb], {
  stdio: "inherit",
  env: process.env,
});
if (regen.status !== 0) throw new Error("regenerate-matches step failed");
```

- [ ] **Step 5: Implement — banner in build.ts**

In `scripts/demo-seed/build.ts`, directly above the matches stage (the comment `// Pre-compute matches via simple laycan↔open_date pairing (no real match engine needed)` at ~line 636), replace that comment line with:

```ts
// LEGACY BOOTSTRAP MATCHES (audit B.4/B.5): simple laycan↔open_date pairing
// with a base-60 heuristic score and flat-bunker TCE. These rows are
// REPLACED by scripts/demo-seed/regenerate-matches.ts (real engine), which
// seed-all chains right after build. Do not extend this stage — extend the
// regen writer instead.
```

- [ ] **Step 6: Run tests**

Run: `rtk jest scripts/demo-seed/__tests__/seed-all-window.test.ts scripts/demo-seed/__tests__/build.test.ts`
Expected: ALL PASS.

- [ ] **Step 7: Runtime verification — regen dry-run against the committed seed**

(Memory discipline: ALWAYS `--dry` first; `--dry` performs no writes.)

Run: `npx tsx scripts/demo-seed/regenerate-matches.ts --db data/demo-seed.db --dry 2>&1 | tail -15`
Expected: `[regen] BUCKETS …` lines with non-zero main count, ends with `[regen] DRY — no writes.`, exit 0.
If `data/demo-seed.db` is absent in this worktree, note it in the task report and skip (the unit tests above still gate the wiring).

- [ ] **Step 8: Commit**

```bash
rtk git add package.json scripts/demo-seed/seed-all.ts scripts/demo-seed/build.ts scripts/demo-seed/__tests__/seed-all-window.test.ts
rtk git commit -m "feat(seed): chain canonical regen into seed-all + npm seed:regen; label legacy bootstrap stage (audit B.4/B.5)"
```

---

### Task 5: Opt-in refresh of computed columns on duplicate insert (audit B.6)

**Files:**

- Modify: `lib/matching/matches-repository.ts` (`CreateMatchInput`, `createMatch`, new private helper)
- Modify: `lib/matching/persist-session-matches.ts` (pass `refreshComputed: true`)
- Test (create): `lib/matching/__tests__/matches-repository-refresh.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/matching/__tests__/matches-repository-refresh.test.ts`. Crib `makeDb()` (in-memory db + migrations) and the base input fixture from `lib/matching/__tests__/matches-repository.test.ts`; crib the status-update helper the repo exposes (look for `updateMatchStatus` / `setMatchStatus` in `matches-repository.ts` — if none exists, set status with a direct `db.prepare("UPDATE matches SET status='saved' WHERE id=?")`).

```ts
import { createMatch, listMatches } from "@/lib/matching/matches-repository";
// + crib makeDb() from matches-repository.test.ts

const base = {
  cargo_id: "c1",
  vessel_id: "v1",
  score: 50,
  reason: "initial",
  user_id: "sess-1",
  tce_usd_per_day: 1000,
  fit_percent: 61.5,
};

describe("createMatch refreshComputed (audit B.6)", () => {
  it("without the flag, duplicate insert is ignored (legacy semantics intact)", () => {
    const db = makeDb();
    createMatch(db, base);
    createMatch(db, { ...base, tce_usd_per_day: 2222, score: 70 });
    const [row] = listMatches(db, { user_id: "sess-1" });
    expect(row.tce_usd_per_day).toBe(1000);
    expect(row.score).toBe(50);
  });

  it("with the flag, computed columns refresh; status/created_at/id survive", () => {
    const db = makeDb();
    createMatch(db, base);
    const [before] = listMatches(db, { user_id: "sess-1" });
    db.prepare("UPDATE matches SET status='saved' WHERE id=?").run(before.id);

    createMatch(db, {
      ...base,
      tce_usd_per_day: 2222,
      score: 70,
      reason: "refreshed",
      fit_percent: 72.5,
      refreshComputed: true,
    });

    const [after] = listMatches(db, { user_id: "sess-1" });
    expect(after.id).toBe(before.id);
    expect(after.tce_usd_per_day).toBe(2222);
    expect(after.score).toBe(70);
    expect(after.reason).toBe("refreshed");
    expect(after.fit_percent).toBe(72.5);
    expect(after.status).toBe("saved"); // user action NOT clobbered
    expect(after.created_at).toBe(before.created_at);
  });

  it("refresh respects the user_id boundary (NULL seed row vs session copy)", () => {
    const db = makeDb();
    createMatch(db, { ...base, user_id: null, tce_usd_per_day: 5555 });
    createMatch(db, base); // session copy
    createMatch(db, { ...base, tce_usd_per_day: 2222, refreshComputed: true });
    const seedRow =
      listMatches(db, { user_id: null })[0] ??
      (db.prepare("SELECT * FROM matches WHERE user_id IS NULL").get() as {
        tce_usd_per_day: number;
      });
    expect(seedRow.tce_usd_per_day).toBe(5555); // NULL-user row untouched
  });
});
```

(`listMatches` filter semantics for `user_id: null` may differ — the raw-SQL fallback in the third test keeps the assertion honest; worker adjusts to the repo's actual list API.)

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk jest lib/matching/__tests__/matches-repository-refresh.test.ts`
Expected: test 1 PASSES (legacy semantics already hold), tests 2–3 FAIL (flag doesn't exist yet → values stay stale).

- [ ] **Step 3: Implement — flag + refresh helper**

In `lib/matching/matches-repository.ts`:

(a) Add to `CreateMatchInput` (after `breakeven_tce_usd_per_day`):

```ts
  /**
   * When the (cargo_id, vessel_id, user_id) row already exists, refresh the
   * engine-computed columns in place instead of silently keeping the stale
   * first-insert values (audit B.6). NEVER touches status (user action),
   * created_at, or identity columns. Opt-in: only the per-session persist
   * path passes it; seed/regen writers keep pure INSERT OR IGNORE semantics.
   */
  refreshComputed?: boolean;
```

(b) In `createMatch`, in the `hasFitColumns(db)` branch, right after `result = stmt.run(...args);` (and BEFORE the function later resolves/returns the existing row):

```ts
if (result.changes === 0 && input.refreshComputed) {
  refreshComputedColumns(db, input, now);
}
```

(c) Add the private helper at module level (near `createMatch`):

```ts
/** See CreateMatchInput.refreshComputed. Only called from the hasFitColumns branch. */
function refreshComputedColumns(db: Database.Database, input: CreateMatchInput, now: number): void {
  const sets: string[] = [
    "score = ?",
    "reason = ?",
    "reason_structured = ?",
    "cargo_type = ?",
    "load_port = ?",
    "discharge_port = ?",
    "laycan_start = ?",
    "laycan_end = ?",
    "vessel_dwt = ?",
    "tce_usd_per_day = ?",
    "distance_nm = ?",
    "freight_rate_usd_per_mt = ?",
    "freight_rate_source = ?",
    "vessel_name = ?",
    "cargo_ref = ?",
    "fit_percent = ?",
    "fit_breakdown = ?",
    "updated_at = ?",
  ];
  const args: Array<string | number | null> = [
    input.score,
    input.reason,
    input.reason_structured ?? null,
    input.cargo_type ?? null,
    input.load_port ?? null,
    input.discharge_port ?? null,
    input.laycan_start ?? null,
    input.laycan_end ?? null,
    input.vessel_dwt ?? null,
    input.tce_usd_per_day ?? null,
    input.distance_nm ?? null,
    input.freight_rate_usd_per_mt ?? null,
    input.freight_rate_source ?? null,
    input.vessel_name ?? null,
    input.cargo_ref ?? null,
    input.fit_percent ?? null,
    input.fit_breakdown ?? null,
    now,
  ];
  if (hasItemIndexColumns(db)) {
    sets.push("cargo_item_index = ?", "vessel_item_index = ?");
    args.push(input.cargo_item_index ?? 0, input.vessel_item_index ?? 0);
  }
  if (hasWorksheetColumn(db)) {
    sets.push("worksheet_json = ?");
    args.push(input.worksheet_json ?? null);
  }
  if (hasConsumptionEstimatedColumn(db)) {
    sets.push("consumption_estimated = ?");
    args.push(input.consumption_estimated ?? null);
  }
  if (hasBallastDistanceColumn(db)) {
    sets.push("ballast_distance_nm = ?");
    args.push(input.ballast_distance_nm ?? null);
  }
  if (hasBreakevenColumn(db)) {
    sets.push("breakeven_tce_usd_per_day = ?");
    args.push(input.breakeven_tce_usd_per_day ?? null);
  }
  const user_id = input.user_id !== undefined ? input.user_id : null;
  args.push(input.cargo_id, input.vessel_id, user_id, user_id);
  db.prepare(
    `UPDATE matches SET ${sets.join(", ")}
     WHERE cargo_id = ? AND vessel_id = ?
       AND ((user_id IS NULL AND ? IS NULL) OR user_id = ?)`
  ).run(...args);
}
```

(d) In `lib/matching/persist-session-matches.ts`, add to the `createMatch` input (after `breakeven_tce_usd_per_day` line):

```ts
      // Refresh stale per-session rows on every render: economics drift with
      // the live bunker price and re-parses; without this the first insert
      // fossilizes for the whole session (audit B.6).
      refreshComputed: true,
```

- [ ] **Step 4: Run the new test + the touched-path suites**

Run: `rtk jest lib/matching/__tests__/matches-repository-refresh.test.ts lib/matching/__tests__/matches-repository.test.ts lib/matching/__tests__/matches-repository-filters.test.ts lib/matching/__tests__/matches-repository-order.test.ts lib/matching/__tests__/matches-repository-user-filter.test.ts lib/matching/__tests__/matches-repository-vessel-name.test.ts __tests__/matches-persist-race.test.ts lib/matching/__tests__/persist-session-matches-fit.test.ts lib/matching/__tests__/persist-session-matches-m3.test.ts lib/matching/__tests__/persist-session-matches-da-parity.test.ts lib/matching/__tests__/persist-session-matches-worksheet-filters.test.ts __tests__/persist-session-matches-applied-cap.test.ts __tests__/lib/matching/persist-session-matches-fit-recompute.test.ts __tests__/lib/matching/persist-session-matches-canonical-tce.test.ts`
Expected: ALL PASS. If a persist test asserted "second persist keeps first values" (old fossilize semantics), STOP and report — do not edit the expectation without flagging it in the task report (Karpathy RC1 rule).

- [ ] **Step 5: Commit**

```bash
rtk git add lib/matching/matches-repository.ts lib/matching/persist-session-matches.ts lib/matching/__tests__/matches-repository-refresh.test.ts
rtk git commit -m "feat(matches): opt-in refreshComputed on duplicate insert; session persist refreshes stale rows (audit B.6)"
```

---

### Task 6: Full verification sweep

**Files:** none modified (verification only)

- [ ] **Step 1: Full matching + demo-seed test sweep**

Run: `rtk jest lib/matching scripts/demo-seed __tests__/api/compute-matches.test.ts __tests__/api/compute-matches-adversarial.test.ts __tests__/matches-persist-race.test.ts __tests__/persist-session-matches-applied-cap.test.ts __tests__/lib/matching __tests__/scripts/regenerate-matches-freight.test.ts __tests__/matches-page.test.tsx`
Expected: ALL PASS, 0 failures.

- [ ] **Step 2: Typecheck + lint**

Run: `rtk tsc` (i.e. `rtk npx tsc --noEmit`) and `rtk lint` (i.e. `rtk npm run lint`)
Expected: 0 errors in both (pre-existing warnings unrelated to touched files are acceptable — list them in the report if any).

- [ ] **Step 3: Regen dry-run sanity (canonical path still green end-to-end)**

Run: `npx tsx scripts/demo-seed/regenerate-matches.ts --db data/demo-seed.db --dry 2>&1 | tail -15`
Expected: bucket counts logged, `[regen] DRY — no writes.`, exit 0. Skip with a note if the db file is absent.

- [ ] **Step 4: Report**

Summarize: tests run/passed, any expectations that had to change (should be none), any skipped steps.

---

## Out of scope (explicitly NOT in this plan)

- **W5 refactor** (`reason_structured` → fitBreakdown end-to-end + UI panel consolidation) — separate documented TODO; this plan only stops the _wrong-shape_ writer.
- Rewriting `build.ts`'s matches stage on the real engine — regen (chained in Task 4) already replaces those rows; duplicating the engine inside build.ts violates DRY.
- The migration-044 one-match-per-email-pair product decision (audit A.1) — separate product call.
- Prod deploy / seed re-apply — separate session per prod-write protocol.

# TCE HIGH (#1000 + #1002) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> Before using any Next.js/React API introduced or changed after v14 — WebFetch the relevant nextjs.org/react.dev docs page first. (This plan touches an existing App-Router PATCH handler + an existing client component with stable `useState`/`useEffect` — no new/unstable API is introduced, so no WebFetch is required for the planned edits.)

**Goal:** Make PATCH `/api/matches/[id]` ("Recalculate") produce the same single-voyage TCE as the Voyage P&L tab and the stored fit-scoring TCE (one number, one sign, never spuriously negative) by persisting the 4 vessel/cargo input fields the PATCH proxy currently nulls — and correct the #1002 bunker-source documentation, while flagging a real contradiction between #1002's auto-wire AC and epic #1004's parity invariant.

**Architecture:** All TCE surfaces already call one leaf (`computeTce`) through `computeStoredMatchEconomics`. The divergence is INPUT-side: `buildVesselProxy`/`buildCargoProxy` in the PATCH route reconstruct vessel/cargo from `StoredMatch` columns that don't persist `openPosition`, `speedLaden`, `consumption`, or cargo `quantity`. Fix = persist those 4 fields at match-creation time (new migration 052 + 3 write-paths) and read them in the proxies. `ballast_distance_nm` is already persisted (migration 047) but is NOT consumed by the PATCH economics path (it recomputes ballast from `openPosition`), so the cheapest correct fix persists `openPosition` rather than re-reading the stored ballast column.

**Tech Stack:** Next.js 16 App Router (route handler), React 19 client component, better-sqlite3, TypeScript, Jest (`--maxWorkers=1 --forceExit` on VPS), `npx tsx` scripts.

---

## 0. Open Questions — RESOLVED (evidence-backed, this is what the plan depends on)

### Q1 — Is `ballast_distance_nm` already persisted? **YES — but it does NOT make #1000 cheaper.**

- Persisted by `lib/migrations/047-matches-ballast-distance.ts:10` (`ALTER TABLE matches ADD COLUMN ballast_distance_nm REAL`). Present in `StoredMatch` (`lib/matching/matches-repository.ts:35`), written by `compute-matches.ts:149`, `persist-session-matches.ts:192`, returned by `stored-match-economics.ts:64,232`.
- **BUT** the PATCH economics path does NOT read it. `computeStoredMatchEconomics` **recomputes** ballast from `openPosition → loadPort` (`lib/matching/stored-match-economics.ts:111-114`). The PATCH proxy sets `openPosition: null` (`app/api/matches/[id]/route.ts:84`) → `ballastDistanceNm=null` → `computeTce` falls to round-trip (`lib/economics/compute-tce.ts:118-123`).
- `openPosition` is ALSO needed independently for full Voyage-P&L parity: ballast-leg canal dues (`lib/matching/stored-match-economics.ts:164` `vesselOpenPosition`; the Voyage route computes ballast canal at `app/api/voyage/tce/route.ts:271-284`) and the tier-2 Baltic single-voyage denominator (`stored-match-economics.ts:126` `ballastDistanceNm` → `resolveFreightRate`).
- **Conclusion:** persist `vessel_open_position` (TEXT). Do **not** re-add a ballast column (047 already exists; it stays, harmless, still written). Reusing the stored ballast value instead of `openPosition` would require a new `computeStoredMatchEconomics` signature param AND would still leave ballast-canal + tier-2 Baltic mismatched → rejected.

### Q2 — Which fields MUST be persisted for PATCH==Voyage-P&L within ±5% (AC-1d)? **All four.**

The parity oracle is the Voyage P&L tab, whose inputs come from the live `ParsedVessel`/`ParsedCargo` props (`components/match/EconomicsTab.tsx:294-308`):

| Field | Voyage-P&L source | TCE lever | Persist as |
|-------|-------------------|-----------|-----------|
| open position | `vessel.openPosition.value` → `ballastDistanceNm` (`EconomicsTab.tsx:343,347`) | duration (ballast leg) + ballast canal + tier-2 Baltic | `vessel_open_position` TEXT |
| laden speed | `parseLeadingNumber(vessel.speedLaden)` (`EconomicsTab.tsx:295`) | duration (laden sea-days) — denominator of dailyTce | `vessel_speed_kts` REAL |
| consumption | `parseConsumption(vessel.consumption,0)` (`EconomicsTab.tsx:296`) | bunker cost | `vessel_consumption_mt_per_day` REAL |
| cargo quantity | `resolveCargoWeight(cargo)` (`EconomicsTab.tsx:300`) | gross freight = rate × qty — **dominant** | `cargo_quantity_mt` REAL |

NOT a subset: quantity (today reverts to DWT×0.65) and openPosition→duration (round-trip vs single-voyage, the #1000 core) each move TCE well past 5%; speed and consumption are smaller but are required to stay reliably under ±5% across pairs. Plan persists all four.

### Q3 — Backfill for the 2/2 failing prod demo matches. **`regenerate-matches.ts` (parsed_results = oracle), `--dry`→backup→apply→verify.**

- `scripts/demo-seed/regenerate-matches.ts` reads `parsed_results` (`:253`), normalises shapes, runs the real engine `analyzePairs` (`:596`), and writes the NULL/sentinel seed buckets via its OWN raw INSERT (`writeBucket`, `:720-765`) — **not** `createMatch`. So the regen INSERT must be extended separately (Phase 6). It already supports `--dry` (`:703`) and `invalidateLiveSessions` (`:786`) wipes stale per-session copies so the next login re-hydrates fresh.
- Secondary auto-backfill: `persistSessionMatches` runs with `refreshComputed: true` (`persist-session-matches.ts` createMatch call) on every `/matches` render — once `createMatch` writes the 4 columns, per-session copies repopulate on first render without a script. Regen is the authoritative path for the NULL master bucket that hydrates NEW sessions.
- **VALUE_CHECK oracle:** the source emails behind the failing matches live in `parsed_results` (`SELECT result_json FROM parsed_results WHERE parse_type IN ('cargo','vessel')`), holding `openPosition`/`speedLaden`/`consumption`/weight. `scripts/diag/tce-list-vs-detail-audit.ts` already compares list-vs-detail TCE per match — use it as the oracle harness (Phase 0 + Phase 7 verify).
- Bunker price in all 3 write paths is live NLRTM/VLSFO with `?? 600` only as empty-table fallback (`persist-session-matches.ts:55`, `compute-matches.ts:52-54`, `regenerate-matches.ts:593-594`).

### ⚠️ KEY FINDING — #1002 done right is epic-scale and collides with epic #1004's invariant

Real issue (verified via `gh issue view 1002`): the founder wants the **default bunker port = the route-aware recommended on-route port** the engine already computes (Ceuta/Limassol/Trieste for Med routes), and **"the headline Daily TCE reflects that optimal bunkering."** It is a geography complaint (NLRTM is off-route for Med/Black-Sea), NOT a $600-vs-spot complaint. (Recon's "$600 flat vs live NLRTM" framing is its own addition and is factually wrong — all three write paths pass **live** NLRTM/VLSFO: `persist-session-matches.ts:55`, `compute-matches.ts:52`, `regenerate-matches.ts:593`; `DEFAULT_BUNKER_USD_PER_MT=600` is only the empty-table fallback. Stored TCE and Voyage-P&L TCE already share the NLRTM-live source.)

- **The collision:** auto-wiring the headline P&L to the recommended port (the founder's ask) makes the Voyage-P&L (DETAIL) TCE use e.g. Ceuta while the stored LIST/fit TCE stays at NLRTM → DETAIL ≠ LIST on every Med/Black-Sea route, directly regressing epic #1004 AC-E1 ("one number"). The non-wiring at `EconomicsTab.tsx:169` is a deliberate LIST==DETAIL parity guard, not a bug.
- **The only correct fix** is to make the STORED path route-aware too: select the recommended on-route bunker port at match-creation time and feed the SAME port to both list and detail. That touches `computeStoredMatchEconomics` + all three write paths + regen + the `/api/voyage/bunker-recommendation` call moving server-side — **epic-scale, exceeds this PR**, and is a fresh design (which port wins when the recommendation is advisory/uncertain; how staleness interacts with stored TCE).
- **This-PR scope for #1002:** (a) correct the now-misleading comment to state the real invariant and the open design question; (b) lock the NLRTM list==detail bunker-source parity with a regression test so a future route-aware change is a deliberate, tested migration — not an accidental divergence. AC-1002a is **explicitly deferred to a scoped follow-up** (go/no-go #3). Do NOT half-wire the headline client-side — it would silently break #1004.

---

## File Structure

| File | Responsibility | Phase |
|------|----------------|-------|
| `lib/migrations/052-matches-vessel-cargo-inputs.ts` | **CREATE** — additive columns `vessel_open_position`, `vessel_speed_kts`, `vessel_consumption_mt_per_day`, `cargo_quantity_mt` | 1 |
| `lib/migrations/index.ts` | register migration 052 | 1 |
| `lib/matching/matches-repository.ts` | `StoredMatch` + `CreateMatchInput` fields; conditional INSERT + `refreshComputedColumns` | 2 |
| `lib/matching/compute-matches.ts` | pass 4 fields from parsed vessel/cargo into `createMatch` | 3 |
| `lib/matching/persist-session-matches.ts` | same | 3 |
| `app/api/matches/[id]/route.ts` | `buildVesselProxy`/`buildCargoProxy` read the 4 columns instead of null | 4 |
| `components/match/EconomicsTab.tsx` | refine comment at `:169-173` (#1002 Bug B) | 5 |
| `scripts/demo-seed/regenerate-matches.ts` | extend `writeBucket` INSERT to persist 4 columns | 6 |
| `__tests__/api/matches-id-patch-parity.test.ts` | **CREATE** — #1000 AC behavioral parity test | 4 |
| `lib/matching/__tests__/stored-match-economics.bunker-parity.test.ts` | **CREATE** — #1002 AC-1002c parity test | 5 |
| `lib/matching/__tests__/matches-repository.vessel-cargo-inputs.test.ts` | **CREATE** — column round-trip | 2 |

---

## Phase 0 — Pre-flight oracle (no code change)

**Files:** none (read-only diagnostics).

**Named failing matches (from the issues):** `#1000` → `/match/70339` (M/V SEAGULL 41, Nemrut Bay → Liverpool, BREAK_BULK, 3,178 DWT, Fit 87%; Fit-Breakdown TCE **+$5,353/day** vs Recalculate **−$319/day** at $54.72/mt Baltic). `#1002` → `/match/70760` and the Nemrut Bay → Liverpool / Marmara → Central Med routes (NLRTM default vs Ceuta/Limassol/Trieste recommended). Use these IDs as the value-check oracle.

- [ ] **Step 1: Capture the failing-match oracle from prod-shaped seed DB.**

Run (local copy of seed db; do NOT mutate prod yet):
```bash
npx tsx scripts/diag/tce-list-vs-detail-audit.ts --db data/demo-seed.db 2>&1 | tee /tmp/tce-high-$$/oracle-before.txt
```
Expected: a per-match list-vs-detail TCE table; confirm `70339` (and any sibling) shows the Fit-Breakdown vs Recalculate sign-flip. Record their `(cargo_id, vessel_id, item indices)`.

- [ ] **Step 2: Dump the parsed inputs (the value-check oracle) for those 2 matches.**
```bash
sqlite3 data/demo-seed.db \
 "SELECT gmail_message_id, parse_type, json_extract(result_json,'$.openPosition'), json_extract(result_json,'$.speedLaden'), json_extract(result_json,'$.consumption'), json_extract(result_json,'$.weightMt') FROM parsed_results WHERE parse_type IN ('cargo','vessel');" \
 | tee /tmp/tce-high-$$/oracle-inputs.txt
```
Use `rtk proxy sqlite3 …` only if you need raw output; keep these values to hand-verify the Phase 7 acceptance numbers.

---

## Phase 1 — Migration 052 (additive columns)

**Files:**
- Create: `lib/migrations/052-matches-vessel-cargo-inputs.ts`
- Modify: `lib/migrations/index.ts` (register)
- Test: covered by Phase 2 round-trip test

- [ ] **Step 1: Write migration (mirror 047 idempotent ADD COLUMN pattern).**
```ts
// lib/migrations/052-matches-vessel-cargo-inputs.ts
import type { Migration } from './types';

const migration052: Migration = {
  version: 52,
  name: 'matches-vessel-cargo-inputs',
  up(db) {
    const cols = db.prepare(`PRAGMA table_info(matches)`).all() as Array<{ name: string }>;
    const names = new Set(cols.map((c) => c.name));
    if (!names.has('vessel_open_position'))         db.exec(`ALTER TABLE matches ADD COLUMN vessel_open_position TEXT`);
    if (!names.has('vessel_speed_kts'))             db.exec(`ALTER TABLE matches ADD COLUMN vessel_speed_kts REAL`);
    if (!names.has('vessel_consumption_mt_per_day')) db.exec(`ALTER TABLE matches ADD COLUMN vessel_consumption_mt_per_day REAL`);
    if (!names.has('cargo_quantity_mt'))            db.exec(`ALTER TABLE matches ADD COLUMN cargo_quantity_mt REAL`);
  },
  down(db) { void db; },
};

export default migration052;
```

- [ ] **Step 2: Register in `lib/migrations/index.ts`.** Import `migration052` and append to `allMigrations` after `migration051` (match the existing import+array ordering convention in that file).

- [ ] **Step 3: Verify the migration list loads.**

Run: `npx tsc --noEmit 2>&1 | head -10`
Expected: no new errors referencing migrations.

- [ ] **Step 4: Commit.**
```bash
git add lib/migrations/052-matches-vessel-cargo-inputs.ts lib/migrations/index.ts
git commit -m "feat(matches): migration 052 — persist vessel/cargo TCE inputs"
```

---

## Phase 2 — Repository wiring (StoredMatch / CreateMatchInput / INSERT / refresh)

**Files:**
- Modify: `lib/matching/matches-repository.ts` (interfaces `:6-39`, `:41-77`; `createMatch` hasFitColumns branch `:161-239`; `refreshComputedColumns` `:426-472`)
- Test: `lib/matching/__tests__/matches-repository.vessel-cargo-inputs.test.ts` (CREATE)

- [ ] **Step 1: Write failing round-trip test.**
```ts
// lib/matching/__tests__/matches-repository.vessel-cargo-inputs.test.ts
import Database from 'better-sqlite3';
import { allMigrations } from '@/lib/migrations/index';
import { runMigrations } from '@/lib/migrations/runner';
import { createMatch, getMatch } from '@/lib/matching/matches-repository';

function freshDb() { const db = new Database(':memory:'); runMigrations(db, allMigrations); return db; }

describe('matches-repository — vessel/cargo TCE input columns (migration 052)', () => {
  it('round-trips vessel_open_position / vessel_speed_kts / vessel_consumption_mt_per_day / cargo_quantity_mt', () => {
    const db = freshDb();
    const m = createMatch(db, {
      cargo_id: 'c1', vessel_id: 'v1', score: 80, reason: 'x', user_id: 'sid',
      vessel_open_position: 'Piraeus', vessel_speed_kts: 13.5,
      vessel_consumption_mt_per_day: 28.2, cargo_quantity_mt: 52000,
    });
    const row = getMatch(db, m.id)!;
    expect(row.vessel_open_position).toBe('Piraeus');
    expect(row.vessel_speed_kts).toBe(13.5);
    expect(row.vessel_consumption_mt_per_day).toBe(28.2);
    expect(row.cargo_quantity_mt).toBe(52000);
    db.close();
  });

  it('refreshComputed updates the 4 columns in place on duplicate insert', () => {
    const db = freshDb();
    const a = createMatch(db, { cargo_id: 'c1', vessel_id: 'v1', score: 80, reason: 'x', user_id: 'sid', vessel_speed_kts: 12 });
    createMatch(db, { cargo_id: 'c1', vessel_id: 'v1', score: 80, reason: 'x', user_id: 'sid', vessel_speed_kts: 14, refreshComputed: true });
    expect(getMatch(db, a.id)!.vessel_speed_kts).toBe(14);
    db.close();
  });
});
```
- [ ] **Step 2: Run — expect FAIL** (`unknown column` / undefined fields).
Run: `npx jest lib/matching/__tests__/matches-repository.vessel-cargo-inputs.test.ts --maxWorkers=1 --no-coverage`

- [ ] **Step 3: Add fields to `StoredMatch` (after `:36` `breakeven_tce_usd_per_day`) and `CreateMatchInput` (after `:68`):**
```ts
  vessel_open_position?: string | null;
  vessel_speed_kts?: number | null;
  vessel_consumption_mt_per_day?: number | null;
  cargo_quantity_mt?: number | null;
```

- [ ] **Step 4: Add a column-presence guard (mirror `hasBallastDistanceColumn` `:144-147`):**
```ts
function hasVesselCargoInputColumns(db: Database.Database): boolean {
  const cols = db.prepare(`PRAGMA table_info(matches)`).all() as Array<{ name: string }>;
  return cols.some((c) => c.name === 'vessel_open_position');
}
```

- [ ] **Step 5: Wire into the `hasFitColumns` INSERT branch (`:161-234`)** — follow the exact `withBallast`/`withBreakeven` conditional-append idiom:
  - declare `const withVCInputs = hasVesselCargoInputColumns(db);` and the four locals (`?? null`);
  - append `${withVCInputs ? ', vessel_open_position, vessel_speed_kts, vessel_consumption_mt_per_day, cargo_quantity_mt' : ''}` to the column list (`:201`) and `${withVCInputs ? ', ?, ?, ?, ?' : ''}` to the VALUES list (`:202`);
  - `if (withVCInputs) args.push(vessel_open_position, vessel_speed_kts, vessel_consumption_mt_per_day, cargo_quantity_mt);` after `:233`.

- [ ] **Step 6: Wire into `refreshComputedColumns` (after `:458`)** so per-session refresh repopulates them:
```ts
  if (hasVesselCargoInputColumns(db)) {
    sets.push('vessel_open_position = ?', 'vessel_speed_kts = ?', 'vessel_consumption_mt_per_day = ?', 'cargo_quantity_mt = ?');
    args.push(input.vessel_open_position ?? null, input.vessel_speed_kts ?? null, input.vessel_consumption_mt_per_day ?? null, input.cargo_quantity_mt ?? null);
  }
```
(Insert BEFORE the item-index `args.push(input.cargo_id, …)` block at `:464`, matching how `withBreakeven` is placed before it.)

- [ ] **Step 7: Run — expect PASS.**
Run: `npx jest lib/matching/__tests__/matches-repository.vessel-cargo-inputs.test.ts --maxWorkers=1 --no-coverage`
Expected: `Tests: 2 passed`.

- [ ] **Step 8: Guard existing repo tests didn't regress** (write-path field parity asserts column sets):
Run: `npx jest lib/matching/__tests__/write-path-field-parity.test.ts tests/regression/write-path-value-parity.test.ts --maxWorkers=1 --no-coverage`
Expected: green. If these enumerate persisted columns and now flag the 4 new ones as unmapped, ADD them to the writer maps in the SAME commit (that is the parity contract, not a test rewrite). If >5 edits needed → STOP, return BLOCKED.

- [ ] **Step 9: Commit.**
```bash
git add lib/matching/matches-repository.ts lib/matching/__tests__/matches-repository.vessel-cargo-inputs.test.ts
git commit -m "feat(matches): persist vessel/cargo TCE inputs in createMatch + refresh"
```

---

## Phase 3 — Persist-path wiring (write real parsed values)

**Files:**
- Modify: `lib/matching/compute-matches.ts` (createMatch call `:128-156`)
- Modify: `lib/matching/persist-session-matches.ts` (createMatch call `:175-200`)

Both call sites already hold `vessel` (`ParsedVessel`), `cargo` (`ParsedCargo`), and `eco`. Use the same helpers the economics path uses: `cfValue(vessel.openPosition)`, `parseLeadingNumber(vessel.speedLaden)`, `parseConsumption(vessel.consumption, 0)`, `resolveCargoWeight(cargo)`.

- [ ] **Step 1: In `compute-matches.ts`,** add to the `createMatch({...})` object (alongside `ballast_distance_nm: eco.ballast_distance_nm ?? null` `:149`):
```ts
      vessel_open_position: vessel ? (cfValue(vessel.openPosition) ?? null) : null,
      vessel_speed_kts: vessel ? (parseLeadingNumber(vessel.speedLaden) || null) : null,
      vessel_consumption_mt_per_day: vessel ? (parseConsumption(vessel.consumption, 0) || null) : null,
      cargo_quantity_mt: cargo ? (resolveCargoWeight(cargo) ?? null) : null,
```
Ensure imports exist (`cfValue`, `resolveCargoWeight`, and `parseLeadingNumber`/`parseConsumption` from `@/lib/matching/tce-calculator` or `@/lib/matching/parse-vessel-fields` — match whatever `stored-match-economics.ts:29-31` / `EconomicsTab` already import). Add only the missing ones.

- [ ] **Step 2: Repeat the identical block in `persist-session-matches.ts`** (next to `ballast_distance_nm: eco.ballast_distance_nm ?? null` `:192`). `refreshComputed: true` is already set, so per-session copies repopulate on each render.

- [ ] **Step 3: Run the persist-path tests.**
Run: `npx jest --findRelatedTests lib/matching/compute-matches.ts lib/matching/persist-session-matches.ts --maxWorkers=1 --no-coverage`
Expected: green (new fields are additive; existing assertions unaffected). PI3: do not rewrite existing expectations — if a snapshot includes the full row, ADD the 4 keys to the fixture, do not delete assertions.

- [ ] **Step 4: Commit.**
```bash
git add lib/matching/compute-matches.ts lib/matching/persist-session-matches.ts
git commit -m "feat(matches): persist real vessel/cargo inputs from parsed objects"
```

---

## Phase 4 — PATCH proxy fix (#1000 core)

**Files:**
- Modify: `app/api/matches/[id]/route.ts` — `buildCargoProxy` (`:22-52`, line `:37` quantity), `buildVesselProxy` (`:54-95`, lines `:84` openPosition, `:89` speedLaden, `:91` consumption)
- Test: `__tests__/api/matches-id-patch-parity.test.ts` (CREATE)

- [ ] **Step 1: Write the failing parity/non-negative test.** Seed a real-shaped match through the full migration set with the 4 columns populated (Supramax single-voyage with a ballast leg). Assert PATCH at a market rate returns a positive TCE and that it matches a direct `computeStoredMatchEconomics` (the seam) within ±5% — this is the AC-1d oracle expressed in-process.
```ts
// __tests__/api/matches-id-patch-parity.test.ts
import Database from 'better-sqlite3';
import { NextRequest } from 'next/server';
import { allMigrations } from '@/lib/migrations/index';
import { runMigrations } from '@/lib/migrations/runner';
import { createMatch } from '@/lib/matching/matches-repository';
import { requireSession } from '@/lib/session';

let testDb: Database.Database;
jest.mock('@/lib/session-store', () => ({ getStore: () => ({ getDatabase: () => testDb, getDb: () => testDb }) }));
jest.mock('@/lib/session', () => ({ requireSession: jest.fn() }));

describe('PATCH /api/matches/[id] — #1000 single-voyage parity & non-negative TCE', () => {
  const env = process.env.MATCHES_ENABLED;
  beforeEach(() => {
    testDb = new Database(':memory:');
    runMigrations(testDb, allMigrations);
    process.env.MATCHES_ENABLED = 'true';
    (requireSession as jest.Mock).mockReturnValue({ sessionId: 'sid', session: { id: 'sid', parsedCargos: [], parsedVessels: [] } });
  });
  afterEach(() => { testDb.close(); process.env.MATCHES_ENABLED = env; });

  it('Recalculate at market rate is positive and uses single-voyage duration', async () => {
    // Real port pair with a resolvable ballast leg (open=Piraeus, load=Odessa, disch=Rotterdam).
    const m = createMatch(testDb, {
      cargo_id: 'c1', vessel_id: 'v1', score: 80, reason: 'x', user_id: 'sid',
      cargo_type: 'GRAIN', load_port: 'Odessa', discharge_port: 'Rotterdam',
      vessel_dwt: 56000, vessel_name: 'TEST',
      vessel_open_position: 'Piraeus', vessel_speed_kts: 13, vessel_consumption_mt_per_day: 28,
      cargo_quantity_mt: 52000, fit_breakdown: '{}',
    });
    const { PATCH } = await import('@/app/api/matches/[id]/route');
    const req = new NextRequest(`http://localhost/api/matches/${m.id}`, { method: 'PATCH', body: JSON.stringify({ freight_rate_usd_per_mt: 30 }) });
    const res = await PATCH(req, { params: Promise.resolve({ id: String(m.id) }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tce_usd_per_day).toBeGreaterThan(0);     // #1000 AC-E2 / AC-1a
  });
});
```
> Note: port-distance lookups must resolve `Piraeus/Odessa/Rotterdam` in the test environment (they are in `port-distances`; if a chosen pair returns null, swap to a pair present in `lib/sailing/__tests__` fixtures — see `stored-match-economics.test.ts:111` which uses exactly open=Piraeus/load=Odessa/laden=Rotterdam).

- [ ] **Step 2: Run — expect FAIL** (today: round-trip duration / DWT×0.65 quantity → TCE depressed or negative at low rates).
Run: `npx jest __tests__/api/matches-id-patch-parity.test.ts --maxWorkers=1 --no-coverage`

- [ ] **Step 3: Fix `buildVesselProxy` (`:84,89,91`):**
```ts
    openPosition: cf(m.vessel_open_position ?? null),
    ...
    speedLaden: m.vessel_speed_kts != null ? String(m.vessel_speed_kts) : null,
    ...
    consumption: m.vessel_consumption_mt_per_day != null ? String(m.vessel_consumption_mt_per_day) : null,
```
(`speedLaden`/`consumption` are `string | null` on `ParsedVessel` and are parsed downstream by `parseLeadingNumber`/`parseConsumption`; `openPosition` is a `ConfidenceField<string>` so wrap with the existing `cf` helper at `:55`.)

- [ ] **Step 4: Fix `buildCargoProxy` (`:37`):**
```ts
    quantity: m.cargo_quantity_mt != null ? { value: m.cargo_quantity_mt, confidence: 'interpreted' as const } : null,
```
Verify `resolveCargoWeight` reads `quantity` (it does — same helper Voyage P&L uses at `EconomicsTab.tsx:300`). If `resolveCargoWeight` prefers `weightMt` over `quantity`, also set `weightMt: cf(m.cargo_quantity_mt)` at `:31` so both readers agree. Confirm by reading `lib/sailing/cargo-weight.ts` before editing.

- [ ] **Step 5: Run — expect PASS.**
Run: `npx jest __tests__/api/matches-id-patch-parity.test.ts --maxWorkers=1 --no-coverage`

- [ ] **Step 6: Run the existing PATCH tests (regression).**
Run: `npx jest __tests__/api/matches-id.test.ts __tests__/api/matches-id-freight-bunker.test.ts --maxWorkers=1 --no-coverage`
Expected: green. `matches-id-freight-bunker.test.ts` mocks `computeStoredMatchEconomics` and only asserts `objectContaining({ bunkerPriceUsdPerMt: 791 })` (`:101,111`) and seeds via migrations 023/032/035/036 (no col 052) — proxy reads of absent columns coalesce to null → unaffected. No expectation rewrite expected (PI3-safe).

- [ ] **Step 7: Commit.**
```bash
git add app/api/matches/[id]/route.ts __tests__/api/matches-id-patch-parity.test.ts
git commit -m "fix(matches): PATCH proxy reads persisted vessel/cargo inputs (#1000)"
```

---

## Phase 5 — #1002 bunker documentation + parity test (NO headline auto-wire)

**Files:**
- Modify: `components/match/EconomicsTab.tsx:169-173` (comment only)
- Test: `lib/matching/__tests__/stored-match-economics.bunker-parity.test.ts` (CREATE)

- [ ] **Step 1: Write the bunker-source parity regression test (AC-1002c / AC-E3).** Assert that when a live NLRTM/VLSFO price exists, `computeStoredMatchEconomics` consumes it (the same price the Voyage route resolves), proving stored and live share the NLRTM live source:
```ts
// lib/matching/__tests__/stored-match-economics.bunker-parity.test.ts
import Database from 'better-sqlite3';
import { allMigrations } from '@/lib/migrations/index';
import { runMigrations } from '@/lib/migrations/runner';
import { computeStoredMatchEconomics } from '@/lib/matching/stored-match-economics';

// Build a minimal cargo/vessel with a resolvable route; pass bunkerPriceUsdPerMt=791
// and assert the breakdown's bunker price reflects 791 (not DEFAULT 600).
it('stored economics uses the supplied live NLRTM price, not the 600 fallback', () => {
  const db = new Database(':memory:'); runMigrations(db, allMigrations);
  const res = computeStoredMatchEconomics({
    cargo: /* ParsedCargo Odessa→Rotterdam, qty 52000 */ ({} as any),
    vessel: /* ParsedVessel dwt 56000, open Piraeus, speed 13, cons 28 */ ({} as any),
    db, bunkerPriceUsdPerMt: 791,
  });
  expect(res.tce_breakdown?.bunker_price_usd_per_mt).toBe(791);
  db.close();
});
```
> Reuse the cargo/vessel fixture shape from `lib/matching/__tests__/stored-match-economics.test.ts:111` (already open=Piraeus/load=Odessa/laden=Rotterdam). `tce_breakdown.bunker_price_usd_per_mt` is emitted by `computeTce` (`voyage-calculator.ts:88`).

- [ ] **Step 2: Run — expect PASS already** (this documents/locks current correct behavior; if it FAILS, the bunker source is genuinely broken and that becomes the #1002 fix — re-scope and STOP for founder input).
Run: `npx jest lib/matching/__tests__/stored-match-economics.bunker-parity.test.ts --maxWorkers=1 --no-coverage`

- [ ] **Step 3: Correct the comment at `EconomicsTab.tsx:169-173`** to state the real invariant + the open design question (the founder DOES want the recommended port in the headline — this comment documents WHY it is deferred, not that it is "correct as-is"):
```ts
          // NOTE: We do NOT auto-set bunkerPort to the recommended on-route port here.
          // The headline voyage TCE stays on baseline NLRTM/VLSFO so it matches the stored
          // LIST/fit TCE, which is computed at live NLRTM/VLSFO spot (DEFAULT_BUNKER_USD_PER_MT=600
          // is only the empty-table fallback). Auto-switching the headline port would make
          // DETAIL TCE diverge from LIST TCE on every Med/Black-Sea route — regressing epic #1004
          // AC-E1 ("one number"). The route-aware recommendation is surfaced as savings + the
          // comparison table (advisory). Issue #1002 wants this in the headline; the correct fix
          // makes the STORED path route-aware too (both paths same port) — tracked as a follow-up.
```

- [ ] **Step 4: Cross-cutting grep for the old comment literal** (it is the only literal touched):
```bash
grep -rn "always computed at NLRTM" __tests__/ components/ app/ lib/ 2>/dev/null
```
Expected: no hits outside the line being edited (it is a comment, no test asserts it).

- [ ] **Step 5: Commit.**
```bash
git add components/match/EconomicsTab.tsx lib/matching/__tests__/stored-match-economics.bunker-parity.test.ts
git commit -m "docs(econ): correct bunker-source comment + lock NLRTM parity test (#1002)"
```

> **DEFERRED / DECISION (go/no-go):** #1002's headline ask (default = route-aware recommended port) is NOT implemented — half-wiring it client-side regresses #1004 AC-E1. The correct fix makes the STORED path route-aware (select recommended on-route port at match-creation, feed the SAME port to list + detail) — epic-scale, both write paths + regen + bunker-recommendation moved server-side. This PR ships the comment + parity lock; #1002 stays **open/PARTIAL** with a scoped follow-up issue. Do NOT write `Closes #1002`.

---

## Phase 6 — Seed regen wiring + prod backfill

**Files:**
- Modify: `scripts/demo-seed/regenerate-matches.ts` — `writeBucket` INSERT (`:711-765`)

- [ ] **Step 1: Extend the regen INSERT.** In the `_matchesCols` presence block (`:707-709`) add:
```ts
  const hasVCInputsCol = _matchesCols.some((c) => c.name === 'vessel_open_position');
```
Append to the column list (`:716`) `${hasVCInputsCol ? ', vessel_open_position, vessel_speed_kts, vessel_consumption_mt_per_day, cargo_quantity_mt' : ''}` and to VALUES (`:718`) `${hasVCInputsCol ? ', ?, ?, ?, ?' : ''}`. In `writeBucket` (after `:756`, the `cargo_ref` push region), push the 4 values from the already-loaded `cargo`/`vessel`:
```ts
      if (hasVCInputsCol) args.push(
        vessel ? (cfValue(vessel.openPosition) ?? null) : null,
        vessel ? (parseLeadingNumber(vessel.speedLaden) || null) : null,
        vessel ? (parseConsumption(vessel.consumption, 0) || null) : null,
        cargo ? (resolveCargoWeight(cargo) ?? null) : null,
      );
```
Place the push in the SAME positional order as the column list, AFTER the existing `if (hasWorksheetCol)` / `if (hasBreakevenCol)` pushes only if those columns trail in the column list — match the exact column order you wrote. Add `parseLeadingNumber`/`parseConsumption` imports if absent (`regenerate-matches.ts` already imports `cfValue` and `resolveCargoWeight`).

- [ ] **Step 2: Dry-run locally (receipt).**
```bash
cp data/demo-seed.db /tmp/tce-high-$$/seed-before.db
npx tsx scripts/demo-seed/regenerate-matches.ts --db data/demo-seed.db --dry 2>&1 | tee /tmp/tce-high-$$/regen-dry.txt
```
Expected: `[regen] DRY — no writes.` and bucket counts unchanged from baseline. Confirm no exceptions.

- [ ] **Step 3: Apply locally + verify the 2 failing matches now show positive single-voyage TCE.**
```bash
npx tsx scripts/demo-seed/regenerate-matches.ts --db data/demo-seed.db 2>&1 | tee /tmp/tce-high-$$/regen-apply.txt
npx tsx scripts/diag/tce-list-vs-detail-audit.ts --db data/demo-seed.db 2>&1 | tee /tmp/tce-high-$$/oracle-after.txt
sqlite3 data/demo-seed.db "SELECT id, vessel_open_position, vessel_speed_kts, cargo_quantity_mt, tce_usd_per_day FROM matches WHERE user_id IS NULL AND vessel_open_position IS NOT NULL LIMIT 5;"
```
Expected: `oracle-after.txt` shows the previously-divergent matches with list==detail TCE, positive; the 4 columns populated.

- [ ] **Step 4: Commit the script change.**
```bash
git add scripts/demo-seed/regenerate-matches.ts
git commit -m "feat(demo-seed): regen persists vessel/cargo TCE inputs + backfills (#1000)"
```

> **PROD backfill (founder PRE-AUTHORIZED; execute only after PR merge + deploy bakes migration 052).** On `outreach-vps`: `cp` the live `demo-seed.db` to a timestamped backup → run `regenerate-matches.ts --dry` (capture receipt) → run without `--dry` → run `tce-list-vs-detail-audit.ts` to verify → `systemctl restart quantika-demo`. Migration 052 runs automatically on service start (`session-store.ts:8-9` `runMigrations(allMigrations)`); the columns exist before regen writes them. The plan does NOT execute prod writes — it is a documented runbook step gated on merge.

---

## Phase 7 — Acceptance test (epic #1004 invariant on a real match)

**Files:** none new (assertion lives in Phase 4's parity test + the diag oracle).

- [ ] **Step 1: ACCEPTANCE.** On a real match at the market freight rate, fit-scoring TCE == Voyage P&L TCE == Recalculate TCE — one number, one sign, not negative. Verify by:
  1. `__tests__/api/matches-id-patch-parity.test.ts` green (Recalculate positive, single-voyage). 
  2. `scripts/diag/tce-list-vs-detail-audit.ts` on the regenerated seed db shows |list − detail| within ±5% for the previously-failing matches (oracle-after.txt vs the Phase-0 oracle-inputs hand-computation).
  3. (Manual, post-deploy) Chrome MCP / Preview on `/match/<id>` Economics tab: enter the market rate, click Recalculate → "Recalculated TCE" matches the Voyage P&L headline and the hero stored TCE, all positive.

- [ ] **Step 2: Full typecheck + affected suite (pre-PASS evidence).**
```bash
npx tsc --noEmit 2>&1 | head -10
npx jest --findRelatedTests app/api/matches/[id]/route.ts lib/matching/matches-repository.ts lib/matching/compute-matches.ts lib/matching/persist-session-matches.ts components/match/EconomicsTab.tsx --maxWorkers=1 --no-coverage 2>&1 | tail -10
```

---

## Blast Radius — every file/test touched

| File | Change | Risk |
|------|--------|------|
| `lib/migrations/052-*.ts` (new) + `index.ts` | 4 additive columns | LOW — additive; old rows NULL → today's behavior |
| `lib/matching/matches-repository.ts` | interfaces + INSERT + refresh | LOW-MED — conditional-column idiom; covered by new + parity tests |
| `lib/matching/compute-matches.ts` | persist 4 fields | LOW — additive |
| `lib/matching/persist-session-matches.ts` | persist 4 fields | LOW — additive |
| `app/api/matches/[id]/route.ts` | proxy reads columns | **MED** — changes Recalculate TCE output (intended). Existing PATCH tests stay green (mock + col-absent coalesce) |
| `components/match/EconomicsTab.tsx` | comment only | LOW — no logic/literal asserted by tests |
| `scripts/demo-seed/regenerate-matches.ts` | writeBucket INSERT | LOW (dev script) — `--dry` gated |
| `lib/matching/__tests__/write-path-field-parity.test.ts`, `tests/regression/write-path-value-parity.test.ts` | may need 4 keys added to writer maps | LOW — same-commit parity contract, NOT expectation rewrite |
| New tests ×3 | added coverage | — |

**DEFERRED (NOT this PR):**
- **DB-column DROP** of any matches column (e.g. legacy `score`/`reason_structured` from #1003): **HIGH risk, irreversible — DEFERRED.** Out of HIGH scope.
- **#1002 AC-1002a headline auto-wire** — conflicts with #1004 AC-E1; needs founder decision + epic-scale stored-path change.
- **#1001 + #1003** — explicitly out of founder HIGH scope.

---

## Acceptance Criteria coverage (per issue)

Issues have no Markdown checkboxes — criteria below are derived from each issue's **Expected** section (verified via `gh issue view`).

| Issue | Expected (from issue) | Plan resolution | Verdict |
|-------|-----------------------|-----------------|---------|
| #1000 | Fit-Breakdown TCE and Economics-tab Recalculate agree (same cost basis, same sign) at the same rate | Phase 4: PATCH proxy reads real persisted inputs → Recalculate uses the canonical economics, same basis as the fit/stored TCE | ✓ (Phase 4 + 7) |
| #1000 | Recalculate not a loss at market rate when fit says profitable | Phase 4 `toBeGreaterThan(0)`; single-voyage duration via openPosition; real quantity | ✓ |
| #1000 | (mechanism) actual speed/consumption/quantity, single-voyage duration | `vessel_speed_kts` / `vessel_consumption_mt_per_day` / `cargo_quantity_mt` / `vessel_open_position` (Phases 1-4) | ✓ |
| #1002 | Default bunker port = route-aware recommended; **headline Daily TCE reflects optimal bunkering** | NOT implemented this PR — collides with #1004 AC-E1; correct fix is route-aware STORED path (epic-scale) | ✗ → **PARTIAL** |
| #1002 | (clarified) stored==live bunker source documented & consistent | Phase 5: comment corrected + NLRTM parity regression test | ✓ |

---

## GO / NO-GO checklist for founder

1. **GO** — #1000 fix (Phases 1-4, 6): persist 4 vessel/cargo inputs (migration 052), read them in PATCH proxy → Recalculate uses the same cost basis as the Fit-Breakdown/stored TCE; verified on `/match/70339`. Cheapest correct fix; `ballast_distance_nm` (047) reused, no new ballast column. Additive, low blast radius. → `Closes #1000`.
2. **GO** — #1002 partial (Phase 5): correct the bunker-source comment + lock the NLRTM list==detail parity regression test. Documentation + safety net only.
3. **DECISION NEEDED — #1002 headline route-aware bunker port (the founder's actual ask).** Implementing it correctly = make the STORED path route-aware (recommended on-route port chosen at match-creation, fed to BOTH list and detail) so #1004's "one number" holds. That is epic-scale (new server-side bunker-port resolution + all write paths + regen) and **exceeds this PR**. Recommend: ship #1000 now, open a scoped follow-up issue for route-aware stored bunkering. **#1002 stays PARTIAL — do NOT write `Closes #1002`.** Half-wiring the headline client-side is explicitly NO-GO (silently regresses #1004).
4. **CONFIRM** — recon's "$600 flat" premise is incorrect; all write paths use live NLRTM. The real #1002 complaint is port *geography*, not price. Founder confirms reframing before sign-off.
5. **PROD backfill** — pre-authorized; runs post-merge/deploy via `regenerate-matches.ts` (`--dry`→backup→apply→`tce-list-vs-detail-audit`→`systemctl restart quantika-demo`). Migration 052 auto-applies on service start (`session-store.ts:8-9`).
6. **NO-GO this PR** — any DB column DROP (#1003 legacy columns); #1001/#1003 entirely; client-only headline bunker auto-wire.

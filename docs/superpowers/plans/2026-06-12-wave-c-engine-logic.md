# Wave C — Engine Logic Bugs (audit section C) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 8 engine-logic findings from the 2026-06-12 logic audit (section C): Bosporus fee dropped on Black Sea↔east-of-Suez, silent $0 voyage on durationDays≤0, IMSBC Group A never hard-blocking, hold-cleanliness blocked pairs staying on the main board, one-match-per-email-pair (founder decision 2026-06-12: fix — one match per ITEM pair), 90–100k DWT classified capesize, back-of-laycan-window arrival rated 'ideal', and four small economics defects (negative freight, latent Suez war-risk double-count, NT ratio inconsistency, economics-factor rounding).

**Architecture:** All fixes are surgical point changes in existing modules; no new subsystems. The only schema change is migration 051 (item-aware unique index on `matches`). C.5 widens the persistence key from (cargo_id, vessel_id, user_id) to include item indices and updates every writer/consumer keyed on the old pair: repository upsert/select, persist dedup, regen pass-1 dedup, dashboard maps, slug resolver determinism.

**Tech Stack:** Next.js 16 / TypeScript / better-sqlite3 / Jest (`npx jest <path>`; `tests/regression/` needs `--testPathIgnorePatterns "/node_modules/"`).

**Branch:** `feat/wave-c-engine-logic` (from main e9070fe2). Worktree: `/Users/jarvis/work/quantika-demo/.claude/worktrees/compassionate-jennings-cb6e62`.

---

## Verified ground truth (recon 2026-06-12, all read from live code this session)

- `lib/matching/tce-calculator.ts:202` `_routeTransitsBosporus` returns true ONLY for med↔blacksea. `_classifyPortBasin` (:161) returns `'indian'|'eastafrica'|'med'|'blacksea'|'atlantic'|'westafrica'|'unknown'`. Novorossiysk→Mumbai = blacksea↔indian → Suez charged (:195 blacksea ∈ westOfSuez) but Bosporus NOT. Both `buildMatchEconomics` (laden :313, ballast :326) and the detail route (`app/api/voyage/tce/route.ts:261,275` via exported `routeTransitsBosporus`) call it — one fix covers both paths.
- `app/api/voyage/tce/route.ts:85` `durationDays: z.number()` — no `.positive()` (`distanceNm` at :75 has it). `durationDays` flows to `calculateTCE` → `computeTce` `overrideDurationDays` → duration 0 → `dailyTce = 0`, bunker = consumption×0×price = 0 → HTTP 200 with all-zero economics.
- `lib/sailing/imsbc-check.ts:308-315` Group A → unconditional `'caution'`. `DG_RESTRICTION_RE` (:268) matches only DG/hazmat/group B tokens. Hard gate wiring already exists: `lib/sailing/match-filters.ts:473-480` `checkImsbc` fails on any `verdict === 'incompatible'`, and pair-analyzer includes it in hard filters (filterOut → blockedMatches).
- `lib/matching/hold-cleanliness.ts:24-32` incompatible → issue + `confidence.blockSend=true`, but `matchLevel` untouched. Partition (`lib/matching/pair-analyzer.ts:788-803`) routes by verdict/`matchLevel==='weak'` only → blocked pair stays in `mainMatches`. `classifyPriority` (`lib/sailing/priority-classifier.ts:18`) maps blockSend → 'urgent'. Dashboard (`app/dashboard/page.tsx:74`) filters `matchLevel good|possible` — demoting to 'weak' removes the pair from both the main bucket and dashboard cards. applyHoldCleanliness runs at pair-analyzer:771, AFTER matchLevel assignment (:751-767), BEFORE sort/partition (:775+) — a level set there sticks.
- `lib/sailing/readiness-gap.ts:113-127` `classifyVerdict`: `gapDays < -1` → 'late' only past cancelling (`< -1 - w`), otherwise **'ideal' anywhere inside the window** including the last day. Spot branch (:274-282) already returns 'tight' for in-window arrivals — non-spot only.
- `lib/sailing/readiness-gap.ts:88-95` `classifyVesselByDwt` fallback `dwt < 50000 ? 'handysize' : 'capesize'`; `VESSEL_CLASS` (`lib/constants.ts:132-137`) has a hole 90 000–100 000 → those vessels fall to **capesize** (BUNKER_DEFAULTS 14.5kn/45mt, capesize ballast radius, capesize breakeven).
- `lib/economics/compute-tce.ts:136` `rate = safeNum(inputs.freightRateUsdPerMt)` — negative finite rates pass → negative grossFreight.
- `lib/economics/canals/suez.ts:80-94` adds war-risk into `totalUsd` when `vesselValueUsd`+`daysInHra` provided. No production caller passes them today (`_quoteSuezSafe` tce-calculator:213-221, `resolveCanalUsd` voyage route :96-124 — neither passes vesselValueUsd) → inactive, but any future caller double-counts vs `computeTce`'s own war-risk. SuezQuote already has a separate `warRiskUsd` field.
- NT ratio: `lib/matching/tce-calculator.ts:209` `NT_DWT_RATIO = 0.65`; `app/api/voyage/tce/route.ts:108` and `app/api/canal/[canal_code]/route.ts:84-87` use `dwt * 0.6`.
- `lib/sailing/fit-breakdown.ts:518` `scoreEconomics` → `Math.round(w * norm)` (integer); every other factor rounds to 0.1 (e.g. :489 `Math.round(... * 10) / 10`).
- C.5 chain: unique index `idx_matches_unique_cargo_vessel_user` on `(cargo_id, vessel_id, COALESCE(user_id,''))` (migration 034). Item columns exist since 044 (`NOT NULL DEFAULT 0`) but are NOT in the index — 044's comment calls one-per-email-pair intentional; **founder reversed that 2026-06-12**. Next free migration version: **051**. Writers/consumers keyed on the coarse pair:
  - `lib/matching/matches-repository.ts:408-415` existing-row SELECT (no item predicate), `:423-467` `refreshComputedColumns` UPDATE WHERE (no item predicate — after 051 it would clobber BOTH item rows) and its SET wrongly writes item indices (:446-448); `getMatchBySlug` (:474-486) `LIMIT 1` without ORDER BY → ambiguous post-051.
  - `lib/matching/persist-session-matches.ts:64-70` first-wins dedup keyed `${cargoEmailId}|${vesselEmailId}`.
  - `scripts/demo-seed/regenerate-matches.ts:615-622` pass-1 dedup keyed `${cargoEmailId}|${vesselEmailId}` («REQUIRED by the unique index»).
  - `app/dashboard/page.tsx:83-84,96,103-107` `matchIdMap`/`storedByKey` keyed `cargo_id|vessel_id` (Map collisions post-051).
  - NOT affected: content dedups `app/matches/page.tsx:123-130` and `lib/matching/count-qualifying.ts:4-11` key on `vessel_name|cargo_ref|load_port|laycan_start` (item-safe — different cargo items differ in cargo_ref); `lib/matching/session-buckets.ts` builds in-memory rows only (negative ids, never persisted); `compute-matches.ts` already passes item indices (:152-153) and its skip-guard is session-scoped.
- Audit C.8 sub-items verified NOT actionable (record only, do not implement): util-cap uses `cargoWtMax` vs util-scorer `cargoWtNominal` — documented intent (#792 worst-case gates vs #865 display scoring, fit-breakdown.ts:617-618); East-Africa↔Atlantic via Suez is correct routing (the 'atlantic' basin regex is NW-Europe only; Mombasa→Rotterdam via Suez is shorter than Cape); qty=0 estimate already surfaces a badge (`components/match/EconomicsTab.tsx:303,713`); detail-tab war_risk laden-only — deferred (needs calculateTCE adapter change, LOW value).

## Sanctioned spec changes (founder-approved — rewriting THESE test expectations is legitimate)

Implementers: the project rule «не менять test expectations под имплементацию» stands. The ONLY exceptions are the behaviour changes below, each from the founder-approved audit (memory `project_quantika_logic_audit_2026_06_12`) or the founder's C.5 decision (2026-06-12). When an existing test asserts the OLD behaviour listed here, rewrite it to the new spec **with a comment naming the audit item**. Any other failing test = STOP and report BLOCKED.

1. **C.1** Bosporus fee now charged whenever exactly one endpoint basin is `blacksea` and the other is a known non-blacksea basin (was: med↔blacksea only).
2. **C.2** `POST /api/voyage/tce` rejects `durationDays <= 0` with 400 (was: 200 with $0 economics).
3. **C.3** IMSBC Group A cargo + vessel restriction matching no-concentrates/liquefaction patterns → `verdict: 'incompatible'` (was: always 'caution').
4. **C.4** Hold-cleanliness incompatible → `matchLevel = 'weak'` → pair lands in the review bucket, not mainMatches (was: stayed in main).
5. **C.7** Non-spot arrival in the BACK half of the laycan window → `'tight'` (was: 'ideal' anywhere inside the window).
6. **C.6** DWT 50 000–99 999 outside explicit ranges → `'panamax'` (was: ≥50k fell to 'capesize'; 90–100k gap).
7. **C.5** Uniqueness key is now (cargo_id, vessel_id, user_id, cargo_item_index, vessel_item_index): several matches per email pair are CORRECT when they pair different items. Reverses migration-044's one-per-email-pair note and the B.6 email-pair first-wins dedup (`matches-repository-refresh.test.ts` dedup case, `tests/regression/persist-dedup-tie-semantics.test.ts`).
8. **C.8** `computeTce` clamps negative freight rate to 0; `quoteSuez().totalUsd` no longer includes `warRiskUsd` (field stays, reported separately); NT default in API routes 0.6 → canonical 0.65 (`NT_DWT_RATIO` export); `scoreEconomics` rounds to 0.1 like every other factor.

---

### Task 1: C.1 — Bosporus transit on Black Sea ↔ any non-Black-Sea basin

**Files:**
- Modify: `lib/matching/tce-calculator.ts:200-206`
- Test: `lib/matching/__tests__/tce-calculator-bosporus.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
// lib/matching/__tests__/tce-calculator-bosporus.test.ts
/** Audit C.1: a voyage entering/leaving the Black Sea transits the Bosporus
 *  regardless of where the other endpoint lies (Novorossiysk→Mumbai paid Suez
 *  but not Bosporus under the old med↔blacksea-only rule). */
import { routeTransitsBosporus, classifyPortBasin } from '@/lib/matching/tce-calculator';

describe('routeTransitsBosporus (audit C.1)', () => {
  it('sanity: basins classify as expected', () => {
    expect(classifyPortBasin('Novorossiysk')).toBe('blacksea');
    expect(classifyPortBasin('Mumbai')).toBe('indian');
    expect(classifyPortBasin('Rotterdam')).toBe('atlantic');
  });

  it('charges Black Sea ↔ east-of-Suez (the audit case)', () => {
    expect(routeTransitsBosporus('Novorossiysk', 'Mumbai')).toBe(true);
    expect(routeTransitsBosporus('Mumbai', 'Constanta')).toBe(true);
  });

  it('charges Black Sea ↔ Atlantic Europe', () => {
    expect(routeTransitsBosporus('Odessa', 'Rotterdam')).toBe(true);
  });

  it('still charges med ↔ blacksea both directions', () => {
    expect(routeTransitsBosporus('Istanbul', 'Odessa')).toBe(true);
    expect(routeTransitsBosporus('Constanta', 'Genoa')).toBe(true);
  });

  it('does not charge intra-basin or unknown routes', () => {
    expect(routeTransitsBosporus('Odessa', 'Constanta')).toBe(false);   // intra-BlackSea
    expect(routeTransitsBosporus('Genoa', 'Piraeus')).toBe(false);      // intra-Med
    expect(routeTransitsBosporus('Rotterdam', 'Mumbai')).toBe(false);   // no Black Sea endpoint
    expect(routeTransitsBosporus('Odessa', 'Xyzzyport')).toBe(false);   // unknown basin → conservative no-charge
    expect(routeTransitsBosporus(null, 'Odessa')).toBe(false);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** on the blacksea↔indian/atlantic cases (`routeTransitsBosporus('Novorossiysk','Mumbai')` returns false).

Run: `npx jest lib/matching/__tests__/tce-calculator-bosporus.test.ts`

- [ ] **Step 3: Replace `_routeTransitsBosporus` (tce-calculator.ts:200-206)**

```ts
// A route transits the Bosporus when exactly one endpoint lies inside the Black
// Sea and the other is a known basin outside it (med, atlantic, indian,
// eastafrica, westafrica — every exit from the Black Sea passes the strait).
// Intra-Med, intra-BlackSea and unknown-basin routes do not transit. (Audit C.1:
// the old med↔blacksea-only rule dropped the Bosporus fee on Black Sea ↔
// east-of-Suez voyages — Novorossiysk→Mumbai paid Suez but not Bosporus.)
function _routeTransitsBosporus(portA: string | null | undefined, portB: string | null | undefined): boolean {
  const a = _classifyPortBasin(portA);
  const b = _classifyPortBasin(portB);
  if (a === 'unknown' || b === 'unknown') return false;
  return (a === 'blacksea') !== (b === 'blacksea');
}
```

- [ ] **Step 4: Run the new test (PASS) + neighbours**

Run: `npx jest lib/matching/__tests__/tce-calculator-bosporus.test.ts lib/matching/__tests__/pair-analyzer-tce-into-fit.test.ts lib/matching/__tests__/stored-match-economics.test.ts`
Expected: PASS. If a stored-economics fixture happens to cross blacksea↔non-med, its canal cost legitimately grows (sanctioned change 1) — update with a `// audit C.1` comment.

- [ ] **Step 5: Commit** `git add -A && git commit -m "fix(tce): charge Bosporus on any Black Sea exit route, not only med↔blacksea (audit C.1)"`

---

### Task 2: C.2 — reject durationDays ≤ 0 at the TCE API boundary

**Files:**
- Modify: `app/api/voyage/tce/route.ts:85`
- Test: `__tests__/api/voyage-tce-duration.test.ts` (create; mirror setup of an existing `__tests__/api/*.test.ts` that POSTs to a route handler — find one with `grep -l "voyage/tce\|route.POST" __tests__/api/ | head`, e.g. canal.test.ts pattern)

- [ ] **Step 1: Check no caller legitimately sends durationDays ≤ 0**

Run: `grep -rn "voyage/tce" app components lib --include="*.ts" --include="*.tsx" | grep -v __tests__ | grep -v "api/voyage"`
Expected: client callers (e.g. EconomicsTab) compute duration from distance/speed > 0. If ANY caller can send 0 → STOP, report BLOCKED.

- [ ] **Step 2: Write the failing test**

```ts
// __tests__/api/voyage-tce-duration.test.ts
/** Audit C.2: durationDays=0 silently produced HTTP 200 with tce=0, bunker=0. */
import { POST } from '@/app/api/voyage/tce/route';
import { NextRequest } from 'next/server';

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/voyage/tce', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

const BASE = {
  vessel: { dwt: 55000, valueUsd: 18_000_000, speedKts: 13, consumptionMtPerDay: 28 },
  route: { originPort: 'Rotterdam', destinationPort: 'Hamburg', distanceNm: 280 },
  cargo: { quantityMt: 50000, freightRateUsdPerMt: 20 },
  bunkerPriceUsdPerMt: 600,
};

describe('POST /api/voyage/tce durationDays validation (audit C.2)', () => {
  it('rejects durationDays = 0 with 400', async () => {
    const res = await POST(makeReq({ ...BASE, durationDays: 0 }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(JSON.stringify(json.issues)).toContain('durationDays');
  });

  it('rejects negative durationDays with 400', async () => {
    const res = await POST(makeReq({ ...BASE, durationDays: -3 }));
    expect(res.status).toBe(400);
  });

  it('accepts positive durationDays', async () => {
    const res = await POST(makeReq({ ...BASE, durationDays: 12 }));
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 3: Run — expect FAIL** (0 and -3 currently return 200).

Run: `npx jest __tests__/api/voyage-tce-duration.test.ts`

- [ ] **Step 4: Fix the schema (route.ts:85)**

```ts
  durationDays: z.number().positive('durationDays must be > 0'),
```

- [ ] **Step 5: Run test (PASS) + the route's existing suites**

Run: `npx jest __tests__/api/voyage-tce-duration.test.ts && npx jest __tests__/api -t "tce"`

- [ ] **Step 6: Commit** `git commit -am "fix(api): reject durationDays<=0 in /api/voyage/tce — was silent \\$0 voyage (audit C.2)"`

---

### Task 3: C.3 — IMSBC Group A hard-blocks on liquefaction-restricted vessels

**Files:**
- Modify: `lib/sailing/imsbc-check.ts` (:268 area — add regex; :308-315 — Group A branch; header doc :4 and :273-276)
- Modify: `lib/sailing/match-filters.ts:467-471` (comment only)
- Test: `lib/sailing/__tests__/imsbc-check.test.ts` (extend)

- [ ] **Step 1: Find a real Group A key for fixtures**

Run: `grep -n '"group": "A"' lib/cargo/imsbc-groups.json | head -5` and pick a canonical Group A cargo (expect e.g. `nickel ore`, `copper concentrate`, `iron ore fines`→`iron ore` may be C — use what the JSON says).

- [ ] **Step 2: Write the failing tests (append to imsbc-check.test.ts)**

```ts
describe('Group A vs liquefaction-restricted vessel (audit C.3)', () => {
  // Use the Group A cargo confirmed from imsbc-groups.json in Step 1.
  const GROUP_A_CARGO = 'nickel ore';

  it.each([
    ['no concentrates'],
    ['No liquefiable cargoes'],
    ['NO GROUP A CARGOES'],
    ['no nickel ore'],
    ['no TML cargoes'],
  ])('restriction "%s" → incompatible', (restriction) => {
    const r = checkImsbcLoadability(GROUP_A_CARGO, { restrictions: [restriction] });
    expect(r.group).toBe('A');
    expect(r.verdict).toBe('incompatible');
  });

  it('Group A without matching restriction stays caution (TML cert required)', () => {
    const r = checkImsbcLoadability(GROUP_A_CARGO, { restrictions: ['no DG'] });
    expect(r.verdict).toBe('caution');
  });

  it('Group C cargo unaffected by liquefaction restrictions', () => {
    const r = checkImsbcLoadability('grain', { restrictions: ['no concentrates'] });
    expect(r.verdict).toBe('ok');
  });
});
```

Also add a hard-gate integration case to `lib/sailing/__tests__/match-filters.test.ts` (locate the existing `checkImsbc` describe with `grep -n "checkImsbc" lib/sailing/__tests__/match-filters.test.ts`):

```ts
  it('Group A cargo on a no-concentrates vessel fails the IMSBC hard gate (audit C.3)', () => {
    const r = checkImsbc('nickel ore', ['no concentrates']);
    expect(r.pass).toBe(false);
  });
```

- [ ] **Step 3: Run — expect FAIL** (`verdict` is 'caution', `pass` is true).

Run: `npx jest lib/sailing/__tests__/imsbc-check.test.ts lib/sailing/__tests__/match-filters.test.ts`

- [ ] **Step 4: Implement in imsbc-check.ts**

Below `DG_RESTRICTION_RE` (:268) add:

```ts
// Vessel restriction patterns indicating IMSBC Group A (liquefaction-risk)
// cargoes are prohibited: "no concentrates", "no liquefiable cargoes",
// "no Group A", "no nickel ore", "no TML cargoes". (Audit C.3 — Group A
// previously never hard-blocked, even on explicitly restricted vessels.)
const GROUP_A_RESTRICTION_RE = /\bno\b.{0,40}(?:concentrates?\b|liquef\w+|group\s*a\b|nickel\s+ore\b|tml\b)/i;
```

Replace the Group A branch (:308-315):

```ts
  if (group === 'A') {
    const restrictions = vessel?.restrictions ?? [];
    if (restrictions.some((r) => GROUP_A_RESTRICTION_RE.test(r))) {
      return {
        group: 'A',
        verdict: 'incompatible',
        requirements,
        rationale: `IMSBC Group A (liquefaction risk) — vessel restrictions prohibit liquefiable/Group A cargoes`,
      };
    }
    return {
      group: 'A',
      verdict: 'caution',
      requirements,
      rationale: `IMSBC Group A (liquefaction risk) — TML certificate required before loading`,
    };
  }
```

Update the function doc (:273-276) bullet to: `Group A → caution (TML certificate required) unless vessel explicitly restricts liquefiable/Group A cargoes → incompatible.` Update the header design-rules bullet (:13) similarly, and the match-filters.ts:467-471 comment block to say the hard gate fires for Group B (DG-restricted) **and Group A (liquefaction-restricted)** vessels.

- [ ] **Step 5: Run (PASS)** `npx jest lib/sailing/__tests__/imsbc-check.test.ts lib/sailing/__tests__/match-filters.test.ts lib/sailing/__tests__/match-gates-integration.test.ts`
If an existing case asserts Group A + restricted vessel → caution, rewrite it per sanctioned change 3 with an `// audit C.3` comment.

- [ ] **Step 6: Commit** `git commit -am "fix(imsbc): Group A hard-blocks on liquefaction-restricted vessels (audit C.3)"`

---

### Task 4: C.4 — hold-cleanliness incompatible demotes the match off the main board

**Files:**
- Modify: `lib/matching/hold-cleanliness.ts:24-32`
- Test: locate with `grep -rln "applyHoldCleanliness" lib --include="*.test.ts"`; if none, create `lib/matching/__tests__/hold-cleanliness.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/matching/__tests__/hold-cleanliness.test.ts (or append to the existing suite found in Step 1)
/** Audit C.4: blockSend=true used to leave the match in mainMatches AND let
 *  classifyPriority flag it 'urgent'. Demoting matchLevel to 'weak' routes it
 *  to the review bucket via the existing partition rule (pair-analyzer:798). */
import { applyHoldCleanliness } from '@/lib/matching/hold-cleanliness';
import type { Match, ParsedCargo, ParsedVessel } from '@/lib/types';

function makeMatch(): Match {
  return {
    cargoEmailId: 'c1', cargoItemIndex: 0, vesselEmailId: 'v1', vesselItemIndex: 0,
    score: 80, matchLevel: 'good', matchReasons: ['test'],
    confidence: { level: 'confirmed', blockSend: false, blockedFields: [], fieldConfidences: [] },
  } as unknown as Match;
}

// Cement → grain is a canonical L5C incompatible pair; verify with
// `grep -n "cement" lib/cargo/l5c-matrix.ts` and adjust if the matrix differs.
const cargo = { cargoDescription: { value: 'grain', confidence: 'confirmed' } } as unknown as ParsedCargo;
const vesselDirty = { lastCargoes: 'cement clinker, cement' } as unknown as ParsedVessel;

describe('applyHoldCleanliness demotion (audit C.4)', () => {
  it('incompatible last cargo → matchLevel weak + blockSend + issue', () => {
    const m = makeMatch();
    applyHoldCleanliness(m, cargo, vesselDirty);
    expect(m.confidence?.blockSend).toBe(true);
    expect(m.matchLevel).toBe('weak');
    expect((m.issues ?? []).join()).toContain('Hold cleanliness');
  });

  it('compatible cargo keeps its level', () => {
    const m = makeMatch();
    const cleanVessel = { lastCargoes: 'wheat, corn' } as unknown as ParsedVessel;
    applyHoldCleanliness(m, cargo, cleanVessel);
    expect(m.matchLevel).toBe('good');
  });
});
```

- [ ] **Step 2: Run — expect FAIL on `matchLevel` assertion** (stays 'good'). If the incompatible fixture doesn't trip `checkCompatibility`, inspect `lib/cargo/l5c-matrix.ts` for a real blocking pair and fix the fixture — do NOT weaken the assertion.

Run: `npx jest lib/matching/__tests__/hold-cleanliness.test.ts`

- [ ] **Step 3: Implement (hold-cleanliness.ts, inside `if (!compat.compatible)`)**

```ts
  if (!compat.compatible) {
    const blockers = compat.blocking_pairs.map((p) => p.previous).join(', ');
    m.issues = [
      ...(m.issues ?? []),
      `Hold cleanliness: incompatible with last cargo (${blockers})`,
    ];
    // Audit C.4: a blocked-send pair is not callable — demote off the main board.
    // The realism partition routes matchLevel='weak' to the review bucket.
    m.matchLevel = 'weak';
    if (m.confidence) {
      m.confidence = { ...m.confidence, level: 'uncertain', blockSend: true };
    }
  }
```

Also update the function doc (:7): `compatible=false → adds issue + demotes confidence to uncertain/blockSend + demotes matchLevel to 'weak' (review bucket)`.

- [ ] **Step 4: Run (PASS) + partition guards**

Run: `npx jest lib/matching/__tests__/hold-cleanliness.test.ts lib/matching/__tests__/pair-analyzer-floor-intact.test.ts && npx jest -t "realism"`
A test asserting an incompatible-hold match stays in mainMatches encodes the bug — rewrite per sanctioned change 4 with `// audit C.4`.

- [ ] **Step 5: Commit** `git commit -am "fix(matching): hold-cleanliness incompatible demotes match to review bucket (audit C.4)"`

---

### Task 5: C.7 — back half of the laycan window rates 'tight', not 'ideal'

**Files:**
- Modify: `lib/sailing/readiness-gap.ts:113-127` (`classifyVerdict`)
- Test: `lib/sailing/__tests__/readiness-gap.test.ts` (extend)

- [ ] **Step 1: Write the failing test (append; follow the suite's existing helper style)**

```ts
describe('back-of-window arrival rates tight (audit C.7)', () => {
  // classifyVerdict is module-private — drive it through calculateReadinessGap.
  // Vessel open at the load port (distance 0) with openDate D arrives on D.
  // Laycan 2026-10-01..2026-10-11 (window 10d): arrival 10-03 (depth 2d) front
  // half → ideal; arrival 10-09 (depth 8d) back half → tight; 10-13 → late.
  const cargo = { laycan: '2026-10-01 .. 2026-10-11', originPort: 'Rotterdam' };
  const vessel = (open: string) => ({
    openDate: open, openPosition: 'Rotterdam', speedLaden: '13 kn', dwtSummer: 55000,
  });
  const opts = { refYear: 2026, today: new Date('2026-09-01T00:00:00Z') };

  it('front half of window stays ideal', () => {
    expect(calculateReadinessGap(vessel('2026-10-03'), cargo, opts).verdict).toBe('ideal');
  });
  it('back half of window is tight', () => {
    expect(calculateReadinessGap(vessel('2026-10-09'), cargo, opts).verdict).toBe('tight');
  });
  it('past cancelling stays late', () => {
    expect(calculateReadinessGap(vessel('2026-10-13'), cargo, opts).verdict).toBe('late');
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (10-09 arrival currently 'ideal').

Run: `npx jest lib/sailing/__tests__/readiness-gap.test.ts -t "audit C.7"`

- [ ] **Step 3: Implement (classifyVerdict)**

```ts
function classifyVerdict(gapDays: number, windowDays: number): ReadinessVerdict {
  // gapDays = laycanSTART - arrival. windowDays = laycanEND - laycanSTART (>= 0).
  // Laycan is a WINDOW [start, end]: a vessel arriving anywhere inside it is
  // ON-TIME, but the deeper into the window it lands, the less slack remains
  // before the cancelling date. Front half → 'ideal'; back half → 'tight'
  // (audit C.7 — previously the whole window rated 'ideal' up to cancelling).
  // 'late' fires only past the cancelling date (END), NOT >1d after the start.
  const w = Number.isFinite(windowDays) ? Math.max(0, windowDays) : 0;
  if (gapDays < -1) {
    if (gapDays < -1 - w) return 'late'; // past the cancelling date
    return -gapDays > w / 2 ? 'tight' : 'ideal'; // back half of the window cuts it fine
  }
  if (gapDays < 0.5) return 'tight'; // arrives right at the start — cuts it fine
  if (gapDays <= 5) return 'ideal'; // small buffer before laydays commence
  return 'idle'; // waits multiple days before laycan even opens (commercially weak)
}
```

- [ ] **Step 4: Run the whole readiness suite (PASS)**

Run: `npx jest lib/sailing/__tests__/readiness-gap.test.ts lib/sailing/__tests__/date-sanity.test.ts`
A case asserting 'ideal' for a back-half arrival encodes the bug — rewrite per sanctioned change 5 with `// audit C.7`. Spot-vessel cases must be untouched (spot branch unchanged).

- [ ] **Step 5: Commit** `git commit -am "fix(readiness): back half of laycan window rates tight, not ideal (audit C.7)"`

---

### Task 6: C.6 — 90–100k DWT classifies panamax, not capesize

**Files:**
- Modify: `lib/sailing/readiness-gap.ts:88-95` (`classifyVesselByDwt`)
- Test: `lib/sailing/__tests__/readiness-gap.test.ts` (extend)

- [ ] **Step 1: Write the failing test (append)**

```ts
describe('classifyVesselByDwt gap handling (audit C.6)', () => {
  it.each([
    [25000, 'handysize'], [45000, 'handysize'], [55000, 'supramax'],
    [80000, 'panamax'],
    [95000, 'panamax'],   // the 90–100k hole used to fall through to capesize
    [99999, 'panamax'],
    [100000, 'capesize'], [450000, 'capesize'],
    [null, 'handysize'],
  ])('%s → %s', (dwt, cls) => {
    expect(classifyVesselByDwt(dwt as number | null)).toBe(cls);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (95000/99999 → 'capesize').

Run: `npx jest lib/sailing/__tests__/readiness-gap.test.ts -t "audit C.6"`

- [ ] **Step 3: Implement**

```ts
/** Map DWT to handysize/supramax/panamax/capesize class (defaults to handysize). */
export function classifyVesselByDwt(dwt: number | null | undefined): VesselClassName {
  if (!dwt || !Number.isFinite(dwt)) return 'handysize';
  for (const [name, range] of Object.entries(VESSEL_CLASS)) {
    if (dwt >= range.minDwt && dwt <= range.maxDwt) return name as VesselClassName;
  }
  // Gaps between class ranges: <50k leans handysize (demo corpus skew);
  // 90–100k post-panamax economics sit closer to panamax than capesize
  // (audit C.6 — the old ≥50k fallback sent 90–100k to capesize: 45mt/day
  // consumption + capesize ballast radius for a baby-cape hull).
  if (dwt < 50000) return 'handysize';
  if (dwt < 100000) return 'panamax';
  return 'capesize';
}
```

- [ ] **Step 4: Run readiness + fit suites (PASS)**

Run: `npx jest lib/sailing/__tests__/readiness-gap.test.ts lib/sailing/__tests__/fit-breakdown.test.ts lib/economics/__tests__/breakeven-thresholds.test.ts`
A test asserting 90–100k → capesize encodes the bug — rewrite per sanctioned change 6 with `// audit C.6`.

- [ ] **Step 5: Commit** `git commit -am "fix(sailing): classify 90-100k DWT as panamax — VESSEL_CLASS gap fell to capesize (audit C.6)"`

---

### Task 7: C.8 — economics micro-fixes (negative freight, Suez war-risk mine, NT ratio, rounding)

**Files:**
- Modify: `lib/economics/compute-tce.ts:136`
- Modify: `lib/economics/canals/suez.ts:94` (+ header doc)
- Modify: `lib/constants.ts` (add `NT_DWT_RATIO`), `lib/matching/tce-calculator.ts:208-209`, `app/api/voyage/tce/route.ts:108`, `app/api/canal/[canal_code]/route.ts:84-87`
- Modify: `lib/sailing/fit-breakdown.ts:518`
- Tests: `lib/economics/__tests__/compute-tce.test.ts`, the suez quote suite (`grep -rln "quoteSuez" lib --include="*.test.ts" __tests__ -r`), `__tests__/api/canal.test.ts`, `lib/sailing/__tests__/fit-breakdown-economics.test.ts`

- [ ] **Step 1: Failing test — negative freight clamp (append to compute-tce.test.ts)**

```ts
  it('clamps a negative freight rate to 0 — no negative gross freight (audit C.8)', () => {
    const r = computeTce({
      dwt: 50000, valueUsd: 15_000_000, speedKts: 13, consumptionMtPerDay: 28,
      freightRateUsdPerMt: -12, quantityMt: 50000, distanceNm: 3000,
      bunkerPriceUsdPerMt: 600, euaPriceEur: 0, canalUsd: 0, daUsd: 0,
    });
    expect(r.breakdown.gross_freight_usd).toBe(0);
    expect(r.breakdown.freight_rate_usd_per_mt).toBe(0);
  });
```

Run: `npx jest lib/economics/__tests__/compute-tce.test.ts -t "audit C.8"` → FAIL (gross −600 000).

- [ ] **Step 2: Implement clamp (compute-tce.ts:136)**

```ts
  // Negative freight is nonsense input (bad parse/manual typo) — clamp to 0 so
  // gross freight never goes negative (audit C.8).
  const rate = Math.max(0, safeNum(inputs.freightRateUsdPerMt));
```

Run same test → PASS.

- [ ] **Step 3: Failing test — quoteSuez totalUsd excludes war-risk (append to the suez suite found above; if none exists, create `lib/economics/canals/__tests__/suez-war-risk.test.ts` following db mocking in neighbour canal tests)**

```ts
  it('reports warRiskUsd separately, never inside totalUsd (audit C.8 latent double-count)', () => {
    // Tariff row with war_risk_zone + vesselValueUsd/daysInHra provided used to
    // fold the premium into totalUsd; TCE callers add their own war-risk on top.
    const q = quoteSuez({ vesselDwt: 50000, vesselNt: 32500, vesselType: 'bulker', laden: true,
      vesselValueUsd: 15_000_000, daysInHra: 5 });
    expect(q.totalUsd).toBe(q.scntFeeUsd);
    // warRiskUsd may be 0 if the active tariff has no war_risk_zone — the
    // invariant under test is the SUM, not the premium itself.
  });
```

Run → FAIL when the tariff row carries `war_risk_zone` (if the seeded tariff has none and `warRiskUsd` is always 0, the equality already holds — keep the test as a regression lock and continue).

- [ ] **Step 4: Implement (suez.ts:94)**

```ts
  // War-risk is quoted for visibility only — NOT folded into totalUsd. The TCE
  // chain (computeTce) prices war-risk itself; summing it here double-counted
  // for any caller passing vesselValueUsd (audit C.8, latent).
  const totalUsd = scntFeeUsd;
```

Update the header doc (:19-21): `War-risk: ... calculateWarRiskPremium() is invoked and reported as warRiskUsd (informational; excluded from totalUsd).`

- [ ] **Step 5: NT ratio — single constant.** In `lib/constants.ts` (after `FALLBACK_EUA_EUR_PER_TCO2`):

```ts
/** Net-tonnage approximation from DWT (bulker convention: NT ≈ DWT × 0.65).
 *  Single source — canal SCNT quoting in both the stored-match path and the
 *  detail/canal API routes (audit C.8: routes used 0.6 vs engine 0.65). */
export const NT_DWT_RATIO = 0.65;
```

In `tce-calculator.ts`: delete the local `const NT_DWT_RATIO = 0.65;` (:208-209) and add `NT_DWT_RATIO` to the existing `@/lib/constants` import (:13). In `app/api/voyage/tce/route.ts:108`: `const vesselNt = body.vessel.nt ?? Math.round(body.vessel.dwt * NT_DWT_RATIO);` (+import). In `app/api/canal/[canal_code]/route.ts:84-87`: replace both `0.6` usages with `NT_DWT_RATIO` (+import; update the comment at :84 to say 0.65).

- [ ] **Step 6: Economics factor 0.1-rounding (fit-breakdown.ts:518)**

```ts
  const score = Math.round(w * norm * 10) / 10;
```

- [ ] **Step 7: Run all affected suites**

Run: `npx jest lib/economics/__tests__/compute-tce.test.ts lib/sailing/__tests__/fit-breakdown-economics.test.ts lib/sailing/__tests__/fit-breakdown.test.ts lib/sailing/__tests__/fit-bracket-data.test.ts __tests__/api/canal.test.ts && npx jest -t "suez"`
Expected: failures ONLY in expectations covered by sanctioned change 8 (integer economics scores, NT-0.6-derived canal fees, totalUsd-includes-war-risk) — rewrite those with `// audit C.8` comments. Anything else → BLOCKED.

- [ ] **Step 8: Commit** `git commit -am "fix(economics): clamp negative freight, unfold Suez war-risk from totalUsd, canonical NT_DWT_RATIO, 0.1-round economics factor (audit C.8)"`

---

### Task 8: C.5 core — item-aware uniqueness (migration 051 + repository + persist)

**Files:**
- Create: `lib/migrations/051-matches-item-unique.ts`
- Modify: `lib/migrations/index.ts` (register — follow the 050 entry pattern)
- Modify: `lib/matching/matches-repository.ts` (:406-417 existing-row SELECT; :423-467 refreshComputedColumns; :474-486 getMatchBySlug)
- Modify: `lib/matching/persist-session-matches.ts:60-70`
- Tests: create `lib/matching/__tests__/matches-item-uniqueness.test.ts`; modify `lib/matching/__tests__/matches-repository-refresh.test.ts`, `lib/matching/__tests__/match-slug.test.ts`, `tests/regression/persist-dedup-tie-semantics.test.ts`

**Context for the implementer:** Founder decision 2026-06-12 (audit C.5): a second cargo item in the same email must get its own match row. Until now the unique index collapsed everything to one row per (cargo_id=emailId, vessel_id=emailId, user_id) and three layers reinforced that: the B.6 first-wins email-pair dedup in persist, regen's pass-1, and migration 044's comment. All existing data is unique under the coarser key, therefore automatically unique under the finer key — the migration needs NO data dedup on `up`.

- [ ] **Step 1: Migration 051**

```ts
// lib/migrations/051-matches-item-unique.ts
import type { Migration } from './types';

/**
 * Widen match uniqueness to the ITEM pair (audit C.5, founder 2026-06-12).
 *
 * Migration 034 deduped matches to one per (cargo_id, vessel_id, user_id) —
 * i.e. one per EMAIL pair — so the second cargo item parsed from the same
 * email could never persist its own match. Item columns exist since 044
 * (NOT NULL DEFAULT 0). This index makes (pair, item, item) the unique key.
 *
 * No data dedup needed on up(): rows unique under the coarser key are
 * necessarily unique under the finer one. down() must dedup before
 * re-tightening (keep the earliest row per coarse key, mirroring 034).
 */
const migration051: Migration = {
  version: 51,
  name: 'matches-item-unique',
  up(db) {
    db.exec(`DROP INDEX IF EXISTS idx_matches_unique_cargo_vessel_user`);
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_matches_unique_pair_item
      ON matches(cargo_id, vessel_id, COALESCE(user_id, ''), cargo_item_index, vessel_item_index)
    `);
  },
  down(db) {
    db.exec(`DROP INDEX IF EXISTS idx_matches_unique_pair_item`);
    db.exec(`
      DELETE FROM matches
      WHERE rowid NOT IN (
        SELECT MIN(rowid) FROM matches
        GROUP BY cargo_id, vessel_id, COALESCE(user_id, '')
      )
    `);
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_matches_unique_cargo_vessel_user
      ON matches(cargo_id, vessel_id, COALESCE(user_id, ''))
    `);
  },
};

export default migration051;
```

Register in `lib/migrations/index.ts` exactly like migration 050 is registered (import + array entry, ascending order).

- [ ] **Step 2: Failing tests — new file**

```ts
// lib/matching/__tests__/matches-item-uniqueness.test.ts
/** Audit C.5 (founder 2026-06-12): one match per ITEM pair. Two cargo items
 *  from the same email matching the same vessel are two distinct rows. */
import Database from 'better-sqlite3';
import { runMigrations } from '@/lib/migrations/runner'; // verify exact export with: grep -n "export" lib/migrations/runner.ts
import { createMatch, listMatches } from '@/lib/matching/matches-repository';

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db); // full chain 001..051 — verify signature; fall back to the per-migration .up(db) pattern used in write-path-field-parity.test.ts if the runner needs more wiring
  return db;
}

const base = {
  cargo_id: 'cargo-email-1', vessel_id: 'vessel-email-1',
  score: 70, reason: 'r', user_id: 'sess-1',
};

describe('item-aware match uniqueness (migration 051)', () => {
  it('persists two rows for two cargo items of the same email pair', () => {
    const db = makeDb();
    createMatch(db, { ...base, cargo_item_index: 0, vessel_item_index: 0, fit_percent: 80 });
    createMatch(db, { ...base, cargo_item_index: 1, vessel_item_index: 0, fit_percent: 75 });
    const rows = listMatches(db, { user_id: 'sess-1', sortBy: 'score', sortDir: 'desc' });
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.cargo_item_index))).toEqual(new Set([0, 1]));
  });

  it('same item pair twice stays one row (INSERT OR IGNORE)', () => {
    const db = makeDb();
    createMatch(db, { ...base, cargo_item_index: 1, vessel_item_index: 0 });
    createMatch(db, { ...base, cargo_item_index: 1, vessel_item_index: 0 });
    expect(listMatches(db, { user_id: 'sess-1', sortBy: 'score', sortDir: 'desc' })).toHaveLength(1);
  });

  it('duplicate insert returns the existing row of the SAME item pair', () => {
    const db = makeDb();
    createMatch(db, { ...base, cargo_item_index: 0, vessel_item_index: 0, fit_percent: 80 });
    createMatch(db, { ...base, cargo_item_index: 1, vessel_item_index: 0, fit_percent: 75 });
    const dup = createMatch(db, { ...base, cargo_item_index: 1, vessel_item_index: 0, fit_percent: 75 });
    expect(dup.cargo_item_index).toBe(1);
  });

  it('refreshComputed updates ONLY the matching item row', () => {
    const db = makeDb();
    createMatch(db, { ...base, cargo_item_index: 0, vessel_item_index: 0, score: 70, fit_percent: 80 });
    createMatch(db, { ...base, cargo_item_index: 1, vessel_item_index: 0, score: 60, fit_percent: 75 });
    createMatch(db, { ...base, cargo_item_index: 1, vessel_item_index: 0, score: 65, fit_percent: 77, refreshComputed: true });
    const rows = listMatches(db, { user_id: 'sess-1', sortBy: 'score', sortDir: 'desc' });
    const item0 = rows.find((r) => r.cargo_item_index === 0)!;
    const item1 = rows.find((r) => r.cargo_item_index === 1)!;
    expect(item0.fit_percent).toBe(80); // untouched — the old WHERE clobbered both
    expect(item1.fit_percent).toBe(77);
  });
});
```

Run: `npx jest lib/matching/__tests__/matches-item-uniqueness.test.ts` → FAIL (one row instead of two; cross-item clobber).

- [ ] **Step 3: Repository — existing-row SELECT (createMatch :406-417)**

```ts
  if (result.changes === 0) {
    // Duplicate silently ignored by UNIQUE constraint — return the existing row
    // (item-aware since migration 051; legacy DBs without item columns keep the
    // coarse pair lookup).
    const withIdx = hasItemIndexColumns(db);
    const sql = `SELECT * FROM matches
         WHERE cargo_id = ? AND vessel_id = ?
           AND (user_id = ? OR (user_id IS NULL AND ? IS NULL))
           ${withIdx ? 'AND cargo_item_index = ? AND vessel_item_index = ?' : ''}
         LIMIT 1`;
    const params: Array<string | number | null> = [input.cargo_id, input.vessel_id, user_id, user_id];
    if (withIdx) params.push(input.cargo_item_index ?? 0, input.vessel_item_index ?? 0);
    const existing = db.prepare(sql).get(...params) as StoredMatch | undefined;
    return existing!;
  }
```

- [ ] **Step 4: Repository — refreshComputedColumns.** Remove the item-index SET block (:446-449 — identity columns, never SET) and make the WHERE item-aware:

```ts
  if (hasWorksheetColumn(db)) {
    // (unchanged COALESCE block)
  }
  if (hasConsumptionEstimatedColumn(db)) { sets.push('consumption_estimated = ?'); args.push(input.consumption_estimated ?? null); }
  if (hasBallastDistanceColumn(db)) { sets.push('ballast_distance_nm = ?'); args.push(input.ballast_distance_nm ?? null); }
  if (hasBreakevenColumn(db)) { sets.push('breakeven_tce_usd_per_day = ?'); args.push(input.breakeven_tce_usd_per_day ?? null); }
  const user_id = input.user_id !== undefined ? input.user_id : null;
  const withIdx = hasItemIndexColumns(db);
  args.push(input.cargo_id, input.vessel_id, user_id, user_id);
  if (withIdx) args.push(input.cargo_item_index ?? 0, input.vessel_item_index ?? 0);
  db.prepare(
    `UPDATE matches SET ${sets.join(', ')}
     WHERE cargo_id = ? AND vessel_id = ?
       AND ((user_id IS NULL AND ? IS NULL) OR user_id = ?)
       ${withIdx ? 'AND cargo_item_index = ? AND vessel_item_index = ?' : ''}`,
  ).run(...args);
```

(Item indices are part of the row's identity since 051 — refresh targets exactly one row.)

- [ ] **Step 5: Repository — getMatchBySlug determinism (:474-486).** The slug carries only cargo_id+vessel_id; with several item rows it must deterministically return the best one:

```ts
/** Resolve a slug (cargo_id + vessel_id + user) to a match. Since migration 051
 *  several item rows may share the pair — return the best by fit, then score
 *  (deterministic; the slug format predates item-level matches). */
export function getMatchBySlug(
  db: Database.Database,
  cargoId: string,
  vesselId: string,
  userId: string,
): StoredMatch | null {
  const row = db
    .prepare(
      `SELECT * FROM matches WHERE cargo_id = ? AND vessel_id = ? AND user_id = ?
       ORDER BY COALESCE(fit_percent, -1) DESC, score DESC, id ASC LIMIT 1`,
    )
    .get(cargoId, vesselId, userId) as StoredMatch | undefined;
  return row ?? null;
}
```

- [ ] **Step 6: persist-session-matches dedup key (:60-70)**

```ts
  // Engine matches arrive sorted by fitPercent DESC. Guard against duplicate
  // ITEM pairs only — keep the first (best). Since migration 051 uniqueness is
  // item-aware: different items of the same email are distinct matches and all
  // persist (audit C.5, founder 2026-06-12; replaces the B.6 email-pair key).
  const seenPairs = new Set<string>();
  const dedupedMatches = sessionMatches.filter((m) => {
    const k = `${m.cargoEmailId}|${m.cargoItemIndex}|${m.vesselEmailId}|${m.vesselItemIndex}`;
    if (seenPairs.has(k)) return false;
    seenPairs.add(k);
    return true;
  });
```

- [ ] **Step 7: Rewrite the two sanctioned tests.** (a) In `matches-repository-refresh.test.ts`, the B.6 first-wins case asserting one row per email pair across different items → now expects BOTH rows (sanctioned change 7; keep a first-wins case for the SAME item pair). (b) `tests/regression/persist-dedup-tie-semantics.test.ts` — same semantics flip; add a banner comment: `// REWRITTEN 2026-06-12: founder decision (audit C.5) — uniqueness is per item pair; the 044-era one-per-email-pair semantics this test pinned are retired.` (c) Extend `match-slug.test.ts`: two item rows, slug resolves to the higher-fit one.

- [ ] **Step 8: Run the full write-path battery**

Run: `npx jest lib/matching/__tests__/matches-item-uniqueness.test.ts lib/matching/__tests__/matches-repository-refresh.test.ts lib/matching/__tests__/matches-repository.test.ts lib/matching/__tests__/match-slug.test.ts lib/matching/__tests__/write-path-field-parity.test.ts lib/matching/__tests__/persist-session-matches-fit.test.ts lib/matching/__tests__/persist-session-matches-m3.test.ts lib/matching/__tests__/persist-session-matches-da-parity.test.ts lib/matching/__tests__/persist-session-matches-worksheet-filters.test.ts && npx jest tests/regression/persist-dedup-tie-semantics.test.ts tests/regression/persist-refresh-worksheet-clobber.test.ts tests/regression/write-path-value-parity.test.ts --testPathIgnorePatterns "/node_modules/"`
Expected: PASS (single-item fixtures are key-compatible with the finer index).

- [ ] **Step 9: Commit** `git commit -am "feat(matching): item-aware match uniqueness — migration 051 + repository + persist (audit C.5)"`

---

### Task 9: C.5 consumers — regen pass-1, dashboard maps, multi-item persist test

**Files:**
- Modify: `scripts/demo-seed/regenerate-matches.ts:583-622` (pass-1 dedup + comments)
- Modify: `app/dashboard/page.tsx:83-107`
- Test: `lib/matching/__tests__/persist-session-matches-multi-item.test.ts` (create)

- [ ] **Step 1: Failing test — two cargo items persist as two rows through the real persist path**

```ts
// lib/matching/__tests__/persist-session-matches-multi-item.test.ts
/** Audit C.5 end-to-end: a cargo email with TWO items matching the same vessel
 *  email persists TWO rows with distinct item indices (the old email-pair
 *  dedup + 034 index collapsed them to one). Mirror the db/fixture setup of
 *  persist-session-matches-fit.test.ts (same migrations chain incl. 051). */
```

Build it by copying the setup of `persist-session-matches-fit.test.ts` (read it first), with: two `Match` objects sharing `cargoEmailId`/`vesselEmailId`, `cargoItemIndex` 0 and 1, `vesselItemIndex` 0, fitPercent 80/75; matching `ParsedCargo` entries `itemIndex` 0 and 1 (different `cargoDescription`s) and one vessel. Assert `listMatches(...)` returns 2 rows and `rows.map(r => r.cargo_item_index).sort()` is `[0, 1]`.

Run: `npx jest lib/matching/__tests__/persist-session-matches-multi-item.test.ts` → with Task 8 landed this should PASS already — if it FAILS, a missed consumer survives; investigate before continuing (this is the acceptance test for the whole C.5).

- [ ] **Step 2: regen pass-1 → item-aware (regenerate-matches.ts:615-622)**

```ts
  // Pass 1: one match per ITEM pair — the engine already emits unique item
  // pairs (pair-analyzer dedupes by pairKey), this guards against accidental
  // dupes only. Since migration 051 the unique index is item-aware, so two
  // items of the same email legitimately produce two board rows (audit C.5,
  // founder 2026-06-12 — replaces the old one-per-email-pair collapse).
  // Pass 2: collapse cross-email content dupes (re-circulated vessel/cargo).
  // Survivors may share (cargo_id, vessel_id) with distinct item indices —
  // INSERT OR IGNORE is safe under idx_matches_unique_pair_item.
  function dedup(matches: Match[]): Match[] {
    return bestBy(
      bestBy(matches, (m) => `${m.cargoEmailId}|${m.cargoItemIndex}|${m.vesselEmailId}|${m.vesselItemIndex}`),
      contentKey,
    );
  }
```

Also update the section banner comment at :583-584 («Dedup each bucket to one match per (cargo email, vessel email) pair») to say «one match per ITEM pair + cross-email content dedup».

- [ ] **Step 3: Dashboard maps item-aware (app/dashboard/page.tsx:83-84, 96, 103-107).** Key both maps and both lookups with item indices so Map entries stop colliding:

```ts
  const storedKey = (cargoId: string, cargoIdx: number | null | undefined, vesselId: string, vesselIdx: number | null | undefined) =>
    `${cargoId}|${cargoIdx ?? 0}|${vesselId}|${vesselIdx ?? 0}`;
  const matchIdMap = new Map(storedMatches.map((sm) => [storedKey(sm.cargo_id, sm.cargo_item_index, sm.vessel_id, sm.vessel_item_index), sm.id]));
  const storedByKey = new Map(storedMatches.map((sm) => [storedKey(sm.cargo_id, sm.cargo_item_index, sm.vessel_id, sm.vessel_item_index), sm]));
```

and at :96/:103/:105/:107 look up with `storedKey(match.cargoEmailId, match.cargoItemIndex, match.vesselEmailId, match.vesselItemIndex)`.

- [ ] **Step 4: TypeScript + lint + acceptance test**

Run: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit && npx jest lib/matching/__tests__/persist-session-matches-multi-item.test.ts lib/matching/__tests__/session-buckets-economics.test.ts`

- [ ] **Step 5: Commit** `git commit -am "feat(matching): item-aware regen dedup + dashboard maps + multi-item persist acceptance (audit C.5)"`

---

### Task 10: Verification sweep

- [ ] **Step 1: Full targeted battery** (NOT full `npm test` — full run is CI's job)

```bash
NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit
rtk lint
npx jest lib/matching lib/sailing lib/economics __tests__/api/canal.test.ts __tests__/api/voyage-tce-duration.test.ts
npx jest tests/regression --testPathIgnorePatterns "/node_modules/"
```

- [ ] **Step 2: Build** `rtk next build` — route compile must succeed (new migration is server-only).
- [ ] **Step 3: Re-read the audit map** (`memory project_quantika_logic_audit_2026_06_12` section C) and confirm each of C.1–C.8 maps to a commit or a documented skip (util seam, East-Africa Suez, qty badge, detail war_risk laden-only).

---

## Out of scope (recorded, not implemented)

- C.8 util-cap vs util-scorer weight basis — documented intent (#792 vs #865), not a bug.
- C.8 East-Africa↔Atlantic always-Suez — 'atlantic' basin is NW-Europe only; Suez is the correct routing there.
- C.8 qty=0 estimate confidence — already surfaced (`EconomicsTab.tsx:713` badge).
- C.8 detail-tab war_risk laden-only — deferred (calculateTCE adapter change; LOW).
- Post-merge: prod seed regen (Bosporus/IMSBC/laycan/DWT/C.5 all shift stored matches) — controller handles after deploy with `--dry` first and explicit founder authorization for the prod write.

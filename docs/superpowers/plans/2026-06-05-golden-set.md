# Golden-Set Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) for Phase A (TDD harness). Phase B (curation) is research/verify — see its note.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a 20-pair regression oracle that runs the matching engine on each pair and asserts
TCE/day, distance_nm, and cargo weight against externally-verified ("golden") numbers, with honest
flags for default-derived inputs.

**Architecture:** A versioned JSON fixture (`golden-matches.json`) + a Jest driver that, per record,
mirrors `regenerate-matches.ts`: normalize inputs → `analyzePairs([cargo],[vessel], async()=>[], {today})`
for distance/bucket/verdict, and `buildMatchEconomics(explicit inputs)` for TCE arithmetic. Control
pairs assert correct values (green now, guard regressions). Known-bug pairs use Jest `it.failing`
(red now; auto-flip when the bug is fixed). Plugs into VALUE_CHECK Check F as the matching-PR oracle.

**Tech Stack:** TypeScript, Jest v30 + ts-jest, the existing matching engine (`lib/matching/*`,
`lib/sailing/port-distances`, `lib/matching/tce-calculator`). External distance verified at BUILD time
via web searoute (offline at test time — number is baked into the fixture).

---

## Key recon facts (from engine map, 2026-06-05)

- `analyzePairs(cargos: ParsedCargo[], vessels: ParsedVessel[], aiScorer, {refYear?, today?, db?})`
  → `{matches, lowConfidenceMatches, insufficientData, blockedMatches}`. `lib/matching/pair-analyzer.ts:245`.
- TCE: `match.economics?.tceUsdPerDay` (USD/day) — **only on good/possible main matches** (economics
  runs after realism partition). Loss-makers may lack it → assert TCE via `buildMatchEconomics` directly.
- `buildMatchEconomics(input: MatchEconomicsInput) → EconomicsResult | null` (`lib/matching/tce-calculator.ts:205`).
  Returns `null` if `distanceNm <= 0`. Defaults: speed **12**, consumption **25**, bunker **600**,
  vessel value **22M** (`tce-calculator.ts:26-29`).
- Distance: `match.readiness.distanceNm` via `getPortDistance(load, disch)` — uses tiered port-distances
  incl. Tier-2 `searoute-pairs.json`. ← this is exactly what the EXTERNAL web number checks.
- Weight: cargo `weightMt` (ConfidenceField) + `weightMtMin`/`weightMtMax` on `ParsedCargo`.
- **NO est/default flag exists** on speed/consumption anywhere. `FreightRateEstimate.source` tracks only
  freight provenance. → est-flag golden assertions are `it.failing` until an engine fix exposes it (B3).
- Clock: pass explicit `today: new Date('YYYY-MM-DDT00:00:00.000Z')` to `analyzePairs` (cleaner than mock).
- Engine template = `scripts/demo-seed/regenerate-matches.ts` (normalizeLaycan + wrapOpenDate → analyzePairs).
- Runner: Jest, `npm test -- <path>`. Setup stubs fetch + `:memory:` DB. Convention test:
  `lib/matching/__tests__/pair-analyzer-empty-id.test.ts` (makeCargo/makeVessel fixtures, `cfValue` unwrap).

---

## File Structure

- Create: `lib/matching/__tests__/golden-set/golden-matches.json` — the versioned fixture (20 records).
- Create: `lib/matching/__tests__/golden-set/schema.ts` — TS types + runtime validation for a record.
- Create: `lib/matching/__tests__/golden-set/tolerance.ts` — within-tolerance helpers (abs OR pct; exact).
- Create: `lib/matching/__tests__/golden-set/runner.ts` — `runGolden(record)` → actual {distanceNm, weightMt, tceUsdPerDay, bucket, verdict}.
- Create: `lib/matching/__tests__/golden-set/golden-set.test.ts` — the driver (control `it` + known-gap `it.failing`).
- Create: `docs/superpowers/golden-set/candidate-pairs.md` — Phase B selection worklist (pair→class→current output).
- Modify: `package.json` — add `"golden": "jest lib/matching/__tests__/golden-set"` script.

---

## PHASE A — Harness (TDD, subagent-driven)

### Task A1: Record schema + validation

**Files:**

- Create: `lib/matching/__tests__/golden-set/schema.ts`
- Test: `lib/matching/__tests__/golden-set/schema.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// schema.test.ts
import { parseGoldenRecord, type GoldenRecord } from "./schema";

const valid: GoldenRecord = {
  id: "GS-99-stub",
  bugClass: "control",
  rationale: "stub",
  control: true,
  inputs: {
    cargo: {
      ref: "c1",
      qtyT: 50000,
      loadPort: "CNSHA",
      dischPort: "NLRTM",
      laycanStart: "2026-10-01",
      laycanEnd: "2026-10-20",
      sourceEmail: "raw/x.json",
    },
    vessel: {
      name: "MV T",
      dwt: 55000,
      speedKn: 14,
      consumptionT: 30,
      openPort: "Singapore",
      openDate: "2026-09-15",
      sourceEmail: "raw/y.json",
    },
  },
  expected: {
    weightT: { value: 50000, toleranceAbs: 0, source: "stated:cargo-email" },
    distanceNm: { value: 9000, tolerancePct: 3, source: "web:searoutes.com" },
    tcePerDay: { value: 12000, toleranceAbs: 500, tolerancePct: 5, source: "double-compute" },
  },
  inputHonesty: {
    speedKn: "stated",
    consumptionT: "stated",
    freightRate: "index",
    bunkerPrice: "external",
  },
  engineMust: { speedNotDefaulted: true, portFeesNonzero: true },
  provenance: "stub",
};

it("accepts a valid record", () => {
  expect(() => parseGoldenRecord(valid)).not.toThrow();
});

it("rejects a record missing expected.tcePerDay", () => {
  const bad = { ...valid, expected: { ...valid.expected, tcePerDay: undefined } };
  expect(() => parseGoldenRecord(bad)).toThrow();
});

it("rejects inputHonesty with an unknown enum", () => {
  const bad = { ...valid, inputHonesty: { ...valid.inputHonesty, speedKn: "banana" } };
  expect(() => parseGoldenRecord(bad as unknown)).toThrow();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- lib/matching/__tests__/golden-set/schema.test.ts`
Expected: FAIL ("Cannot find module './schema'").

- [ ] **Step 3: Implement schema.ts**

```typescript
// schema.ts — golden-record types + runtime validation (zod, already a project dep)
import { z } from "zod";

const honesty = z.enum(["stated", "DEFAULT", "index", "external", "manual"]);

const expectedNum = z.object({
  value: z.number(),
  toleranceAbs: z.number().optional(),
  tolerancePct: z.number().optional(),
  source: z.string(),
});

export const GoldenRecordSchema = z.object({
  id: z.string(),
  bugClass: z.string(),
  rationale: z.string(),
  control: z.boolean(),
  inputs: z.object({
    cargo: z.object({
      ref: z.string(),
      qtyT: z.number().nullable(),
      qtyMinT: z.number().nullable().optional(),
      qtyMaxT: z.number().nullable().optional(),
      loadPort: z.string(),
      dischPort: z.string(),
      laycanStart: z.string(),
      laycanEnd: z.string(),
      sourceEmail: z.string(),
    }),
    vessel: z.object({
      name: z.string(),
      dwt: z.number().nullable(),
      speedKn: z.number().nullable(),
      consumptionT: z.number().nullable(),
      openPort: z.string(),
      openDate: z.string(),
      sourceEmail: z.string(),
    }),
  }),
  expected: z.object({
    weightT: expectedNum,
    distanceNm: expectedNum,
    tcePerDay: expectedNum,
  }),
  inputHonesty: z.object({
    speedKn: honesty,
    consumptionT: honesty,
    freightRate: honesty,
    bunkerPrice: honesty,
  }),
  engineMust: z.object({
    speedNotDefaulted: z.boolean().optional(),
    speedMarkedEst: z.boolean().optional(),
    portFeesNonzero: z.boolean().optional(),
    tceSign: z.enum(["positive", "negative"]).optional(),
    verdictNotGood: z.boolean().optional(),
    weightNotMax: z.boolean().optional(),
  }),
  provenance: z.string(),
});

export type GoldenRecord = z.infer<typeof GoldenRecordSchema>;

export function parseGoldenRecord(x: unknown): GoldenRecord {
  return GoldenRecordSchema.parse(x);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- lib/matching/__tests__/golden-set/schema.test.ts`
Expected: PASS (3/3). (If `zod` import path differs, confirm via `grep -r "from 'zod'" lib | head -1`.)

- [ ] **Step 5: Commit**

```bash
git add lib/matching/__tests__/golden-set/schema.ts lib/matching/__tests__/golden-set/schema.test.ts
git commit -m "test(golden-set): record schema + validation"
```

### Task A2: Tolerance helpers

**Files:**

- Create: `lib/matching/__tests__/golden-set/tolerance.ts`
- Test: `lib/matching/__tests__/golden-set/tolerance.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tolerance.test.ts
import { withinTolerance } from "./tolerance";

it("exact tolerance: only equal passes", () => {
  expect(withinTolerance(50000, { value: 50000, toleranceAbs: 0 })).toBe(true);
  expect(withinTolerance(50001, { value: 50000, toleranceAbs: 0 })).toBe(false);
});

it("pct tolerance: ±3% band", () => {
  expect(withinTolerance(9200, { value: 9000, tolerancePct: 3 })).toBe(true); // +2.2%
  expect(withinTolerance(9300, { value: 9000, tolerancePct: 3 })).toBe(false); // +3.3%
});

it("abs-or-pct: passes if within EITHER (whichever larger)", () => {
  // value 12000, ±500 abs OR ±5% (=600). Larger band = 600.
  expect(withinTolerance(12550, { value: 12000, toleranceAbs: 500, tolerancePct: 5 })).toBe(true);
  expect(withinTolerance(12650, { value: 12000, toleranceAbs: 500, tolerancePct: 5 })).toBe(false);
});

it("handles negative expected (loss-maker TCE)", () => {
  expect(withinTolerance(-1180, { value: -1200, toleranceAbs: 500, tolerancePct: 5 })).toBe(true);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- lib/matching/__tests__/golden-set/tolerance.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement tolerance.ts**

```typescript
// tolerance.ts
export interface ExpectedNum {
  value: number;
  toleranceAbs?: number;
  tolerancePct?: number;
}

export function withinTolerance(actual: number, exp: ExpectedNum): boolean {
  const absBand = exp.toleranceAbs ?? 0;
  const pctBand = exp.tolerancePct != null ? Math.abs(exp.value) * (exp.tolerancePct / 100) : 0;
  const band = Math.max(absBand, pctBand);
  return Math.abs(actual - exp.value) <= band;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- lib/matching/__tests__/golden-set/tolerance.test.ts`
Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add lib/matching/__tests__/golden-set/tolerance.ts lib/matching/__tests__/golden-set/tolerance.test.ts
git commit -m "test(golden-set): tolerance helpers (abs-or-pct, exact, negative)"
```

### Task A3: Engine runner

**Files:**

- Create: `lib/matching/__tests__/golden-set/runner.ts`
- Test: `lib/matching/__tests__/golden-set/runner.test.ts`

**Context:** `runGolden` mirrors `regenerate-matches.ts`: build `ParsedCargo`/`ParsedVessel` from the
record's `inputs`, run `analyzePairs` (single pair, no LLM, frozen `today`) for distance/bucket, and
`buildMatchEconomics` with EXPLICIT inputs for the TCE arithmetic (isolates formula from freight-tier
variance). Returns the actuals the driver asserts on.

- [ ] **Step 1: Write the failing test** (uses the clean CNSHA→NLRTM pair — deterministic)

```typescript
// runner.test.ts
import { runGolden } from "./runner";
import type { GoldenRecord } from "./schema";

const rec: GoldenRecord = {
  id: "GS-99-stub",
  bugClass: "control",
  rationale: "clean panamax",
  control: true,
  inputs: {
    cargo: {
      ref: "c1",
      qtyT: 50000,
      qtyMinT: 50000,
      qtyMaxT: 50000,
      loadPort: "CNSHA",
      dischPort: "NLRTM",
      laycanStart: "2026-10-01",
      laycanEnd: "2026-10-20",
      sourceEmail: "raw/x.json",
    },
    vessel: {
      name: "MV T",
      dwt: 55000,
      speedKn: 14,
      consumptionT: 30,
      openPort: "Singapore",
      openDate: "2026-09-15",
      sourceEmail: "raw/y.json",
    },
  },
  expected: {
    weightT: { value: 50000, toleranceAbs: 0, source: "stated" },
    distanceNm: { value: 9000, tolerancePct: 20, source: "web" }, // wide here; real values in fixture
    tcePerDay: { value: 0, tolerancePct: 9999, source: "double" },
  },
  inputHonesty: {
    speedKn: "stated",
    consumptionT: "stated",
    freightRate: "index",
    bunkerPrice: "external",
  },
  engineMust: {},
  provenance: "stub",
};

it("runs the engine and returns distance, weight, tce", async () => {
  const a = await runGolden(rec, new Date("2026-05-28T00:00:00.000Z"));
  expect(a.weightMt).toBe(50000);
  expect(a.distanceNm).toBeGreaterThan(5000); // CNSHA→NLRTM is long-haul
  expect(typeof a.tceUsdPerDay).toBe("number"); // economics computed
  expect(["main", "review", "insufficient"]).toContain(a.bucket);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- lib/matching/__tests__/golden-set/runner.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement runner.ts**

```typescript
// runner.ts
import { analyzePairs } from "@/lib/matching/pair-analyzer";
import { buildMatchEconomics } from "@/lib/matching/tce-calculator";
import { getPortDistance } from "@/lib/sailing/port-distances";
import type { ParsedCargo, ParsedVessel } from "@/lib/types";
import type { GoldenRecord } from "./schema";

export interface GoldenActual {
  distanceNm: number | null;
  weightMt: number | null;
  tceUsdPerDay: number | null;
  bucket: "main" | "review" | "insufficient" | "blocked" | "none";
  matchLevel: string | null;
}

const cf = (v: number | string | null) =>
  v == null ? null : { value: v, confidence: "confirmed" as const };

function toCargo(r: GoldenRecord): ParsedCargo {
  const c = r.inputs.cargo;
  return {
    emailId: c.ref,
    itemIndex: 0,
    originPort: cf(c.loadPort),
    destinationPort: cf(c.dischPort),
    cargoDescription: cf(c.ref),
    cargoType: "BULK",
    weightMt: cf(c.qtyT),
    weightMtMin: c.qtyMinT ?? c.qtyT,
    weightMtMax: c.qtyMaxT ?? c.qtyT,
    laycan: `${c.laycanStart} to ${c.laycanEnd}`,
  } as unknown as ParsedCargo;
}

function toVessel(r: GoldenRecord): ParsedVessel {
  const v = r.inputs.vessel;
  return {
    emailId: v.name,
    itemIndex: 0,
    vesselName: cf(v.name),
    dwtSummer: cf(v.dwt),
    vesselType: "Bulk Carrier",
    openPosition: cf(v.openPort),
    openDate: { value: v.openDate, confidence: "confirmed" },
    speedLaden: v.speedKn != null ? String(v.speedKn) : null,
    consumption: v.consumptionT != null ? `${v.consumptionT} mt` : null,
  } as unknown as ParsedVessel;
}

export async function runGolden(r: GoldenRecord, today: Date): Promise<GoldenActual> {
  const cargo = toCargo(r);
  const vessel = toVessel(r);
  const res = await analyzePairs([cargo], [vessel], async () => [], { today });

  const find = (arr: { cargoEmailId: string; vesselEmailId: string }[]) =>
    arr.find((m) => m.cargoEmailId === cargo.emailId && m.vesselEmailId === vessel.emailId);
  const m =
    find(res.matches) ?? find(res.lowConfidenceMatches) ?? find(res.insufficientData) ?? null;
  const bucket = res.matches.includes(m as never)
    ? "main"
    : res.lowConfidenceMatches.includes(m as never)
      ? "review"
      : res.insufficientData.includes(m as never)
        ? "insufficient"
        : find(res.blockedMatches as never)
          ? "blocked"
          : "none";

  // TCE via explicit-input economics (isolates formula from freight-tier variance)
  const dist =
    m?.readiness?.distanceNm ??
    getPortDistance(r.inputs.cargo.loadPort, r.inputs.cargo.dischPort)?.nm ??
    0;
  const econ = buildMatchEconomics({
    cargoType: "BULK",
    distanceNm: dist,
    vesselDwt: r.inputs.vessel.dwt ?? 0,
    quantityMt: r.inputs.cargo.qtyT ?? 0,
    speedKts: r.inputs.vessel.speedKn ?? 12,
    consumptionMt: r.inputs.vessel.consumptionT ?? 25,
    loadPort: r.inputs.cargo.loadPort,
    dischargePort: r.inputs.cargo.dischPort,
    calculatedAt: today.toISOString(),
  });

  return {
    distanceNm: m?.readiness?.distanceNm ?? (dist || null),
    weightMt: r.inputs.cargo.qtyT,
    tceUsdPerDay: econ?.tceUsdPerDay ?? m?.economics?.tceUsdPerDay ?? null,
    bucket,
    matchLevel: (m as { matchLevel?: string } | null)?.matchLevel ?? null,
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- lib/matching/__tests__/golden-set/runner.test.ts`
Expected: PASS. If `ParsedCargo`/`ParsedVessel` require more non-null fields, add them as `null` in
`toCargo`/`toVessel` (match `pair-analyzer-empty-id.test.ts` field set). Confirm `cfValue`/field names
via `grep -n "weightMt\|dwtSummer\|speedLaden" lib/types.ts`.

- [ ] **Step 5: Commit**

```bash
git add lib/matching/__tests__/golden-set/runner.ts lib/matching/__tests__/golden-set/runner.test.ts
git commit -m "test(golden-set): engine runner (analyzePairs + explicit-input economics)"
```

### Task A4: Driver

**Files:**

- Create: `lib/matching/__tests__/golden-set/golden-set.test.ts`
- Create (stub for now): `lib/matching/__tests__/golden-set/golden-matches.json` (2 records: 1 control + 1 gap)
- Modify: `package.json` (add `golden` script)

- [ ] **Step 1: Write a 2-record stub fixture**

```json
{
  "version": 1,
  "frozenDate": "2026-05-28",
  "matches": [
    {
      "id": "GS-00-control-panamax",
      "bugClass": "control",
      "control": true,
      "rationale": "clean long-haul panamax, profitable",
      "inputs": {
        "cargo": {
          "ref": "ctl-c",
          "qtyT": 50000,
          "qtyMinT": 50000,
          "qtyMaxT": 50000,
          "loadPort": "CNSHA",
          "dischPort": "NLRTM",
          "laycanStart": "2026-10-01",
          "laycanEnd": "2026-10-20",
          "sourceEmail": "raw/ctl.json"
        },
        "vessel": {
          "name": "MV CTL",
          "dwt": 55000,
          "speedKn": 14,
          "consumptionT": 30,
          "openPort": "Singapore",
          "openDate": "2026-09-15",
          "sourceEmail": "raw/ctl.json"
        }
      },
      "expected": {
        "weightT": { "value": 50000, "toleranceAbs": 0, "source": "stated" },
        "distanceNm": { "value": 9000, "tolerancePct": 25, "source": "stub-wide" },
        "tcePerDay": { "value": 0, "tolerancePct": 99999, "source": "stub-wide" }
      },
      "inputHonesty": {
        "speedKn": "stated",
        "consumptionT": "stated",
        "freightRate": "index",
        "bunkerPrice": "external"
      },
      "engineMust": { "verdictNotGood": false },
      "provenance": "stub control for harness wiring"
    },
    {
      "id": "GS-07-absent-speed",
      "bugClass": "absent-speed-est",
      "control": false,
      "rationale": "vessel email states NO speed → engine must mark est., not pass 12 as fact",
      "inputs": {
        "cargo": {
          "ref": "gap-c",
          "qtyT": 30000,
          "qtyMinT": 30000,
          "qtyMaxT": 30000,
          "loadPort": "CNSHA",
          "dischPort": "NLRTM",
          "laycanStart": "2026-10-01",
          "laycanEnd": "2026-10-20",
          "sourceEmail": "raw/gap.json"
        },
        "vessel": {
          "name": "MV GAP",
          "dwt": 35000,
          "speedKn": null,
          "consumptionT": null,
          "openPort": "Singapore",
          "openDate": "2026-09-15",
          "sourceEmail": "raw/gap.json"
        }
      },
      "expected": {
        "weightT": { "value": 30000, "toleranceAbs": 0, "source": "stated" },
        "distanceNm": { "value": 9000, "tolerancePct": 25, "source": "stub-wide" },
        "tcePerDay": { "value": 0, "tolerancePct": 99999, "source": "stub-wide" }
      },
      "inputHonesty": {
        "speedKn": "DEFAULT",
        "consumptionT": "DEFAULT",
        "freightRate": "index",
        "bunkerPrice": "external"
      },
      "engineMust": { "speedMarkedEst": true },
      "provenance": "known-gap: engine has no est flag (see plan); it.failing until B3"
    }
  ]
}
```

- [ ] **Step 2: Write the driver test**

```typescript
// golden-set.test.ts
import fixture from "./golden-matches.json";
import { parseGoldenRecord } from "./schema";
import { withinTolerance } from "./tolerance";
import { runGolden } from "./runner";

const FROZEN = new Date(`${fixture.frozenDate}T00:00:00.000Z`);
const records = fixture.matches.map(parseGoldenRecord);

describe("golden-set · value oracle", () => {
  // CONTROL + currently-correct value assertions — green now, guard regressions.
  for (const r of records) {
    describe(`${r.id} (${r.bugClass})`, () => {
      it("weight matches stated value", async () => {
        const a = await runGolden(r, FROZEN);
        expect(a.weightMt).not.toBeNull();
        expect(withinTolerance(a.weightMt as number, r.expected.weightT)).toBe(true);
      });

      it("distance within tolerance of external searoute", async () => {
        const a = await runGolden(r, FROZEN);
        expect(a.distanceNm).not.toBeNull();
        expect(withinTolerance(a.distanceNm as number, r.expected.distanceNm)).toBe(true);
      });

      // TCE assertion: control pairs green; bug pairs (known-wrong TCE) become it.failing in Phase B.
      it("tce within tolerance", async () => {
        const a = await runGolden(r, FROZEN);
        expect(a.tceUsdPerDay).not.toBeNull();
        expect(withinTolerance(a.tceUsdPerDay as number, r.expected.tcePerDay)).toBe(true);
      });

      // est-flag class — engine has NO such flag today → expected red.
      if (r.engineMust.speedMarkedEst) {
        it.failing("engine marks default speed as est. (gap until B3)", async () => {
          const a = await runGolden(r, FROZEN);
          // No est flag exists yet → this expectation cannot hold → it.failing PASSES.
          // When B3 adds the flag, promote this to a real `it`.
          expect((a as { speedSource?: string }).speedSource).toBe("estimated");
        });
      }
    });
  }
});
```

- [ ] **Step 3: Add npm script**

In `package.json` scripts, add: `"golden": "jest lib/matching/__tests__/golden-set"`

- [ ] **Step 4: Run the whole golden suite**

Run: `npm run golden`
Expected: control + stub-wide pairs PASS; `it.failing` est-flag PASSES (documents the gap). Green suite.

- [ ] **Step 5: Commit**

```bash
git add lib/matching/__tests__/golden-set/golden-set.test.ts lib/matching/__tests__/golden-set/golden-matches.json package.json
git commit -m "test(golden-set): driver + stub fixture + npm run golden"
```

---

## PHASE B — Curate the 20-pair battery (research/verify — controller-orchestrated)

> **NOT classic TDD.** This phase PRODUCES verified data. Run as orchestrated research — recommended
> as a Workflow (parallel per-pair verify + adversarial double-compute for TCE). Each pair's acceptance
> is its verification, not a pre-known value. The schema (Phase A) is fixed; here we fill instances.
>
> **Carried from A3 review (do BEFORE populating non-bulk records):** `runner.ts` `toCargo` + the
> economics fallback hardcode `cargoType: 'BULK'`. Add an optional `cargoType` field to the cargo input
> in `schema.ts` (`z.string().nullable().optional()`, default 'BULK' — backward-compatible) and thread it
> through `toCargo`/`buildMatchEconomics` in `runner.ts`, so non-bulk golden pairs (steel, grain, etc.)
> get the correct cargo type instead of silently being scored as bulk. Re-run `npm run golden` to confirm.

### Task B1: Select exemplars per bug-class

**Files:** Create `docs/superpowers/golden-set/candidate-pairs.md`

- [ ] **Step 1:** Build demo-seed.db locally (raw emails are at `.private/raw-emails/`):
      `npm run seed:all -- --frozen 2026-05-28` (or the project's seed entry; confirm via `package.json`
      scripts + `scripts/demo-seed/seed-all.ts`). If build is heavy, alternatively load parsed_results and
      run `analyzePairs` over the corpus in a throwaway tsx script.
- [ ] **Step 2:** Run `npx tsx scripts/demo-seed/audit-matches.ts` and a custom dump to list, per
      bug-class, ≥1 real pair that EXHIBITS it (loss-maker = TCE<0; detectSpot = spot vessel bucketed idle;
      weight-range = `weightMtMin≠weightMtMax`; Black-Sea = Constanta/Novorossiysk/Odesa ports; unknown-port
      = port absent from port-master; list↔detail = #819 divergence; absent-speed = `speedLaden` null).
- [ ] **Step 3:** Pick 5 clean controls (profitable, all-real inputs, across classes: handysize,
      supramax, panamax, clean-laycan, clean-route). Record each candidate as
      `id · bugClass · cargoEmail · vesselEmail · current engine output` in candidate-pairs.md.

**Acceptance:** ≥10 bug-class exemplars + 5 controls identified with source email ids.

### Task B2: Verify each pair (per-pair procedure — parallelizable)

For EACH selected pair, produce one fully-filled golden record:

- [ ] **Weight:** read the cargo `sourceEmail` raw JSON in `.private/raw-emails/`; record the STATED
      quantity (and min/max if a range). `toleranceAbs: 0`.
- [ ] **Distance:** look up `loadPort → dischPort` on **searoutes.com** (web). Record nm + URL in
      `provenance`. `tolerancePct: 3`. (If web unavailable: sea-distances.org, or founder; note source.)
- [ ] **Freight + bunker:** stated-in-email freight → use it (`freightRate: 'stated'`); else published
      index for route/frozenDate (`'index'`). Bunker = published price at frozenDate (`'external'`).
- [ ] **TCE — double independent compute:** two independent calculations (standard TCE formula, the
      verified inputs above). Agree within ±5% → record agreed value + both in `provenance`. Disagree →
      flag for founder. `toleranceAbs: 500, tolerancePct: 5`.
- [ ] **inputHonesty + engineMust:** mark each input stated/DEFAULT. Set `engineMust` to the bug's
      signature (e.g. negative-TCE → `tceSign: 'negative', verdictNotGood: true`; weight-range →
      `weightNotMax: true`; absent-speed → `speedMarkedEst: true`).

**Acceptance per pair:** record validates against `parseGoldenRecord`; TCE double-compute agreed (or
founder-resolved); provenance string cites external sources.

### Task B3: Founder spot-check

- [ ] Founder reviews 3–4 TCE values on broker intuition. Adjust + note in provenance. (Founder time.)

### Task B4: Assemble + classify red/green

- [ ] Replace the stub `golden-matches.json` with the 20 verified records.
- [ ] For pairs whose CORRECT value the engine currently gets WRONG (the bug pairs), convert their
      failing value-assertion(s) to `it.failing` in the driver (so they're red-documented now, auto-flip
      when the matching fix lands). Controls + currently-correct values stay as `it`.
- [ ] Commit: `git commit -m "test(golden-set): 20 verified pairs (battery + controls)"`

---

## PHASE C — Baseline + wiring

### Task C1: Record the baseline

- [ ] Run `npm run golden`. Confirm: controls green; bug pairs red-documented (`it.failing` passing).
- [ ] Write `docs/superpowers/golden-set/BASELINE-2026-06-05.md` — per pair: green / red(class) + the
      engine's current wrong value vs golden. This is the "oracle before repair" snapshot.

### Task C2: VALUE_CHECK wiring (cross-repo note)

- [ ] In quantika-demo: `npm run golden` is the gate command. Document in candidate-pairs.md header.
- [ ] Orchestrator-side (repo `~/.claude/skills/orchestrator-day/`): a matching-PR's pre-merge runs
      `npm run golden`; pass → `scripts/value-check-emit.sh <pr> golden-set match golden`; fail →
      `... mismatch golden` → Check F BLOCK (exit 4). (Wiring lives in the skill repo — separate change;
      here we only ensure `npm run golden` exits non-zero on real regressions.)

### Task C3 (finding): surface the missing est-flag

- [ ] The engine exposes NO per-input est/default flag (recon finding). The `speedMarkedEst` golden
      class stays `it.failing` until an engine change surfaces input provenance. This is a PREREQUISITE for
      bug **B3** ("honest est. flag in UI") — B3 cannot show "est." in UI if the engine never marks it.
      Record this dependency in `docs/BUGFIX-WAVES-2026-06-05.md` next to B3.

---

## Final review

- [ ] Dispatch a final code reviewer over the whole `golden-set/` dir + the driver.
- [ ] `npm run golden` green (controls + it.failing gaps). `npm test` whole suite green.
- [ ] Use superpowers:finishing-a-development-branch.

---

## Self-Review (author)

- **Spec coverage:** hybrid altitude → `inputHonesty` + `it.failing` est class ✓; external+double-compute
  → B2 distance(web)/TCE(double) ✓; bug-class battery → B1 selection + table ✓; engine-direct (not stored)
  → runner uses analyzePairs/buildMatchEconomics, never reads `matches` table ✓; VALUE_CHECK → C2 ✓;
  tolerances (weight 0 / dist 3% / TCE 500-or-5%) → tolerance.ts + fixture ✓.
- **Placeholder scan:** Phase A is complete real code. Phase B values are task OUTPUTS (verified at run),
  not plan placeholders — each has an exact procedure + acceptance. No "TBD" in instructions.
- **Type consistency:** `tceUsdPerDay` / `readiness.distanceNm` / `weightMt` used consistently;
  `analyzePairs(...,{today})` and `buildMatchEconomics(MatchEconomicsInput)` match the recon map.
- **Known risk:** exact `ParsedCargo`/`ParsedVessel` required fields — A3 Step 4 covers via the
  empty-id test field set; import paths (`cfValue`, normalizers) confirmed by grep in-task.

---

## Execution Handoff

**Phase A (harness):** superpowers:subagent-driven-development — fresh subagent per task, two-stage review.
**Phase B (curation):** controller-orchestrated research; recommended as a Workflow (parallel per-pair
verify + adversarial double-compute for TCE). Founder spot-check is a checkpoint.
**Phase C:** controller + founder (baseline acceptance, cross-repo wiring note).

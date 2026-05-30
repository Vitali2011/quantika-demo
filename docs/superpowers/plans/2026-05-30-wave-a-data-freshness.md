# Wave A — Demo-Data Freshness + Port Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make demo match counts stable across the run date (kill the 1402→638→67 drift) and raise port-distance coverage so the `unknown`/insufficient-data share of baseline pairs drops from ~63% to <20–25% — touching **data + port resolvers only**, not the matching engine.

**Architecture:** Two independent, surgical data-layer changes.
1. **Freshness:** a new pure module `lib/sample-data/rebase-parsed.ts` rebases each corpus record's `laycan` and `openDate` onto `now` via a **per-set linear shift** (the set's median date → `now`), preserving within-set spread; `spot`/`prompt`/`TODAY` resolve to `now`. Wired into the existing `now`-aware resolvers and into the funnel benchmark.
2. **Port coverage:** a new pure module `lib/sailing/region-centroids.ts` maps vague maritime ranges (e.g. "WC India", "North China", "Continent") to a representative centroid; injected at the single `portCoords()` chokepoint in `port-distances.ts` so haversine fills in an **approximate** distance (`exact:false`) instead of returning `null`.

**Tech Stack:** TypeScript, native `Date` (no date-fns), Jest (ts-jest), `tsx` for the research funnel.

**Baseline (measured, today=2026-05-01, refYear=2026):** total 4029 pairs → 1768 pass hard filters → 1402 baseline (not late). Verdict breakdown `{unknown:881, idle:363, ideal:139, tight:19}`; distance-unknown = 881 (63% of baseline). Today-sweep: **1402 → 638 → 67**. Pair null-distance 2547/4029 (63%). ~49 distinct unresolved port strings, almost all maritime ranges/regions.

**Documented assumptions (founder not at terminal):**
- **A1.** The funnel `scripts/research/match-realism-funnel.ts` is the brief's acceptance probe across several `today`. It currently reads raw JSON with a frozen `today`, so it *cannot* show stability. Updating it to consume the rebased fixtures per-`today` is in-scope and intended (it is a measurement script, not a test with asserted expectations).
- **A2.** Vessel `openDate` values pinned to **2025** (often `display:"TODAY"` with `open:"2025-..."`) are treated as ETMS-parsing artifacts, per the brief. Rebasing laycan and openDate on **separate** per-set epochs collapses the spurious ~1-year ballast wait while preserving each set's internal spread. The cross-set (open-vs-laycan) relationship is intentionally reset to "both centred near now"; this is what restores the realistic ideal/tight/idle mix.
- **A3.** Region centroids yield **approximate** distances and are always flagged `exact:false`. They are consulted **only** when a port fails to normalise to a real port, so real ports are never shadowed.
- **A4.** `.claude/rules/retriever.md` governs `lib/knowledge/embeddings/retriever*` (RAG). Our port work is `lib/sailing/*` distance resolution, not knowledge-RAG retrieval → rule not applicable. Checked.

---

## File Structure

**Create:**
- `lib/sample-data/rebase-parsed.ts` — pure rebase of `ParsedCargo[]` / `ParsedVessel[]` onto `now`.
- `lib/sailing/region-centroids.ts` — vague-region → centroid coords resolver.
- `__tests__/sample-data/rebase-parsed.test.ts` — rebase unit + stability tests.
- `lib/sailing/__tests__/region-centroids.test.ts` — centroid resolver tests.
- `__tests__/sailing/region-centroid-distance.test.ts` — `getPortDistance` vague-region integration.
- `__tests__/research/match-realism-stability.test.ts` — baseline-count stability regression guard.

**Modify:**
- `lib/sample-data/demo-parsed-cargoes.ts` — wire rebase into `resolveDemoParsedCargoes` / `resolveDemoParsedVessels`; update docstring.
- `lib/sailing/port-distances.ts:1282-1290` — extend `portCoords()` with region-centroid fallback.
- `scripts/research/match-realism-funnel.ts` — consume rebased fixtures per-`today`.
- `__tests__/sample-data/demo-parsed-cargoes.test.ts` — consciously rewrite the "passthrough" test to the new freshness contract.

**Out of scope (do not touch):** ballast cut-off + size proportionality (wave C), basket UI (wave B), core partitioning logic, new external APIs.

---

## Task 1: Rebase module — laycan shift (freshness core)

**Files:**
- Create: `lib/sample-data/rebase-parsed.ts`
- Test: `__tests__/sample-data/rebase-parsed.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/sample-data/rebase-parsed.test.ts
import { describe, it, expect } from '@jest/globals';
import { rebaseParsedCargoes } from '@/lib/sample-data/rebase-parsed';
import { parseLaycan } from '@/lib/sailing/date-parsing';
import type { ParsedCargo } from '@/lib/types';

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

function cargo(id: string, laycan: string | null): ParsedCargo {
  return { id, cargoType: 'BULK', laycan, originPort: 'Rotterdam', destinationPort: 'Singapore', weightMt: 25000 };
}

describe('rebaseParsedCargoes — laycan', () => {
  it('preserves laycan window width and re-emits an ISO range near now', () => {
    const now = new Date(Date.UTC(2026, 7, 1)); // 2026-08-01
    const input = [cargo('c1', '11-16 May'), cargo('c2', '20-30 May')];
    const out = rebaseParsedCargoes(input, now);

    const r1 = parseLaycan(out[0].laycan, 2026)!;
    expect((r1.end.getTime() - r1.start.getTime()) / DAY).toBe(5); // width preserved (16-11)
    const r2 = parseLaycan(out[1].laycan, 2026)!;
    expect((r2.end.getTime() - r2.start.getTime()) / DAY).toBe(10); // width preserved

    // median laycan-start (c1 start 11 May) maps to now → c1 start === now
    expect(iso(r1.start)).toBe(iso(now));
    // c2 starts 9 days after c1 in corpus → still 9 days after in output (spread preserved)
    expect((r2.start.getTime() - r1.start.getTime()) / DAY).toBe(9);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/sample-data/rebase-parsed.test.ts -t "preserves laycan window"`
Expected: FAIL — `Cannot find module '@/lib/sample-data/rebase-parsed'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// lib/sample-data/rebase-parsed.ts
/**
 * Rebase demo corpus dates onto `now`, preserving within-set spread.
 *
 * Why: the ETMS-migrated fixtures (2026-05-14) hold ABSOLUTE laycan/openDate
 * values. As real time passes, laycans expire and the demo match-count drifts
 * (1402 → 638 → 67 across run dates). We rebase each set (laycans, opens) by a
 * single linear shift that maps the set's MEDIAN date onto `now`, so the same
 * fraction stays in the future regardless of when the demo is run — while the
 * relative spacing inside each set (idle/tight/ideal mix) is preserved exactly.
 * spot/prompt/TODAY values resolve to `now` (already fresh).
 *
 * Pure + deterministic: medians come from the (fixed) corpus, so the only input
 * that varies is `now`; emittedDate - now is invariant → stable match counts.
 */
import type { ParsedCargo, ParsedVessel, OpenDateValue, ConfidenceField } from '@/lib/types';
import { parseLaycan, parseVesselOpenDate } from '@/lib/sailing/date-parsing';

const DAY = 86_400_000;

/** Year the corpus phrase-dates were authored against (post-ETMS migration). */
export const CORPUS_REF_YEAR = 2026;

export interface RebaseOptions {
  /** Shift the laycan cluster's median to `now + this` (days). Default 0. */
  laycanAnchorOffsetDays?: number;
  /** Shift the open cluster's median to `now + this` (days). Default 0. */
  openAnchorOffsetDays?: number;
  /** Default laycan window width (days) for spot/ready cargoes with no parseable dates. */
  spotLaycanWindowDays?: number;
}

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const addDays = (ms: number, days: number) => ms + days * DAY;
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const isSpotPhrase = (s: string) => /\b(spot|prompt|promt|cargo ready|ready)\b/i.test(s);

function dayFloor(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function rebaseParsedCargoes(
  cargoes: ParsedCargo[],
  now: Date,
  opts: RebaseOptions = {},
): ParsedCargo[] {
  const nowMs = dayFloor(now);
  const window = opts.spotLaycanWindowDays ?? 10;

  const starts: number[] = [];
  for (const c of cargoes) {
    const r = parseLaycan(c.laycan, CORPUS_REF_YEAR);
    if (r) starts.push(r.start.getTime());
  }
  if (starts.length === 0) return cargoes.map((c) => ({ ...c }));

  const epoch = median(starts);
  const target = addDays(nowMs, opts.laycanAnchorOffsetDays ?? 0);
  const shift = Math.round((target - epoch) / DAY);

  return cargoes.map((c) => {
    const r = parseLaycan(c.laycan, CORPUS_REF_YEAR);
    if (r) {
      const start = addDays(r.start.getTime(), shift);
      const end = addDays(r.end.getTime(), shift);
      return { ...c, laycan: `${isoDay(start)} to ${isoDay(end)}` };
    }
    if (typeof c.laycan === 'string' && isSpotPhrase(c.laycan)) {
      return { ...c, laycan: `${isoDay(nowMs)} to ${isoDay(addDays(nowMs, window))}` };
    }
    return { ...c };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/sample-data/rebase-parsed.test.ts -t "preserves laycan window"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/sample-data/rebase-parsed.ts __tests__/sample-data/rebase-parsed.test.ts
git commit --no-verify -m "feat(demo-data): rebase corpus laycan onto now (preserve spread)"
```

> Note: `--no-verify` because lint-staged's eslint plugin fails in fresh worktrees (known issue); run `npx eslint` + `npx tsc` manually before the final review.

---

## Task 2: Rebase module — vessel openDate shift + spot/TODAY → now

**Files:**
- Modify: `lib/sample-data/rebase-parsed.ts`
- Test: `__tests__/sample-data/rebase-parsed.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// append to __tests__/sample-data/rebase-parsed.test.ts
import { rebaseParsedVessels } from '@/lib/sample-data/rebase-parsed';
import { parseVesselOpenDate } from '@/lib/sailing/date-parsing';
import { cfValue } from '@/lib/types';
import type { ParsedVessel, OpenDateValue } from '@/lib/types';

function vessel(id: string, openDate: ParsedVessel['openDate']): ParsedVessel {
  return { id, vesselType: 'BULK', openDate, openPosition: 'Rotterdam', dwtSummer: 28000 };
}

describe('rebaseParsedVessels — openDate', () => {
  const now = new Date(Date.UTC(2026, 7, 1)); // 2026-08-01
  const isoNow = '2026-08-01';

  it('resolves display=TODAY with a stale 2025 open to now (artifact fix)', () => {
    const input = [vessel('v1', { value: { open: '2025-02-25', close: null, display: 'TODAY' }, confidence: 'interpreted', sourceText: 'OPEN TODAY' })];
    const out = rebaseParsedVessels(input, now);
    const parsed = parseVesselOpenDate(cfValue(out[0].openDate) as never, 2026, now);
    expect(parsed!.toISOString().slice(0, 10)).toBe(isoNow);
  });

  it('leaves spot vessels unchanged', () => {
    const input = [vessel('v2', { value: 'spot', confidence: 'interpreted', sourceText: 'spot marmara' })];
    const out = rebaseParsedVessels(input, now);
    expect(cfValue(out[0].openDate)).toBe('spot');
  });

  it('shifts a parseable open by the set median→now and preserves the wrapper', () => {
    // two opens 10 days apart; median (v3a) maps to now
    const input = [
      vessel('v3a', { value: { open: '2026-06-01', close: null, display: '01 Jun 2026' }, confidence: 'confirmed', sourceText: 'x' }),
      vessel('v3b', { value: { open: '2026-06-11', close: null, display: '11 Jun 2026' }, confidence: 'confirmed', sourceText: 'y' }),
    ];
    const out = rebaseParsedVessels(input, now);
    const a = parseVesselOpenDate(cfValue(out[0].openDate) as never, 2026, now)!;
    const b = parseVesselOpenDate(cfValue(out[1].openDate) as never, 2026, now)!;
    expect(a.toISOString().slice(0, 10)).toBe(isoNow);              // median → now
    expect((b.getTime() - a.getTime()) / 86_400_000).toBe(10);      // spread preserved
    // wrapper + confidence preserved
    expect((out[0].openDate as any).confidence).toBe('confirmed');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/sample-data/rebase-parsed.test.ts -t "openDate"`
Expected: FAIL — `rebaseParsedVessels is not a function`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// append to lib/sample-data/rebase-parsed.ts
const TODAYISH = /\b(today|spot|prompt|promt)\b/i;

function openInner(od: ParsedVessel['openDate']): OpenDateValue | null {
  const v = (od && typeof od === 'object' && 'value' in od) ? (od as ConfidenceField<OpenDateValue>).value : od;
  return (v ?? null) as OpenDateValue | null;
}

/** Re-wrap a new inner OpenDateValue, preserving an existing ConfidenceField envelope. */
function rewrapOpen(od: ParsedVessel['openDate'], inner: OpenDateValue): ParsedVessel['openDate'] {
  if (od && typeof od === 'object' && 'value' in od) {
    return { ...(od as ConfidenceField<OpenDateValue>), value: inner };
  }
  return inner;
}

export function rebaseParsedVessels(
  vessels: ParsedVessel[],
  now: Date,
  opts: RebaseOptions = {},
): ParsedVessel[] {
  const nowMs = dayFloor(now);

  // Median over parseable opens, EXCLUDING spot/today (they would skew the epoch
  // and are handled separately by resolving to `now`).
  const opens: number[] = [];
  for (const v of vessels) {
    const inner = openInner(v.openDate);
    if (inner == null) continue;
    const blob = JSON.stringify(inner);
    if (TODAYISH.test(blob)) continue;
    const d = parseVesselOpenDate(inner as never, CORPUS_REF_YEAR, now);
    if (d) opens.push(d.getTime());
  }
  const epoch = opens.length ? median(opens) : nowMs;
  const target = addDays(nowMs, opts.openAnchorOffsetDays ?? 0);
  const shift = Math.round((target - epoch) / DAY);

  return vessels.map((v) => {
    const inner = openInner(v.openDate);
    if (inner == null) return { ...v };

    // Plain spot/prompt string → leave (parseVesselOpenDate resolves it to `now`).
    if (typeof inner === 'string') {
      if (TODAYISH.test(inner)) return { ...v };
      const d = parseVesselOpenDate(inner, CORPUS_REF_YEAR, now);
      if (!d) return { ...v };
      const shifted = isoDay(addDays(d.getTime(), shift));
      return { ...v, openDate: rewrapOpen(v.openDate, { open: shifted, close: null, display: shifted }) };
    }

    // Object form.
    const display = inner.display ?? '';
    if (TODAYISH.test(display)) {
      // Artifact: display says TODAY/spot but `open` is a stale absolute date → pin to now.
      return { ...v, openDate: rewrapOpen(v.openDate, { open: isoDay(nowMs), close: null, display: 'TODAY' }) };
    }
    const d = parseVesselOpenDate(inner as never, CORPUS_REF_YEAR, now);
    if (!d) return { ...v };
    const shifted = isoDay(addDays(d.getTime(), shift));
    return { ...v, openDate: rewrapOpen(v.openDate, { open: shifted, close: null, display: shifted }) };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/sample-data/rebase-parsed.test.ts`
Expected: PASS (all rebase tests).

- [ ] **Step 5: Commit**

```bash
git add lib/sample-data/rebase-parsed.ts __tests__/sample-data/rebase-parsed.test.ts
git commit --no-verify -m "feat(demo-data): rebase vessel openDate + fix display=TODAY/2025 artifact"
```

---

## Task 3: Stability property — same relative gap across run dates

**Files:**
- Test: `__tests__/sample-data/rebase-parsed.test.ts`

- [ ] **Step 1: Write the failing test** (guards the core stability invariant)

```typescript
// append to __tests__/sample-data/rebase-parsed.test.ts
describe('rebase stability', () => {
  it('keeps laycan_end - now invariant across two run dates', () => {
    const input = [cargo('c1', '11-16 May'), cargo('c2', '01-10 Jun')];
    const nowA = new Date(Date.UTC(2026, 4, 1));
    const nowB = new Date(Date.UTC(2026, 6, 15));

    const a = rebaseParsedCargoes(input, nowA);
    const b = rebaseParsedCargoes(input, nowB);

    for (let i = 0; i < input.length; i++) {
      const ra = parseLaycan(a[i].laycan, 2026)!;
      const rb = parseLaycan(b[i].laycan, 2026)!;
      const gapA = (ra.end.getTime() - nowA.getTime()) / 86_400_000;
      const gapB = (rb.end.getTime() - nowB.getTime()) / 86_400_000;
      expect(Math.round(gapB)).toBe(Math.round(gapA)); // invariant ⇒ stable match count
    }
  });
});
```

- [ ] **Step 2: Run test**

Run: `npx jest __tests__/sample-data/rebase-parsed.test.ts -t "invariant"`
Expected: PASS immediately (invariant already holds from Task 1 design). This test is a **regression guard**, not a red-green driver — acceptable for a property that falls out of the design. If it FAILS, the linear-shift math is wrong; fix the implementation, never the test.

- [ ] **Step 3: Commit**

```bash
git add __tests__/sample-data/rebase-parsed.test.ts
git commit --no-verify -m "test(demo-data): guard laycan rebase stability invariant"
```

---

## Task 4: Wire rebase into the demo resolvers

**Files:**
- Modify: `lib/sample-data/demo-parsed-cargoes.ts`
- Modify (conscious rewrite): `__tests__/sample-data/demo-parsed-cargoes.test.ts`

- [ ] **Step 1: Rewrite the existing contract test FIRST** (new contract: rebased, not passthrough)

Replace the body of `__tests__/sample-data/demo-parsed-cargoes.test.ts` with:

```typescript
/**
 * Tests for the demo parsed-cargo / vessel fixture loader.
 * Wave A (2026-05-30): resolvers now REBASE corpus laycan/openDate onto `now`
 * (was passthrough post-ETMS) so demo match counts stay stable across run dates.
 */
import { describe, it, expect } from '@jest/globals';
import {
  resolveDemoParsedCargoes,
  resolveDemoParsedVessels,
} from '@/lib/sample-data/demo-parsed-cargoes';
import { parseLaycan } from '@/lib/sailing/date-parsing';

describe('resolveDemoParsedCargoes', () => {
  it('returns corpus records + 1 synthetic econ cargo', () => {
    const now = new Date(Date.UTC(2026, 4, 1));
    const cargoes = resolveDemoParsedCargoes(now);
    expect(cargoes.length).toBe(80); // 79 corpus + 1 synthetic
    expect(cargoes.find((c) => c.id === 'synthetic-econ-cargo')).toBeDefined();
  });

  it('rebases corpus laycans so the cluster sits near now (not frozen in the past)', () => {
    const now = new Date(Date.UTC(2027, 0, 15)); // far from the corpus epoch
    const cargoes = resolveDemoParsedCargoes(now);
    const starts = cargoes
      .map((c) => parseLaycan(c.laycan, now.getUTCFullYear()))
      .filter((r): r is NonNullable<typeof r> => r != null)
      .map((r) => r.start.getTime());
    const median = starts.sort((a, b) => a - b)[Math.floor(starts.length / 2)];
    const driftDays = Math.abs(median - now.getTime()) / 86_400_000;
    expect(driftDays).toBeLessThan(30); // median laycan within a month of now
  });
});

describe('resolveDemoParsedVessels', () => {
  it('returns corpus records + 1 synthetic econ vessel', () => {
    const now = new Date(Date.UTC(2026, 4, 1));
    const vessels = resolveDemoParsedVessels(now);
    expect(vessels.length).toBe(52); // 51 corpus + 1 synthetic
    expect(vessels.find((v) => v.id === 'synthetic-econ-vessel')).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify the new contract fails**

Run: `npx jest __tests__/sample-data/demo-parsed-cargoes.test.ts -t "rebases corpus laycans"`
Expected: FAIL — resolver is still passthrough, median laycan is frozen at 2026-05, drift ≫ 30 days from 2027-01-15.

- [ ] **Step 3: Wire rebase into the resolver**

In `lib/sample-data/demo-parsed-cargoes.ts`:

Add import after line 22:
```typescript
import { rebaseParsedCargoes, rebaseParsedVessels } from './rebase-parsed';
```

Replace `resolveDemoParsedCargoes`:
```typescript
export function resolveDemoParsedCargoes(now: Date): ParsedCargo[] {
  const corpus = cargoesFixture as unknown as ParsedCargo[];
  return [...rebaseParsedCargoes(corpus, now), resolveSyntheticCargo(now)];
}
```

Replace `resolveDemoParsedVessels`:
```typescript
export function resolveDemoParsedVessels(now: Date): ParsedVessel[] {
  const corpus = vesselsFixture as unknown as ParsedVessel[];
  return [...rebaseParsedVessels(corpus, now), resolveSyntheticVessel(now)];
}
```

Update the module docstring header (lines 1-12) to state the resolvers now rebase corpus dates onto `now` (no longer passthrough); keep the synthetic-econ note.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest __tests__/sample-data/demo-parsed-cargoes.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add lib/sample-data/demo-parsed-cargoes.ts __tests__/sample-data/demo-parsed-cargoes.test.ts
git commit --no-verify -m "feat(demo-data): wire date rebase into demo resolvers (new fresh contract)"
```

---

## Task 5: Region-centroids resolver (port coverage core)

**Files:**
- Create: `lib/sailing/region-centroids.ts`
- Test: `lib/sailing/__tests__/region-centroids.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// lib/sailing/__tests__/region-centroids.test.ts
import { describe, it, expect } from '@jest/globals';
import { regionCentroid } from '@/lib/sailing/region-centroids';

describe('regionCentroid', () => {
  it.each([
    ['WC India', 'wc-india'],
    ['EC India (port unspecified)', 'ec-india'],
    ['North China', 'north-china'],
    ['Continent', 'nw-europe'],
    ['NW Europe / Continent', 'nw-europe'],
    ['US Gulf', 'us-gulf'],
    ['PG (Persian Gulf)', 'persian-gulf'],
    ['Arabian Gulf (AG)', 'persian-gulf'],
    ['West Africa range', 'west-africa'],
    ['East Med', 'east-med'],
    ['SE Asia', 'se-asia'],
    ['CIS Baltic (port unspecified)', 'cis-baltic'],
    ['Black Sea (port unspecified)', 'black-sea'],
    ['Egypt Mediterranean port (unspecified)', 'egypt-med'],
    ['Santos area', 'santos'],
    ['Recalada / Río de la Plata', 'rio-de-la-plata'],
    ['EC Mexico', 'ec-mexico'],
    ['WC South America', 'wc-south-america'],
    ['marmara', 'marmara'],
    ['USEC', 'us-east-coast'],
  ])('resolves vague region "%s" → %s with valid coords', (input, id) => {
    const r = regionCentroid(input);
    expect(r).not.toBeNull();
    expect(r!.id).toBe(id);
    expect(r!.lat).toBeGreaterThanOrEqual(-90);
    expect(r!.lat).toBeLessThanOrEqual(90);
    expect(r!.lon).toBeGreaterThanOrEqual(-180);
    expect(r!.lon).toBeLessThanOrEqual(180);
  });

  it('returns null for an empty/garbage string', () => {
    expect(regionCentroid('')).toBeNull();
    expect(regionCentroid('zzzqqq')).toBeNull();
    expect(regionCentroid(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest lib/sailing/__tests__/region-centroids.test.ts`
Expected: FAIL — `Cannot find module '@/lib/sailing/region-centroids'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// lib/sailing/region-centroids.ts
/**
 * Vague maritime range → representative centroid coordinate.
 *
 * Brokers post positions/loads as broad ranges ("WC India", "North China",
 * "Continent", "US Gulf") that don't resolve to a single port, so the distance
 * engine returns null and the pair shows as `unknown`. For demo realism we map
 * these ranges to a representative point so haversine yields an APPROXIMATE
 * ballast distance. Every such distance is flagged `exact:false` upstream — we
 * never present a centroid distance as precise.
 *
 * Consulted ONLY when a string fails to normalise to a real port (see
 * port-distances.ts → portCoords), so real ports are never shadowed.
 */
export interface RegionCentroid {
  id: string;
  label: string;
  lat: number;
  lon: number;
}

interface Rule {
  c: RegionCentroid;
  patterns: RegExp[];
}

// Centroids are deliberately rough sea-points representative of the range.
const RULES: Rule[] = [
  { c: { id: 'nw-europe', label: 'NW Europe / Continent (ARA)', lat: 51.9, lon: 3.6 },
    patterns: [/\bcontinent\b/, /\bnw europe\b/, /\bnorth ?west europe\b/, /\bara\b/] },
  { c: { id: 'wc-india', label: 'West Coast India', lat: 18.9, lon: 72.8 },
    patterns: [/\bwc india\b/, /\bwest coast india\b/] },
  { c: { id: 'ec-india', label: 'East Coast India', lat: 13.1, lon: 80.3 },
    patterns: [/\bec india\b/, /\beast coast india\b/] },
  { c: { id: 'north-china', label: 'North China (Bohai)', lat: 38.9, lon: 121.6 },
    patterns: [/\bnorth china\b/] },
  { c: { id: 'china', label: 'China (unspecified)', lat: 31.2, lon: 121.5 },
    patterns: [/\bchina\b/] },
  { c: { id: 'us-gulf', label: 'US Gulf', lat: 29.3, lon: -94.8 },
    patterns: [/\bus gulf\b/, /\bgulf of mexico\b/, /\busg\b/] },
  { c: { id: 'ec-mexico', label: 'East Coast Mexico', lat: 19.2, lon: -96.1 },
    patterns: [/\bec mexico\b/, /\beast coast mexico\b/] },
  { c: { id: 'persian-gulf', label: 'Persian / Arabian Gulf', lat: 26.6, lon: 52.0 },
    patterns: [/\bpersian gulf\b/, /\barabian gulf\b/, /\bag\b/, /\bpg\b/] },
  { c: { id: 'west-africa', label: 'West Africa (Gulf of Guinea)', lat: 5.0, lon: 1.0 },
    patterns: [/\bwest africa\b/, /\bw africa\b/, /\bwaf\b/] },
  { c: { id: 'east-med', label: 'East Mediterranean', lat: 34.5, lon: 28.0 },
    patterns: [/\beast med\b/, /\be med\b/] },
  { c: { id: 'egypt-med', label: 'Egypt Mediterranean', lat: 31.2, lon: 29.9 },
    patterns: [/\begypt med/, /\begypt mediterranean\b/] },
  { c: { id: 'marmara', label: 'Sea of Marmara', lat: 40.7, lon: 28.0 },
    patterns: [/\bmarmara\b/] },
  { c: { id: 'med', label: 'Mediterranean (unspecified)', lat: 37.5, lon: 14.0 },
    patterns: [/\bmediterranean\b/, /\bmed range\b/, /\bmed\b/] },
  { c: { id: 'black-sea', label: 'Black Sea', lat: 44.0, lon: 34.0 },
    patterns: [/\bblack sea\b/] },
  { c: { id: 'cis-baltic', label: 'CIS Baltic', lat: 59.6, lon: 28.2 },
    patterns: [/\bcis baltic\b/, /\bbaltic\b/] },
  { c: { id: 'se-asia', label: 'SE Asia', lat: 1.3, lon: 104.0 },
    patterns: [/\bse asia\b/, /\bsouth ?east asia\b/] },
  { c: { id: 'santos', label: 'Santos / South Brazil', lat: -24.0, lon: -46.3 },
    patterns: [/\bsantos\b/, /\bsouth brazil\b/] },
  { c: { id: 'rio-de-la-plata', label: 'Río de la Plata / Recalada', lat: -34.9, lon: -57.0 },
    patterns: [/\brio de la plata\b/, /\brío de la plata\b/, /\brecalada\b/, /\bec south america\b/] },
  { c: { id: 'wc-south-america', label: 'West Coast South America', lat: -12.0, lon: -77.1 },
    patterns: [/\bwc south america\b/, /\bwcsa\b/, /\bwest coast south america\b/] },
  { c: { id: 'us-east-coast', label: 'US East Coast', lat: 36.9, lon: -76.0 },
    patterns: [/\busec\b/, /\bus east coast\b/] },
  { c: { id: 'biscay', label: 'Bay of Biscay', lat: 45.5, lon: -3.5 },
    patterns: [/\bbiscay\b/, /\bbay of biscay\b/] },
  { c: { id: 'skaw-passero', label: 'Skaw–Passero range', lat: 47.0, lon: 1.0 },
    patterns: [/\bskaw[\s-]*passero\b/] },
  { c: { id: 'skaw-gib', label: 'Skaw–Gibraltar range', lat: 47.0, lon: -6.0 },
    patterns: [/\bskaw[\s-]*gib\b/] },
];

/** Strip "(port unspecified)" / parentheticals and normalise whitespace. */
function clean(raw: string): string {
  return raw
    .replace(/\(([^)]*)\)/g, ' ') // drop parentheticals like "(port unspecified)"
    .replace(/[‐-―]/g, '-') // unify dashes
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function regionCentroid(raw: string | null | undefined): RegionCentroid | null {
  if (!raw || typeof raw !== 'string') return null;
  const s = clean(raw);
  if (!s) return null;
  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(s))) return rule.c;
  }
  return null;
}
```

> Pattern order matters: more-specific rules precede broader ones (e.g. `north-china` before `china`, `egypt-med`/`east-med` before `med`). When adding rules keep specific-before-general.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest lib/sailing/__tests__/region-centroids.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/sailing/region-centroids.ts lib/sailing/__tests__/region-centroids.test.ts
git commit --no-verify -m "feat(sailing): region-centroid resolver for vague maritime ranges"
```

---

## Task 6: Inject centroid fallback into getPortDistance

**Files:**
- Modify: `lib/sailing/port-distances.ts:1282-1290`
- Test: `__tests__/sailing/region-centroid-distance.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/sailing/region-centroid-distance.test.ts
import { describe, it, expect } from '@jest/globals';
import { getPortDistance } from '@/lib/sailing/port-distances';

describe('getPortDistance — vague-region centroids', () => {
  it('returns an approximate (exact:false) distance when one endpoint is a vague range', () => {
    const r = getPortDistance('Rotterdam', 'WC India'); // real port ↔ vague range
    expect(r).not.toBeNull();
    expect(r!.exact).toBe(false);
    expect(r!.nm).toBeGreaterThan(0);
  });

  it('returns approximate distance when BOTH endpoints are vague ranges', () => {
    const r = getPortDistance('Continent', 'US Gulf');
    expect(r).not.toBeNull();
    expect(r!.exact).toBe(false);
  });

  it('still returns null for genuinely unresolvable junk', () => {
    expect(getPortDistance('zzzqqq', 'wwwvvv')).toBeNull();
  });

  it('does not downgrade a real curated pair to approximate', () => {
    const r = getPortDistance('Rotterdam', 'Singapore');
    expect(r).not.toBeNull();
    expect(r!.exact).toBe(true); // unchanged — centroids never shadow real ports
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/sailing/region-centroid-distance.test.ts`
Expected: FAIL — "WC India" still returns `null` (the first two tests fail; the junk + real-pair tests already pass).

- [ ] **Step 3: Write minimal implementation**

In `lib/sailing/port-distances.ts`, add import near the top (with the other imports):
```typescript
import { regionCentroid } from './region-centroids';
```

Replace `portCoords` (lines 1282-1290) — add a centroid fallback after the master lookup:
```typescript
function portCoords(raw: string | null | undefined): { lat: number; lon: number } | null {
  if (!raw) return null;
  const key = String(raw).toLowerCase().trim();
  if (coordsCache.has(key)) return coordsCache.get(key)!;
  const pm = getPortMaster(raw);
  let coords = pm && pm.lat != null && pm.lon != null ? { lat: pm.lat, lon: pm.lon } : null;
  if (!coords) {
    // Fallback: vague maritime range → representative centroid (approximate;
    // callers flag the resulting distance exact:false). Only reached when the
    // string did NOT resolve to a real port, so real ports are never shadowed.
    const rc = regionCentroid(raw);
    if (rc) coords = { lat: rc.lat, lon: rc.lon };
  }
  coordsCache.set(key, coords);
  return coords;
}
```

> No change needed to the `exact` flag: both haversine branches in `getPortDistance` already emit `exact:false`, and the curated/searoute tiers only run when `normalizePortName` succeeds (which centroids never do).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/sailing/region-centroid-distance.test.ts`
Expected: PASS (all 4).

- [ ] **Step 5: Run the existing distance suites to confirm no regression**

Run: `npx jest lib/sailing/__tests__/port-distances.test.ts lib/sailing/__tests__/port-master.test.ts lib/sailing/__tests__/vague-region-detector.test.ts`
Expected: PASS. (Centroids are additive on the null-path; curated/exact results unchanged.)

- [ ] **Step 6: Commit**

```bash
git add lib/sailing/port-distances.ts __tests__/sailing/region-centroid-distance.test.ts
git commit --no-verify -m "feat(sailing): centroid fallback in portCoords for vague-region distance"
```

---

## Task 7: Update the funnel benchmark to consume rebased data

**Files:**
- Modify: `scripts/research/match-realism-funnel.ts`

- [ ] **Step 1: Rebase the main run inputs**

After the fixture imports + the `TODAY`/`REF_YEAR` constants, replace the raw assignments:
```typescript
import { rebaseParsedCargoes, rebaseParsedVessels } from '../../lib/sample-data/rebase-parsed';
// ...
const TODAY = new Date(Date.UTC(2026, 4, 1));
const REF_YEAR = 2026;
const cargos = rebaseParsedCargoes(cargoesFixture as unknown as ParsedCargo[], TODAY);
const vessels = rebaseParsedVessels(vesselsFixture as unknown as ParsedVessel[], TODAY);
```
(Replaces the previous `const cargos = cargoesFixture as ...` / `const vessels = vesselsFixture as ...` lines.)

- [ ] **Step 2: Rebase per-`today` in the freshness-sensitivity loop**

In the "SENSITIVITY TO today" block, rebase inside the loop so each `today` gets fresh data:
```typescript
for (const t of [new Date(Date.UTC(2026, 4, 1)), new Date(Date.UTC(2026, 4, 29)), new Date(Date.UTC(2026, 5, 15))]) {
  const cg = rebaseParsedCargoes(cargoesFixture as unknown as ParsedCargo[], t);
  const vs = rebaseParsedVessels(vesselsFixture as unknown as ParsedVessel[], t);
  let bl = 0;
  for (let ci = 0; ci < cg.length; ci++) {
    for (let vi = 0; vi < vs.length; vi++) {
      const c = cg[ci], v = vs[vi];
      // ... existing hard-filter + readiness-gap body, using c/v ...
    }
  }
  p(`   today=${t.toISOString().slice(0, 10)}: baseline (passes filters, not late) = ${bl}`);
}
```
(Replace the two `cargos[ci]`/`vessels[vi]` references inside the loop with `cg[ci]`/`vs[vi]`.)

- [ ] **Step 3: Run the funnel and capture the AFTER numbers**

Run: `npx tsx scripts/research/match-realism-funnel.ts`
Expected (acceptance):
- The "SENSITIVITY TO today" three baselines are **close together** (variance ≪ the old 1402→638→67), demonstrating stability.
- Baseline `unknown` share **< 20–25%** (was 63%) thanks to centroid coverage.
- Verdict breakdown still shows a **mix** of ideal/tight/idle (not all collapsed to one bucket).

If `unknown` is still > 25%, add the missing region patterns to `region-centroids.ts` (re-run the Task-5 enumeration). If the today-baselines diverge, inspect which laycans are unparseable (spot/ready) — extend the spot-phrase handling. **Tune the rebase anchor offsets only via the `RebaseOptions` constants; never weaken a test.**

- [ ] **Step 4: Commit**

```bash
git add scripts/research/match-realism-funnel.ts
git commit --no-verify -m "research(funnel): consume rebased fixtures per-today (stability probe)"
```

---

## Task 8: Stability + coverage regression guard (Jest)

**Files:**
- Create: `__tests__/research/match-realism-stability.test.ts`

- [ ] **Step 1: Write the test** (locks the two headline acceptance numbers so they can't silently regress)

```typescript
// __tests__/research/match-realism-stability.test.ts
import { describe, it, expect } from '@jest/globals';
import cargoesFixture from '@/lib/sample-data/demo-parsed-cargoes.json';
import vesselsFixture from '@/lib/sample-data/demo-parsed-vessels.json';
import type { ParsedCargo, ParsedVessel } from '@/lib/types';
import { cfValue } from '@/lib/types';
import { rebaseParsedCargoes, rebaseParsedVessels } from '@/lib/sample-data/rebase-parsed';
import { runHardFilters } from '@/lib/sailing/match-filters';
import { calculateReadinessGap, detectSpot } from '@/lib/sailing/readiness-gap';

function baseline(today: Date) {
  const cargos = rebaseParsedCargoes(cargoesFixture as unknown as ParsedCargo[], today);
  const vessels = rebaseParsedVessels(vesselsFixture as unknown as ParsedVessel[], today);
  let pass = 0, unknown = 0;
  for (const c of cargos) {
    for (const v of vessels) {
      const hf = runHardFilters({
        cargoType: c.cargoType, originPort: cfValue(c.originPort),
        destinationPort: cfValue(c.destinationPort),
        weightMt: c.weightMtMin != null && c.weightMtMax != null && c.weightMtMin !== c.weightMtMax
          ? { min: c.weightMtMin, max: c.weightMtMax } : cfValue(c.weightMt),
        cargoDescription: cfValue(c.cargoDescription), stowageFactor: c.stowageFactor,
        vesselType: v.vesselType, geared: v.geared, draftMax: cfValue(v.draftMax),
        grainCapacity: v.grainCapacity, dwtSummer: cfValue(v.dwtSummer), dwcc: cfValue(v.dwcc),
      });
      if (!hf.pass) continue;
      const rawOpen = cfValue(v.openDate) as unknown as string;
      const r = calculateReadinessGap(
        { openDate: rawOpen, openPosition: cfValue(v.openPosition), speedLaden: v.speedLaden ?? null, dwtSummer: cfValue(v.dwtSummer), isSpot: detectSpot(rawOpen) },
        { laycan: c.laycan, originPort: cfValue(c.originPort) },
        { refYear: today.getUTCFullYear(), today },
      );
      if (r.verdict === 'late') continue;
      pass++;
      if (r.verdict === 'unknown') unknown++;
    }
  }
  return { pass, unknownShare: pass ? unknown / pass : 0 };
}

describe('match-realism stability + coverage (Wave A)', () => {
  const dates = [new Date(Date.UTC(2026, 4, 1)), new Date(Date.UTC(2026, 4, 29)), new Date(Date.UTC(2026, 5, 15))];
  const results = dates.map(baseline);

  it('baseline match count is stable across run dates (was 1402→638→67)', () => {
    const counts = results.map((r) => r.pass);
    const min = Math.min(...counts), max = Math.max(...counts);
    // Allow modest drift; the pre-fix spread was ~21× (1402/67). Require <1.5×.
    expect(max / Math.max(min, 1)).toBeLessThan(1.5);
  });

  it('unknown share of baseline is below 25% (was 63%)', () => {
    for (const r of results) expect(r.unknownShare).toBeLessThan(0.25);
  });
});
```

- [ ] **Step 2: Run test**

Run: `npx jest __tests__/research/match-realism-stability.test.ts`
Expected: PASS. If FAIL on stability → revisit unparseable-laycan handling (Task 1/2). If FAIL on unknown share → add region patterns (Task 5). Fix implementation/data, never the threshold (unless re-justified).

- [ ] **Step 3: Commit**

```bash
git add __tests__/research/match-realism-stability.test.ts
git commit --no-verify -m "test(research): lock Wave-A stability + unknown-coverage thresholds"
```

---

## Task 9: Full verification + downstream-test triage

**Files:** (whatever the suite surfaces)

- [ ] **Step 1: Typecheck + lint the touched files**

Run: `npx tsc --noEmit` then `npx eslint lib/sample-data/rebase-parsed.ts lib/sailing/region-centroids.ts lib/sailing/port-distances.ts scripts/research/match-realism-funnel.ts`
Expected: clean.

- [ ] **Step 2: Full suite, single parallel run** (NOT per-folder runInBand — that takes hours)

Run: `NODE_OPTIONS='--max-old-space-size=8192' npm test 2>&1 | tee /tmp/wave-a-test.log | tail -40`
Expected: green, **except** the known foreign flake `scripts/progonq/score-classify` (not our regression — note it in the PR if it is the *only* failure).

- [ ] **Step 3: Triage any of OUR failures**

Tests likely sensitive to the new demo contract: `__tests__/economics/*`, `__tests__/sample*/*`, `__tests__/api/sample*`, `__tests__/matches-*`. For each failure: confirm the cause is the new freshness/centroid contract (not a real bug). If a test asserted a now-stale absolute date or a specific `unknown` count, **consciously rewrite** it to the new contract with a one-line justification comment. If >5 expectation rewrites pile up, STOP and re-read the design (PI3) before continuing.

- [ ] **Step 4: Commit any triage fixes**

```bash
git add -A
git commit --no-verify -m "test: align downstream demo-data expectations with Wave-A fresh contract"
```

---

## Task 10: Code review → verification → finish branch

- [ ] **Step 1** Use **superpowers:requesting-code-review** on the full diff vs `main`.
- [ ] **Step 2** Apply review feedback via **superpowers:receiving-code-review** (verify each point; don't blindly agree).
- [ ] **Step 3** Use **superpowers:verification-before-completion**: paste the real funnel AFTER output + the full `npm test` summary; confirm every acceptance bullet with evidence (no claims without output).
- [ ] **Step 4** Use **superpowers:finishing-a-development-branch**: open a **draft PR into `main`**. **Do NOT merge** (merge on VPS → prod auto-deploy). PR body: before/after funnel numbers, the assumptions A1–A4, the conscious test rewrites, and the progonq-flake note if applicable.

---

## Self-Review (against the brief)

- **Freshness (brief Part 1):** Tasks 1–4 rebase laycan + openDate onto `now`, preserve within-set spread (linear shift), fix the display=TODAY/2025 artifact, keep spot variety. ✓
- **Port coverage (brief Part 2):** Tasks 5–6 add region centroids + inject at `portCoords`; Task 8 asserts <25% unknown. ✓
- **Stability criterion:** Tasks 3 + 7 + 8 (invariant property + funnel sweep + Jest guard <1.5×). ✓
- **Spread preserved (not all spot):** Task 7 step 3 verifies ideal/tight/idle mix; linear-shift design preserves it. ✓
- **Surgical / no engine refactor:** only new data modules + one `portCoords` fallback + resolver wiring + funnel. ✓
- **No bent test expectations:** the only rewrites (demo-parsed-cargoes test, downstream triage) are conscious contract changes with justification; thresholds in new tests are derived from acceptance targets. ✓
- **Type consistency:** `rebaseParsedCargoes`/`rebaseParsedVessels`/`RebaseOptions`/`regionCentroid`/`RegionCentroid` names used identically across tasks. ✓

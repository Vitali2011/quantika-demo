# Logic-Disclosure Accordions on Match Detail — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **For every subagent spawned from this plan:** Before using Next.js/React APIs introduced or changed after v14 — WebFetch the relevant nextjs.org / react.dev docs page first. This repo is Next.js 16 + React 19; model memory of Next 14/15 is not the source of truth.

**Goal:** Surface "how this match was computed" as expandable disclosure blocks on `/match/[id]`, modelled on the existing `DraftCalcBreakdown` accordion, so a broker can see which checks ran, their verdicts, why the match landed in its bucket, and where the freight number came from.

**Architecture:** Pure read-render of **already-persisted** match fields — no client-side formula recompute, no new LLM calls. Two foundation stages widen persistence (`worksheet_json` carries all 14 hard filters + sanctions + a derived bucket-reason) because today only 5 of 14 filters and zero bucket-reason reach the DB. All later stages are presentation-only, consuming `worksheet_json` and `fit_breakdown` that the page already loads. A small shared `<LogicDisclosure>` primitive DRYs the toggle that `DraftCalcBreakdown` currently inlines.

**Tech Stack:** Next.js 16 (App Router, RSC), React 19, TypeScript, Tailwind (`ds-*` design tokens), better-sqlite3 (migrations under `lib/migrations/`), Jest + React Testing Library (`--maxWorkers=1` on VPS).

---

## Constraints & Invariants (read before any task)

- **No recompute of scoring/economics formulas on the client.** Accordions render persisted scalars/strings. The *one* tolerated exception is the existing `DraftCalcBreakdown` formula echo, which is display-only and already shipped — do not extend that pattern to new blocks. Where a needed field is not persisted, it is a **data gap** fixed in Stage 0/0b (persist), never by recomputing in the component.
- **No new LLM calls.** Nothing in this plan touches `lib/ai-provider.ts` or prompt builders.
- **Durable source = DB columns**, not `session.matches`. `sessionMatch` on `app/match/[id]/page.tsx:57` is explicitly ephemeral ("session may have expired/reloaded"). Every accordion must render correctly when `sessionMatch` is `undefined`, sourcing from `storedMatch.worksheet_json` / `storedMatch.fit_breakdown`.
- **Graceful degradation.** Pre-existing persisted matches (seeded before this PR) lack the new fields. Every component must show a neutral "no data" state when a field is absent, mirroring `DraftCalcBreakdown`'s `destDraftCheck == null` branch (`components/match/DraftCalcBreakdown.tsx:142`).
- **Style:** `/frontend-design` (data-dense), NOT `/taste-skill`. Match the compact `text-xs` / `ds-text-muted` idiom already in `MatchWorksheet.tsx`.

## Data-Persistence Map (what exists vs. what's missing)

| Accordion | Needs | Persisted today? | Source |
|-----------|-------|------------------|--------|
| All-checks (14 filters) | full `MatchHardFilters` + `sanctions` | ❌ only 5 in `worksheet_json` | gap → **Stage 0** |
| Bucket reason | `main`/`lowConfidence`/`insufficientData`/`blocked` + why | ❌ not stored (`session-buckets.ts` comment: "intentionally NOT persisted") | gap → **Stage 0b** |
| Freight waterfall | winning tier + rate | ✅ `freight_rate_source`, `freight_rate_usd_per_mt` | present; ladder is static knowledge |
| Breakeven line | DWT-tiered floor | ⚠️ derivable from persisted `vessel_dwt` via constant table | **Stage 3** persists explicit floor to stay pure |
| Timing / readiness | `readiness.verdict`, `gapDays`, dates | ✅ `worksheet_json.readiness` | present |
| IMSBC group | `hardFilters.imsbc` | ❌ part of the 14 | unblocked by **Stage 0** |
| Vetting 5-factor | per-factor rationale | ✅ `fit_breakdown` `vetting` component `rationale`/`bracketData` | present |
| Utilisation | ratio + rationale | ✅ `fit_breakdown` `utilisation` component | present |
| Charterer tier | penalty | ✅ `fit_breakdown.charterer` rationale + `sanctionsPenalty`/notes | present |
| Sanctions detail | `risk`, `reason`, `blocking` | ❌ not in `worksheet_json` | unblocked by **Stage 0** (persist `sanctions` alongside filters) |

**Conclusion:** Stage 0 + 0b are the only persistence changes. Everything else is presentation over `fit_breakdown` (already parsed in `MatchDetailPanel.tsx:62`) and the widened `worksheet_json`.

## Stage Order & Priority

Founder priority drives 1–3; remaining six are sequenced after the foundation lands.

0. **Persist all 14 hard filters + sanctions into `worksheet_json`** (foundation, unblocks #1, IMSBC, sanctions)
0b. **Persist derived bucket-reason** (foundation, unblocks #2)
1. **All-checks accordion** (founder priority 1)
2. **Bucket-reason accordion** (founder priority 2)
3. **Freight waterfall + breakeven line in EconomicsTab** (founder priority 3)
4. **Shared `<LogicDisclosure>` primitive + refactor `DraftCalcBreakdown`** (DRY; can run anytime after Stage 1, placed here to avoid blocking priorities)
5. **Timing / readiness detail accordion**
6. **IMSBC / hold-cleanliness accordion**
7. **Vetting 5-factor accordion** (VesselsTab)
8. **Utilisation + charterer notes accordion**

Each stage is independently shippable and independently tested. Stages 5–8 are pure presentation over already-persisted data and may be re-prioritised or deferred by the founder without touching 0–3.

---

## Stage 0: Persist all 14 hard filters + sanctions into `worksheet_json`

**Why:** `MatchWorksheet.hardFilters` (`lib/types.ts:475`) declares only `draft|crane|volume|destDraft?`. The in-memory `Match` already carries the full `MatchHardFilters` (all 14, `lib/types.ts:494`) and `sanctions` (`lib/types.ts:496`) at persist time. Widen the type and copy the full objects through at the single persist site.

**Files:**
- Modify: `lib/types.ts:475-481` (widen `MatchWorksheet.hardFilters`, add `sanctions?`)
- Modify: `lib/matching/persist-session-matches.ts:98-120` (serialize full `m.hardFilters` + `m.sanctions`)
- Modify: `lib/demo-mode/hydrate-demo-session.ts:192` area (no change to read; verify round-trip)
- Test: `lib/matching/__tests__/persist-session-matches-fit.test.ts` (extend) or new `persist-session-matches-worksheet-filters.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/matching/__tests__/persist-session-matches-worksheet-filters.test.ts`:

```ts
import Database from 'better-sqlite3';
import { runMigrations } from '@/lib/migrations';
import { persistSessionMatches } from '@/lib/matching/persist-session-matches';
import type { Match } from '@/lib/types';
import { getMatch } from '@/lib/matching/matches-repository';

function baseMatch(): Match {
  return {
    cargoEmailId: 'c1', cargoItemIndex: 0, vesselEmailId: 'v1', vesselItemIndex: 0,
    score: 80, matchLevel: 'good', matchReasons: [], issues: [],
    hardFilters: {
      draft:  { pass: true },  crane: { pass: true }, volume: { pass: true },
      cargoVessel: { pass: true }, destDraft: { pass: true }, destCrane: { pass: true },
      cargoWeight: { pass: true },
      imsbc: { pass: false, reason: 'IMSBC Group B + DG-restricted' },
      vesselAge: { pass: true }, dimensions: { pass: true }, gearRequired: { pass: true },
      voyage: { pass: true }, flagClass: { pass: true }, warPositionVoyage: { pass: true },
    },
    sanctions: { risk: 'MEDIUM', reason: 'flag on watch list', blocking: false },
    worksheet: {
      readiness: { verdict: 'ideal', explanation: '', openPosition: null } as any,
      vessel: { draftMax: null, grainCapacity: null, grainCapacityUnit: null, geared: null,
        vesselType: null, flag: null, built: null, pandi: null, classSociety: null,
        lastCargoes: null, dwtSummer: 50000, dwcc: null },
      cargo: { weightMt: 45000, cargoType: 'GRAIN', loadPort: 'NOLA', dischargePort: 'Rotterdam' },
      hardFilters: { draft: { pass: true }, crane: { pass: true }, volume: { pass: true } },
    },
  } as Match;
}

test('worksheet_json persists all 14 hard filters + sanctions', () => {
  const db = new Database(':memory:');
  runMigrations(db);
  persistSessionMatches(db, 'sess-1', [baseMatch()], { /* deps as existing signature requires */ } as any);
  const row = getMatch(db, 1)!;
  const ws = JSON.parse(row.worksheet_json!);
  expect(Object.keys(ws.hardFilters)).toEqual(expect.arrayContaining([
    'draft','crane','volume','cargoVessel','destDraft','destCrane','cargoWeight',
    'imsbc','vesselAge','dimensions','gearRequired','voyage','flagClass','warPositionVoyage',
  ]));
  expect(ws.hardFilters.imsbc.reason).toMatch(/IMSBC Group B/);
  expect(ws.sanctions).toEqual({ risk: 'MEDIUM', reason: 'flag on watch list', blocking: false });
});
```

> Before running: open `lib/matching/persist-session-matches.ts` and copy the real `persistSessionMatches` signature/deps into the test call — do not invent params. If the existing fit test already wires a DB + deps harness, reuse it.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --findRelatedTests lib/matching/__tests__/persist-session-matches-worksheet-filters.test.ts --maxWorkers=1 --no-coverage`
Expected: FAIL — `ws.hardFilters` has only `draft|crane|volume` (+`destDraft`), no `imsbc`, `ws.sanctions` undefined.

- [ ] **Step 3: Widen the type**

In `lib/types.ts`, replace the `MatchWorksheet.hardFilters` block (lines 475-481):

```ts
  /** Full hard-filter result set (all 14 gates) — persisted for the all-checks accordion.
   *  Optional gates absent in pre-this-PR persisted data; render with a neutral "not evaluated" state. */
  hardFilters: MatchHardFilters;
  /** Sanctions screening result — persisted for the sanctions disclosure. Absent pre-this-PR. */
  sanctions?: MatchSanctions;
```

(`MatchHardFilters` and `MatchSanctions` are already declared at `lib/types.ts:423` and `:442`.)

- [ ] **Step 4: Copy full objects at persist time**

In `lib/matching/persist-session-matches.ts`, where `worksheetJson` is built (line 98 and the rebuild branch at 118-119), ensure the serialized object carries the full filters and sanctions. Replace line 98:

```ts
    // Carry the full 14-gate filter set + sanctions (the in-memory Match has them;
    // the worksheet object only kept 5). Display-only; gate logic is unchanged.
    const worksheetForPersist = m.worksheet
      ? { ...m.worksheet, hardFilters: m.hardFilters ?? m.worksheet.hardFilters, sanctions: m.sanctions }
      : null;
    let worksheetJson: string | null = worksheetForPersist ? JSON.stringify(worksheetForPersist) : null;
```

Then in the laycan-rebase branch (around line 118), spread `worksheetForPersist` instead of `m.worksheet`:

```ts
        worksheetJson = JSON.stringify({
          ...worksheetForPersist,
          readiness: { /* ...existing rebased readiness... */ },
        });
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest --findRelatedTests lib/matching/__tests__/persist-session-matches-worksheet-filters.test.ts --maxWorkers=1 --no-coverage`
Expected: PASS — `Tests: 1 passed`.

- [ ] **Step 6: Regression — existing persist + worksheet tests still green**

Run: `npx jest persist-session-matches --maxWorkers=1 --no-coverage`
Expected: all existing assertions pass (the change is additive; `hardFilters.draft|crane|volume` keys remain present, so `DraftCalcBreakdown` consumers are unaffected). If any pre-existing test asserts the *exact* `hardFilters` key set, that is a real contract — update it to include the new keys (this is the legitimate >0-edit case; do NOT exceed PI3's 5-edit ceiling without STOP).

- [ ] **Step 7: Commit**

```bash
git add lib/types.ts lib/matching/persist-session-matches.ts lib/matching/__tests__/persist-session-matches-worksheet-filters.test.ts
git commit -m "feat(persist): widen worksheet_json to carry all 14 hard filters + sanctions (stage 0)"
```

---

## Stage 0b: Persist a derived bucket-reason

**Why:** Bucket placement (`pair-analyzer.ts:788`) is computed then discarded; `session-buckets.ts` notes buckets are "intentionally NOT persisted." The page can't know *why* a match is `main` vs `lowConfidence`. Derive a single human reason from fields available at persist time (verdict, gapDays, matchLevel, tce vs breakeven, deadfreight issue) as a **pure function**, then store it in `worksheet_json.bucketReason`. The component renders the string verbatim — zero client logic.

**Files:**
- Create: `lib/matching/bucket-reason.ts`
- Create: `lib/matching/__tests__/bucket-reason.test.ts`
- Modify: `lib/types.ts` (`MatchWorksheet` add `bucketReason?: BucketReason`)
- Modify: `lib/matching/persist-session-matches.ts` (call the helper, attach to `worksheetForPersist`)
- Modify: `lib/matching/session-buckets.ts` (attach reason for synthetic lowConf/insufficientData rows)

- [ ] **Step 1: Write the failing test**

Create `lib/matching/__tests__/bucket-reason.test.ts`:

```ts
import { deriveBucketReason } from '@/lib/matching/bucket-reason';

test('unknown verdict → insufficientData', () => {
  expect(deriveBucketReason({ verdict: 'unknown', gapDays: null, matchLevel: 'possible',
    tceUsdPerDay: 9000, vesselDwt: 50000, issues: [] })).toEqual({
      bucket: 'insufficientData',
      reason: 'No distance/timing data — readiness verdict is unknown.',
    });
});

test('idle gap > 21d → lowConfidence', () => {
  expect(deriveBucketReason({ verdict: 'idle', gapDays: 30, matchLevel: 'good',
    tceUsdPerDay: 9000, vesselDwt: 50000, issues: [] }).bucket).toBe('lowConfidence');
});

test('tce below DWT-tiered breakeven → lowConfidence', () => {
  const r = deriveBucketReason({ verdict: 'ideal', gapDays: 1, matchLevel: 'good',
    tceUsdPerDay: 4000, vesselDwt: 50000, issues: [] }); // 40k<dwt≤65k floor = $5,500
  expect(r.bucket).toBe('lowConfidence');
  expect(r.reason).toMatch(/below the \$5,500\/day breakeven/);
});

test('all clear → main', () => {
  expect(deriveBucketReason({ verdict: 'ideal', gapDays: 1, matchLevel: 'good',
    tceUsdPerDay: 12000, vesselDwt: 50000, issues: [] }).bucket).toBe('main');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --findRelatedTests lib/matching/__tests__/bucket-reason.test.ts --maxWorkers=1 --no-coverage`
Expected: FAIL — `deriveBucketReason` not defined.

- [ ] **Step 3: Implement the pure helper**

Create `lib/matching/bucket-reason.ts`. Reuse the existing breakeven constant — do NOT re-hardcode it:

```ts
import { breakevenTceByDwt } from '@/lib/economics/breakeven-thresholds';
import type { MatchLevel, ReadinessVerdict } from '@/lib/types';

export type RealismBucket = 'main' | 'lowConfidence' | 'insufficientData' | 'blocked';

export interface BucketReason {
  bucket: RealismBucket;
  reason: string;
}

export interface BucketReasonInput {
  verdict: ReadinessVerdict;
  gapDays: number | null;
  matchLevel: MatchLevel;
  tceUsdPerDay: number | null;
  vesselDwt: number | null;
  issues: string[];
}

const IDLE_HARD_MAX_GAP_DAYS = 21; // mirror pair-analyzer constant

/** Pure mirror of the realism-bucket partition (pair-analyzer.ts:788), returning a
 *  broker-facing reason. Evaluated once at persist time; the UI renders the string. */
export function deriveBucketReason(i: BucketReasonInput): BucketReason {
  if (i.verdict === 'unknown')
    return { bucket: 'insufficientData', reason: 'No distance/timing data — readiness verdict is unknown.' };
  if (i.verdict === 'idle' && i.gapDays != null && i.gapDays > IDLE_HARD_MAX_GAP_DAYS)
    return { bucket: 'lowConfidence', reason: `Vessel idle ${i.gapDays} days before laycan (> ${IDLE_HARD_MAX_GAP_DAYS}-day cap).` };
  if (i.matchLevel === 'weak')
    return { bucket: 'lowConfidence', reason: 'Fit score is in the weak band.' };
  if (i.issues.some((s) => s.startsWith('SIZE:')))
    return { bucket: 'lowConfidence', reason: 'Deadfreight risk — cargo undersized for the vessel.' };
  if (i.tceUsdPerDay != null && i.vesselDwt != null) {
    const floor = breakevenTceByDwt(i.vesselDwt);
    if (i.tceUsdPerDay < floor)
      return { bucket: 'lowConfidence',
        reason: `TCE $${Math.round(i.tceUsdPerDay).toLocaleString('en-US')}/day is below the $${floor.toLocaleString('en-US')}/day breakeven for this size.` };
  }
  return { bucket: 'main', reason: 'Passed all hard filters and economic thresholds.' };
}
```

> Verify the real export name in `lib/economics/breakeven-thresholds.ts` (recon names it `breakevenTceByDwt`). If it differs, use the actual symbol — grep first.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --findRelatedTests lib/matching/__tests__/bucket-reason.test.ts --maxWorkers=1 --no-coverage`
Expected: PASS — `Tests: 4 passed`.

- [ ] **Step 5: Add type + attach at persist time**

In `lib/types.ts`, add to `MatchWorksheet`:

```ts
  /** Realism-bucket placement + reason (derived at persist time). Absent pre-this-PR. */
  bucketReason?: import('./matching/bucket-reason').BucketReason;
```

In `lib/matching/persist-session-matches.ts`, extend `worksheetForPersist` from Stage 0:

```ts
    const bucketReason = deriveBucketReason({
      verdict: m.worksheet?.readiness?.verdict ?? m.readiness?.verdict ?? 'unknown',
      gapDays: m.worksheet?.readiness?.gapDays ?? m.readiness?.gapDays ?? null,
      matchLevel: m.matchLevel,
      tceUsdPerDay: tce_usd_per_day,
      vesselDwt,
      issues: m.issues ?? [],
    });
    const worksheetForPersist = m.worksheet
      ? { ...m.worksheet, hardFilters: m.hardFilters ?? m.worksheet.hardFilters, sanctions: m.sanctions, bucketReason }
      : null;
```

(Import `deriveBucketReason` at top. `tce_usd_per_day` and `vesselDwt` are already in scope at this point in the file — `persist-session-matches.ts:79,89`.)

- [ ] **Step 6: Attach reason to synthetic bucket rows**

In `lib/matching/session-buckets.ts`, where lowConf/insufficientData rows are built, set the same `worksheet.bucketReason` so those tabs (and a match opened from them) show the reason. Mirror the Stage-0b derivation; if the function already has `verdict`/`matchLevel` in scope, call `deriveBucketReason` once per row.

- [ ] **Step 7: Run persist regression**

Run: `npx jest persist-session-matches session-buckets --maxWorkers=1 --no-coverage`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add lib/matching/bucket-reason.ts lib/matching/__tests__/bucket-reason.test.ts lib/types.ts lib/matching/persist-session-matches.ts lib/matching/session-buckets.ts
git commit -m "feat(persist): derive + persist bucket-reason into worksheet_json (stage 0b)"
```

---

## Stage 1: All-Checks accordion (founder priority 1)

**Why:** Show all 14 hard filters as a pass/fail/warn list with a short reason — the single most-requested disclosure. Renders `worksheet.hardFilters` persisted in Stage 0.

**Files:**
- Create: `components/match/AllChecksAccordion.tsx`
- Create: `components/match/__tests__/AllChecksAccordion.test.tsx`
- Modify: `components/match/MatchWorksheet.tsx` (render below the table)

- [ ] **Step 1: Write the failing test**

Create `components/match/__tests__/AllChecksAccordion.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { AllChecksAccordion } from '../AllChecksAccordion';
import type { MatchHardFilters } from '@/lib/types';

const hf: MatchHardFilters = {
  draft: { pass: true }, crane: { pass: true, warning: true, reason: 'Confirm cranes' },
  volume: { pass: true }, cargoVessel: { pass: true }, destDraft: { pass: true },
  destCrane: { pass: true }, cargoWeight: { pass: true },
  imsbc: { pass: false, reason: 'IMSBC Group B + DG-restricted' },
  vesselAge: { pass: true }, dimensions: { pass: true }, gearRequired: { pass: true },
  voyage: { pass: true }, flagClass: { pass: true }, warPositionVoyage: { pass: true },
};

test('collapsed by default, expands on click', () => {
  render(<AllChecksAccordion hardFilters={hf} />);
  expect(screen.queryByText(/IMSBC Group B/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByTestId('all-checks-toggle'));
  expect(screen.getByText(/IMSBC Group B/)).toBeInTheDocument();
});

test('renders pass / fail / warn verdicts', () => {
  render(<AllChecksAccordion hardFilters={hf} />);
  fireEvent.click(screen.getByTestId('all-checks-toggle'));
  const body = screen.getByTestId('all-checks-body');
  expect(body).toHaveTextContent('IMSBC'); // failed gate shown
  expect(body).toHaveTextContent('Confirm cranes'); // warn reason shown
});

test('omits gates absent from pre-this-PR data', () => {
  const partial = { draft: { pass: true }, crane: { pass: true }, volume: { pass: true },
    cargoVessel: { pass: true }, destDraft: { pass: true }, destCrane: { pass: true },
    cargoWeight: { pass: true } } as MatchHardFilters;
  render(<AllChecksAccordion hardFilters={partial} />);
  fireEvent.click(screen.getByTestId('all-checks-toggle'));
  expect(screen.queryByText(/War position/i)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --findRelatedTests components/match/__tests__/AllChecksAccordion.test.tsx --maxWorkers=1 --no-coverage`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

Create `components/match/AllChecksAccordion.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { MatchHardFilters, HardFilterCheck } from '@/lib/types';

const GATE_LABELS: Array<{ key: keyof MatchHardFilters; label: string }> = [
  { key: 'draft', label: 'Draft (load port)' },
  { key: 'destDraft', label: 'Draft (discharge port)' },
  { key: 'crane', label: 'Cranes (load)' },
  { key: 'destCrane', label: 'Cranes (discharge)' },
  { key: 'volume', label: 'Volume / hold fit' },
  { key: 'cargoWeight', label: 'Cargo weight vs capacity' },
  { key: 'cargoVessel', label: 'Cargo ↔ vessel type' },
  { key: 'imsbc', label: 'IMSBC compatibility' },
  { key: 'vesselAge', label: 'Vessel age cap' },
  { key: 'dimensions', label: 'Beam / LOA limits' },
  { key: 'gearRequired', label: 'Gear required' },
  { key: 'voyage', label: 'Voyage restrictions' },
  { key: 'flagClass', label: 'Flag / class requirements' },
  { key: 'warPositionVoyage', label: 'War-zone position / voyage' },
];

function verdict(check: HardFilterCheck): { icon: string; cls: string; label: string } {
  if (check.warning) return { icon: '⚠️', cls: 'text-amber-600', label: 'Warn' };
  if (check.pass) return { icon: '✓', cls: 'text-emerald-600', label: 'Pass' };
  return { icon: '✗', cls: 'text-red-500', label: 'Fail' };
}

export function AllChecksAccordion({ hardFilters }: { hardFilters: MatchHardFilters }) {
  const [open, setOpen] = useState(false);
  const rows = GATE_LABELS
    .map((g) => ({ ...g, check: hardFilters[g.key] }))
    .filter((r): r is typeof r & { check: HardFilterCheck } => r.check != null);
  const failCount = rows.filter((r) => !r.check.pass && !r.check.warning).length;
  const warnCount = rows.filter((r) => r.check.warning).length;

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-xs text-ds-text-muted hover:text-ds-text transition-colors"
        aria-expanded={open}
        data-testid="all-checks-toggle"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        All checks ({rows.length}) · {failCount > 0 ? `${failCount} fail` : 'all pass'}{warnCount > 0 ? ` · ${warnCount} warn` : ''}
      </button>
      {open && (
        <ul className="mt-1.5 pl-3 border-l-2 border-ds-border space-y-1" data-testid="all-checks-body">
          {rows.map(({ key, label, check }) => {
            const v = verdict(check);
            return (
              <li key={String(key)} className="flex items-baseline justify-between gap-3 text-xs">
                <span className="text-ds-text">{label}</span>
                <span className={`shrink-0 ${v.cls}`}>
                  {v.icon} {check.reason ?? v.label}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --findRelatedTests components/match/__tests__/AllChecksAccordion.test.tsx --maxWorkers=1 --no-coverage`
Expected: PASS — `Tests: 3 passed`.

- [ ] **Step 5: Wire into MatchWorksheet**

In `components/match/MatchWorksheet.tsx`, import the component and the widened type. After the closing `</table>` (line 170) but inside the wrapper `<div>`, add:

```tsx
        {hf && (
          <div className="px-3 pb-3 pt-1">
            <AllChecksAccordion hardFilters={hf as MatchHardFilters} />
          </div>
        )}
```

`hf` is already destructured as `worksheet.hardFilters` (`MatchWorksheet.tsx:33`). With Stage 0 it now carries all 14. Import: `import { AllChecksAccordion } from './AllChecksAccordion';` and `import type { MatchHardFilters } from '@/lib/types';`.

- [ ] **Step 6: Run the worksheet test suite**

Run: `npx jest --findRelatedTests components/match/MatchWorksheet.tsx components/match/AllChecksAccordion.tsx --maxWorkers=1 --no-coverage`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add components/match/AllChecksAccordion.tsx components/match/__tests__/AllChecksAccordion.test.tsx components/match/MatchWorksheet.tsx
git commit -m "feat(match): all-checks accordion — 14 hard filters with verdicts (stage 1)"
```

---

## Stage 2: Bucket-reason accordion (founder priority 2)

**Why:** Show why the match is in `main` / `lowConfidence` / `insufficientData` / `blocked`. Renders `worksheet.bucketReason` persisted in Stage 0b. Lives in `MatchDetailPanel` (the right rail, alongside AI Summary / Fit Score).

**Files:**
- Create: `components/match/BucketReasonCard.tsx`
- Create: `components/match/__tests__/BucketReasonCard.test.tsx`
- Modify: `components/match/MatchDetailPanel.tsx` (accept `bucketReason` prop, render card)
- Modify: `app/match/[id]/page.tsx` (parse `worksheet.bucketReason`, pass to panel)

- [ ] **Step 1: Write the failing test**

Create `components/match/__tests__/BucketReasonCard.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { BucketReasonCard } from '../BucketReasonCard';

test('renders bucket label + reason', () => {
  render(<BucketReasonCard bucketReason={{ bucket: 'lowConfidence',
    reason: 'TCE $4,000/day is below the $5,500/day breakeven for this size.' }} />);
  expect(screen.getByText(/Manual review/i)).toBeInTheDocument();
  expect(screen.getByText(/below the \$5,500\/day breakeven/)).toBeInTheDocument();
});

test('renders nothing when bucketReason absent (pre-this-PR data)', () => {
  const { container } = render(<BucketReasonCard bucketReason={undefined} />);
  expect(container).toBeEmptyDOMElement();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --findRelatedTests components/match/__tests__/BucketReasonCard.test.tsx --maxWorkers=1 --no-coverage`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

Create `components/match/BucketReasonCard.tsx`:

```tsx
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import type { BucketReason } from '@/lib/matching/bucket-reason';

const BUCKET_LABEL: Record<BucketReason['bucket'], { title: string; cls: string }> = {
  main:             { title: 'Main match',     cls: 'text-emerald-600' },
  lowConfidence:    { title: 'Manual review',  cls: 'text-amber-600' },
  insufficientData: { title: 'Not enough data', cls: 'text-slate-500' },
  blocked:          { title: 'Blocked',         cls: 'text-red-500' },
};

export function BucketReasonCard({ bucketReason }: { bucketReason?: BucketReason }) {
  if (!bucketReason) return null;
  const meta = BUCKET_LABEL[bucketReason.bucket];
  return (
    <Card size="sm" data-testid="bucket-reason-card">
      <CardHeader>
        <CardTitle className="text-xs uppercase tracking-wide text-ds-text-muted flex items-center justify-between">
          <span>Why this bucket</span>
          <span className={`font-medium ${meta.cls}`}>{meta.title}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-ds-text-muted leading-relaxed">{bucketReason.reason}</p>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --findRelatedTests components/match/__tests__/BucketReasonCard.test.tsx --maxWorkers=1 --no-coverage`
Expected: PASS — `Tests: 2 passed`.

- [ ] **Step 5: Thread the prop through page + panel**

In `components/match/MatchDetailPanel.tsx`, add `bucketReason?: import('@/lib/matching/bucket-reason').BucketReason;` to `MatchDetailPanelProps`, destructure it in `PanelContent`, and render `<BucketReasonCard bucketReason={bucketReason} />` directly under the AI Summary card (after `MatchDetailPanel.tsx:90`).

In `app/match/[id]/page.tsx`, after `worksheet` is parsed (line 88), pass `bucketReason={worksheet?.bucketReason}` into the `<MatchDetailPanel ... />` props object (the props are assembled around line 116-123).

- [ ] **Step 6: Run panel test suite**

Run: `npx jest --findRelatedTests components/match/MatchDetailPanel.tsx components/match/BucketReasonCard.tsx --maxWorkers=1 --no-coverage`
Expected: PASS. If a fixture-based `MatchDetailPanel` test asserts an exact card count, update it to expect the new card only when `bucketReason` is supplied (additive; do not rewrite unrelated expectations — PI3).

- [ ] **Step 7: Commit**

```bash
git add components/match/BucketReasonCard.tsx components/match/__tests__/BucketReasonCard.test.tsx components/match/MatchDetailPanel.tsx app/match/[id]/page.tsx
git commit -m "feat(match): bucket-reason card on detail panel (stage 2)"
```

---

## Stage 3: Freight waterfall accordion + breakeven line (founder priority 3)

**Why:** In `EconomicsTab`, show the 4-tier freight source ladder with the winning tier highlighted (from persisted `freight_rate_source` + `freight_rate_usd_per_mt`) and a breakeven floor line (DWT-tiered). The ladder text is static domain knowledge; only the winner and the rate come from persistence. To keep the breakeven floor a pure render (not a client constant lookup), persist it explicitly.

**Files:**
- Create: `lib/migrations/050-matches-breakeven.ts` (+ register in `lib/migrations/index.ts`)
- Modify: `lib/matching/matches-repository.ts` (`StoredMatch` + insert: `breakeven_tce_usd_per_day`)
- Modify: `lib/matching/persist-session-matches.ts` (compute via `breakevenTceByDwt(vesselDwt)`, persist)
- Create: `components/match/FreightWaterfall.tsx`
- Create: `components/match/__tests__/FreightWaterfall.test.tsx`
- Modify: `components/match/EconomicsTab.tsx` (render ladder + breakeven line; accept `storedBreakevenTce`)
- Modify: `components/match/MatchTabs.tsx` + `app/match/[id]/page.tsx` (thread `breakeven_tce_usd_per_day`)

- [ ] **Step 1: Write the failing migration test**

Create `lib/migrations/__tests__/050-matches-breakeven.test.ts`:

```ts
import Database from 'better-sqlite3';
import { runMigrations } from '@/lib/migrations';

test('migration 050 adds breakeven_tce_usd_per_day column', () => {
  const db = new Database(':memory:');
  runMigrations(db);
  const cols = db.prepare(`PRAGMA table_info(matches)`).all() as Array<{ name: string }>;
  expect(cols.map((c) => c.name)).toContain('breakeven_tce_usd_per_day');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest --findRelatedTests lib/migrations/__tests__/050-matches-breakeven.test.ts --maxWorkers=1 --no-coverage`
Expected: FAIL — column missing.

- [ ] **Step 3: Add the migration**

Create `lib/migrations/050-matches-breakeven.ts` (mirror `046-matches-consumption-estimated.ts` idempotent shape):

```ts
import type { Migration } from './types';

const migration050: Migration = {
  version: 50,
  name: 'matches-breakeven',
  up(db) {
    const names = new Set((db.prepare(`PRAGMA table_info(matches)`).all() as Array<{ name: string }>).map((c) => c.name));
    if (!names.has('breakeven_tce_usd_per_day')) {
      db.exec(`ALTER TABLE matches ADD COLUMN breakeven_tce_usd_per_day REAL`);
    }
  },
};

export default migration050;
```

Register it in `lib/migrations/index.ts` (import + add to the ordered array, following the existing `migration046`/`047`/`049` pattern). Confirm the real `Migration` type path before writing.

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest --findRelatedTests lib/migrations/__tests__/050-matches-breakeven.test.ts --maxWorkers=1 --no-coverage`
Expected: PASS.

- [ ] **Step 5: Persist the floor + extend StoredMatch**

In `lib/matching/matches-repository.ts`: add `breakeven_tce_usd_per_day: number | null;` to `StoredMatch` and the insert-input interface; add the column to the INSERT column list + args behind a `withBreakeven` capability check (mirror `withConsEst`/`withBallast` at lines 183/212).

In `lib/matching/persist-session-matches.ts`, where economics is resolved (around line 78-89), compute:

```ts
    const breakeven_tce_usd_per_day = vesselDwt != null ? breakevenTceByDwt(vesselDwt) : null;
```

and add `breakeven_tce_usd_per_day` to the insert input object (line ~153 area).

- [ ] **Step 6: Write the FreightWaterfall component test**

Create `components/match/__tests__/FreightWaterfall.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { FreightWaterfall } from '../FreightWaterfall';

test('highlights the winning tier (baltic) and shows the rate', () => {
  render(<FreightWaterfall source="baltic" rateUsdPerMt={24.5} />);
  fireEvent.click(screen.getByTestId('freight-waterfall-toggle'));
  const winner = screen.getByTestId('freight-tier-baltic');
  expect(winner).toHaveAttribute('data-winner', 'true');
  expect(winner).toHaveTextContent('$24.50');
});

test('unknown source → no winner highlighted, no crash', () => {
  render(<FreightWaterfall source={null} rateUsdPerMt={null} />);
  fireEvent.click(screen.getByTestId('freight-waterfall-toggle'));
  expect(screen.queryByTestId('freight-tier-baltic')).toHaveAttribute('data-winner', 'false');
});
```

- [ ] **Step 7: Run to verify it fails**

Run: `npx jest --findRelatedTests components/match/__tests__/FreightWaterfall.test.tsx --maxWorkers=1 --no-coverage`
Expected: FAIL — module not found.

- [ ] **Step 8: Implement FreightWaterfall**

Create `components/match/FreightWaterfall.tsx`. Map persisted `freight_rate_source` values to the static 4-tier ladder; highlight the winner; show the rate on the winning row only (no recompute):

```tsx
'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

const TIERS: Array<{ id: string; label: string; note: string }> = [
  { id: 'manual',    label: 'Tier 0 · Broker override',  note: 'Manually entered rate (highest trust).' },
  { id: 'email',     label: 'Tier 1 · Parsed from cargo email', note: 'Rate stated in the cargo order.' },
  { id: 'baltic',    label: 'Tier 2 · Baltic TC day-rate', note: '($/day × voyage days) ÷ tonnes.' },
  { id: 'estimated', label: 'Tier 3 · Model estimate',    note: 'Base rate × distance × DWT factors.' },
];

// Persisted freight_rate_source values → ladder id.
const SOURCE_ALIAS: Record<string, string> = {
  manual: 'manual', parsed: 'email', email: 'email', baltic: 'baltic', estimate: 'estimated', estimated: 'estimated',
};

export function FreightWaterfall({ source, rateUsdPerMt }: { source: string | null; rateUsdPerMt: number | null }) {
  const [open, setOpen] = useState(false);
  const winnerId = source ? SOURCE_ALIAS[source] ?? null : null;
  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-xs text-ds-text-muted hover:text-ds-text transition-colors"
        aria-expanded={open}
        data-testid="freight-waterfall-toggle"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        Freight source waterfall
      </button>
      {open && (
        <ul className="mt-1.5 pl-3 border-l-2 border-ds-border space-y-1" data-testid="freight-waterfall-body">
          {TIERS.map((t) => {
            const isWinner = t.id === winnerId;
            return (
              <li
                key={t.id}
                data-testid={`freight-tier-${t.id}`}
                data-winner={String(isWinner)}
                className={`text-xs ${isWinner ? 'text-ds-text font-medium' : 'text-ds-text-subtle'}`}
              >
                {isWinner ? '→ ' : '  '}{t.label}
                {isWinner && rateUsdPerMt != null && (
                  <span className="ml-1 font-mono">${rateUsdPerMt.toFixed(2)}/mt</span>
                )}
                <span className="block pl-3 text-ds-text-muted">{t.note}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
```

> Confirm the exact `freight_rate_source` string set actually written by `lib/matching/freight-resolver.ts` / `stored-match-economics.ts` and align `SOURCE_ALIAS` keys to it before finalizing (grep `freight_rate_source =`).

- [ ] **Step 9: Run to verify it passes**

Run: `npx jest --findRelatedTests components/match/__tests__/FreightWaterfall.test.tsx --maxWorkers=1 --no-coverage`
Expected: PASS — `Tests: 2 passed`.

- [ ] **Step 10: Render waterfall + breakeven line in EconomicsTab**

In `components/match/EconomicsTab.tsx`: add `storedBreakevenTce?: number | null;` to `EconomicsTabProps`. Near the freight-rate source badge, render `<FreightWaterfall source={freightRateSource ?? null} rateUsdPerMt={storedFreightRate ?? null} />`. Near the TCE headline (around the `storedTceUsdPerDay` block, line 736), add a breakeven line that compares the **persisted** TCE to the **persisted** floor — render only, no arithmetic on formula inputs:

```tsx
{storedBreakevenTce != null && (
  <div className="flex justify-between text-xs text-ds-text-muted" data-testid="breakeven-line">
    <span>Breakeven floor (size-tiered)</span>
    <span className="font-mono">
      ${storedBreakevenTce.toLocaleString('en-US')}/day
      {storedTceUsdPerDay != null && (
        <span className={storedTceUsdPerDay >= storedBreakevenTce ? 'text-emerald-600 ml-1' : 'text-red-500 ml-1'}>
          {storedTceUsdPerDay >= storedBreakevenTce ? '✓ above' : '✗ below'}
        </span>
      )}
    </span>
  </div>
)}
```

(The ✓/✗ is a comparison of two persisted scalars, not a formula recompute — allowed.)

- [ ] **Step 11: Thread `breakeven_tce_usd_per_day` through**

In `components/match/MatchTabs.tsx`, add a `storedBreakevenTce` prop and forward it into `<EconomicsTab storedBreakevenTce={...} />` (mirror `storedTceUsdPerDay` at `MatchTabs.tsx:47`/economics block). In `app/match/[id]/page.tsx`, pass `storedBreakevenTce={storedMatch.breakeven_tce_usd_per_day}` into `<MatchTabs ... />` (line 284 area, alongside `storedTceUsdPerDay`).

- [ ] **Step 12: Run economics suite**

Run: `npx jest --findRelatedTests components/match/EconomicsTab.tsx components/match/FreightWaterfall.tsx lib/matching/matches-repository.ts --maxWorkers=1 --no-coverage`
Expected: PASS.

- [ ] **Step 13: Commit**

```bash
git add lib/migrations/050-matches-breakeven.ts lib/migrations/index.ts lib/migrations/__tests__/050-matches-breakeven.test.ts lib/matching/matches-repository.ts lib/matching/persist-session-matches.ts components/match/FreightWaterfall.tsx components/match/__tests__/FreightWaterfall.test.tsx components/match/EconomicsTab.tsx components/match/MatchTabs.tsx app/match/[id]/page.tsx
git commit -m "feat(economics): freight-source waterfall + breakeven floor line (stage 3)"
```

---

## Stage 4: Shared `<LogicDisclosure>` primitive (DRY refactor)

**Why:** Stages 1, 3 (and 5–8) each inline the same `useState` + Chevron toggle that `DraftCalcBreakdown` also has. Extract one primitive; refactor the new accordions to use it. Keep `DraftCalcBreakdown`'s public props unchanged (it is consumed by `MatchWorksheet` and `app/matches/MatchesClient.tsx:19`).

**Files:**
- Create: `components/match/LogicDisclosure.tsx`
- Create: `components/match/__tests__/LogicDisclosure.test.tsx`
- Modify: `components/match/AllChecksAccordion.tsx`, `components/match/FreightWaterfall.tsx` (use primitive)

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { LogicDisclosure } from '../LogicDisclosure';

test('toggles children, label always visible', () => {
  render(<LogicDisclosure label="Details" testId="x"><p>hidden body</p></LogicDisclosure>);
  expect(screen.getByText('Details')).toBeInTheDocument();
  expect(screen.queryByText('hidden body')).not.toBeInTheDocument();
  fireEvent.click(screen.getByTestId('x-toggle'));
  expect(screen.getByText('hidden body')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest --findRelatedTests components/match/__tests__/LogicDisclosure.test.tsx --maxWorkers=1 --no-coverage`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the primitive**

```tsx
'use client';

import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

export function LogicDisclosure({ label, testId, children }: { label: ReactNode; testId: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-xs text-ds-text-muted hover:text-ds-text transition-colors"
        aria-expanded={open}
        data-testid={`${testId}-toggle`}
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {label}
      </button>
      {open && (
        <div className="mt-1.5 pl-3 border-l-2 border-ds-border" data-testid={`${testId}-body`}>
          {children}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest --findRelatedTests components/match/__tests__/LogicDisclosure.test.tsx --maxWorkers=1 --no-coverage`
Expected: PASS.

- [ ] **Step 5: Refactor AllChecksAccordion + FreightWaterfall to use it**

Replace the inline toggle/body in both with `<LogicDisclosure label={...} testId="all-checks">…</LogicDisclosure>` (and `testId="freight-waterfall"`). Keep the same `data-testid` suffixes (`-toggle`, `-body`) so Stage 1/3 tests stay green unchanged.

- [ ] **Step 6: Run the affected suites**

Run: `npx jest --findRelatedTests components/match/AllChecksAccordion.tsx components/match/FreightWaterfall.tsx components/match/LogicDisclosure.tsx --maxWorkers=1 --no-coverage`
Expected: PASS — Stage 1 & 3 tests pass against the refactored components.

- [ ] **Step 7: Commit**

```bash
git add components/match/LogicDisclosure.tsx components/match/__tests__/LogicDisclosure.test.tsx components/match/AllChecksAccordion.tsx components/match/FreightWaterfall.tsx
git commit -m "refactor(match): extract shared LogicDisclosure primitive (stage 4)"
```

---

## Stages 5–8: Secondary accordions (pure presentation, prioritise per founder)

These consume only **already-persisted** data (`worksheet_json` + `fit_breakdown`) and reuse `<LogicDisclosure>`. Each follows the identical TDD shape as Stage 1 (failing RTL test → component → wire → suite → commit). No persistence changes.

- [ ] **Stage 5 — Timing / readiness detail.** New `ReadinessDetail` block under the `⏱ Time` row in `MatchWorksheet.tsx`. Source: `worksheet.readiness` (`verdict`, `gapDays`, `arrivalDate`, `laycanStart/End`, `sailingDays`, `speedKn`, `distanceNm` — all persisted, used today only as one-line text at `MatchWorksheet.tsx:58`). Render verdict band + the gap arithmetic that is **already computed and stored** (`gapDays`), not recomputed. Test: collapsed→expanded, verdict label, "no data" when `verdict==='unknown'`.

- [ ] **Stage 6 — IMSBC / hold-cleanliness.** New block in `MatchWorksheet.tsx` (or VesselsTab). Source: `worksheet.hardFilters.imsbc` (now persisted via Stage 0) for group verdict + reason; hold-cleanliness surfaces via `match.issues` strings already shown in the issues list. Render group verdict (pass/caution/fail) + reason. Test: shows IMSBC reason when present; neutral state when `imsbc` absent.

- [ ] **Stage 7 — Vetting 5-factor.** New `VettingBreakdown` accordion in `VesselsTab.tsx`. Source: the `vetting` component inside `fit_breakdown` (`rationale` + `bracketData`), already persisted and already parsed in `MatchDetailPanel.tsx:62`. Parse the same `fit_breakdown` JSON, pull the `vetting` component, render its rationale; if `bracketData` encodes per-factor sub-scores, list them. No recompute — render the stored rationale/bracket string. Test: renders vetting rationale; empty state when no `vetting` component.

- [ ] **Stage 8 — Utilisation + charterer notes.** Extend the Fit Score card in `MatchDetailPanel.tsx`: the `utilisation` and (if present) `charterer` components already render with rationale; add a `<LogicDisclosure>` that surfaces `bracketData` (cargo/capacity ratio, peak band) and the charterer-tier penalty already in `fit_breakdown` notes / `sanctionsPenalty`. Pure render of parsed `fit_breakdown`. Test: utilisation bracket shown; charterer penalty line shown when tier penalty > 0.

Each stage commit message: `feat(match): <name> accordion (stage N)`.

---

## Testing Strategy

- **Unit (persistence):** Stages 0, 0b, 3 — round-trip through an in-memory better-sqlite3 DB (`runMigrations` + `persistSessionMatches` + `getMatch`), asserting the new JSON keys/columns. Behavioral, not string-match (PI2).
- **Pure-function:** Stage 0b `deriveBucketReason` table-driven over all five partition branches.
- **Component (RTL):** every accordion — collapsed-by-default, expands on click, renders persisted fields, and a graceful "no data" branch for pre-this-PR matches. These are real render+interaction tests (PI2).
- **Full run before PR:** `npx tsc --noEmit` then `npx jest --maxWorkers=1 --no-coverage` on the changed `lib/matching`, `lib/migrations`, and `components/match` paths. Do NOT spawn parallel jest waves > 2 on the VPS (OOM risk; `--maxWorkers=1`).

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| **Pre-this-PR persisted matches** lack `hardFilters[8..14]`, `sanctions`, `bucketReason`, `breakeven_tce_usd_per_day` | Every component has an explicit absent-field branch (tested). Optionally re-run demo-seed regen to backfill; not required for correctness. |
| **`session.matches` ephemerality** — building accordions off `sessionMatch` would blank out after reload | All stages source from `storedMatch.*` (DB), verified by tests that never populate a session. |
| **`freight_rate_source` string drift** — actual values may differ from recon's tier names | Stage 3 Step 8 requires grepping the real `freight_rate_source =` writer and aligning `SOURCE_ALIAS` before finalizing. |
| **Breakeven as client logic** — a DWT→floor lookup in the component would be a recompute | Stage 3 persists `breakeven_tce_usd_per_day`; the component renders the scalar. Only a ✓/✗ scalar comparison happens client-side. |
| **PI3 — existing tests asserting exact `hardFilters` key sets / panel card counts** | Additive changes; update only the directly-contradicted assertion, ≤5 edits. If a change would force >5 expectation rewrites → STOP and escalate. |
| **Migration ordering** — wrong version number collides | New migration is `050` (latest is `049`); register in `lib/migrations/index.ts` ordered array. Migration test asserts the column exists post-`runMigrations`. |
| **RSC/`'use client'` boundary** — accordions need `useState` | Each interactive accordion starts with `'use client'`; cards with no state (`BucketReasonCard`) stay server-renderable. Before touching RSC boundaries, WebFetch nextjs.org/docs/app. |

## Definition of Done

- [ ] `npx tsc --noEmit` clean.
- [ ] All new + existing `lib/matching`, `lib/migrations`, `components/match` jest suites green (`--maxWorkers=1`).
- [ ] Founder priority 1 (all-checks), 2 (bucket-reason), 3 (freight waterfall + breakeven) shipped and visible on `/match/[id]`.
- [ ] No client-side recompute of scoring/economics formulas introduced; no new LLM calls; verified by diff review.
- [ ] Every accordion degrades to a neutral state on pre-this-PR persisted matches.
- [ ] Secondary stages 5–8 either implemented or explicitly deferred by the founder with their data-source confirmed present.
- [ ] `git status --porcelain` empty.

## Spec-Coverage Self-Review

- Founder priority 1 → Stage 1 (+ Stage 0 persistence). ✅
- Founder priority 2 → Stage 2 (+ Stage 0b). ✅
- Founder priority 3 → Stage 3. ✅
- Six secondary candidates (timing, IMSBC, vetting, sanctions, utilisation, charterer) → Stages 5–8 + sanctions folded into Stage 0 persistence and the issues list. ✅
- "Render persisted fields only, no recompute, no LLM" → enforced by Constraints section + Stage 0/0b/3 persistence + Risks table. ✅
- "Data-gap → minimal persist as a separate stage" → Stages 0, 0b, and the column add in Stage 3. ✅

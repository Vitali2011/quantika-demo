# RECON: LOA Berth Gate — Data Coverage & Implementation Path

> Date: 2026-06-19 | Branch: claude/1781841791-recon-loa | Task #8 LOA campaign

---

## Executive Summary

LOA gate is **implementable but requires two pre-requisites**:
1. Add `vessel.loa` to `MatchWorksheet` type + both worksheet builders
2. Accept 65% port coverage + 56% vessel LOA coverage as the operating baseline (missing → graceful pass)

Impact on existing demo data: **~3% of LOA-checkable pairs would be demoted** — low noise, but the real protection is catching the tail of niche restrictive ports (<200m maxLOA) where it matters most.

---

## Q1 — Data Coverage: `maxLOA` in port-master.json & vessel `loa` parse reliability

### port-master.json

- **File**: `data/ports/port-master.json` (483 ports, 10,781 lines)
- **Field**: `maxLOA` (number, metres) — top-level optional field on port objects
- **Coverage**: 314/483 ports have `maxLOA` **(65%)**; 169 ports (35%) do **NOT**

Key ports **missing** `maxLOA` (critical for Black Sea / Med routes):
```
TRKRS Karasu, TRIST Istanbul, UANLK Mykolaiv, UAODS Odesa,
ROCND Constanta, BGVAR Varna, BGBOJ Burgas, RUNVS Novorossiysk,
GRPIR Piraeus, TRALI Aliaga, EGALY Alexandria, DEBRE Bremen,
NLAMS Amsterdam, BEGNE Ghent, FRDKK Dunkirk, ...
```

Restrictive ports with `maxLOA < 200m` (most impactful gate targets):
```
RUROV  Rostov-on-Don  140m
UAKHE  Kherson        140m  
SESOO  Söderhamn      170m
TNSFA  Sfax           180m
AEAJM  Ajman          180m
RUARH  Arkhangelsk    190m
BDMGL  Mongla         190m
KZAAU  Aktau          160m
```

**Conclusion**: port `maxLOA` data is **real and present** but covers mainly deeper-draft / modern ports. Black Sea inner ports (Mykolaiv, Odesa, Kherson, Rostov) are missing — exactly where LOA constraints exist. Data backfill needed for these before the gate has real bite.

### Vessel `loa` in ParsedVessel

- **Type**: `ParsedVessel.loa: number | null` (`lib/types.ts:266`) — plain number, no ConfidenceField
- **Parsing**: `lib/schemas/parse-vessel.ts:59` uses `confidenceFieldNumber`; `parse-vessel-helpers.ts` applies:
  - Zero-guard: `nullIfZeroNumeric` 
  - SQM/CM guard: `nullIfSqmOrCmDimension` (prevents "2900sqm" → loa=2900)
  - Prompt: `lib/prompts/parse-vessel.ts:224-256` has explicit anti-patterns for sqm/bag confusion
- **Demo coverage**: 51/90 demo vessels (56%) have LOA parsed
- **Range**: 69m–200m (avg 112m) — appropriate for MPP/general cargo/handysize
- **Reliability**: guards are robust; false positives rare per prompt anti-pattern rules

### Critical Gap: `loa` NOT in `MatchWorksheet.vessel`

`MatchWorksheet.vessel` type (`lib/types.ts:470-483`) does **not include `loa`**:
```typescript
vessel: {
  draftMax: number | null;
  grainCapacity: number | null;
  grainCapacityUnit: 'cbm' | 'cbft' | null;
  geared: boolean | null;
  vesselType: string | null;
  flag: string | null;
  built: number | null;
  pandi: string | null;
  classSociety: string | null;
  lastCargoes: string | null;
  dwtSummer: number | null;
  dwcc: number | null;
  // ← no loa field
}
```

Both worksheet builders omit it:
- `scripts/demo-seed/regenerate-matches.ts:481–493` — `buildWorksheet()`
- `lib/matching/persist-session-matches.ts:129–132` — live persist path

This means: even though `pair-analyzer.ts:145` passes `vesselLoa: v.loa ?? null` to `runHardFilters`, the result is **not stored in worksheet_json**. Any future LOA display in DD panel requires adding `loa` to the worksheet vessel shape.

---

## Q2 — Where to Add `checkLOA`: Parallel to `checkDraftLaden`

### Existing draft gate anatomy

```
port-master.ts:
  portCanHandleDraft(port, vesselDraftM) → DraftCheckResult

match-filters.ts:
  checkDraft(port, vesselDraftM) → FilterResult          ← simple wrapper
  checkDraftLaden(port, staticDraftM, estimate, tons) → FilterResult  ← laden estimate
  runHardFilters(input) → HardFilterResult
    - draft = checkDraftLaden(input.originPort, ...)
    - destDraft = checkDraftLaden(input.destinationPort, ...)
```

### Where to add checkLOA

**Step 1 — `lib/sailing/port-master.ts`**: Add `portCanHandleLOA()` mirroring `portCanHandleDraft`:
```typescript
// After line ~116 (portCanHandleDraft)
export function portCanHandleLOA(
  port: string | null | undefined,
  vesselLoaM: number | null | undefined,
): { ok: boolean; portLoaM: number | null; reason?: string } {
  const master = port ? getPortMaster(port) : null;
  if (!master) return { ok: true, portLoaM: null };
  if (vesselLoaM == null || !Number.isFinite(vesselLoaM) || vesselLoaM <= 0)
    return { ok: true, portLoaM: master.maxLOA ?? null };
  if (master.maxLOA == null) return { ok: true, portLoaM: null };
  if (vesselLoaM > master.maxLOA) {
    return {
      ok: false,
      portLoaM: master.maxLOA,
      reason: `vessel LOA ${vesselLoaM}m exceeds berth max LOA ${master.maxLOA}m at ${master.name}`,
    };
  }
  return { ok: true, portLoaM: master.maxLOA };
}
```

**Step 2 — `lib/sailing/match-filters.ts`**: Add `checkLOA()` (≈line 39-45, after `checkDraft`):
```typescript
export function checkLOA(
  port: string | null | undefined,
  vesselLoaM: number | null | undefined,
): FilterResult {
  const r = portCanHandleLOA(port, vesselLoaM);
  if (!r.ok) return { pass: false, reason: r.reason };
  return { pass: true };
}
```

**Step 3 — `HardFilterInput` interface** (≈line 549-582): Already has `vesselLoa?: number | null` — no change needed.

**Step 4 — `HardFilterResult.checks`** (≈line 584-606): Add `loaBerth?: FilterResult; destLoaBerth?: FilterResult;`

**Step 5 — `runHardFilters()`** (≈line 608-701): Add after draft checks (≈line 612-625):
```typescript
const loaBerth = checkLOA(input.originPort, input.vesselLoa ?? null);
const destLoaBerth = checkLOA(input.destinationPort ?? null, input.vesselLoa ?? null);
```
Add to `failures[]` (≈line 678):
```typescript
if (!loaBerth.pass && loaBerth.reason) failures.push(loaBerth.reason);
if (!destLoaBerth.pass && destLoaBerth.reason) failures.push(destLoaBerth.reason);
```

Note: `checkVesselDimensions()` already checks `cargoMaxLoaM` (cargo-stated LOA limit) — that's a **cargo constraint** check. The new `checkLOA` is a **port berth constraint** check — different dimension, parallel to draft.

---

## Q3 — Impact Estimate: Match Demotion

### Demo data simulation

| Metric | Value |
|--------|-------|
| Demo vessels with LOA | 51/90 (56%) |
| Demo cargoes with origin port | 146/146 (100%) |
| Possible vessel-cargo pairs | 7,446 |
| Pairs where port maxLOA known | 2,397 (32%) |
| Pairs where port maxLOA unknown | 5,049 (68% — graceful pass) |
| **Pairs that would FAIL LOA gate** | **75 (3.1% of checkable)** |
| Pairs that would pass | 2,322 |

### Assessment

**Low demotion rate, but data gaps are the limiter**:
- 68% of pairs are unchecked because Black Sea / Med ports lack `maxLOA` (Odesa, Constanta, Istanbul etc.)
- Of what IS checkable, only 3.1% fail — mostly small vessels (69-100m) against niche restrictive ports
- Most demo vessels (avg 112m LOA) are well within typical port limits (330-430m for major ports)
- Truly restrictive ports (<200m) affect river/coastal routes: Rostov-on-Don, Kherson, Arkhangelsk, Aktau

**Recommendation**: LOA gate is safe to enable without risking match noise **on current data**. The gate will have near-zero impact until port `maxLOA` data is backfilled for Black Sea inner ports.

**Regen required**: When gate is enabled in `runHardFilters`, existing seed matches won't have `loaBerth` in `hardFilters` (pre-gate data). `regenerate-matches.ts --rebuild-worksheet` would need to re-run hard filters, or the check can be added as optional in `HardFilterResult.checks`.

---

## Q4 — DD Panel: Activating LOA Row in MatchWorksheet

### Current state

`components/match/MatchWorksheet.tsx` renders a `rows[]` table. The `🌊 Draft` row (line 126-143) is the exact pattern:

```typescript
{
  label: '🌊 Draft',
  vessel: v.draftMax != null ? `${v.draftMax} m` : '—',
  cargoPort: hf.draft.reason ? hf.draft.reason : '—',
  verdict: verdictBadge(hf.draft.pass, hf.draft.reason),
  detail: <DraftCalcBreakdown ... />,
}
```

### Required changes to activate LOA row

**A. Add `loa` to `MatchWorksheet.vessel` type** (`lib/types.ts:470-483`):
```typescript
vessel: {
  // ... existing fields ...
  loa?: number | null;   // add this
}
```

**B. Add `loa` to `buildWorksheet()` vessel** (`scripts/demo-seed/regenerate-matches.ts:481-493`):
```typescript
vessel: {
  // ... existing ...
  loa: vessel?.loa ?? null,
}
```

**C. Add `loa` to live persist path** (`lib/matching/persist-session-matches.ts` — find the vessel object, mirror above)

**D. Add `loaBerth` / `destLoaBerth` to `MatchHardFilters`** and `HardFilterResult.checks` (see Q2)

**E. Add LOA row to MatchWorksheet `rows[]`** after Draft row:
```typescript
...(hf.loaBerth !== undefined || v.loa != null) ? [{
  label: '📏 LOA',
  vessel: v.loa != null ? `${v.loa} m` : '—',
  cargoPort: (() => {
    const loadLOA = getPortMaster(c.loadPort)?.maxLOA;
    const dischLOA = getPortMaster(c.dischargePort)?.maxLOA;
    if (!loadLOA && !dischLOA) return '—';
    return [
      loadLOA ? `load: max ${loadLOA}m` : null,
      dischLOA ? `disch: max ${dischLOA}m` : null,
    ].filter(Boolean).join(' / ');
  })(),
  verdict: hf.loaBerth !== undefined
    ? verdictBadge(
        hf.loaBerth.pass && (hf.destLoaBerth?.pass ?? true),
        (!hf.loaBerth.pass ? hf.loaBerth.reason : hf.destLoaBerth?.reason) ?? undefined,
      )
    : '— Not evaluated',
}] : [],
```

Note: `MatchWorksheet.tsx` is **RSC** (no `'use client'`), so `getPortMaster` can be called directly — unlike `MatchesClient.tsx` which is client-only and uses the `attachPortLimits` server-side injection pattern. LOA limits for the DD panel can follow the same `attachPortLimits` approach OR be read directly (RSC path already does this for draft at line 139-140).

**Server-side injection via `attachPortLimits`** (consistent with draft pattern for list view):
Extend `PortLimitFields` in `lib/matching/attach-port-limits.ts` to add:
```typescript
load_port_loa_limit_m: number | null;
discharge_port_loa_limit_m: number | null;
```

---

## Q5 — Consumer Parity: list == detail

Two rendering surfaces consume `worksheet_json`:

| Surface | File | Pattern |
|---------|------|---------|
| **List** (matches page) | `app/matches/MatchesClient.tsx:938-975` | Parses `worksheet_json` client-side; `c.factor === 'draft'` → `<DraftCalcBreakdown>` |
| **Detail** (match/[id] page) | `app/match/[id]/page.tsx:339` → `<MatchWorksheet>` | RSC; parses `worksheet_json` server-side |

For **list parity**: when `c.factor === 'loa'` (if LOA becomes a scored factor in fit breakdown), render `<LOABreakdown>` same as `DraftCalcBreakdown` pattern. The `MatchesClient.tsx` already threads `match.load_port_limit_m` for draft — add `match.load_port_loa_limit_m` via `attachPortLimits`.

For **detail parity**: `MatchWorksheet.tsx` LOA row uses `getPortMaster` directly (RSC). As long as `v.loa` is stored in `worksheet_json`, it will display.

**Parity requirement**: both surfaces must come from the SAME persisted `worksheet_json.vessel.loa` — cannot read live from `parsed_results` separately (would break for seed data after emails are gone).

---

## Implementation Checklist (for follow-up PR)

### Phase 1 — Data infrastructure (required before any meaningful gate)
- [ ] `lib/types.ts`: Add `loa?: number | null` to `MatchWorksheet.vessel`
- [ ] `lib/types.ts`: Add `loaBerth?: FilterResult; destLoaBerth?: FilterResult` to `HardFilterResult.checks` / `MatchHardFilters`
- [ ] `lib/sailing/port-master.ts`: Add `portCanHandleLOA()` function
- [ ] `lib/sailing/match-filters.ts`: Add `checkLOA()` + wire into `runHardFilters()`
- [ ] `scripts/demo-seed/regenerate-matches.ts:buildWorksheet()`: Add `loa: vessel?.loa ?? null`
- [ ] `lib/matching/persist-session-matches.ts`: Mirror above in live persist path

### Phase 2 — Display
- [ ] `lib/matching/attach-port-limits.ts`: Add `load_port_loa_limit_m` / `discharge_port_loa_limit_m`
- [ ] `app/matches/page.tsx`: Thread LOA limits from `attachPortLimits`
- [ ] `app/matches/MatchesClient.tsx`: Add `load_port_loa_limit_m` to type; LOA factor display
- [ ] `components/match/MatchWorksheet.tsx`: Add LOA row after Draft row

### Phase 3 — Data backfill (for gate to have real impact)
- [ ] Backfill `maxLOA` for Black Sea inner ports: Odesa, Mykolaiv, Kherson, Constanta, Novorossiysk, Varna, Istanbul, Piraeus — currently missing in `port-master.json`
- [ ] Re-run `regenerate-matches.ts` to backfill `worksheet_json.vessel.loa` for existing seed matches

---

## Root Cause Diagnosis

The LOA gate gap is NOT a filter logic gap (pair-analyzer already passes `vesselLoa` to `runHardFilters`). The root cause is **two storage gaps**:

1. **`worksheet_json.vessel` schema** does not include `loa` → display impossible without re-query
2. **port-master.json `maxLOA` coverage** is 65% — the most impactful Black Sea ports lack the field

Enabling `checkLOA()` in `runHardFilters` today would add the hard filter logic, but:
- Existing stored matches won't have `loaBerth` in their persisted `hardFilters` (pre-gate matches show "not evaluated")
- The DD panel cannot show vessel LOA vs port maxLOA without `v.loa` in the worksheet
- 68% of pairs would still pass on missing data (correct per conservative design)

# Recon: CII Source Provenance Bug

## ROOT CAUSE

`lib/matching/due-diligence.ts:401` — `VETTING_LOOKUP.cii.source` hardcodes `SRC.equasis`
(`'Equasis'`) for **all** CII ratings regardless of actual provenance. When the rating is an
age/type estimate (`ciiSource: 'estimated'`) or an AI guess (`ciiSource: 'llm-fallback'`), the
DD panel still shows `Источник: Equasis` — a false disclosure.

The `detail` copy at line 402-403 compounds the problem:
> `'Рейтинг углеродной интенсивности (CII, A–E) из Equasis. ...'`
— this text says "из Equasis" even for estimated ratings.

---

## 1. `vessel.ciiSource` field

### Definition
`lib/types.ts:300`
```typescript
ciiSource?: 'imo-public' | 'estimated' | 'llm-fallback' | null;
```

### Values
| Value | Meaning |
|---|---|
| `'imo-public'` | Real rating from `lib/sample-data/imo/cii.json` (record with no `source` marker or `source !== 'estimated'`) |
| `'estimated'` | Derived from age/type rule in `lib/imo/cii-estimate.ts` (built ≥ 2008 → C; 1995-2007 → D; < 1995 → E) |
| `'llm-fallback'` | AI-estimated when IMO absent from the static dataset |
| `null` / `undefined` | Not looked up yet |

### Corresponding type in the lookup layer
`lib/imo/cii-lookup.ts:7`
```typescript
export type CiiSource = 'imo-public' | 'estimated' | 'llm-fallback';
```

### Where `ciiSource` is populated (write sites)

1. **Demo seed** — `scripts/demo-seed/regenerate-matches.ts:60-69`
   ```typescript
   // hydrateCiiRatings() calls lookupCii with callLlm stubbed to 'unknown'
   vessel.ciiSource = source;  // source from CiiResult.source
   ```
   Source comes from `lookupCii()` → `lookupInDataset()` preserves the `record.source` field
   from `cii.json` (`'estimated'` or absent → `'imo-public'`); LLM miss → `'llm-fallback'`.

2. **Match detail page** — `app/match/[id]/page.tsx:183-188`
   ```typescript
   // Only runs when vessel has CII D/E restriction
   ciiSource = (await lookupCii(vessel.imo, { callLlm: async () => 'unknown' })).source;
   const vesselWithCii = vessel && ciiSource ? { ...vessel, ciiSource } : vessel;
   ```
   `vesselWithCii` (with `ciiSource` injected) is passed to `buildDueDiligence()` at line 210.

### Where `ciiSource` is NOT populated (read gaps)

`computeVesselVetting()` in `lib/sailing/vessel-vetting.ts:136-138` accepts only:
```typescript
vessel: Pick<ParsedVessel, 'flag' | 'built' | 'classSociety' | 'pandi' | 'ciiRating'>
```
`ciiSource` is stripped from the Pick — `scoreCii()` only uses the rating letter. The provenance
is available on `args.vessel?.ciiSource` in `buildVetting` but is never read.

---

## 2. All consumers of the CII DD category and its source label

### The bug site
`lib/matching/due-diligence.ts:400-404` — static lookup table:
```typescript
const VETTING_LOOKUP = {
  // ...
  cii: {
    source: SRC.equasis,          // ← BUG: hardcoded, always 'Equasis'
    detail: 'Рейтинг углеродной интенсивности (CII, A–E) из Equasis. ...',  // ← BUG: "из Equasis"
  },
};
```

### Where `source` from VETTING_LOOKUP flows
`lib/matching/due-diligence.ts:663-665` (inside `buildVetting()`):
```typescript
const source =
  f.key === 'age' ? SRC.equasis : VETTING_LOOKUP[f.key]?.source ?? null;
checks.push({ label: f.label, state, evidence: f.rationale, detail, source });
```
For `f.key === 'cii'` this always returns `'Equasis'`.

### UI rendering
`components/match/DDCheckRow.tsx:118-122` — rendered inside the "Подробнее" accordion:
```tsx
{source && (
  <span className="inline-block text-xs ...">
    Источник: {source}   {/* shows "Источник: Equasis" even for estimates */}
  </span>
)}
```

### Other consumers of `ciiRating` (not using the source label)
| File | Line | What it does |
|---|---|---|
| `lib/sailing/vessel-vetting.ts:147` | `scoreCii(vessel.ciiRating)` | Produces `VettingFactor.key='cii'`, no source |
| `lib/sailing/fit-breakdown.ts:497-516` | `scoreVetting()` | Rolls up vetting into fit-% component, no source label |
| `components/match/VesselsTab.tsx:93` | `<CiiRatingBadge source={vessel.ciiSource ?? 'imo-public'} />` | **Correct** — uses real `ciiSource`, adds asterisk for estimates |
| `components/vessel/CiiRatingBadge.tsx:28-29` | `isEstimated = source === 'estimated' || source === 'llm-fallback'` | Properly renders `CII D*` with tooltip disclosure |
| `app/match/[id]/page.tsx:184-188` | Hydrates `ciiSource` before `buildDueDiligence` | Source is available but `buildVetting` ignores it |

---

## 3. How PSC handles its source (comparison pattern)

### PSC source — single, truly Equasis
`lib/matching/due-diligence.ts:395-399`:
```typescript
psc: {
  source: SRC.equasis,  // ← correct: PSC data IS from Equasis
  detail: 'История задержаний судна ... по базе Equasis.',
},
```
PSC data always comes from the `psc_detention_history` DB table populated by Equasis scraping
(`lib/market/psc-repository.ts:39`). The `detentionCount` passed to `computeVesselVetting()` has
one source only — no provenance branching needed.

### Key difference from CII
PSC has no `pscSource` field and never needs one — the data source is invariant (always Equasis).
CII has three possible provenances (`imo-public` / `estimated` / `llm-fallback`) surfaced via
`ParsedVessel.ciiSource`, but `buildVetting` ignores this field.

**Pattern to follow for the fix:** `CiiRatingBadge.tsx` already does the right thing — it reads
`vessel.ciiSource` and branches label/tooltip. The DD panel's `buildVetting` should do the same.

---

## 4. What the UI shows for the source line

When the user expands "Подробнее" on the CII check row:
- **Source badge**: `Источник: Equasis` — always, regardless of actual provenance
- **Detail text**: `Рейтинг углеродной интенсивности (CII, A–E) из Equasis. A/B/C — в норме, D — внимание, E — повышенный риск.`

Both are wrong when `ciiSource === 'estimated'` or `'llm-fallback'`.

For comparison, `CiiRatingBadge` in `VesselsTab` (same page!) correctly shows:
- Label: `CII D*` (asterisk signals estimate)
- Tooltip: `CII rating D* (2025, оценка по возрасту/типу — не официальный рейтинг IMO)`

So the **same match detail page** shows the correct asterisk in one widget (VesselsTab badge)
and the wrong "Equasis" source in another (DD panel). Internally consistent with itself only if
the vessel had a real IMO rating.

---

## Fix Plan

### Minimal change: 1 function, `lib/matching/due-diligence.ts`

**Step 1** — Add a helper after the `SRC` const (~line 174):
```typescript
function ciiSourceBadge(src: string | null | undefined): string {
  if (src === 'estimated') return 'Оценка (возраст/тип судна)';
  if (src === 'llm-fallback') return 'Оценка ИИ';
  return SRC.equasis; // 'imo-public' or absent → real Equasis rating
}

function ciiDetailCopy(src: string | null | undefined): string {
  if (src === 'estimated') {
    return 'Рейтинг углеродной интенсивности (CII, A–E) — оценка по возрасту/типу судна (не официальный рейтинг IMO). A/B/C — в норме, D — внимание, E — повышенный риск эксплуатационных ограничений.';
  }
  if (src === 'llm-fallback') {
    return 'Рейтинг углеродной интенсивности (CII, A–E) — оценка ИИ (не официальный рейтинг IMO). A/B/C — в норме, D — внимание, E — повышенный риск эксплуатационных ограничений.';
  }
  return 'Рейтинг углеродной интенсивности (CII, A–E) из Equasis. A/B/C — в норме, D — внимание, E — повышенный риск эксплуатационных ограничений.';
}
```

**Step 2** — In `buildVetting()` (~line 659-665), branch CII specifically:
```typescript
const detail =
  f.key === 'age'
    ? ageDetail(args.vessel.built, refYear, f.rationale)
    : f.key === 'cii'
      ? ciiDetailCopy(args.vessel?.ciiSource)   // ← branch by real provenance
      : VETTING_LOOKUP[f.key]?.detail ?? null;
const source =
  f.key === 'cii'
    ? ciiSourceBadge(args.vessel?.ciiSource)   // ← branch by real provenance
    : f.key === 'age'
      ? SRC.equasis
      : VETTING_LOOKUP[f.key]?.source ?? null;
```

**Step 3** — Test to add (`__tests__/due-diligence-cii-source.test.ts` or inline in existing
`due-diligence` test file):
```typescript
// Behavioral: DD panel CII check shows 'Оценка' source when ciiSource=estimated
it('CII check source badge = estimate label when vessel.ciiSource is estimated', () => {
  const args = buildTestArgs({ vessel: makeVessel({ ciiRating: 'D', ciiSource: 'estimated' }) });
  const dd = buildDueDiligence(args);
  const vetting = dd.categories.find(c => c.key === 'vetting')!;
  const ciiCheck = vetting.checks.find(c => c.label === 'CII rating')!;
  expect(ciiCheck.source).toBe('Оценка (возраст/тип судна)');
  expect(ciiCheck.source).not.toContain('Equasis');
});

it('CII check source badge = Equasis when vessel.ciiSource is imo-public', () => {
  const args = buildTestArgs({ vessel: makeVessel({ ciiRating: 'B', ciiSource: 'imo-public' }) });
  const dd = buildDueDiligence(args);
  const vetting = dd.categories.find(c => c.key === 'vetting')!;
  const ciiCheck = vetting.checks.find(c => c.label === 'CII rating')!;
  expect(ciiCheck.source).toBe('Equasis');
});
```

### Scope
- **1 file changed**: `lib/matching/due-diligence.ts`
- **1 test file**: new or expanded `__tests__/due-diligence.test.ts`
- No DB migration needed (no new columns)
- No UI component changes needed (DDCheckRow already renders `source` as-is)
- No `vessel-vetting.ts` changes needed (source is a presentation concern, not a scoring concern)

### NOT in scope
- Changing `VETTING_LOOKUP.cii.source` directly — it's the static fallback, keep it as
  `SRC.equasis` for `'imo-public'` case; the fix branches before looking it up
- Changing `computeVesselVetting` pick type to include `ciiSource` — provenance is
  presentation-only, scoring doesn't need it
- `CiiRatingBadge` in `VesselsTab` — already correct, no change needed
- PSC — source is correctly Equasis, no change needed

---

## Call-site Map

| File | Line | Role |
|---|---|---|
| `lib/types.ts` | 297-300 | Field definition on `ParsedVessel` |
| `lib/imo/cii-lookup.ts` | 7, 81-125 | `CiiSource` type + `lookupCii()` — sets provenance |
| `lib/imo/cii-estimate.ts` | 23-30 | `estimateCiiByBuildYear()` — age/type rule |
| `lib/imo/cii-cache.ts` | — | Cache layer, preserves `source` |
| `scripts/demo-seed/regenerate-matches.ts` | 60-69 | Sets `vessel.ciiSource` during demo seed |
| `app/match/[id]/page.tsx` | 183-210 | Hydrates `ciiSource`, passes `vesselWithCii` to `buildDueDiligence` |
| **`lib/matching/due-diligence.ts`** | **400-404, 663-665** | **BUG: ignores `ciiSource`, hardcodes Equasis** |
| `lib/sailing/vessel-vetting.ts` | 114-126, 136-148 | `scoreCii()`, `computeVesselVetting()` — no source, scoring only |
| `components/match/DDCheckRow.tsx` | 118-122 | Renders `Источник: {source}` in "Подробнее" accordion |
| `components/match/VesselsTab.tsx` | 93 | **Correct**: `<CiiRatingBadge source={vessel.ciiSource ?? 'imo-public'} />` |
| `components/vessel/CiiRatingBadge.tsx` | 28-29 | Asterisk + tooltip — correct pattern to follow |

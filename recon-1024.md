# RECON-1024 — Synthesized laycan dates carry false [¹] footnote

**Date**: 2026-06-17  
**Branch**: `claude/1781692070-recon-1024`  
**Status**: READ-ONLY RECON — no code changes

---

## ROOT CAUSE

**Two-write-paths recurrence**: The `dropLaycanSource` fix (stripping
`preferredDates.sourceText` on shifted laycans, commit `7f903f05`) was applied
only in `lib/sample-data/rebase-parsed.ts`, which runs ONLY when
`createDemoSession` is called. The production login path (`hydrateDemoSession`)
reads `parsedCargos` directly from `parsed_results` in the DB via
`buildDemoSessionBlob` — never calling `rebaseParsedCargoes` — so
`preferredDates.sourceText` is preserved from the original LLM parse with the
original email date phrase, while the displayed laycan is the synthesized/rebased
value from `worksheet.readiness.laycanStart/End`. The render seam in
`app/match/[id]/page.tsx:382` then passes this original `sourceText` to
`SourceAttributionSection`, which shows [¹] whenever `sourceText` is non-null.

---

## CALL-SITES THAT SET THE FOOTNOTE / DATES

### 1. `lib/sample-data/rebase-parsed.ts:108-132` — `dropLaycanSource` (FIXED, create-path only)

```ts
// When the laycan is shifted/synthesized, preferredDates.sourceText (a quote for the
// ORIGINAL email date) no longer attributes the displayed value — drop it so the match
// page does not render a false [¹] citation (#1024). Keep .value for display.
const dropLaycanSource = (c: ParsedCargo): ParsedCargo['preferredDates'] =>
  c.preferredDates ? { ...c.preferredDates, sourceText: undefined } : c.preferredDates;
```

Called only inside `rebaseParsedCargoes`, which is called by `resolveDemoParsedCargoes`
→ `createDemoSession`. **Never reached by `hydrateDemoSession`.**

### 2. `lib/demo-mode/hydrate-demo-session.ts:96-110` — `buildDemoSessionBlob` (BROKEN)

```ts
for (const row of parsedRows) {
  switch (row.parse_type) {
    case 'cargo': parsedCargos.push(...safeJsonArray<ParsedCargo>(row.result_json, 'cargo')); break;
    ...
  }
}
const dedupedCargos = dedupByKey(parsedCargos);
// ← NO sourceText stripping here
```

Loads `parsedCargos` from DB `parsed_results` table as-is. The LLM-parsed rows
carry `preferredDates.sourceText` (the original email date phrase) unchanged.
`shiftedCargo` in `build.ts` only shifts `cargo.laycan`, not `preferredDates`.

### 3. `app/match/[id]/page.tsx:381-385` — render seam (false attribution origin)

```ts
...(laycanDisplay
  ? [{ label: 'Laycan', value: { value: laycanDisplay, confidence: 'confirmed' as const,
       sourceText: cargo.preferredDates?.sourceText } }]  // ← BUG: original sourceText
  : cargo.preferredDates
    ? [{ label: 'Laycan', value: cargo.preferredDates }]
    : []),
```

When `laycanDisplay` is set (always for demo matches, since `worksheet.readiness.laycanStart`
exists → tier-1 of `resolveLaycanDisplay`), the synthesized display value is used but the
original `sourceText` from cargo (which was NOT cleared in `hydrateDemoSession`) is
propagated. `SourceAttributionSection:29` then renders [¹] for any field with truthy
`sourceText`.

---

## PROD RENDER PATH CONFIRMED

| Path | Caller | `parsedCargos` source | `sourceText` cleared? |
|------|--------|----------------------|----------------------|
| `createDemoSession` | `POST /api/sample` | `lib/sample-data/demo-parsed-cargoes.json` → `rebaseParsedCargoes` | **YES** ✓ |
| `hydrateDemoSession` | `POST /api/auth/login`, `GET /api/demo/rehydrate` | DB `parsed_results` → `buildDemoSessionBlob` | **NO** ✗ |

Prod uses `hydrateDemoSession`. The prior fix only patched `createDemoSession`.

Key files confirming the call chain:
- `app/api/auth/login/route.ts:85` — `hydrateDemoSession(sessionId)` (main login)
- `app/api/demo/rehydrate/route.ts:44,50` — `hydrateDemoSession(sessionId)` (session refresh)
- `app/api/sample/route.ts:21` — `createDemoSession()` (legacy demo button, NOT prod path)

---

## EXACT SEAM + RECOMMENDED FIX SHAPE

### Fix A — Primary: strip `sourceText` in `buildDemoSessionBlob` (hydrate path)

**File**: `lib/demo-mode/hydrate-demo-session.ts`  
**After line 110** (`const dedupedCargos = dedupByKey(parsedCargos);`):

```ts
// Mirror rebase-parsed.ts:dropLaycanSource: seeded preferredDates.sourceText is the
// ORIGINAL email phrase, not the shifted/synthesized laycan displayed in the UI.
// Strip it so SourceAttributionSection cannot render a false [¹] citation (#1024).
const dedupedCargos = dedupByKey(parsedCargos).map((c) =>
  c.preferredDates
    ? { ...c, preferredDates: { ...c.preferredDates, sourceText: undefined } }
    : c
);
```

This mirrors exactly what `dropLaycanSource` does in `rebaseParsedCargoes`.

### Fix B — Defense-in-depth: drop `sourceText` at render when `laycanDisplay` overrides

**File**: `app/match/[id]/page.tsx:381-385`

Change:
```ts
...(laycanDisplay
  ? [{ label: 'Laycan', value: { value: laycanDisplay, confidence: 'confirmed' as const,
       sourceText: cargo.preferredDates?.sourceText } }]
```
To:
```ts
...(laycanDisplay
  ? [{ label: 'Laycan', value: { value: laycanDisplay, confidence: 'confirmed' as const } }]
```

Rationale: when `laycanDisplay` is set, it comes from `worksheet.readiness.laycanStart/End`
(tier 1) or `storedMatch.laycan_start/end` (tier 2), both of which are synthesized/rebased
dates. Neither matches the original email phrase in `sourceText`. The render should
not pass a sourceText that attributes the synthesized value to the email.

The `else` branch already handles the case where `cargo.preferredDates` IS the source —
that branch keeps the original `ConfidenceField` intact (with its real `sourceText`).

---

## VESSEL OPEN-DATE NOTE

Issue title says "laycan + vessel-open dates carry false [¹]". The vessel-open-date part
is **NOT a [¹] bug** — `SourceAttributionSection` only receives cargo fields (see page.tsx
lines 376-387: no `vessel.openDate` passed). The vessel open-date shows a synthesized
value in the `MatchWorksheet` "⏱ Time" row (`r.openDate` from `worksheet.readiness.openDate`),
but without any [¹] footnote. The issue title conflates two separate observations:
1. **Laycan [¹] false provenance** (actual bug, in Source Attribution) — fix A+B above
2. **Vessel open-date wrong display** (expected demo synthesis, no [¹]) — not a bug in the
   provenance/attribution sense; the MatchWorksheet does not claim a source for that value.

---

## PARITY NOTE: List vs Detail / Both Write-Paths

**List page** (`/matches`): Renders laycan via `resolveLaycanDisplay` for display only.
No `SourceAttributionSection`. No [¹] possible. Both paths render the same synthesized date.

**Detail page** (`/match/[id]`): Renders `SourceAttributionSection` with the Laycan field.
This is where the false [¹] appears — ONLY in the `hydrateDemoSession` path because
`createDemoSession` already clears `sourceText`.

**Both write-paths** both need the fix:
- `createDemoSession`: already fixed in `rebaseParsedCargoes` (commit `7f903f05`)
- `hydrateDemoSession`: NOT fixed (this is the gap — fix A above)

Fix B (render) provides shared protection for both paths as defense-in-depth.

---

## TRACE_READ

Key files read for this recon (in order):

| File | Purpose |
|------|---------|
| `components/match/SourceAttributionSection.tsx:29` | Filter: shows [¹] when `f.value.sourceText && f.value.value != null` |
| `app/match/[id]/page.tsx:381-385` | Render seam: passes `sourceText: cargo.preferredDates?.sourceText` with synthesized `laycanDisplay` |
| `lib/utils/laycan-display.ts` | `resolveLaycanDisplay`: tier-1=worksheet, tier-2=stored, tier-3=cargoRaw |
| `lib/sample-data/rebase-parsed.ts:108-133` | Prior fix (commit `7f903f05`): `dropLaycanSource` strips `sourceText` — only in `createDemoSession` path |
| `lib/sample-data/demo-parsed-cargoes.ts:36-39` | `resolveDemoParsedCargoes` calls `rebaseParsedCargoes` — `createDemoSession` only |
| `lib/sample-data/create-demo-session.ts:99-101` | `createDemoSession` calls `resolveDemoParsedCargoes(today)` |
| `lib/demo-mode/hydrate-demo-session.ts:96-110` | `buildDemoSessionBlob`: loads `parsedCargos` from DB, no `sourceText` stripping |
| `lib/demo-mode/hydrate-demo-session.ts:248-261` | `hydrateDemoSession` entry point |
| `app/api/auth/login/route.ts:85-90` | Prod login → `hydrateDemoSession` |
| `app/api/demo/rehydrate/route.ts:44-50` | Session refresh → `hydrateDemoSession` |
| `app/api/sample/route.ts:21` | Legacy demo button → `createDemoSession` (not prod path) |
| `scripts/demo-seed/build.ts:34-43` | `shiftedCargo`: shifts `cargo.laycan` only, NOT `preferredDates` |
| `lib/matching/persist-session-matches.ts:134-168` | Worksheet rebuild from `vessel.openDate` and `cargo.laycan` |

---

## ISSUE ACCEPTANCE CRITERIA

| Issue | Criterion | Status | Evidence |
|-------|-----------|--------|----------|
| #1024 | Synthesized laycan drops [¹] in Source Attribution | ✗ | `hydrateDemoSession` path still carries `sourceText` — see `hydrate-demo-session.ts:96-110` |
| #1024 | [¹] either dropped or labeled "demo-shifted" for synthesized dates | ✗ | Render seam `page.tsx:382` passes `sourceText` unconditionally when `laycanDisplay` set |
| #1024 | Consistent behavior across both write-paths | ✗ | `createDemoSession` fixed; `hydrateDemoSession` not |

All criteria ✗ — issue remains open. Fix shape described above.

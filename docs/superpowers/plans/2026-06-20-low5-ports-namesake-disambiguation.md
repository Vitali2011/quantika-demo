# Plan — FIX #5 (audit-1 LOW): context-aware homonym port disambiguation

**Date:** 2026-06-20
**Branch:** `fix-low5-ports`
**Tier:** M (founder = FULL M fix)
**Issue ref:** audit-1 LOW item #5 (NOT GitHub issue #5 — that is the unrelated Wave-5 follow-up)

## Problem

`lib/ports/resolve.ts` `buildIndex()` populates `byName` first-wins (line ~85).
Two ports in the 488-port dataset share a folded name with a different
LOCODE/country:

| Name      | First-wins (current) | Other          |
|-----------|----------------------|----------------|
| Cartagena | `ESCAR` (ES, Med)    | `COCTG` (CO)   |
| Tripoli   | `LBKYE` (LB, E-Med)  | `LYTIP` (LY)   |

A bare name (`"Cartagena"`) always resolves to the arbitrary first-loaded port
regardless of route context → wrong distance, wrong bunker port, wrong TCE for
prod users who type bare names. Demo data uses LOCODEs / unambiguous strings, so
demo TCE is **not** currently affected.

## Design (surgical, backward-compatible)

Add an **optional** `context` param to `resolvePort` / `resolvePortStrict`. Used
ONLY to break homonym ties. When NO context is given, behavior stays EXACTLY
first-wins → zero regression on the 488-port dataset.

```ts
export interface ResolveContext {
  /** Counterpart voyage port — its coords/country break homonym ties */
  counterpart?: { lat?: number | null; lon?: number | null; country?: string | null } | null;
  /** Explicit ISO alpha-2 country hint (highest priority) */
  country?: string | null;
}
export function resolvePort(input: string, context?: ResolveContext): ResolvedPort | null;
```

- Index: add `byNameAll: Map<string, PortEntry[]>` keeping ALL same-name entries
  reachable. `byName` (first-wins) stays for the no-context path.
- Tie-break runs ONLY when `context` supplied AND `byNameAll` has >1 candidate.
  Priority: explicit `country` hint (unique match) → counterpart coords
  (nearest by haversine) → counterpart country match → else fall through to
  first-wins.
- LOCODE path unchanged (LOCODE is unique → homonym-immune).

## Wiring (call-sites that already have the counterpart port)

| File | Site | Action |
|------|------|--------|
| `lib/matching/tce-calculator.ts` | `deriveEtsCoverage` (load+disch) | pass counterpart |
| `lib/port-da/match-da.ts` | `sumMatchPortDaUsd` (port siblings) | pass counterpart |
| `lib/sailing/fit-breakdown.ts` | `isEuropeanDischarge(disch)` (+ `cargo.originPort`) | add optional counterpart param, wire caller |
| `app/api/voyage/tce/route.ts` | `resolvePortOrPassthrough` (origin↔dest) | add optional counterpart param, thread |
| `app/api/voyage/compare-routes/route.ts` | `daResolver` closure (body.origin/destination) | pass counterpart |
| `lib/knowledge/distances/lookup.ts` | `resolvePortStrict(LOCODE)` | **SKIP** — LOCODE-only, homonym-immune (documented) |

Where no counterpart is available, the call stays unchanged.

## TDD

Failing tests first (`__tests__/ports/resolve.test.ts`, append-only — PI3):
1. Cartagena + South-American counterpart coords → `COCTG`
2. Cartagena + Mediterranean counterpart coords → `ESCAR`
3. Cartagena + NO hint → unchanged first-wins (`ESCAR`)
4. Cartagena + explicit `{country:'CO'}` → `COCTG`
5. Tripoli + Lebanon-side counterpart → `LBKYE`; + Libya-side counterpart → `LYTIP`
6. Non-homonym (`Rotterdam`) + context → identical to no-context (no effect)

## Out of scope

- No new region/basin field in port-master.json (tie-break uses existing lat/lon).
- No change to vague-region resolution (`resolve-vague.ts`).
- `lookup.ts` LOCODE path not wired (homonym-immune by construction).

## Verification

- `npx tsc --noEmit`
- `npx jest __tests__/ports/resolve.test.ts lib/port-da/__tests__/match-da.test.ts lib/sailing/__tests__/fit-breakdown.test.ts --runInBand --forceExit`
- Demo TCE unchanged (zero bare homonym strings in demo data).

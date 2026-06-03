# Plan — EU ETS carbon 50% for in/out-EU voyages (T2)

**Tier:** M · risk-override (economics calc) → mandatory `/test-skill` · creative=YES (brainstorm inline below).
**Branch:** off origin/main (`9cfca018`).

## Gate 0 — TRACE
- **Target:** `calculateEuEts` (`lib/economics/ets.ts`): `amount = vlsfoBurnMt * cf * euLegPercent * phase * euaPrice`.
- **Consumers (3):** `lib/economics/voyage-calculator.ts`, `app/api/voyage/tce/route.ts`, `lib/economics/index.ts`.
- **Entry:** server (request-time P&L; not baked in seed → code-only deploy, NO data-apply).
- **Real failure data:** current formula applies `euLegPercent * phase` (i.e. 100% of the EU leg) — there is NO 50% reduction for in/out-EU voyages. Founder note (NIGHT-RUN backlog): "для смешанных рейсов ужать до 50% in/out-EU плеч" (~270-340/т at 100% phase 2026 is too high for mixed voyages).
- **Parity:** n/a.

## Brainstorm (creative — leg classification design, ДО impl)
EU ETS maritime scope (Directive 2023/959): emissions coverage by voyage type —
- **Intra-EU** (BOTH ports EU/EEA) → **100%** of emissions dutiable.
- **In/out-EU** (EXACTLY ONE port EU/EEA) → **50%** of emissions dutiable.
- **Extra-EU** (NEITHER port EU) → **0%**.

Current `euLegPercent` is the *geographic EU-leg fraction* (a different lever) — it is NOT the coverage factor. Approaches:
- **H1 (selected):** add an explicit `coverageFactor` derived from EU-endpoint count (`isEuCountry(origin.country)` + `isEuCountry(dest.country)` — `isEuCountry` already exists in `lib/validation/sanctions`): both→1.0, one→0.5, none→0. Multiply: `amount = burn*cf*euLegPercent*phase*euaPrice*coverageFactor`. Explicit, testable, doesn't overload euLegPercent.
- **H2 (rejected):** fold 0.5 into euLegPercent at the caller — conflates geographic fraction with regulatory coverage; breaks the meaning of euLegPercent for other consumers.
- **Selected H1** — caller (voyage-calculator/tce-route) passes origin/dest EU flags (or country codes) → ets computes coverageFactor.

## Scope
- `lib/economics/ets.ts`: extend `EuEtsInput` with origin/dest EU flags (or `coverageFactor`); compute factor {both:1, one:0.5, none:0}; multiply into amount. Guard: if flags absent → default 1.0 (conservative, current behavior) to avoid silent under-charge regressions.
- `lib/economics/voyage-calculator.ts` + `app/api/voyage/tce/route.ts`: pass EU-endpoint flags (use `isEuCountry` on resolved port countries already available in tce/route as `originResolved.country`/`destinationResolved.country`).

## Acceptance
- Unit tests: intra-EU (both EU) → coverage 1.0; in/out-EU (one EU) → 0.5; extra-EU → 0. Backward-compat: absent flags → 1.0 (existing ets tests stay green).
- `/test-skill` cold QA PASS. Code-only (no seed/prod-data write).

## Out-of-scope
- Do NOT change phase-in schedule or Cf factors. Do NOT touch matching/seed. MGO-grade is a SEPARATE backlog item — not here.

## If stuck → QUESTIONS.md + state.md + stop.

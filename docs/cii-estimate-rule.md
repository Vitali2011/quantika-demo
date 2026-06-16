# CII estimate rule (demo data)

## Why estimates, not real data

IMO's Carbon Intensity Indicator (CII) register is **not free / openly licensed**, so
for demo vessels we cannot ship real ratings at scale. Instead we derive a deterministic,
intentionally **conservative** proxy from build year. Every such rating is labeled as an
**estimate** in the UI («оценка по возрасту/типу») and is never presented as a real IMO
rating.

Founder decision (2026-06-16, data-fill campaign Task 2): fill the CII vetting row with
estimates so it stops being empty (was 0/90, scored neutral), while keeping the handful of
real, founder-confirmed ratings real.

## The rule

Implemented in [`lib/imo/cii-estimate.ts`](../lib/imo/cii-estimate.ts) as
`estimateCiiByBuildYear(built)`:

| Build year     | Estimated CII | Vetting verdict |
| -------------- | ------------- | --------------- |
| ≥ 2008         | **C**         | ok (meets min.) |
| 1995 – 2007    | **D**         | caution         |
| < 1995         | **E**         | warn            |
| missing / bad  | unknown       | neutral (no penalty) |

### Design constraints

- **No optimism — ceiling is C.** We never assign **A** or **B**: those are optimistic
  efficiency claims that require verified data. Capping at C keeps every estimate
  neutral-to-cautious and stops an estimate from *inflating* a vessel's vetting / fit score.
- **Deterministic & pure.** Same build year → same rating. No `Date.now()`, no randomness,
  no network. This makes offline seed regeneration reproducible.
- **Missing data → neutral, never penalty.** No build year ⇒ `unknown` ⇒ the CII factor
  scores as neutral (0.6 share), exactly as a fully-missing rating did before.

## Provenance / honesty plumbing

- Static dataset records ([`lib/sample-data/imo/cii.json`](../lib/sample-data/imo/cii.json))
  carry `source` + `basis` markers. Estimated entries:
  `{ "imo": "...", "rating": "D", "source": "estimated", "basis": "age/type" }`.
  Real entries omit the marker (treated as `imo-public`).
- `lookupCii` (`lib/imo/cii-lookup.ts`) threads `source: 'imo-public' | 'estimated' |
  'llm-fallback'` end-to-end (and preserves it through the cache).
- `CiiRatingBadge` renders an asterisk (`CII D*`) for estimates and a disclosure tooltip:
  - `estimated`  → «оценка по возрасту/типу — не официальный рейтинг IMO»
  - `llm-fallback` → «Estimated by AI»
  - `imo-public` → no asterisk, `source: imo-public`.

## Real (founder-confirmed) ratings — preserved

These are NOT estimates and keep their real ratings (no `estimated` marker):

| IMO       | Rating |
| --------- | ------ |
| 8887296   | D      |
| 9166510   | E      |
| 9238363   | D      |

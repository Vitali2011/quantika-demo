# Plan — fix-freight-clamp (divergence audit, finding 9)

## Problem (ROOT confirmed on main, lib/matching/freight-resolver.ts:83)

Tier-2 Baltic per-mt rate = `(vessel day-rate × voyage days) ÷ cargo tonnes`.
The day-rate is for the WHOLE vessel, but `quantityMt` can be a small **part-cargo**
(e.g. 3000 mt booked on a 50k-dwt panamax). The math then yields **320–533 USD/mt**
while real dry-bulk voyage freight is ~30–60 USD/mt — and it is shown with the
authoritative `~ Market (Baltic)` badge (freight-badge.ts:32, tone `baltic`,
`dimmed:false`). The figure is a vessel/parcel-size mismatch artifact, not market truth.

## Fix

Add a plausibility ceiling on the computed Tier-2 $/mt. When the value exceeds the
ceiling, **do not return `source:'baltic'`** — fall through to the Tier-3 estimate
(`estimateFreightRate`, `source:'estimated'`). Effect:

- The absurd figure is **suppressed** (replaced by the class/route estimate value).
- The badge **auto-downgrades** to `≈ Estimate` (`freightBadge('estimated')` →
  tone `estimate`, `dimmed:true`) — no badge-file change needed, since the badge is
  driven purely by `freight_rate_source`.

Single chokepoint: `resolveFreightRate` is the only producer of `source:'baltic'`
(persisted as `freight_rate_source`; consumed by MatchesClient, EconomicsTab,
due-diligence, match detail page — all read the string, none recompute the tier).

## Clamp band (defensible basis)

Hard ceiling: **`TIER2_MAX_USD_PER_MT = 200`**.

Basis: dry-bulk **voyage freight** per metric ton has historically peaked around
$80–120/mt even in extreme markets (2008 capesize iron-ore spike). The existing
plausibility test asserts full-cargo Tier-2 rates land in $1–40/mt. A $200/mt ceiling
gives generous headroom above any real bulk voyage rate (so legitimate long-haul /
small-parcel rates are NOT downgraded) while sitting well below the 320–533/mt
part-cargo artifact. Documented as a named const + comment in freight-resolver.ts.

No lower clamp: a too-low Tier-2 rate is not the reported failure mode and the
existing `value > 0` guard already rejects zero/negative.

## TDD

- RED: part-cargo case (3000 mt on 50k dwt, BSI_TC ~13500 $/day, 3000 nm) currently
  yields 500+ USD/mt at `source:'baltic'`. Assert post-fix: `source==='estimated'`
  and `value < 200`.
- Keep existing plausible-route tests green (full cargoes stay `baltic`, $1–40/mt).
- GREEN: add ceiling check inside the Tier-2 block before returning.

## Out of scope

- No change to freight-badge.ts (downgrade is automatic via source string).
- No change to the TCE formula / voyage-days model.
- No lower-bound clamp.

## Files

- `lib/matching/freight-resolver.ts` — add `TIER2_MAX_USD_PER_MT` const + ceiling guard.
- `lib/matching/__tests__/freight-resolver.test.ts` — add part-cargo clamp/downgrade test.

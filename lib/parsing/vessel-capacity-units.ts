import type { ParsedVessel } from '@/lib/types';

// cbft→cbm: 1 cbft = 0.0283168 m³, i.e. divide by 35.314667. SINGLE shared
// constant — previously duplicated as CBFT_TO_CBM_PROD (parse-vessel-helpers)
// and CBFT_TO_CBM (hydrate-demo-session). Code is the single owner of the
// conversion factor (principle #4, shared-root). (#984 follow-up)
export const CBFT_TO_CBM = 35.314667;

/**
 * Normalize a ParsedVessel's grain/bale capacity to cbm IN PLACE, unit-aware.
 *
 * `grainCapacityUnit` is the single unit field governing BOTH grain and bale —
 * there is no separate `baleCapacityUnit`. When it is 'cbft' the raw value(s) are
 * divided by 35.314667 and the unit relabelled 'cbm'. Any other non-cbm/non-null
 * label is normalised to 'cbm' WITHOUT touching the value (already cbm — e.g. a
 * post-#984 parse).
 *
 * IDEMPOTENT: once relabelled 'cbm' a re-run never re-converts — so calling it at
 * multiple readers (parse-time, hydrate, engine/regen intake) cannot double-convert.
 * This is what lets all three readers agree on a single conversion (#984 fixed
 * parse-time + hydrate; the engine/regen path was a third, unconverted reader).
 *
 * Does NOT apply the >2.5×DWT capacity-plausibility clamp (#793/#976) — that stays
 * a separate concern at each reader so this util has one job: the unit conversion.
 */
export function normalizeVesselCapacityToCbm(v: ParsedVessel): void {
  const unit = v.grainCapacityUnit;
  if (unit && unit.toLowerCase() === 'cbft') {
    if (typeof v.grainCapacity === 'number' && v.grainCapacity > 0) {
      v.grainCapacity = Math.round(v.grainCapacity / CBFT_TO_CBM);
    }
    if (typeof v.baleCapacity === 'number' && v.baleCapacity > 0) {
      v.baleCapacity = Math.round(v.baleCapacity / CBFT_TO_CBM);
    }
    v.grainCapacityUnit = 'cbm';
  } else if (unit && unit !== 'cbm') {
    v.grainCapacityUnit = 'cbm';
  }
}

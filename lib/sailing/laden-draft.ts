/* Primary: empirical regression (research §2) — continuous in DWT, no light-draft
 * assumption required. Class-TPC (Handy≈45, Supra≈52, Panamax≈60, Cape≈80 t/cm)
 * is exposed for cross-checking in tests only; tpc param fires an alternative
 * immersion-based path (presently unexercised by production callers). */

import { classifyVesselByDwt } from './readiness-gap';
import type { VesselClassName } from '../constants';

export interface LadenDraftEstimate {
  ladenDraftM: number;
  method: 'tpc' | 'class-tpc' | 'empirical' | 'unknown';
  approximate: true;
  vesselClass: VesselClassName | null;
}

/** Class-TPC from research §2 — used for cross-checks in tests, not primary estimation. */
export const CLASS_TPC: Record<VesselClassName, number> = {
  handysize: 45,
  supramax:  52,
  panamax:   60,
  capesize:  80,
};

/**
 * Approximate laden draft estimate for a vessel loading a given cargo weight.
 * Returns null when either input is invalid — caller must fall back to static draft check.
 *
 * Conservative bias: result is rounded UP to nearest 0.1 m so a screening tool
 * errs toward flagging a possible overdraft rather than silently passing one.
 */
export function estimateLadenDraft(
  dwtTons: number | null | undefined,
  cargoTons: number | null | undefined,
  tpc?: number | null,
): LadenDraftEstimate | null {
  if (
    dwtTons == null || cargoTons == null ||
    !Number.isFinite(dwtTons) || !Number.isFinite(cargoTons) ||
    dwtTons <= 0 || cargoTons <= 0
  ) {
    return null;
  }

  const vesselClass = classifyVesselByDwt(dwtTons);
  const fullLoadDraftM = 0.4991 * Math.pow(dwtTons, 0.2991);

  let rawDraftM: number;
  let method: LadenDraftEstimate['method'];

  if (tpc != null && Number.isFinite(tpc) && tpc > 0) {
    // TPC-immersion path (future; presently unexercised by production callers)
    // Draft reduction relative to full-load: (DWT − cargo) / (TPC t/cm × 100 cm/m)
    const draftReduction = (dwtTons - cargoTons) / (tpc * 100);
    rawDraftM = fullLoadDraftM - draftReduction;
    method = 'tpc';
  } else {
    // Empirical partial-load scaling — clamp ratio to 1 (over-DWT cargo uses full-load draft)
    const ratio = Math.min(cargoTons / dwtTons, 1);
    rawDraftM = fullLoadDraftM * Math.pow(ratio, 0.3);
    method = 'empirical';
  }

  // Conservative round-up to nearest 0.1 m
  const ladenDraftM = Math.ceil(rawDraftM * 10) / 10;

  return { ladenDraftM, method, approximate: true, vesselClass };
}

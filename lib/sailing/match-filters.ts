/**
 * Deterministic hard filters for the vessel-cargo matcher.
 *
 * These are checks that answer "is this combination physically or commercially
 * possible?" with a clear yes/no. Failures are dropped from the matcher output
 * BEFORE the LLM ever sees them, so the LLM cannot rescue an impossible pair
 * with creative reasoning.
 *
 * Design rules:
 *   - If any input is missing/unknown → check passes (graceful; we never block
 *     a match just because we couldn't verify the constraint).
 *   - If we CAN verify and it fails → check fails with a plain-English reason.
 *   - All checks are pure functions; no IO, no side effects.
 */

import { getPortMaster, portCanHandleDraft, portHasShoreCranes } from './port-master';
import { CargoType, Range, isRange } from '../types';
import { checkImsbcLoadability } from './imsbc-check';

export interface FilterResult {
  pass: boolean;
  reason?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Draft check — "can vessel physically berth at the port?"
// ────────────────────────────────────────────────────────────────────────────

export function checkDraft(port: string | null | undefined, vesselDraftM: number | null | undefined): FilterResult {
  const r = portCanHandleDraft(port, vesselDraftM);
  if (!r.ok) {
    return { pass: false, reason: r.reason };
  }
  return { pass: true };
}

// ────────────────────────────────────────────────────────────────────────────
// Crane check — "can gearless vessel load/discharge here?"
//   gearless = NO vessel cranes. If geared=null (unknown) → graceful pass.
// ────────────────────────────────────────────────────────────────────────────

export function checkCrane(port: string | null | undefined, vesselGeared: boolean | null | undefined): FilterResult {
  // Geared (has own cranes) — never blocked
  if (vesselGeared === true) return { pass: true };
  // Geared status unknown — can't verify
  if (vesselGeared == null) return { pass: true };
  // vesselGeared === false → gearless → need port cranes
  const portCranes = portHasShoreCranes(port);
  if (portCranes === false) {
    return { pass: false, reason: `gearless vessel cannot load at ${port} (no shore cranes)` };
  }
  return { pass: true };
}

// ────────────────────────────────────────────────────────────────────────────
// Volume check — "does cargo volume fit vessel grain capacity?"
//   volume_m3 = weight_mt × stowage_factor
//   fails if volume_m3 > grain_capacity (with 5% margin — "abt" tolerance)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Stowage factors (m³/MT) for common bulk cargoes.
 * Source: standard bulk-carrier operations handbook.
 */
export const STOWAGE_FACTORS: Record<string, number> = {
  wheat:      1.30,
  barley:     1.40,
  maize:      1.35,
  corn:       1.35,
  soybean:    1.40,
  rice:       1.35,
  cement:     0.75,
  fertilizer: 1.05,
  urea:       1.10,
  potash:     1.00,
  sugar:      1.10,
  salt:       0.95,
  coal:       1.30,
  iron:       0.35,
  steel:      0.45,
  scrap:      1.50,
  bauxite:    0.80,
  gypsum:     0.90,
  bagged:     1.40,
  timber:     2.50,
  woodchips:  2.80,
};

const DEFAULT_STOWAGE_FACTOR = 1.35; // conservative bulk estimate

export interface VolumeCheckInput {
  weightMt: Range<number> | number | null;
  cargoDescription: string | null;
  stowageFactor: string | null;      // free-text, e.g. "1.3 m³/mt"
  grainCapacity: number | null;       // m³
}

function resolveStowageFactor(cargoDescription: string | null, explicit: string | null): number {
  // Explicit parsed value wins
  if (explicit) {
    const m = explicit.match(/(\d+(?:\.\d+)?)/);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > 0 && n < 10) return n;
    }
  }
  // Keyword lookup
  if (cargoDescription) {
    const lower = cargoDescription.toLowerCase();
    for (const [kw, sf] of Object.entries(STOWAGE_FACTORS)) {
      if (lower.includes(kw)) return sf;
    }
  }
  return DEFAULT_STOWAGE_FACTOR;
}

export function checkVolume(input: VolumeCheckInput): FilterResult {
  const { weightMt, grainCapacity, cargoDescription, stowageFactor } = input;
  // Use max bound for conservative capacity check (worst-case scenario)
  const effectiveWeight = isRange<number>(weightMt) ? weightMt.max : weightMt;
  if (effectiveWeight == null || !Number.isFinite(effectiveWeight) || effectiveWeight <= 0) return { pass: true };
  if (grainCapacity == null || !Number.isFinite(grainCapacity) || grainCapacity <= 0) return { pass: true };

  const sf = resolveStowageFactor(cargoDescription, stowageFactor);
  const requiredM3 = effectiveWeight * sf;
  const capacityWithMargin = grainCapacity * 1.05; // 5% tolerance for "abt" values

  if (requiredM3 > capacityWithMargin) {
    return {
      pass: false,
      reason: `cargo needs ~${Math.round(requiredM3)}m³ (${effectiveWeight}mt × ${sf} stowage) but vessel grain capacity is ${grainCapacity}m³`,
    };
  }
  return { pass: true };
}

// ────────────────────────────────────────────────────────────────────────────
// Cargo weight check — "can vessel physically lift this weight?"
//   Prefers DWCC (true cargo carrying capacity, after bunkers/stores deduction).
//   Falls back to DWT × 0.90 (typical 10% deduction for fuel/water/stores).
//   Fails when cargo weight exceeds capacity by more than 5% margin ("abt").
//   If both DWCC and DWT are missing → graceful pass.
// ────────────────────────────────────────────────────────────────────────────

const WEIGHT_MARGIN = 1.05;        // 5% tolerance for "abt" / about-this-weight
const DWT_TO_DWCC_RATIO = 0.90;    // typical cargo capacity = 90% of DWT

export interface CargoWeightCheckInput {
  weightMt: Range<number> | number | null;
  dwtSummer: number | null;
  dwcc: number | null;
}

export function checkCargoWeight(input: CargoWeightCheckInput): FilterResult {
  const { weightMt, dwtSummer, dwcc } = input;
  // Use max bound for conservative capacity check (worst-case scenario)
  const effectiveWeight = isRange<number>(weightMt) ? weightMt.max : weightMt;
  if (effectiveWeight == null || !Number.isFinite(effectiveWeight) || effectiveWeight <= 0) {
    return { pass: true };
  }

  // Resolve effective vessel capacity: prefer DWCC (true cargo capacity)
  let effectiveCapacity: number | null = null;
  let capacitySource = '';
  if (dwcc != null && Number.isFinite(dwcc) && dwcc > 0) {
    effectiveCapacity = dwcc;
    capacitySource = 'DWCC';
  } else if (dwtSummer != null && Number.isFinite(dwtSummer) && dwtSummer > 0) {
    effectiveCapacity = dwtSummer * DWT_TO_DWCC_RATIO;
    capacitySource = `DWT × ${DWT_TO_DWCC_RATIO}`;
  }
  if (effectiveCapacity == null) return { pass: true };

  const capacityWithMargin = effectiveCapacity * WEIGHT_MARGIN;
  if (effectiveWeight > capacityWithMargin) {
    return {
      pass: false,
      reason: `cargo ${Math.round(effectiveWeight)} mt exceeds vessel capacity ${Math.round(effectiveCapacity)} mt (${capacitySource}) by more than 5% tolerance`,
    };
  }
  return { pass: true };
}

// ────────────────────────────────────────────────────────────────────────────
// Cargo type × vessel type compatibility
// ────────────────────────────────────────────────────────────────────────────

/**
 * Normalized vessel-type categories used for compatibility matching.
 */
type VesselCategory = 'bulk' | 'mpp' | 'tanker' | 'container' | 'roro' | 'unknown';

function categorizeVessel(raw: string | null | undefined): VesselCategory {
  if (!raw) return 'unknown';
  const s = raw.toLowerCase();
  if (/tanker|oil|chemical|product/.test(s)) return 'tanker';
  if (/mpp|multi-?purpose|general cargo|gc|break.?bulk|heavy.?lift/.test(s)) return 'mpp';
  if (/container|containership/.test(s)) return 'container';
  if (/ro.?ro|roro|car carrier/.test(s)) return 'roro';
  if (/bulk|handysize|supramax|panamax|capesize|handymax|ultramax/.test(s)) return 'bulk';
  return 'unknown';
}

/**
 * Compatibility matrix — rows=cargo type, cols=vessel category.
 * Value = can this vessel category carry this cargo type? (true/false)
 */
const COMPATIBILITY: Record<CargoType, Record<VesselCategory, boolean>> = {
  BULK:       { bulk: true,  mpp: true,  tanker: false, container: false, roro: false, unknown: true },
  BREAK_BULK: { bulk: false, mpp: true,  tanker: false, container: false, roro: false, unknown: true },
  PROJECT:    { bulk: false, mpp: true,  tanker: false, container: false, roro: false, unknown: true },
  FCL:        { bulk: false, mpp: false, tanker: false, container: true,  roro: false, unknown: true },
  LCL:        { bulk: false, mpp: false, tanker: false, container: true,  roro: false, unknown: true },
  RORO:       { bulk: false, mpp: false, tanker: false, container: false, roro: true,  unknown: true },
  AIR:        { bulk: false, mpp: false, tanker: false, container: false, roro: false, unknown: false }, // sea vessels can't carry air cargo
  OTHER:      { bulk: true,  mpp: true,  tanker: true,  container: true,  roro: true,  unknown: true },  // no constraint
};

const CARGO_NEEDS_EXPLANATION: Record<CargoType, string> = {
  BULK:       'dry bulk carrier or MPP',
  BREAK_BULK: 'MPP or general-cargo vessel',
  PROJECT:    'MPP / heavy-lift vessel',
  FCL:        'container ship',
  LCL:        'container ship',
  RORO:       'RORO / car carrier',
  AIR:        'air freight only',
  OTHER:      'any vessel',
};

export interface CargoVesselCompatInput {
  cargoType: CargoType;
  vesselType: string | null;
}

export function checkCargoVesselCompat(input: CargoVesselCompatInput): FilterResult {
  const cat = categorizeVessel(input.vesselType);
  const row = COMPATIBILITY[input.cargoType];
  if (!row) return { pass: true };
  const ok = row[cat];
  if (!ok) {
    return {
      pass: false,
      reason: `cargo type ${input.cargoType} requires ${CARGO_NEEDS_EXPLANATION[input.cargoType]}, vessel is ${input.vesselType ?? cat}`,
    };
  }
  return { pass: true };
}

// ────────────────────────────────────────────────────────────────────────────
// Vessel age check — "is vessel young enough for this cargo?"
// ────────────────────────────────────────────────────────────────────────────

export interface VesselAgeCheckInput {
  cargoMaxVesselAgeYrs: number | null;
  vesselBuilt: number | null;
  refYear: number | null;
}

export function checkVesselAge(input: VesselAgeCheckInput): FilterResult {
  const { cargoMaxVesselAgeYrs, vesselBuilt, refYear } = input;
  if (cargoMaxVesselAgeYrs == null || vesselBuilt == null || refYear == null) return { pass: true };
  const age = refYear - vesselBuilt;
  if (age > cargoMaxVesselAgeYrs) {
    return {
      pass: false,
      reason: `vessel age ${age} years exceeds cargo max ${cargoMaxVesselAgeYrs} years`,
    };
  }
  return { pass: true };
}

// ────────────────────────────────────────────────────────────────────────────
// Gear-required check — cargo explicitly requires geared vessel
// ────────────────────────────────────────────────────────────────────────────

export interface GearRequiredCheckInput {
  cargoGearRequired: boolean | null;
  geared: boolean | null;
  originPort: string | null;
  destinationPort: string | null | undefined;
}

export function checkGearRequired(input: GearRequiredCheckInput): FilterResult {
  const { cargoGearRequired, geared } = input;
  // Not required or unknown → pass (conservative)
  if (!cargoGearRequired) return { pass: true };
  // Geared vessel satisfies requirement
  if (geared === true) return { pass: true };
  // Geared unknown → conservative pass
  if (geared == null) return { pass: true };
  // geared === false → check whether either port has shore cranes as substitute
  const loadCranes = portHasShoreCranes(input.originPort);
  if (loadCranes === true) return { pass: true };
  const dischCranes = portHasShoreCranes(input.destinationPort ?? null);
  if (dischCranes === true) return { pass: true };
  return { pass: false, reason: 'cargo requires geared vessel; vessel is gearless and no confirmed shore cranes at load/discharge port' };
}

// ────────────────────────────────────────────────────────────────────────────
// Vessel dimensions check — beam and LOA vs cargo port/cargo maximums
// ────────────────────────────────────────────────────────────────────────────

export interface VesselDimensionsCheckInput {
  vesselBeam: number | null;
  vesselLoa: number | null;
  cargoMaxBeamM: number | null;
  cargoMaxLoaM: number | null;
}

export function checkVesselDimensions(input: VesselDimensionsCheckInput): FilterResult {
  const { vesselBeam, vesselLoa, cargoMaxBeamM, cargoMaxLoaM } = input;
  if (cargoMaxBeamM != null && vesselBeam != null && vesselBeam > cargoMaxBeamM) {
    return {
      pass: false,
      reason: `vessel beam ${vesselBeam}m exceeds cargo max beam ${cargoMaxBeamM}m`,
    };
  }
  if (cargoMaxLoaM != null && vesselLoa != null && vesselLoa > cargoMaxLoaM) {
    return {
      pass: false,
      reason: `vessel LOA ${vesselLoa}m exceeds cargo max LOA ${cargoMaxLoaM}m`,
    };
  }
  return { pass: true };
}

// ────────────────────────────────────────────────────────────────────────────
// Unified runner
// ────────────────────────────────────────────────────────────────────────────

// ────────────────────────────────────────────────────────────────────────────
// IMSBC check — hard-gate ONLY when vessel explicitly restricts DG carriage
//   and cargo is IMSBC Group B (chemical hazard).
//   Group A/C/unknown → always passes here (caution surfaced separately).
// ────────────────────────────────────────────────────────────────────────────

export function checkImsbc(
  cargoDescription: string | null,
  vesselRestrictions?: string[],
): FilterResult {
  const result = checkImsbcLoadability(cargoDescription, { restrictions: vesselRestrictions });
  if (result.verdict !== 'incompatible') return { pass: true };
  return { pass: false, reason: result.rationale };
}

export interface HardFilterInput {
  cargoType: CargoType;
  originPort: string | null;
  destinationPort?: string | null;
  weightMt: Range<number> | number | null;
  cargoDescription: string | null;
  stowageFactor: string | null;
  vesselType: string | null;
  geared: boolean | null;
  draftMax: number | null;
  grainCapacity: number | null;
  dwtSummer: number | null;
  dwcc: number | null;
  vesselRestrictions?: string[];
}

export interface HardFilterResult {
  pass: boolean;
  failures: string[];
  checks: {
    draft: FilterResult;
    crane: FilterResult;
    volume: FilterResult;
    cargoVessel: FilterResult;
    destDraft: FilterResult;
    destCrane: FilterResult;
    cargoWeight: FilterResult;
    imsbc: FilterResult;
  };
}

export function runHardFilters(input: HardFilterInput): HardFilterResult {
  const draft = checkDraft(input.originPort, input.draftMax);
  const crane = checkCrane(input.originPort, input.geared);
  const volume = checkVolume({
    weightMt: input.weightMt,
    cargoDescription: input.cargoDescription,
    stowageFactor: input.stowageFactor,
    grainCapacity: input.grainCapacity,
  });
  const cargoVessel = checkCargoVesselCompat({
    cargoType: input.cargoType,
    vesselType: input.vesselType,
  });
  const destDraft = checkDraft(input.destinationPort ?? null, input.draftMax);
  const destCrane = checkCrane(input.destinationPort ?? null, input.geared);
  const cargoWeight = checkCargoWeight({
    weightMt: input.weightMt,
    dwtSummer: input.dwtSummer,
    dwcc: input.dwcc,
  });
  const imsbc = checkImsbc(input.cargoDescription, input.vesselRestrictions);

  const failures: string[] = [];
  if (!draft.pass && draft.reason) failures.push(draft.reason);
  if (!crane.pass && crane.reason) failures.push(crane.reason);
  if (!volume.pass && volume.reason) failures.push(volume.reason);
  if (!cargoVessel.pass && cargoVessel.reason) failures.push(cargoVessel.reason);
  if (!destDraft.pass && destDraft.reason) failures.push(destDraft.reason);
  if (!destCrane.pass && destCrane.reason) failures.push(destCrane.reason);
  if (!cargoWeight.pass && cargoWeight.reason) failures.push(cargoWeight.reason);
  if (!imsbc.pass && imsbc.reason) failures.push(imsbc.reason);

  return {
    pass: failures.length === 0,
    failures,
    checks: { draft, crane, volume, cargoVessel, destDraft, destCrane, cargoWeight, imsbc },
  };
}

// Unused export to satisfy coverage: callers use getPortMaster through port-master directly
void getPortMaster;

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
import { CargoType } from '../types';

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
  weightMt: number | null;
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
  if (weightMt == null || !Number.isFinite(weightMt) || weightMt <= 0) return { pass: true };
  if (grainCapacity == null || !Number.isFinite(grainCapacity) || grainCapacity <= 0) return { pass: true };

  const sf = resolveStowageFactor(cargoDescription, stowageFactor);
  const requiredM3 = weightMt * sf;
  const capacityWithMargin = grainCapacity * 1.05; // 5% tolerance for "abt" values

  if (requiredM3 > capacityWithMargin) {
    return {
      pass: false,
      reason: `cargo needs ~${Math.round(requiredM3)}m³ (${weightMt}mt × ${sf} stowage) but vessel grain capacity is ${grainCapacity}m³`,
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
// Unified runner
// ────────────────────────────────────────────────────────────────────────────

export interface HardFilterInput {
  cargoType: CargoType;
  originPort: string | null;
  destinationPort?: string | null;
  weightMt: number | null;
  cargoDescription: string | null;
  stowageFactor: string | null;
  vesselType: string | null;
  geared: boolean | null;
  draftMax: number | null;
  grainCapacity: number | null;
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

  const failures: string[] = [];
  if (!draft.pass && draft.reason) failures.push(draft.reason);
  if (!crane.pass && crane.reason) failures.push(crane.reason);
  if (!volume.pass && volume.reason) failures.push(volume.reason);
  if (!cargoVessel.pass && cargoVessel.reason) failures.push(cargoVessel.reason);
  if (!destDraft.pass && destDraft.reason) failures.push(destDraft.reason);
  if (!destCrane.pass && destCrane.reason) failures.push(destCrane.reason);

  return {
    pass: failures.length === 0,
    failures,
    checks: { draft, crane, volume, cargoVessel, destDraft, destCrane },
  };
}

// Unused export to satisfy coverage: callers use getPortMaster through port-master directly
void getPortMaster;

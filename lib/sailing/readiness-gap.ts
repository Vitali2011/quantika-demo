/**
 * Readiness-gap calculator — the core of the matcher fix.
 *
 * For a (vessel, cargo) pair, computes whether the vessel can physically and
 * commercially reach the loading port in time for the laycan window:
 *
 *   arrival_date = vessel.open_date + (port_distance_nm / speed_kn) / 24h
 *   gap_days     = laycan_start - arrival_date
 *
 *   gap > 5    → vessel idle, commercially weak (owner won't wait 1+ week unpaid)
 *   gap 1-5    → ideal
 *   gap -1..0  → tight, barely makes it
 *   gap < -1   → late, should be hard-filtered
 *   any null   → unknown (unparseable input), match not filtered but no credit
 */

import { parseVesselOpenDate, parseLaycan } from './date-parsing';
import { getPortDistance, normalizePortName } from './port-distances';
import { BUNKER_DEFAULTS, VESSEL_CLASS, VesselClassName } from '../constants';

export type ReadinessVerdict = 'ideal' | 'tight' | 'idle' | 'late' | 'unknown';

export interface ReadinessGap {
  openDate: string | null;          // ISO yyyy-mm-dd for serialization
  laycanStart: string | null;
  laycanEnd: string | null;
  distanceNm: number | null;
  speedKn: number | null;
  sailingDays: number | null;
  arrivalDate: string | null;
  gapDays: number | null;
  verdict: ReadinessVerdict;
  explanation: string;
}

export interface VesselInput {
  openDate: string | null;
  openPosition: string | null;
  speedLaden: string | null;
  dwtSummer: number | null;
}

export interface CargoInput {
  laycan: string | null;
  originPort: string | null;
}

export interface CalcOptions {
  refYear?: number;
  today?: Date;
}

/** Parse speed from a free-form string like "12.5 knots" / "abt 13 kn" / "13 knts". */
export function parseSpeedKnots(raw: string | null | undefined): number | null {
  if (!raw || typeof raw !== 'string') return null;
  const m = raw.match(/(\d+(?:\.\d+)?)\s*(?:kn(?:ot|ts|s)?)?/i);
  if (!m) return null;
  const n = Number(m[1]);
  if (Number.isNaN(n) || n <= 0 || n > 40) return null;
  return n;
}

/** Map DWT to handysize/supramax/panamax/capesize class (defaults to handysize). */
export function classifyVesselByDwt(dwt: number | null | undefined): VesselClassName {
  if (!dwt || !Number.isFinite(dwt)) return 'handysize';
  for (const [name, range] of Object.entries(VESSEL_CLASS)) {
    if (dwt >= range.minDwt && dwt <= range.maxDwt) return name as VesselClassName;
  }
  // Gap between handysize (≤35k) and supramax (50k+) — lean handysize for demo
  return dwt < 50000 ? 'handysize' : 'capesize';
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function classifyVerdict(gapDays: number): ReadinessVerdict {
  // gap < -1d     → vessel arrives too late, misses laycan start by > 24h
  // gap [-1, 0.5) → tight — vessel cuts it fine, any delay misses laycan
  // gap [0.5, 5]  → ideal — realistic arrival with small buffer
  // gap > 5d      → idle — vessel must wait multiple days before laycan (commercially weak)
  if (gapDays < -1) return 'late';
  if (gapDays < 0.5) return 'tight';
  if (gapDays <= 5) return 'ideal';
  return 'idle';
}

function buildExplanation(args: {
  vesselPort: string | null;
  cargoPort: string | null;
  openDate: string | null;
  arrivalDate: string | null;
  laycanStart: string | null;
  gapDays: number | null;
  verdict: ReadinessVerdict;
}): string {
  const { vesselPort, cargoPort, openDate, arrivalDate, laycanStart, gapDays, verdict } = args;
  if (verdict === 'unknown') {
    return 'Insufficient data to compute readiness (unparseable date or unknown port).';
  }
  const gap = Math.abs(Math.round(gapDays ?? 0));
  const openStr = openDate ? `open ${vesselPort} ${openDate}` : `open ${vesselPort ?? 'port'}`;
  const arrStr = arrivalDate ? `arrives ${cargoPort} ~${arrivalDate}` : `arrives ${cargoPort ?? 'load port'}`;
  const lcStr = laycanStart ? `laycan starts ${laycanStart}` : 'laycan';

  switch (verdict) {
    case 'ideal':
      return `Vessel ${openStr} → ${arrStr} → ${gap}d before ${lcStr} — clean window.`;
    case 'tight':
      return `Vessel ${openStr} → ${arrStr} → arrives right at ${lcStr} — tight timing.`;
    case 'idle':
      return `Vessel ${openStr} → ${arrStr} → ${gap}d idle before ${lcStr} — owner likely won't wait.`;
    case 'late':
      return `Vessel ${openStr} → ${arrStr} → ${gap}d after ${lcStr} — misses laycan.`;
  }
}

/**
 * Compute a structured readiness assessment for one cargo-vessel pair.
 * All outputs are serializable (ISO date strings, not Date objects) so the
 * result can be persisted into session + passed to the LLM prompt as JSON.
 */
export function calculateReadinessGap(
  vessel: VesselInput,
  cargo: CargoInput,
  opts: CalcOptions = {},
): ReadinessGap {
  const refYear = opts.refYear ?? new Date().getUTCFullYear();
  const today = opts.today ?? new Date();

  const openDateObj = parseVesselOpenDate(vessel.openDate, refYear, today);
  const laycanRange = parseLaycan(cargo.laycan, refYear);
  const distanceNm = getPortDistance(vessel.openPosition, cargo.originPort);

  const vesselPortCanon = normalizePortName(vessel.openPosition) ?? vessel.openPosition ?? null;
  const cargoPortCanon = normalizePortName(cargo.originPort) ?? cargo.originPort ?? null;

  // Determine speed: explicit > default by vessel class
  const explicitSpeed = parseSpeedKnots(vessel.speedLaden);
  const cls = classifyVesselByDwt(vessel.dwtSummer);
  const speedKn = explicitSpeed ?? BUNKER_DEFAULTS[cls].speed;

  // If any critical input is missing → unknown
  if (!openDateObj || !laycanRange || distanceNm == null) {
    return {
      openDate: openDateObj ? isoDay(openDateObj) : null,
      laycanStart: laycanRange ? isoDay(laycanRange.start) : null,
      laycanEnd: laycanRange ? isoDay(laycanRange.end) : null,
      distanceNm,
      speedKn,
      sailingDays: null,
      arrivalDate: null,
      gapDays: null,
      verdict: 'unknown',
      explanation: buildExplanation({
        vesselPort: vesselPortCanon,
        cargoPort: cargoPortCanon,
        openDate: openDateObj ? isoDay(openDateObj) : null,
        arrivalDate: null,
        laycanStart: laycanRange ? isoDay(laycanRange.start) : null,
        gapDays: null,
        verdict: 'unknown',
      }),
    };
  }

  // Compute sailing time + arrival
  const sailingDays = distanceNm / (speedKn * 24);
  const arrivalMs = openDateObj.getTime() + sailingDays * 86_400_000;
  const arrival = new Date(arrivalMs);
  const gapMs = laycanRange.start.getTime() - arrivalMs;
  const gapDays = gapMs / 86_400_000;
  const verdict = classifyVerdict(gapDays);

  return {
    openDate: isoDay(openDateObj),
    laycanStart: isoDay(laycanRange.start),
    laycanEnd: isoDay(laycanRange.end),
    distanceNm,
    speedKn,
    sailingDays: Math.round(sailingDays * 100) / 100,
    arrivalDate: isoDay(arrival),
    gapDays: Math.round(gapDays * 100) / 100,
    verdict,
    explanation: buildExplanation({
      vesselPort: vesselPortCanon,
      cargoPort: cargoPortCanon,
      openDate: isoDay(openDateObj),
      arrivalDate: isoDay(arrival),
      laycanStart: isoDay(laycanRange.start),
      gapDays,
      verdict,
    }),
  };
}

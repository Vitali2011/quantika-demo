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
 *
 * Special case — spot vessels:
 *   When openDate is "spot" / "prompt", the owner is ready to sail immediately.
 *   The broker's question is no longer "will the owner wait?" but "can she
 *   physically arrive before laycan starts?".  We override the verdict:
 *     gapDays >= 0.5  → 'ideal'   (arrives comfortably before laycan)
 *     gapDays [-1, 0.5) → 'tight' (cuts it fine departing today)
 *     gapDays < -1    → 'late'    (even today's departure misses laycan)
 *   This prevents spot vessels from being scored as 'idle' (−15 pts) when they
 *   are actually the most commercially attractive candidates.
 */

import { parseVesselOpenDate, parseLaycan } from './date-parsing';
import { isLaycanExpired } from './date-sanity';
import { getPortDistance, normalizePortName } from './port-distances';
import { isVagueRegion } from './vague-region-detector';
import { BUNKER_DEFAULTS, VESSEL_CLASS, VesselClassName } from '../constants';

/** Maximum gap (days) for a spot vessel to still qualify as 'ideal'.
 *  Beyond this, the owner won't hold the vessel unpaid — verdict degrades to 'idle'. */
export const SPOT_IDEAL_MAX_GAP_DAYS = 30;

export type ReadinessVerdict = 'ideal' | 'tight' | 'idle' | 'late' | 'unknown';

export interface ReadinessGap {
  openDate: string | null;          // ISO yyyy-mm-dd for serialization
  laycanStart: string | null;
  laycanEnd: string | null;
  distanceNm: number | null;
  /** True when distance came from the curated sea-route matrix; false when it
   *  was a great-circle (haversine) approximation; null when distance unknown. */
  distanceExact?: boolean | null;
  speedKn: number | null;
  sailingDays: number | null;
  arrivalDate: string | null;
  gapDays: number | null;
  verdict: ReadinessVerdict;
  explanation: string;
  /** True when the vessel's open date was detected as "spot" / "prompt". */
  isSpot?: boolean;
}

export interface VesselInput {
  openDate: string | null;
  openPosition: string | null;
  speedLaden: string | null;
  dwtSummer: number | null;
  /** Explicit spot flag — set to true when caller already detected "spot" in the
   *  raw open-date string.  When omitted, detectSpot() is called on openDate. */
  isSpot?: boolean;
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

/** Returns true when the raw open-date string signals the vessel is immediately available. */
export function detectSpot(raw: string | null | undefined): boolean {
  if (!raw || typeof raw !== 'string') return false;
  return /\b(spot|prompt|promt)\b/i.test(raw.trim());
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
  isSpot?: boolean;
  /** Optional override — when caller has already built a specific explanation
   *  (e.g. vague-region detection), inject it directly bypassing the generic
   *  "insufficient data" template. */
  unknownExplanation?: string;
}): string {
  const { vesselPort, cargoPort, openDate, arrivalDate, laycanStart, gapDays, verdict, isSpot, unknownExplanation } = args;
  if (verdict === 'unknown') {
    return unknownExplanation ?? 'Insufficient data to compute readiness (unparseable date or unknown port).';
  }
  const gap = Math.abs(Math.round(gapDays ?? 0));
  const openStr = openDate ? `open ${vesselPort} ${openDate}` : `open ${vesselPort ?? 'port'}`;
  const arrStr = arrivalDate ? `arrives ${cargoPort} ~${arrivalDate}` : `arrives ${cargoPort ?? 'load port'}`;
  const lcStr = laycanStart ? `laycan starts ${laycanStart}` : 'laycan';
  const spotPrefix = isSpot ? 'Spot vessel (available immediately) → ' : '';

  switch (verdict) {
    case 'ideal':
      return isSpot
        ? `${spotPrefix}${arrStr} → ${gap}d before ${lcStr} — can sail immediately, ideal.`
        : `Vessel ${openStr} → ${arrStr} → ${gap}d before ${lcStr} — clean window.`;
    case 'tight':
      return isSpot
        ? `${spotPrefix}${arrStr} → cuts it fine for ${lcStr} — tight but feasible.`
        : `Vessel ${openStr} → ${arrStr} → arrives right at ${lcStr} — tight timing.`;
    case 'idle':
      return isSpot
        ? `${spotPrefix}${arrStr} → ${gap}d before ${lcStr} — too far out, spot vessel won't hold unpaid that long.`
        : `Vessel ${openStr} → ${arrStr} → ${gap}d idle before ${lcStr} — owner likely won't wait.`;
    case 'late':
      return isSpot
        ? `${spotPrefix}${arrStr} → misses ${lcStr} by ${gap}d even departing today.`
        : `Vessel ${openStr} → ${arrStr} → ${gap}d after ${lcStr} — misses laycan.`;
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

  // Spot detection: honour explicit flag OR detect from raw open-date string.
  const isSpot = vessel.isSpot ?? detectSpot(vessel.openDate);

  const openDateObj = parseVesselOpenDate(vessel.openDate, refYear, today);
  const laycanRange = parseLaycan(cargo.laycan, refYear);
  const distanceRes = getPortDistance(vessel.openPosition, cargo.originPort);
  const distanceNm = distanceRes?.nm ?? null;
  const distanceExact = distanceRes?.exact ?? null;

  const vesselPortCanon = normalizePortName(vessel.openPosition) ?? vessel.openPosition ?? null;
  const cargoPortCanon = normalizePortName(cargo.originPort) ?? cargo.originPort ?? null;

  // Determine speed: explicit > default by vessel class
  const explicitSpeed = parseSpeedKnots(vessel.speedLaden);
  const cls = classifyVesselByDwt(vessel.dwtSummer);
  const speedKn = explicitSpeed ?? BUNKER_DEFAULTS[cls].speed;

  // Early return: expired laycan is a hard disqualifier — broker should never see this as a match.
  if (laycanRange && !isLaycanExpired(laycanRange, today).valid) {
    const gapDays = Math.round((laycanRange.end.getTime() - today.getTime()) / 86_400_000 * 100) / 100;
    const daysAgo = Math.abs(Math.round(gapDays));
    return {
      openDate: openDateObj ? isoDay(openDateObj) : null,
      laycanStart: isoDay(laycanRange.start),
      laycanEnd: isoDay(laycanRange.end),
      distanceNm,
      distanceExact,
      speedKn,
      sailingDays: null,
      arrivalDate: null,
      gapDays,
      verdict: 'late',
      explanation: `Laycan expired — window ended ${isoDay(laycanRange.end)}, ${daysAgo}d ago.`,
      isSpot,
    };
  }

  // If any critical input is missing → unknown.
  // BUT: when distance is the missing piece, check whether vessel.openPosition
  // or cargo.originPort is a vague region (e.g. "East Coast Greece", "Red Sea",
  // "Tunisia") — surface a specific, actionable hint instead of the generic
  // "insufficient data" message. Verdict stays 'unknown' (we don't invent
  // a distance), only the explanation gets richer.
  if (!openDateObj || !laycanRange || distanceNm == null) {
    let unknownExplanation: string | undefined;
    if (distanceNm == null) {
      const vesselVague = isVagueRegion(vessel.openPosition);
      const cargoVague = isVagueRegion(cargo.originPort);
      const parts: string[] = [];
      if (vesselVague.vague && vesselVague.suggestion) {
        parts.push(`Vessel position: ${vesselVague.suggestion}`);
      }
      if (cargoVague.vague && cargoVague.suggestion) {
        parts.push(`Cargo origin: ${cargoVague.suggestion}`);
      }
      if (parts.length > 0) {
        unknownExplanation = parts.join(' ');
      }
    }
    return {
      openDate: openDateObj ? isoDay(openDateObj) : null,
      laycanStart: laycanRange ? isoDay(laycanRange.start) : null,
      laycanEnd: laycanRange ? isoDay(laycanRange.end) : null,
      distanceNm,
      distanceExact,
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
        isSpot,
        unknownExplanation,
      }),
      isSpot,
    };
  }

  // Compute sailing time + arrival
  const sailingDays = distanceNm / (speedKn * 24);
  const arrivalMs = openDateObj.getTime() + sailingDays * 86_400_000;
  const arrival = new Date(arrivalMs);
  const gapMs = laycanRange.start.getTime() - arrivalMs;
  const gapDays = gapMs / 86_400_000;

  // For non-spot vessels: standard verdict based on how long the owner must wait idle.
  // For spot vessels: owner departs today — the only question is physical feasibility.
  //   gapDays > SPOT_IDEAL_MAX_GAP_DAYS → 'idle' (owner won't hold unpaid 30+ days)
  //   gapDays >= 0.5  → arrives comfortably before laycan → 'ideal'
  //   gapDays [-1, 0.5) → barely makes it → 'tight'
  //   gapDays < -1    → even today's departure misses laycan → 'late'
  const verdict: ReadinessVerdict = isSpot
    ? (gapDays > SPOT_IDEAL_MAX_GAP_DAYS ? 'idle' : gapDays >= 0.5 ? 'ideal' : gapDays >= -1 ? 'tight' : 'late')
    : classifyVerdict(gapDays);

  return {
    openDate: isoDay(openDateObj),
    laycanStart: isoDay(laycanRange.start),
    laycanEnd: isoDay(laycanRange.end),
    distanceNm,
    distanceExact,
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
      isSpot,
    }),
    isSpot,
  };
}

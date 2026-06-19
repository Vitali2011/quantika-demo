/**
 * Vessel vetting — 5 soft signals (flag / class / age / P&I / CII) for the broker-facing fit-%.
 *
 * Pure function, date-independent: age uses the caller-supplied refYear, never Date.now().
 * unknown per-factor → neutral (0.5 share) — true midpoint, missing data ≠ penalty and ≠ reward.
 * This is a SOFT signal: it lowers fit-% and surfaces badges, but does NOT gate / exclude.
 * Sanctions (hard blocking) remain in the sanctions layer — not duplicated here.
 */

import { getParisMouClassification } from '@/lib/sanctions/paris-mou';
import { isIacs } from '@/lib/sanctions/iacs-members';
import { isIgClub } from '@/lib/sanctions/pi-ig-clubs';
import type { ParsedVessel } from '@/lib/types';

export type VettingVerdict = 'ok' | 'caution' | 'warn' | 'unknown';

export interface VettingFactor {
  key: string;
  label: string;
  verdict: VettingVerdict;
  rationale: string;
}

export interface VesselVettingResult {
  /** 0..1 overall vetting score (1.0 = fully clean, 0.5 = all unknown/neutral, lower = concerns). */
  score: number;
  factors: VettingFactor[];
  /** Human-readable labels for caution/warn factors — for UI badges. */
  badges: string[];
}

// Age breakpoints in years — conservative thresholds matching broker intuition for dry-bulk.
const AGE_CAUTION_YR = 15;
const AGE_WARN_YR = 22;

/** Verdict → numeric share contributing to overall score. */
export const VETTING_VERDICT_SHARE: Record<VettingVerdict, number> = {
  ok: 1.0,
  caution: 0.65,
  warn: 0.2,
  unknown: 0.5,
};

// ── Sub-factor scorers ────────────────────────────────────────────────────────

function scoreFlag(flag: string | null): VettingFactor {
  if (!flag) {
    return { key: 'flag', label: 'Flag (Paris MoU)', verdict: 'unknown', rationale: 'flag country not recorded' };
  }
  const tier = getParisMouClassification(flag);
  switch (tier) {
    case 'white':
      return { key: 'flag', label: 'Flag (Paris MoU)', verdict: 'ok', rationale: `${flag} — Paris MoU white list (low detention)` };
    case 'grey':
      return { key: 'flag', label: 'Flag (Paris MoU)', verdict: 'caution', rationale: `${flag} — Paris MoU grey list (elevated detention rate)` };
    case 'black':
      return { key: 'flag', label: 'Flag (Paris MoU)', verdict: 'warn', rationale: `${flag} — Paris MoU black list (high detention rate)` };
    default:
      return { key: 'flag', label: 'Flag (Paris MoU)', verdict: 'unknown', rationale: `${flag} — not in Paris MoU classification` };
  }
}

function scoreClass(classSociety: string | null): VettingFactor {
  if (!classSociety) {
    return { key: 'class', label: 'Class society (IACS)', verdict: 'unknown', rationale: 'class society not recorded' };
  }
  if (isIacs(classSociety)) {
    return { key: 'class', label: 'Class society (IACS)', verdict: 'ok', rationale: `${classSociety} — IACS member` };
  }
  return { key: 'class', label: 'Class society (IACS)', verdict: 'caution', rationale: `${classSociety} — not an IACS member` };
}

function scoreAge(built: number | null, refYear: number): VettingFactor {
  if (built == null) {
    return { key: 'age', label: 'Vessel age', verdict: 'unknown', rationale: 'build year not recorded' };
  }
  const age = refYear - built;
  if (age < 0) {
    return { key: 'age', label: 'Vessel age', verdict: 'unknown', rationale: `build year ${built} is after refYear ${refYear}` };
  }
  if (age <= AGE_CAUTION_YR) {
    return { key: 'age', label: 'Vessel age', verdict: 'ok', rationale: `${age} years — modern vessel` };
  }
  if (age <= AGE_WARN_YR) {
    return { key: 'age', label: 'Vessel age', verdict: 'caution', rationale: `${age} years — mature vessel, higher maintenance risk` };
  }
  return { key: 'age', label: 'Vessel age', verdict: 'warn', rationale: `${age} years — aged vessel, elevated off-hire / inspection risk` };
}

function scorePandi(pandi: string | null): VettingFactor {
  if (!pandi) {
    return { key: 'pandi', label: 'P&I insurance', verdict: 'unknown', rationale: 'P&I club not recorded' };
  }
  if (isIgClub(pandi)) {
    return { key: 'pandi', label: 'P&I insurance', verdict: 'ok', rationale: `${pandi} — IG P&I member` };
  }
  return { key: 'pandi', label: 'P&I insurance', verdict: 'caution', rationale: `${pandi} — not an IG P&I club` };
}

/** PSC detention history — detentions in the lookback window are the single
 *  strongest port-state-control trust signal. 0 → clean; 1 → caution; ≥2 → warn.
 *  Caller supplies the count (resolved from psc_detention_history by IMO upstream,
 *  where the db handle lives) — this module stays pure / db-free. */
function scorePsc(detentionCount: number): VettingFactor {
  if (detentionCount <= 0) {
    return { key: 'psc', label: 'PSC detentions', verdict: 'ok', rationale: 'No port-state-control detentions on record in the lookback window.' };
  }
  if (detentionCount === 1) {
    return { key: 'psc', label: 'PSC detentions', verdict: 'caution', rationale: '1 PSC detention in the lookback window — elevated inspection risk.' };
  }
  return { key: 'psc', label: 'PSC detentions', verdict: 'warn', rationale: `${detentionCount} PSC detentions in the lookback window — high inspection / off-hire risk.` };
}

function scoreCii(ciiRating: 'A' | 'B' | 'C' | 'D' | 'E' | null | undefined): VettingFactor {
  if (ciiRating == null) {
    return { key: 'cii', label: 'CII rating', verdict: 'unknown', rationale: 'CII rating not recorded' };
  }
  if (ciiRating === 'A' || ciiRating === 'B' || ciiRating === 'C') {
    const note = ciiRating === 'C' ? 'meets minimum standard' : 'eco-efficient';
    return { key: 'cii', label: 'CII rating', verdict: 'ok', rationale: `CII ${ciiRating} — ${note}` };
  }
  if (ciiRating === 'D') {
    return { key: 'cii', label: 'CII rating', verdict: 'caution', rationale: 'CII D — below standard; eco-risk' };
  }
  return { key: 'cii', label: 'CII rating', verdict: 'warn', rationale: 'CII E — poor rating; elevated eco-risk and potential cargo owner push-back' };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Compute a vetting signal for a vessel.
 *
 * @param vessel  - vessel fields (flag, built, classSociety, pandi, ciiRating)
 * @param opts    - { refYear } — used for age arithmetic; caller-supplied, never Date.now()
 */
export function computeVesselVetting(
  vessel: Pick<ParsedVessel, 'flag' | 'built' | 'classSociety' | 'pandi' | 'ciiRating'>,
  opts: { refYear: number; detentionCount?: number },
): VesselVettingResult {
  const { refYear, detentionCount } = opts;

  const factors: VettingFactor[] = [
    scoreFlag(vessel.flag),
    scoreClass(vessel.classSociety),
    scoreAge(vessel.built, refYear),
    scorePandi(vessel.pandi),
    scoreCii(vessel.ciiRating),
  ];
  // PSC is optional: only included when the caller supplies a count (db-resolved).
  // Absent → 5 factors, preserving every existing caller's behaviour.
  if (detentionCount != null) {
    factors.push(scorePsc(detentionCount));
  }

  const avgShare =
    factors.reduce((sum, f) => sum + VETTING_VERDICT_SHARE[f.verdict], 0) / factors.length;

  const badges = factors
    .filter((f) => f.verdict === 'caution' || f.verdict === 'warn')
    .map((f) => f.label);

  return { score: avgShare, factors, badges };
}

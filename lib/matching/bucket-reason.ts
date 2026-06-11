import { breakevenTceByDwt } from '@/lib/economics/breakeven-thresholds';
import type { MatchLevel, ReadinessVerdict } from '@/lib/types';

export type RealismBucket = 'main' | 'lowConfidence' | 'insufficientData' | 'blocked';

export interface BucketReason {
  bucket: RealismBucket;
  reason: string;
}

export interface BucketReasonInput {
  verdict: ReadinessVerdict;
  gapDays: number | null;
  matchLevel: MatchLevel;
  tceUsdPerDay: number | null;
  vesselDwt: number | null;
  issues: string[];
}

const IDLE_HARD_MAX_GAP_DAYS = 21;

/** Pure mirror of the realism-bucket partition, returning a broker-facing reason.
 *  Evaluated once at persist time; the UI renders the string verbatim. */
export function deriveBucketReason(i: BucketReasonInput): BucketReason {
  if (i.verdict === 'unknown')
    return { bucket: 'insufficientData', reason: 'No distance/timing data — readiness verdict is unknown.' };
  if (i.verdict === 'idle' && i.gapDays != null && i.gapDays > IDLE_HARD_MAX_GAP_DAYS)
    return { bucket: 'lowConfidence', reason: `Vessel idle ${i.gapDays} days before laycan (> ${IDLE_HARD_MAX_GAP_DAYS}-day cap).` };
  if (i.matchLevel === 'weak')
    return { bucket: 'lowConfidence', reason: 'Fit score is in the weak band.' };
  if (i.issues.some((s) => s.startsWith('SIZE:')))
    return { bucket: 'lowConfidence', reason: 'Deadfreight risk — cargo undersized for the vessel.' };
  if (i.tceUsdPerDay != null && i.vesselDwt != null) {
    const floor = breakevenTceByDwt(i.vesselDwt);
    if (i.tceUsdPerDay < floor)
      return { bucket: 'lowConfidence',
        reason: `TCE $${Math.round(i.tceUsdPerDay).toLocaleString('en-US')}/day is below the $${floor.toLocaleString('en-US')}/day breakeven for this size.` };
  }
  return { bucket: 'main', reason: 'Passed all hard filters and economic thresholds.' };
}

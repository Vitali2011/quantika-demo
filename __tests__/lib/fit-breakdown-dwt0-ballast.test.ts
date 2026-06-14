/**
 * Regression lock: scoreBallast with vesselDwt=0 must return conservative unknown,
 * not classify as handysize (which was the pre-fix behavior via classifyVesselByDwt(0)).
 * Mirrors scoreClassFit guard at line 259: `vesselDwt <= 0`.
 */

import { scoreBallast } from '@/lib/sailing/fit-breakdown';
import { FIT_WEIGHTS } from '@/lib/sailing/fit-breakdown';

const UNKNOWN_SHARE = 0.6; // matches UNKNOWN_SHARE constant in fit-breakdown

describe('scoreBallast — dwt=0 guard', () => {
  it('returns conservative unknown score for vesselDwt=0', () => {
    const result = scoreBallast(200, 0);
    // conservative = 60% of weight, not a full class-based score
    const expectedScore = Math.round(FIT_WEIGHTS.ballast * UNKNOWN_SHARE * 10) / 10;
    expect(result.score).toBe(expectedScore);
    expect(result.factor).toBe('ballast');
  });

  it('returns a rationale string (not handysize class label) for vesselDwt=0', () => {
    const result = scoreBallast(200, 0);
    expect(result.rationale).toContain('DWT not stated');
  });

  it('still scores normally for a valid handysize vessel (15000 DWT)', () => {
    // This ensures the guard does NOT affect legitimate small vessels
    const result = scoreBallast(200, 15000);
    const maxScore = FIT_WEIGHTS.ballast;
    expect(result.score).toBeGreaterThan(maxScore * UNKNOWN_SHARE);
  });
});

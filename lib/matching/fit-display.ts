import { StoredMatch } from './matches-repository';
import { effectiveScore } from '../utils/effective-score';

export interface FitDisplay { value: number; label: string; }

export function fitDisplay(m: Pick<StoredMatch, 'score' | 'fit_percent' | 'laycan_end' | 'laycan_start'>, nowMs: number): FitDisplay {
  if (m.fit_percent != null) return { value: Math.round(m.fit_percent), label: '% fit' };
  return { value: effectiveScore(m, nowMs), label: '%' };
}

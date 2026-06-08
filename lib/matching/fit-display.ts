import { StoredMatch } from './matches-repository';
import { isLaycanExpired } from '../utils/fmt-laycan';

function effectiveScore(m: Pick<StoredMatch, 'score' | 'laycan_end' | 'laycan_start'>, nowMs: number): number {
  if (nowMs === 0) return m.score;
  if (isLaycanExpired(m.laycan_end, m.laycan_start, nowMs)) return Math.min(m.score, 70);
  return m.score;
}

export interface FitDisplay { value: number; label: string; }

export function fitDisplay(m: Pick<StoredMatch, 'score' | 'fit_percent' | 'laycan_end' | 'laycan_start'>, nowMs: number): FitDisplay {
  if (m.fit_percent != null) return { value: Math.round(m.fit_percent), label: '% fit' };
  return { value: effectiveScore(m, nowMs), label: '%' };
}

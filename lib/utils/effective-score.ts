import { isLaycanExpired } from './fmt-laycan';

export function effectiveScore(
  m: { score: number; laycan_end: number | null; laycan_start: number | null },
  nowMs: number,
): number {
  if (nowMs === 0) return m.score;
  if (isLaycanExpired(m.laycan_end, m.laycan_start, nowMs)) return Math.min(m.score, 70);
  return m.score;
}

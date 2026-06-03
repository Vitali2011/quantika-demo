export function fmtLaycan(start: number | null, end: number | null): string {
  if (!start && !end) return '—';
  const fmt = (ts: number) =>
    new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  if (start && end) return `${fmt(start)}–${fmt(end)}`;
  if (start) return fmt(start);
  return fmt(end!);
}

// Returns true when the laycan window has already passed.
// Uses laycan_end as the primary expiry reference; falls back to laycan_start.
// Both values are Unix milliseconds (canonical unit; same as laycan_start/laycan_end in StoredMatch).
export function isLaycanExpired(
  end: number | null,
  start: number | null,
  nowMs?: number,
): boolean {
  const now = nowMs ?? Date.now();
  const ref = end ?? start;
  if (ref === null) return false;
  return ref < now;
}

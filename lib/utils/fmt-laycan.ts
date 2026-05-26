export function fmtLaycan(start: number | null, end: number | null): string {
  if (!start && !end) return '—';
  const fmt = (ts: number) =>
    new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (start && end) return `${fmt(start)}–${fmt(end)}`;
  if (start) return fmt(start);
  return fmt(end!);
}

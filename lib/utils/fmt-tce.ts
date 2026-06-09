export function fmtTce(v: number | null): string {
  if (v == null) return '—';
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  return `${sign}$${(abs / 1000).toFixed(1)}k`;
}

import type { StoredMatch } from './matches-repository';

const CSV_HEADER = 'id,cargo_id,vessel_id,score,status,cargo_type,load_port,discharge_port,created_at';

function escapeField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '""';
  const str = String(value);
  return str.includes(',') || str.includes('"') || str.includes('\n')
    ? `"${str.replace(/"/g, '""')}"`
    : str;
}

export function matchesToCsv(matches: StoredMatch[]): string {
  const rows = matches.map((m) =>
    [
      m.id,
      escapeField(m.cargo_id),
      escapeField(m.vessel_id),
      m.score,
      m.status,
      escapeField(m.cargo_type),
      escapeField(m.load_port),
      escapeField(m.discharge_port),
      new Date(m.created_at).toISOString(),
    ].join(',')
  );
  return [CSV_HEADER, ...rows].join('\n');
}

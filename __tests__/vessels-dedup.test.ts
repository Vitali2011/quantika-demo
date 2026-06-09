/**
 * Regression #885-F2: dedupRows behavioral tests — vessel name-collision dedup.
 * Locks the fix in app/vessels/page.tsx that collapses same-name vessels to 1 row.
 */
import { dedupRows } from '@/app/vessels/page';
import type { VesselRow } from '@/app/vessels/VesselsClient';

function makeRow(vesselName: string, openDate: string | null, status: 'open' | 'match' = 'open'): VesselRow {
  return {
    id: `${vesselName}:${openDate ?? 'null'}`,
    emailId: `email-${vesselName}-${openDate ?? 'null'}`,
    itemIndex: 0,
    vesselName,
    vesselType: 'bulk carrier',
    vesselKey: 'bulk',
    dwtSummer: '50k',
    openPosition: 'Rotterdam',
    openDate,
    status,
    sourceTag: 'Email',
    sourceName: 'Test Broker',
  };
}

// Pre-sort utility matching page.tsx logic: newest date first, nulls last.
function presort(rows: VesselRow[]): VesselRow[] {
  return [...rows].sort((a, b) => {
    const da = a.openDate ?? '';
    const db = b.openDate ?? '';
    return db.localeCompare(da);
  });
}

function keyFn(r: VesselRow): string {
  return r.vesselName && r.vesselName !== 'Unknown vessel' ? r.vesselName : r.id;
}

describe('dedupRows — regression #885-F2', () => {
  it('3 rows named "SEAGULL 41" with different openDates collapse to 1 row', () => {
    const rows = presort([
      makeRow('SEAGULL 41', '2026-06-04'),
      makeRow('SEAGULL 41', '2026-05-31'),
      makeRow('SEAGULL 41', '2026-05-25'),
    ]);
    const result = dedupRows(rows, keyFn);
    expect(result).toHaveLength(1);
  });

  it('keeps the newest openDate when collapsing duplicates', () => {
    const rows = presort([
      makeRow('SEAGULL 41', '2026-06-04'),
      makeRow('SEAGULL 41', '2026-05-31'),
      makeRow('SEAGULL 41', '2026-05-25'),
    ]);
    const result = dedupRows(rows, keyFn);
    expect(result[0].openDate).toBe('2026-06-04');
  });

  it('vessel with null openDate sorts after dated vessels and is not promoted', () => {
    // null-date row appears last in presort (empty string localeCompare loses)
    const rows = presort([
      makeRow('SEAGULL 41', '2026-06-04'),
      makeRow('SEAGULL 41', null),
    ]);
    // Pre-sort should place the dated row first
    expect(rows[0].openDate).toBe('2026-06-04');
    const result = dedupRows(rows, keyFn);
    expect(result).toHaveLength(1);
    expect(result[0].openDate).toBe('2026-06-04');
  });

  it('match-status row wins over open-status row regardless of insertion order', () => {
    // Match row comes AFTER the open row in iteration (presort puts newer date first,
    // but here we test the match-preference logic directly)
    const open = makeRow('SEAGULL 41', '2026-06-04', 'open');
    const match = makeRow('SEAGULL 41', '2026-05-25', 'match');
    // Simulate: open row seen first (newer date), match row seen second
    const result = dedupRows([open, match], keyFn);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('match');
  });

  it('distinct vessel names each produce a separate row', () => {
    const rows = presort([
      makeRow('SEAGULL 41', '2026-06-04'),
      makeRow('SEAGULL 42', '2026-06-04'),
      makeRow('SEAGULL 43', '2026-06-04'),
    ]);
    const result = dedupRows(rows, keyFn);
    expect(result).toHaveLength(3);
  });

  it('"Unknown vessel" rows are never collapsed (each gets its own id key)', () => {
    const rows = [
      makeRow('Unknown vessel', '2026-06-04'),
      makeRow('Unknown vessel', '2026-05-31'),
    ];
    // Override id to be unique per row
    rows[0].id = 'email1:0';
    rows[1].id = 'email2:0';
    const result = dedupRows(rows, keyFn);
    expect(result).toHaveLength(2);
  });
});

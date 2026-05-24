import { matchesToCsv } from '../matches-csv';
import type { StoredMatch } from '../matches-repository';

function makeMatch(overrides: Partial<StoredMatch> = {}): StoredMatch {
  return {
    id: 1,
    cargo_id: 'CARGO-1',
    vessel_id: 'VESSEL-1',
    score: 75,
    reason: '{}',
    status: 'shortlist',
    user_id: null,
    created_at: new Date('2026-05-21T12:00:00Z').getTime(),
    updated_at: new Date('2026-05-21T12:00:00Z').getTime(),
    reason_structured: null,
    cargo_type: null,
    load_port: null,
    discharge_port: null,
    laycan_start: null,
    laycan_end: null,
    vessel_dwt: null,
    tce_usd_per_day: null,
    distance_nm: null,
    freight_rate_usd_per_mt: null,
    freight_rate_source: null,
    ...overrides,
  };
}

describe('matchesToCsv — header', () => {
  it('first line is the correct CSV header', () => {
    const csv = matchesToCsv([]);
    const firstLine = csv.split('\n')[0];
    expect(firstLine).toBe('id,cargo_id,vessel_id,score,status,cargo_type,load_port,discharge_port,created_at');
  });

  it('empty matches array returns header only (1 line)', () => {
    const csv = matchesToCsv([]);
    expect(csv.split('\n')).toHaveLength(1);
  });
});

describe('matchesToCsv — row count', () => {
  it('2 matches → 3 lines (header + 2 data rows)', () => {
    const m1 = makeMatch({ id: 1 });
    const m2 = makeMatch({ id: 2, cargo_id: 'CARGO-2' });
    const csv = matchesToCsv([m1, m2]);
    expect(csv.split('\n')).toHaveLength(3);
  });

  it('single match → 2 lines (header + 1 data row)', () => {
    const csv = matchesToCsv([makeMatch()]);
    expect(csv.split('\n')).toHaveLength(2);
  });
});

describe('matchesToCsv — field values', () => {
  it('data row contains correct id, score, status', () => {
    const m = makeMatch({ id: 42, score: 88, status: 'saved' });
    const csv = matchesToCsv([m]);
    const row = csv.split('\n')[1];
    expect(row).toMatch(/^42,/);
    expect(row).toContain(',88,');
    expect(row).toContain(',saved,');
  });

  it('null optional fields appear as empty quoted strings', () => {
    const m = makeMatch({ cargo_type: null, load_port: null, discharge_port: null });
    const csv = matchesToCsv([m]);
    const row = csv.split('\n')[1];
    // cargo_type, load_port, discharge_port should be ""
    expect(row).toContain('"",');
  });

  it('populated optional fields appear in row', () => {
    const m = makeMatch({
      cargo_type: 'grain',
      load_port: 'NLRTM',
      discharge_port: 'USNYC',
    });
    const csv = matchesToCsv([m]);
    const row = csv.split('\n')[1];
    expect(row).toContain('grain');
    expect(row).toContain('NLRTM');
    expect(row).toContain('USNYC');
  });

  it('created_at is serialized as ISO string', () => {
    const ts = new Date('2026-05-21T12:00:00Z').getTime();
    const m = makeMatch({ created_at: ts });
    const csv = matchesToCsv([m]);
    const row = csv.split('\n')[1];
    expect(row).toContain('2026-05-21T12:00:00.000Z');
  });

  it('field containing comma is quoted', () => {
    const m = makeMatch({ cargo_id: 'CARGO,WITH,COMMAS' });
    const csv = matchesToCsv([m]);
    const row = csv.split('\n')[1];
    expect(row).toContain('"CARGO,WITH,COMMAS"');
  });
});

describe('matchesToCsv — bulk selection (2+ matches)', () => {
  it('3 selected matches produce 4-line CSV with all ids present', () => {
    const matches = [
      makeMatch({ id: 10, cargo_id: 'C-10' }),
      makeMatch({ id: 20, cargo_id: 'C-20' }),
      makeMatch({ id: 30, cargo_id: 'C-30' }),
    ];
    const csv = matchesToCsv(matches);
    const lines = csv.split('\n');
    expect(lines).toHaveLength(4);
    expect(lines[1]).toMatch(/^10,/);
    expect(lines[2]).toMatch(/^20,/);
    expect(lines[3]).toMatch(/^30,/);
  });
});

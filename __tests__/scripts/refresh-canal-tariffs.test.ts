/**
 * W6a — I12: refresh-canal-tariffs stub tags rows as manual-{date}, not llm:refresh-{date}.
 * PI2: behavioral test — call fetchUpdatedRates, inspect returned source strings.
 */

import { fetchUpdatedRates } from '@/scripts/refresh-canal-tariffs';
import type { CanalTariffRow } from '@/lib/economics/canals/types';

const FIXTURE_ROWS: CanalTariffRow[] = [
  {
    id: 1,
    canal: 'suez',
    vessel_type: 'bulker',
    scnt_min: null,
    scnt_max: null,
    base_fee_usd: 50000,
    per_scnt_fee_usd: 0,
    war_risk_zone: null,
    valid_from: '2026-01-01',
    valid_to: null,
    source: 'static-seed',
  },
];

describe('fetchUpdatedRates', () => {
  it('tags returned rows with manual-{YYYY-MM-DD}, not llm:refresh-{date}', async () => {
    const rows = await fetchUpdatedRates('suez', FIXTURE_ROWS);
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toMatch(/^manual-\d{4}-\d{2}-\d{2}$/);
    expect(rows[0].source).not.toContain('llm:refresh');
  });

  it('sets valid_from to today', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const rows = await fetchUpdatedRates('suez', FIXTURE_ROWS);
    expect(rows[0].valid_from).toBe(today);
  });
});

/**
 * @jest-environment jsdom
 *
 * Spec β-13: 4 build-functions for one-click inserts.
 * Each returns InsertResult { html, plain } — non-empty, role-specific.
 */
import { buildBenchmarkInsert } from '../../../extensions/gmail/inserts/benchmark';
import { buildPassportInsert } from '../../../extensions/gmail/inserts/passport';
import { buildEconomicsInsert } from '../../../extensions/gmail/inserts/economics';
import { buildBimcoInsert } from '../../../extensions/gmail/inserts/bimco';

describe('buildBenchmarkInsert', () => {
  it('returns non-empty html + plain with route + rate + source', async () => {
    const fetcher = jest.fn().mockResolvedValue({
      route: 'TC5',
      rate: 12683,
      date: '2026-04-15',
      source: 'Toepfer TMI',
    });
    const out = await buildBenchmarkInsert('TC5', { fetcher });
    expect(out.html.length).toBeGreaterThan(0);
    expect(out.plain.length).toBeGreaterThan(0);
    expect(out.html).toMatch(/<table/i);
    expect(out.html).toContain('TC5');
    expect(out.html).toContain('12,683');
    expect(out.html).toContain('Toepfer TMI');
    expect(out.plain).toContain('TC5');
    expect(out.plain).toContain('12683');
    expect(out.plain).toContain('Toepfer TMI');
  });

  it('falls back to a placeholder row when fetcher returns null', async () => {
    const fetcher = jest.fn().mockResolvedValue(null);
    const out = await buildBenchmarkInsert('TC7', { fetcher });
    expect(out.html).toContain('TC7');
    expect(out.plain).toContain('TC7');
    expect(out.plain.toLowerCase()).toContain('n/a');
  });
});

describe('buildPassportInsert', () => {
  it('renders vessel name, IMO, dwt, year, flag and last fixtures', async () => {
    const fetcher = jest.fn().mockResolvedValue({
      name: 'MV TEST',
      imo: '1234567',
      dwt: 82000,
      year: 2018,
      flag: 'Liberia',
      fixtures: [
        { date: '2026-04-01', route: 'USG-CONT', rate: 28 },
        { date: '2026-03-12', route: 'ECSA-FE', rate: 35 },
        { date: '2026-02-20', route: 'BSEA-MED', rate: 22 },
      ],
    });
    const out = await buildPassportInsert('1234567', { fetcher });
    expect(out.html).toContain('MV TEST');
    expect(out.html).toContain('1234567');
    expect(out.html).toContain('82,000');
    expect(out.html).toContain('2018');
    expect(out.html).toContain('Liberia');
    expect(out.html).toContain('USG-CONT');
    expect(out.plain).toContain('MV TEST');
    expect(out.plain).toContain('IMO');
    expect(out.plain).toContain('1234567');
    expect(out.plain).toContain('ECSA-FE');
  });
});

describe('buildEconomicsInsert', () => {
  it('formats TCE and freight rate from GET /api/matches/[id] (W9 shape)', async () => {
    const fetcher = jest.fn().mockResolvedValue({
      tce_usd_per_day: 18500,
      freight_rate_usd_per_mt: 28.5,
      load_port: 'Houston',
      discharge_port: 'Rotterdam',
    });
    const out = await buildEconomicsInsert('V-1', { fetcher });
    expect(out.html).toContain('TCE');
    expect(out.html).toContain('18,500');
    expect(out.html).toContain('28.5');
    expect(out.html).toContain('Houston');
    expect(out.html).toContain('Rotterdam');
    expect(out.plain).toContain('TCE');
    expect(out.plain).toContain('18,500');
    expect(out.plain).toContain('Houston');
    expect(out.plain).toContain('Rotterdam');
  });

  it('shows fallback when tce_usd_per_day is null', async () => {
    const fetcher = jest.fn().mockResolvedValue({ tce_usd_per_day: null, freight_rate_usd_per_mt: null, load_port: null, discharge_port: null });
    const out = await buildEconomicsInsert('M-99', { fetcher });
    expect(out.html).toContain('M-99');
    expect(out.plain).toContain('n/a');
  });
});

describe('buildBimcoInsert', () => {
  it('returns a war-risk clause with non-empty html + plain', () => {
    const out = buildBimcoInsert('war');
    expect(out.html.toLowerCase()).toContain('war');
    expect(out.plain.toLowerCase()).toContain('war');
    expect(out.html).toContain('BIMCO');
  });

  it('returns sanctions, cyber and bio clauses', () => {
    const s = buildBimcoInsert('sanctions');
    const c = buildBimcoInsert('cyber');
    const b = buildBimcoInsert('bio');
    expect(s.plain.toLowerCase()).toContain('sanction');
    expect(c.plain.toLowerCase()).toContain('cyber');
    expect(b.plain.toLowerCase()).toMatch(/bio|fouling/);
  });
});

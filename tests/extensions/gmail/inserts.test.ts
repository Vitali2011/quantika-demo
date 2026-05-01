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
  it('formats TCE / bunker / war / ETS from voyage breakdown', async () => {
    const fetcher = jest.fn().mockResolvedValue({
      voyageId: 'V-1',
      breakdown: {
        bunker_usd: 800000,
        war_risk_usd: 25000,
        ets_usd: 15000,
        ets_eur: 14000,
        canal_usd: 0,
        da_usd: 60000,
        gross_freight_usd: 1500000,
        total_costs_usd: 900000,
        net_voyage_usd: 600000,
        daily_tce_usd: 18500,
        applicable: { bunker: true, canal: false, da: true, war_risk: true, ets: true },
      },
    });
    const out = await buildEconomicsInsert('V-1', { fetcher });
    expect(out.html).toContain('TCE');
    expect(out.html).toContain('18,500');
    expect(out.html).toContain('800,000');
    expect(out.plain).toContain('TCE');
    expect(out.plain).toContain('18500');
    expect(out.plain).toContain('Bunker');
    expect(out.plain).toContain('War');
    expect(out.plain).toContain('ETS');
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

/**
 * @jest-environment jsdom
 *
 * BUG-β-13-PassportNaN — passport.ts must not crash on null/undefined/NaN
 * numeric fields (dwt, fixture rate). Use fmtNum helper that returns 'n/a'.
 */
import { buildPassportInsert } from '../../../extensions/gmail/inserts/passport';

describe('BUG-β-13-PassportNaN', () => {
  it('renders n/a when dwt is undefined', async () => {
    const fetcher = jest.fn().mockResolvedValue({
      name: 'V',
      imo: '123',
      dwt: undefined as unknown as number,
      year: 2020,
      flag: 'PA',
      fixtures: [],
    });
    const out = await buildPassportInsert('v1', { fetcher });
    expect(out.html).toContain('n/a');
    expect(out.html).not.toContain('NaN');
  });

  it('renders n/a when fixture rate is null', async () => {
    const fetcher = jest.fn().mockResolvedValue({
      name: 'V',
      imo: '123',
      dwt: 50000,
      year: 2020,
      flag: 'PA',
      fixtures: [
        { date: '2026-01-01', route: 'A-B', rate: null as unknown as number },
      ],
    });
    const out = await buildPassportInsert('v1', { fetcher });
    expect(out.html).toContain('n/a');
    expect(out.html).not.toContain('NaN');
  });

  it('renders n/a when fixture rate is NaN', async () => {
    const fetcher = jest.fn().mockResolvedValue({
      name: 'V',
      imo: '123',
      dwt: 50000,
      year: 2020,
      flag: 'PA',
      fixtures: [{ date: '2026-01-01', route: 'A-B', rate: NaN }],
    });
    const out = await buildPassportInsert('v1', { fetcher });
    expect(out.html).not.toContain('NaN');
  });
});

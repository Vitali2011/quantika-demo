import { getVesselPassport } from '../counterparty';
import type { VesselPassport } from '../counterparty';

jest.mock('../sanctions/opensanctions', () => ({
  checkVesselSanctions: jest.fn().mockResolvedValue({
    sanctioned: false,
    matches: [],
    sources: [],
  }),
}));

describe('getVesselPassport', () => {
  it('returns a VesselPassport for a valid IMO', async () => {
    const passport: VesselPassport = await getVesselPassport('9074729');
    expect(passport).toMatchObject({
      imo: '9074729',
    });
    expect(passport).toHaveProperty('flag');
    expect(passport).toHaveProperty('class');
    expect(passport).toHaveProperty('pi');
    expect(passport).toHaveProperty('sanctions');
    expect(passport).toHaveProperty('shadowFleet');
  });

  it('passport.class.isIacs reflects isIacs check', async () => {
    const passport = await getVesselPassport('9074729');
    expect(typeof passport.class.isIacs).toBe('boolean');
  });

  it('passport.pi.isIg reflects isIgClub check', async () => {
    const passport = await getVesselPassport('9074729');
    expect(typeof passport.pi.isIg).toBe('boolean');
  });

  it('passport.sanctions.sanctioned is false when checkVesselSanctions returns no positive matches', async () => {
    const passport = await getVesselPassport('9074729');
    expect(passport.sanctions.sanctioned).toBe(false);
  });

  it('passport.shadowFleet.riskLevel is one of the valid values', async () => {
    const passport = await getVesselPassport('9074729');
    expect(['none', 'low', 'medium', 'high']).toContain(passport.shadowFleet.riskLevel);
  });

  it('is idempotent — second call for same IMO returns same shape', async () => {
    const p1 = await getVesselPassport('9074729');
    const p2 = await getVesselPassport('9074729');
    expect(p1.imo).toBe(p2.imo);
    expect(p1.sanctions.sanctioned).toBe(p2.sanctions.sanctioned);
  });

  it('sanctions.sanctioned is true when checkVesselSanctions reports a hit', async () => {
    const { checkVesselSanctions } = jest.requireMock('../sanctions/opensanctions') as {
      checkVesselSanctions: jest.Mock;
    };
    checkVesselSanctions.mockResolvedValueOnce({
      sanctioned: true,
      matches: [{ id: 'Q1', caption: 'Test', score: 0.95, datasets: ['us_ofac_sdn'], properties: {} }],
      sources: ['us_ofac_sdn'],
    });

    const passport = await getVesselPassport('9999999');
    expect(passport.sanctions.sanctioned).toBe(true);
    expect(passport.sanctions.sources).toContain('us_ofac_sdn');
  });
});

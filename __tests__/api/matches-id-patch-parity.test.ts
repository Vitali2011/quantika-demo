import Database from 'better-sqlite3';
import { NextRequest } from 'next/server';
import { allMigrations } from '@/lib/migrations/index';
import { runMigrations } from '@/lib/migrations/runner';
import { createMatch } from '@/lib/matching/matches-repository';
import { computeStoredMatchEconomics } from '@/lib/matching/stored-match-economics';
import { requireSession } from '@/lib/session';

let testDb: Database.Database;
jest.mock('@/lib/session-store', () => ({
  getStore: () => ({ getDatabase: () => testDb, getDb: () => testDb }),
}));
jest.mock('@/lib/session', () => ({ requireSession: jest.fn() }));

describe('PATCH /api/matches/[id] — #1000 single-voyage parity & non-negative TCE', () => {
  const env = process.env.MATCHES_ENABLED;
  beforeEach(() => {
    testDb = new Database(':memory:');
    runMigrations(testDb, allMigrations);
    process.env.MATCHES_ENABLED = 'true';
    (requireSession as jest.Mock).mockReturnValue({
      sessionId: 'sid',
      session: { id: 'sid', parsedCargos: [], parsedVessels: [] },
    });
  });
  afterEach(() => {
    testDb.close();
    process.env.MATCHES_ENABLED = env;
  });

  it('Recalculate at market rate is positive and uses persisted single-voyage inputs', async () => {
    // Real port pair with a resolvable ballast leg (open=Piraeus, load=Odessa, disch=Rotterdam).
    const m = createMatch(testDb, {
      cargo_id: 'c1', vessel_id: 'v1', score: 80, reason: 'x', user_id: 'sid',
      cargo_type: 'GRAIN', load_port: 'Odessa', discharge_port: 'Rotterdam',
      vessel_dwt: 56000, vessel_name: 'TEST',
      vessel_open_position: 'Piraeus', vessel_speed_kts: 13, vessel_consumption_mt_per_day: 28,
      cargo_quantity_mt: 52000,
    });

    const { PATCH } = await import('@/app/api/matches/[id]/route');
    const req = new NextRequest(`http://localhost/api/matches/${m.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ freight_rate_usd_per_mt: 30 }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: String(m.id) }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tce_usd_per_day).toBeGreaterThan(0); // #1000 AC-E2 / AC-1a

    // Parity with the canonical economics seam (the LIST/fit path) at the same rate.
    const seam = computeStoredMatchEconomics({
      cargo: {
        emailId: 'c1', itemIndex: 0,
        originPort: { value: 'Odessa', confidence: 'interpreted' },
        destinationPort: { value: 'Rotterdam', confidence: 'interpreted' },
        cargoType: 'GRAIN' as unknown as 'BULK',
        cargoDescription: null, weightMt: { value: 52000, confidence: 'interpreted' },
        weightMtMin: null, weightMtMax: null, volumeCbm: null, dimensions: null,
        containerType: null, quantity: null, incoterms: null, preferredDates: null,
        laycan: null, loadingRate: null, dischargeRate: null, commissionPercent: null,
        commissionTerms: null, freightRateUsd: null, specialRequirements: null,
        stowageFactor: null, missingInfo: [], originCountry: null, destinationCountry: null,
      } as never,
      vessel: {
        emailId: 'v1', itemIndex: 0, vesselName: { value: 'TEST', confidence: 'interpreted' },
        imo: null, flag: null, built: null, classSociety: null, pandi: null,
        dwtSummer: { value: 56000, confidence: 'interpreted' }, dwcc: null, draftMax: null,
        loa: null, beam: null, grt: null, nrt: null, holdsCount: null, hatchesCount: null,
        grainCapacity: null, grainCapacityUnit: null, baleCapacity: null, holdDimensions: null,
        hatchDimensions: null, tankTopStrength: null, geared: null, craneCapacity: null,
        hatchType: null, vesselType: null,
        openPosition: { value: 'Piraeus', confidence: 'interpreted' }, openDate: null,
        direction: null, restrictions: [], lastCargoes: null, speedLaden: '13',
        speedBallast: null, consumption: '28', deckCapacity: null, specialFeatures: [],
      } as never,
      db: testDb,
      freightOverrideUsdPerMt: 30,
      // Same live NLRTM/VLSFO price the PATCH route + the stored LIST path both
      // resolve (migration seeds 791) — #1000 is about vessel/cargo inputs, not
      // bunker, which the two paths already share.
      bunkerPriceUsdPerMt: 791,
    });
    expect(seam.tce_usd_per_day).not.toBeNull();
    const detail = body.tce_usd_per_day as number;
    const list = seam.tce_usd_per_day as number;
    expect(Math.abs(detail - list) / Math.abs(list)).toBeLessThanOrEqual(0.05); // AC-1d ±5%
  });
});

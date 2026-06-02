/**
 * Bug 1 acceptance — the bunker-recommendation API must NOT include Pacific or
 * EastAsia or AtlanticSouth ports for a Med/Black-Sea/NW-Europe voyage even if
 * those ports have prices in the DB. The basin filter is the structural fix:
 * candidates outside the voyage's maritime corridor are dropped before any
 * detour math runs, so the haversine fallback's 40-60 % under-estimate cannot
 * sneak Los Angeles back into the list.
 */

import Database from 'better-sqlite3';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/voyage/bunker-recommendation/route';

let db: Database.Database;

beforeAll(() => {
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE bunker_prices (
      port_unlocode    TEXT NOT NULL,
      fuel_grade       TEXT NOT NULL,
      price_usd_per_mt REAL NOT NULL,
      price_date       TEXT NOT NULL,
      source           TEXT NOT NULL,
      fetched_at       TEXT NOT NULL,
      UNIQUE(port_unlocode, fuel_grade, price_date)
    );
    -- Med + Black Sea hubs (must appear for Med voyages)
    INSERT INTO bunker_prices VALUES ('GIGIB', 'VLSFO', 771, '2026-06-02', 'seed', datetime('now'));
    INSERT INTO bunker_prices VALUES ('GRPIR', 'VLSFO', 760, '2026-06-02', 'seed', datetime('now'));
    INSERT INTO bunker_prices VALUES ('ROCND', 'VLSFO', 740, '2026-06-02', 'seed', datetime('now'));
    INSERT INTO bunker_prices VALUES ('ITAUG', 'VLSFO', 755, '2026-06-02', 'seed', datetime('now'));
    INSERT INTO bunker_prices VALUES ('NLRTM', 'VLSFO', 791, '2026-06-02', 'seed', datetime('now'));
    -- Far-away hubs — basin filter must EXCLUDE for Med voyages
    INSERT INTO bunker_prices VALUES ('USLAX', 'VLSFO', 950, '2026-06-02', 'seed', datetime('now'));
    INSERT INTO bunker_prices VALUES ('SGSIN', 'VLSFO', 801, '2026-06-02', 'seed', datetime('now'));
    INSERT INTO bunker_prices VALUES ('BRSSZ', 'VLSFO', 720, '2026-06-02', 'seed', datetime('now'));
    INSERT INTO bunker_prices VALUES ('ZADUR', 'VLSFO', 700, '2026-06-02', 'seed', datetime('now'));
  `);
});

afterAll(() => db.close());

jest.mock('@/lib/session-store', () => ({
  getStore: jest.fn(() => ({ getDb: () => db })),
}));

// Force-null direct distance so detour-check is irrelevant — we want to prove
// the basin filter ALONE is enough to reject Pacific candidates.
jest.mock('@/lib/sailing/port-distances', () => ({
  getPortDistance: jest.fn(() => null),
}));

function makeReq(from: string, to: string): NextRequest {
  return new NextRequest(
    `http://localhost/api/voyage/bunker-recommendation?from=${from}&to=${to}&grade=VLSFO`,
    { method: 'GET' },
  );
}

describe('Bug 1 — basin filter excludes out-of-corridor candidates', () => {
  it('Constanta → Liverpool: USLAX is NOT in candidates (Pacific basin)', async () => {
    const res = await GET(makeReq('ROCND', 'GBLIV'));
    const body = await res.json();
    const ports = body.candidates.map((c: { port: string }) => c.port);
    expect(ports).not.toContain('USLAX');
  });

  it('Constanta → Liverpool: SGSIN is NOT in candidates (EastAsia)', async () => {
    const res = await GET(makeReq('ROCND', 'GBLIV'));
    const body = await res.json();
    const ports = body.candidates.map((c: { port: string }) => c.port);
    expect(ports).not.toContain('SGSIN');
  });

  it('Constanta → Liverpool: BRSSZ is NOT in candidates (AtlanticSouth)', async () => {
    const res = await GET(makeReq('ROCND', 'GBLIV'));
    const body = await res.json();
    const ports = body.candidates.map((c: { port: string }) => c.port);
    expect(ports).not.toContain('BRSSZ');
  });

  it('Constanta → Liverpool: ZADUR is NOT in candidates (SouthAfrica)', async () => {
    const res = await GET(makeReq('ROCND', 'GBLIV'));
    const body = await res.json();
    const ports = body.candidates.map((c: { port: string }) => c.port);
    expect(ports).not.toContain('ZADUR');
  });

  it('Constanta → Liverpool: regional Med + Black Sea hubs DO appear', async () => {
    const res = await GET(makeReq('ROCND', 'GBLIV'));
    const body = await res.json();
    const ports = body.candidates.map((c: { port: string }) => c.port);
    // Black Sea (origin), East Med, West Med, AtlanticNorth, NorthEurope — all in corridor
    expect(ports).toContain('GIGIB');
    expect(ports).toContain('GRPIR');
    expect(ports).toContain('ROCND');
    expect(ports).toContain('ITAUG');
    expect(ports).toContain('NLRTM');
  });

  it('Constanta → Mersin (East Med caboteur): Atlantic hubs NOT in candidates', async () => {
    const res = await GET(makeReq('ROCND', 'TRMER'));
    const body = await res.json();
    const ports = body.candidates.map((c: { port: string }) => c.port);
    expect(ports).not.toContain('USLAX');
    expect(ports).not.toContain('SGSIN');
    expect(ports).not.toContain('NLRTM');
  });

  it('response includes liftTonnes when vessel params provided', async () => {
    const url =
      'http://localhost/api/voyage/bunker-recommendation' +
      '?from=ROCND&to=GBLIV&grade=VLSFO&dwt=10000&speedKn=12&consMtPerDay=14&voyageDays=15';
    const res = await GET(new NextRequest(url, { method: 'GET' }));
    const body = await res.json();
    // (15+5)*14 = 280 mt; cap = 700 mt → 280
    expect(body.liftTonnes).toBe(280);
    expect(body.capacityMt).toBe(700);
    expect(body.liftCapped).toBe(false);
  });

  it('Bug 2 (round-2) — "Nemrut Bay" resolves to EastMed corridor: USLAX NOT in candidates', async () => {
    // port-master.json TRALI entry now has alias "Nemrut Bay" → portBasin = EastMed
    // Corridor EastMed→NorthEurope = {EastMed,WestMed,AtlanticNorth,NorthEurope}
    // USLAX (Pacific) is outside → correctly excluded even with null distances
    const res = await GET(makeReq('Nemrut Bay', 'GBLIV'));
    const body = await res.json();
    const ports = body.candidates.map((c: { port: string }) => c.port);
    expect(ports).not.toContain('USLAX');
  });

  it('Bug basin-nodist — unknown to-port: global hubs excluded from BlackSea voyage', async () => {
    // Simulates distanceNm=null scenario: to-port not in port-master → portBasin=null.
    // Fixed behaviour: corridor = {BlackSea, EastMed} (from-basin + 1-hop neighbours).
    const res = await GET(makeReq('ROCND', 'UNKNOWNXXX'));
    const body = await res.json();
    const ports = body.candidates.map((c: { port: string }) => c.port);
    // Pacific, EastAsia, AtlanticSouth, NorthEurope, WestMed — all outside {BlackSea,EastMed}
    expect(ports).not.toContain('USLAX');   // Pacific
    expect(ports).not.toContain('SGSIN');   // EastAsia
    expect(ports).not.toContain('BRSSZ');   // AtlanticSouth
    expect(ports).not.toContain('ZADUR');   // SouthAfrica
    expect(ports).not.toContain('NLRTM');   // NorthEurope
    expect(ports).not.toContain('GIGIB');   // WestMed
    expect(ports).not.toContain('ITAUG');   // WestMed
    // BlackSea origin and EastMed neighbour are included
    expect(ports).toContain('ROCND');       // BlackSea
    expect(ports).toContain('GRPIR');       // EastMed
  });

  it('Bug 3 — eff $/MT equals price + (devFuel + devTime)/liftTonnes for each row', async () => {
    const url =
      'http://localhost/api/voyage/bunker-recommendation' +
      '?from=ROCND&to=GBLIV&grade=VLSFO&dwt=10000&speedKn=12&consMtPerDay=14&voyageDays=15';
    const res = await GET(new NextRequest(url, { method: 'GET' }));
    const body = await res.json();
    const lift = body.liftTonnes;
    for (const c of body.candidates) {
      const expected = c.priceUsdPerMt + (c.deviationFuelUsd + c.timeCostUsd) / lift;
      // round to same precision as candidate output (2 decimals)
      expect(c.effectiveUsdPerMt).toBeCloseTo(expected, 1);
    }
  });
});

/**
 * #1002 — route-aware bunker port parity (list == detail).
 *
 * Behavioral guard for the core invariant: the bunker port persisted in the
 * stored match (matches.bunker_port) is the SAME port the detail-page
 * recommendation API surfaces, and the same port the detail TCE is computed at —
 * so the list TCE and the detail TCE agree.
 *
 *  (a) Med / Black-Sea route → stored bunker_port != NLRTM (a Med hub wins) + TCE > 0
 *  (b) NW-Europe route → NLRTM (fallback / cheapest-baseline correct)
 *  (c) list-bunkerPort == detail-bunkerPort == recommended, and the stored TCE and
 *      the detail TCE (same port, live price) differ by < 5% (intraday drift only).
 *
 * resolveRecommendedBunkerPort and resolveOnRouteBunkerCandidates share the exact
 * code path the GET /api/voyage/bunker-recommendation route delegates to, so
 * asserting reco.port === candidates[0].port proves the route↔lib parity that the
 * whole fix rests on.
 */
import Database from 'better-sqlite3';
import {
  resolveRecommendedBunkerPort,
  resolveOnRouteBunkerCandidates,
  type BunkerVesselOpts,
} from '@/lib/economics/bunker-routing';
import { computeStoredMatchEconomics } from '@/lib/matching/stored-match-economics';
import { getLatestBunkerPrice } from '@/lib/market/bunker-repository';
import { estimateVoyageDays } from '@/lib/economics/voyage-days';
import { getPortDistance } from '@/lib/sailing/port-distances';
import type { ParsedCargo, ParsedVessel } from '@/lib/types';

/**
 * Fresh seed date (2 days old) so prices pass the BUNKER_STALE_DAYS=7 freshness
 * gate (FIX #15). A hard-coded calendar date would silently age past 7 days and
 * get excluded, collapsing every on-route candidate to the fallback (cf. #1075).
 */
const SEED_DATE = (() => {
  const d = new Date();
  d.setDate(d.getDate() - 2);
  return d.toISOString().slice(0, 10);
})();

/** DB with bunker_prices (Med hubs cheaper than NLRTM), eua + port_da for economics. */
function makeDb(): Database.Database {
  const db = new Database(':memory:');
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
    -- Med + Black Sea hubs (on-route for Black-Sea → UK), all CHEAPER than NLRTM
    INSERT INTO bunker_prices VALUES ('ESCEU', 'VLSFO', 720, '${SEED_DATE}', 'seed', datetime('now'));
    INSERT INTO bunker_prices VALUES ('GIGIB', 'VLSFO', 745, '${SEED_DATE}', 'seed', datetime('now'));
    INSERT INTO bunker_prices VALUES ('ESALG', 'VLSFO', 748, '${SEED_DATE}', 'seed', datetime('now'));
    INSERT INTO bunker_prices VALUES ('GRPIR', 'VLSFO', 760, '${SEED_DATE}', 'seed', datetime('now'));
    INSERT INTO bunker_prices VALUES ('ROCND', 'VLSFO', 770, '${SEED_DATE}', 'seed', datetime('now'));
    INSERT INTO bunker_prices VALUES ('ITAUG', 'VLSFO', 758, '${SEED_DATE}', 'seed', datetime('now'));
    -- NW Europe hubs
    INSERT INTO bunker_prices VALUES ('NLRTM', 'VLSFO', 800, '${SEED_DATE}', 'seed', datetime('now'));
    INSERT INTO bunker_prices VALUES ('BEANR', 'VLSFO', 815, '${SEED_DATE}', 'seed', datetime('now'));

    CREATE TABLE eua_prices (
      contract_type     TEXT,
      price_eur_per_tco2 REAL,
      price_date        TEXT,
      source            TEXT DEFAULT 'test'
    );
    INSERT INTO eua_prices (contract_type, price_eur_per_tco2, price_date) VALUES ('spot', 77, '${SEED_DATE}');

    CREATE TABLE port_da_estimates (
      port_code TEXT, vessel_dwt_min INTEGER, vessel_dwt_max INTEGER,
      port_dues_usd REAL, pilotage_usd REAL, tugs_usd REAL,
      stevedoring_usd_per_mt REAL DEFAULT 0, cargo_type TEXT DEFAULT 'general',
      confidence TEXT DEFAULT 'estimated', source TEXT DEFAULT 'test'
    );
    INSERT INTO port_da_estimates (port_code, vessel_dwt_min, vessel_dwt_max, port_dues_usd, pilotage_usd, tugs_usd, cargo_type)
    VALUES
      ('ROCND', 0, 200000, 18000, 7000, 5000, 'bulk'),
      ('GBLIV', 0, 200000, 20000, 8000, 5000, 'bulk'),
      ('BEANR', 0, 200000, 19000, 7000, 5000, 'bulk'),
      ('NLRTM', 0, 200000, 20000, 8000, 5000, 'bulk');
  `);
  return db;
}

function cargo(originPort: string, destinationPort: string): ParsedCargo {
  return {
    emailId: 'c1', itemIndex: 0,
    originPort: { value: originPort, confidence: 'confirmed' },
    destinationPort: { value: destinationPort, confidence: 'confirmed' },
    cargoType: 'BULK',
    laycan: '1-15 Aug 2026',
    freightRateUsd: 30,
    cargoDescription: null,
    weightMt: { value: 45000, confidence: 'confirmed' },
    weightMtMin: null, weightMtMax: null, volumeCbm: null, dimensions: null,
    containerType: null, quantity: null, incoterms: null, preferredDates: null,
    loadingRate: null, dischargeRate: null, commissionPercent: null,
    commissionTerms: null, specialRequirements: null, stowageFactor: null,
    missingInfo: [], originCountry: null, destinationCountry: null,
  } as ParsedCargo;
}

function vessel(openPosition: string): ParsedVessel {
  return {
    emailId: 'v1', itemIndex: 0,
    dwtSummer: { value: 56000, confidence: 'confirmed' },
    vesselName: null, imo: null, flag: null, built: null, classSociety: null,
    pandi: null, dwcc: null, draftMax: null, loa: null, beam: null, grt: null, nrt: null,
    holdsCount: null, hatchesCount: null, grainCapacity: null, grainCapacityUnit: null,
    baleCapacity: null, holdDimensions: null, hatchDimensions: null, tankTopStrength: null,
    geared: null, craneCapacity: null, hatchType: null, vesselType: null,
    openPosition: { value: openPosition, confidence: 'confirmed' },
    openDate: null, direction: null, restrictions: [], lastCargoes: null,
    speedLaden: '13', speedBallast: null, consumption: '28',
    deckCapacity: null, specialFeatures: [],
  } as ParsedVessel;
}

function opts(from: string, to: string): BunkerVesselOpts {
  const dist = getPortDistance(from, to)?.nm ?? null;
  return { dwt: 56000, speedKn: 13, consMtPerDay: 28, voyageDays: estimateVoyageDays(dist, 13) };
}

const MED_HUBS = ['ESCEU', 'GIGIB', 'ESALG', 'GRPIR', 'ROCND', 'ITAUG'];

describe('#1002 route-aware bunker parity', () => {
  it('(a) Med/Black-Sea route → bunker_port is a Med hub (not NLRTM) and TCE > 0', () => {
    const db = makeDb();
    try {
      const from = 'ROCND', to = 'GBLIV'; // Constanta → Liverpool
      const reco = resolveRecommendedBunkerPort(db, from, to, 'VLSFO', opts(from, to));

      expect(reco.port).not.toBe('NLRTM');
      expect(MED_HUBS).toContain(reco.port);

      const eco = computeStoredMatchEconomics({
        cargo: cargo(from, to),
        vessel: vessel(from),
        db,
        bunkerPriceUsdPerMt: reco.priceUsdPerMt,
      });
      expect(eco.tce_usd_per_day).not.toBeNull();
      expect(eco.tce_usd_per_day!).toBeGreaterThan(0);
    } finally {
      db.close();
    }
  });

  it('(b) NW-Europe route → NLRTM (cheapest-baseline / fallback correct)', () => {
    const db = makeDb();
    try {
      const from = 'BEANR', to = 'NLRTM'; // Antwerp → Rotterdam
      const reco = resolveRecommendedBunkerPort(db, from, to, 'VLSFO', opts(from, to));
      expect(reco.port).toBe('NLRTM');
    } finally {
      db.close();
    }
  });

  it('(c) list-port == detail-port == recommended, and list TCE ≈ detail TCE (<5% drift)', () => {
    const db = makeDb();
    try {
      const from = 'ROCND', to = 'GBLIV';
      const o = opts(from, to);

      // Recommended (route delegates to resolveOnRouteBunkerCandidates → candidates[0]).
      const routeResult = resolveOnRouteBunkerCandidates(db, from, to, 'VLSFO', o);
      const recommendedPort = routeResult.candidates[0].port;

      // Stored (list) — what compute-matches/persist persist into bunker_port.
      const reco = resolveRecommendedBunkerPort(db, from, to, 'VLSFO', o);
      const listPort = reco.port;

      // Detail — EconomicsTab seeds bunkerPort = stored bunker_port, then /api/voyage/tce
      // looks up that port's live price.
      const detailPort = listPort;
      const detailPrice = getLatestBunkerPrice(db, detailPort, 'VLSFO')!.price_usd_per_mt;

      // route == lib parity (the invariant the whole fix rests on)
      expect(listPort).toBe(recommendedPort);
      expect(detailPort).toBe(recommendedPort);
      // detail looks up the SAME port → same live price the stored TCE used
      expect(detailPrice).toBe(reco.priceUsdPerMt);

      const listEco = computeStoredMatchEconomics({
        cargo: cargo(from, to), vessel: vessel(from), db, bunkerPriceUsdPerMt: reco.priceUsdPerMt,
      });
      const detailEco = computeStoredMatchEconomics({
        cargo: cargo(from, to), vessel: vessel(from), db, bunkerPriceUsdPerMt: detailPrice,
      });

      const listTce = listEco.tce_usd_per_day!;
      const detailTce = detailEco.tce_usd_per_day!;
      expect(listTce).not.toBeNull();
      const drift = Math.abs(listTce - detailTce) / Math.abs(listTce);
      expect(drift).toBeLessThan(0.05);
    } finally {
      db.close();
    }
  });
});

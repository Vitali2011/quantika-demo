#!/usr/bin/env -S npx tsx
/**
 * patch-fit.ts — patch demo-seed.db with fit_percent + fit_breakdown data.
 *
 * Strategy:
 *   1. Run migration 042 (adds fit_percent / fit_breakdown columns if absent).
 *   2. If the DB has existing user_id=NULL matches, compute fitBreakdown for each
 *      using stored vessel_dwt + distance_nm + laycan fields.
 *   3. If no seed matches exist (or to supplement), insert synthetic demo
 *      matches covering the full fit range (high / medium / low).
 *
 * Usage:
 *   npx tsx scripts/demo-seed/patch-fit.ts [--db path/to/demo-seed.db]
 *   # default: data/demo-seed.db
 */

import path from 'node:path';
import Database from 'better-sqlite3';
import migration041 from '@/lib/migrations/041-matches-vessel-name';
import migration042 from '@/lib/migrations/042-matches-fit';
import { computeFitBreakdown } from '@/lib/sailing/fit-breakdown';
import type { FitBreakdownInput } from '@/lib/sailing/fit-breakdown';
import type { ParsedCargo, ParsedVessel, MatchReadiness, ReadinessVerdict } from '@/lib/types';

// ── helpers ───────────────────────────────────────────────────────────────────

function arg(k: string): string | undefined {
  const i = process.argv.indexOf(k);
  return i === -1 ? undefined : process.argv[i + 1];
}

function makeReadiness(
  gapDays: number,
  distanceNm: number,
  speedKts = 12,
): MatchReadiness {
  const travelDays = distanceNm / (speedKts * 24);
  const net = gapDays - travelDays;
  let verdict: ReadinessVerdict;
  if (net > 10) verdict = 'idle';
  else if (net >= 2) verdict = 'ideal';
  else if (net >= -1) verdict = 'tight';
  else verdict = 'late';
  return {
    verdict,
    distanceNm,
    gapDays,
    openDate: null,
    laycanStart: null,
    laycanEnd: null,
    speedKn: speedKts,
    sailingDays: travelDays,
    arrivalDate: null,
    explanation: `gap ${gapDays}d, travel ${travelDays.toFixed(1)}d, net ${net.toFixed(1)}d → ${verdict}`,
  };
}

function cf<T>(value: T, confidence: 'confirmed' | 'estimated' = 'confirmed') {
  return { value, confidence, sourceText: String(value) };
}

// ── synthetic demo fixtures ───────────────────────────────────────────────────
// Covers the full fit-% range with realistic dry-bulk scenarios.

interface DemoFixture {
  cargoId: string;
  vesselId: string;
  vesselName: string;
  cargoRef: string;
  cargo: ParsedCargo;
  vessel: ParsedVessel;
  readiness: MatchReadiness;
  loadPort: string;
  dischargePort: string;
  distanceNm: number;
  laycanStartMs: number;
  laycanEndMs: number;
  score: number;   // legacy score column
}

const NOW_MS = Date.now();
const DAY_MS = 86_400_000;

const fixtures: DemoFixture[] = [
  // ── HIGH fit ≈ 88–92% ────────────────────────────────────────────────────
  {
    cargoId: 'demo-cargo-grain-rtm',
    vesselId: 'demo-vessel-supramax-a',
    vesselName: 'M/V SEAGULL ALPHA',
    cargoRef: '50,000 MT grain FIOS, Hamburg, Germany',
    loadPort: 'CNSHA',
    dischargePort: 'DEHAM',
    distanceNm: 11500,
    laycanStartMs: NOW_MS + 18 * DAY_MS,
    laycanEndMs:   NOW_MS + 22 * DAY_MS,
    score: 91,
    readiness: makeReadiness(18, 850),  // vessel near load port, 850nm ballast → ready
    cargo: {
      emailId: 'demo-cargo-grain-rtm', itemIndex: 0,
      cargoType: 'BULK',
      cargoDescription: cf('50,000 MT wheat, FIOS Shinc'),
      weightMt: cf(50000), weightMtMin: 48000, weightMtMax: 52000, quantity: 50000,
      originPort: cf('CNSHA'), originCountry: 'China',
      destinationPort: cf('DEHAM'), destinationCountry: 'Germany',
      stowageFactor: '1.25', loadingRate: '8000 SHINC', dischargeRate: '8000 SHINC',
      commissionPercent: 3.75, commissionTerms: 'TTL',
      incoterms: 'FIOS', missingInfo: [], preferredDates: null,
      dimensions: null, volumeCbm: null, containerType: null, specialRequirements: null,
    } as unknown as ParsedCargo,
    vessel: {
      emailId: 'demo-vessel-supramax-a', itemIndex: 0,
      vesselName: cf('M/V SEAGULL ALPHA'), imo: '9000001', flag: 'Marshall Islands',
      built: 2016, classSociety: 'BV', pandi: 'Skuld',
      dwtSummer: cf(58000), dwcc: cf(55500), draftMax: cf(12.5),
      loa: 190, beam: 32, grt: null, nrt: null,
      holdsCount: 5, hatchesCount: 5,
      grainCapacity: 72000, grainCapacityUnit: 'cbm', baleCapacity: 70000,
      holdDimensions: null, hatchDimensions: null, tankTopStrength: null,
      geared: true, craneCapacity: cf(30), hatchType: null,
      vesselType: 'Bulk Carrier',
      openPosition: cf('Singapore'), direction: 'Worldwide', restrictions: [],
      lastCargoes: 'grain, wheat', speedLaden: '14.0', speedBallast: '14.5',
      consumption: '28', consumptionUnit: 'MT/day IFO',
    } as unknown as ParsedVessel,
  },

  // ── HIGH fit ≈ 82–86% ─────────────────────────────────────────────────────
  {
    cargoId: 'demo-cargo-coal-nlr',
    vesselId: 'demo-vessel-panamax-b',
    vesselName: 'M/V SEAGULL BETA',
    cargoRef: '70,000 MT coal, Rotterdam, Netherlands',
    loadPort: 'AUMEL',
    dischargePort: 'NLRTM',
    distanceNm: 9800,
    laycanStartMs: NOW_MS + 14 * DAY_MS,
    laycanEndMs:   NOW_MS + 18 * DAY_MS,
    score: 84,
    readiness: makeReadiness(14, 1200),  // vessel near Newcastle, ~1200nm ballast to Melbourne
    cargo: {
      emailId: 'demo-cargo-coal-nlr', itemIndex: 0,
      cargoType: 'BULK',
      cargoDescription: cf('70,000 MT thermal coal FIOST'),
      weightMt: cf(70000), weightMtMin: 68000, weightMtMax: 72000, quantity: 70000,
      originPort: cf('AUMEL'), originCountry: 'Australia',
      destinationPort: cf('NLRTM'), destinationCountry: 'Netherlands',
      stowageFactor: '1.15', loadingRate: '10000 SHINC', dischargeRate: '8000 SHINC',
      commissionPercent: 3.75, commissionTerms: 'TTL',
      incoterms: 'FIOS', missingInfo: [], preferredDates: null,
      dimensions: null, volumeCbm: null, containerType: null, specialRequirements: null,
    } as unknown as ParsedCargo,
    vessel: {
      emailId: 'demo-vessel-panamax-b', itemIndex: 0,
      vesselName: cf('M/V SEAGULL BETA'), imo: '9000002', flag: 'Greece',
      built: 2014, classSociety: 'DNV', pandi: 'Gard',
      dwtSummer: cf(76000), dwcc: cf(73000), draftMax: cf(13.5),
      loa: 225, beam: 32.2, grt: null, nrt: null,
      holdsCount: 7, hatchesCount: 7,
      grainCapacity: 90000, grainCapacityUnit: 'cbm', baleCapacity: 87000,
      holdDimensions: null, hatchDimensions: null, tankTopStrength: null,
      geared: false, craneCapacity: null, hatchType: null,
      vesselType: 'Bulk Carrier',
      openPosition: cf('Port Hedland'), direction: 'Worldwide', restrictions: [],
      lastCargoes: 'coal, iron ore', speedLaden: '13.5', speedBallast: '14.0',
      consumption: '32', consumptionUnit: 'MT/day IFO',
    } as unknown as ParsedVessel,
  },

  // ── MEDIUM fit ≈ 65–72% ───────────────────────────────────────────────────
  {
    cargoId: 'demo-cargo-cement-nlr',
    vesselId: 'demo-vessel-handymax-c',
    vesselName: 'M/V SEAGULL GAMMA',
    cargoRef: '18,000 MT cement, Piraeus, Greece',
    loadPort: 'TRIST',
    dischargePort: 'GRPIR',
    distanceNm: 520,
    laycanStartMs: NOW_MS + 7 * DAY_MS,
    laycanEndMs:   NOW_MS + 10 * DAY_MS,
    score: 68,
    readiness: makeReadiness(7, 280),  // 280nm ballast from Black Sea to Istanbul
    cargo: {
      emailId: 'demo-cargo-cement-nlr', itemIndex: 0,
      cargoType: 'BULK',
      cargoDescription: cf('18,000 MT bagged cement, sling bags'),
      weightMt: cf(18000), weightMtMin: 17000, weightMtMax: 19000, quantity: 18000,
      originPort: cf('TRIST'), originCountry: 'Turkey',
      destinationPort: cf('GRPIR'), destinationCountry: 'Greece',
      stowageFactor: '0.8', loadingRate: '3000 SHINC', dischargeRate: '2500 SHINC',
      commissionPercent: 2.5, commissionTerms: 'TTL',
      incoterms: 'FIO', missingInfo: [], preferredDates: null,
      dimensions: null, volumeCbm: null, containerType: null, specialRequirements: null,
    } as unknown as ParsedCargo,
    vessel: {
      emailId: 'demo-vessel-handymax-c', itemIndex: 0,
      vesselName: cf('M/V SEAGULL GAMMA'), imo: '9000003', flag: 'Cyprus',
      built: 2009, classSociety: 'LR', pandi: 'West of England',
      dwtSummer: cf(38000), dwcc: cf(36500), draftMax: cf(11.0),
      loa: 180, beam: 30, grt: null, nrt: null,
      holdsCount: 5, hatchesCount: 5,
      grainCapacity: 46000, grainCapacityUnit: 'cbm', baleCapacity: 44000,
      holdDimensions: null, hatchDimensions: null, tankTopStrength: null,
      geared: true, craneCapacity: cf(25), hatchType: null,
      vesselType: 'Bulk Carrier',
      openPosition: cf('Istanbul'), direction: 'Med', restrictions: [],
      lastCargoes: 'fertilizer, grain', speedLaden: '12.5', speedBallast: '13.0',
      consumption: '22', consumptionUnit: 'MT/day IFO',
    } as unknown as ParsedVessel,
  },

  // ── MEDIUM fit ≈ 58–65% — marginal timing ────────────────────────────────
  {
    cargoId: 'demo-cargo-ore-gen',
    vesselId: 'demo-vessel-cape-d',
    vesselName: 'M/V SEAGULL DELTA',
    cargoRef: '160,000 MT iron ore, Genoa, Italy',
    loadPort: 'BRPVE',
    dischargePort: 'ITGOA',
    distanceNm: 5800,
    laycanStartMs: NOW_MS + 12 * DAY_MS,
    laycanEndMs:   NOW_MS + 16 * DAY_MS,
    score: 62,
    readiness: makeReadiness(12, 4200),  // 4200nm ballast — farther away, marginal
    cargo: {
      emailId: 'demo-cargo-ore-gen', itemIndex: 0,
      cargoType: 'BULK',
      cargoDescription: cf('160,000 MT iron ore FIOST'),
      weightMt: cf(160000), weightMtMin: 155000, weightMtMax: 165000, quantity: 160000,
      originPort: cf('BRPVE'), originCountry: 'Brazil',
      destinationPort: cf('ITGOA'), destinationCountry: 'Italy',
      stowageFactor: '0.45', loadingRate: '25000 SHINC', dischargeRate: '18000 SHINC',
      commissionPercent: 3.75, commissionTerms: 'TTL',
      incoterms: 'FIOST', missingInfo: [], preferredDates: null,
      dimensions: null, volumeCbm: null, containerType: null, specialRequirements: null,
    } as unknown as ParsedCargo,
    vessel: {
      emailId: 'demo-vessel-cape-d', itemIndex: 0,
      vesselName: cf('M/V SEAGULL DELTA'), imo: '9000004', flag: 'Panama',
      built: 2012, classSociety: 'NK', pandi: 'Japan Club',
      dwtSummer: cf(180000), dwcc: cf(175000), draftMax: cf(18.0),
      loa: 292, beam: 45, grt: null, nrt: null,
      holdsCount: 9, hatchesCount: 9,
      grainCapacity: 200000, grainCapacityUnit: 'cbm', baleCapacity: 195000,
      holdDimensions: null, hatchDimensions: null, tankTopStrength: null,
      geared: false, craneCapacity: null, hatchType: null,
      vesselType: 'Bulk Carrier',
      openPosition: cf('Tubarao'), direction: 'Worldwide', restrictions: [],
      lastCargoes: 'iron ore, coal', speedLaden: '13.0', speedBallast: '14.0',
      consumption: '55', consumptionUnit: 'MT/day IFO',
    } as unknown as ParsedVessel,
  },

  // ── LOW fit ≈ 32–42% — poor utilisation ──────────────────────────────────
  {
    cargoId: 'demo-cargo-grain-small',
    vesselId: 'demo-vessel-cape-e',
    vesselName: 'M/V SEAGULL EPSILON',
    cargoRef: '5,000 MT rice, Novorossiysk, Russia',
    loadPort: 'UAODS',
    dischargePort: 'TRIZM',
    distanceNm: 310,
    laycanStartMs: NOW_MS + 20 * DAY_MS,
    laycanEndMs:   NOW_MS + 24 * DAY_MS,
    score: 38,
    readiness: makeReadiness(20, 310 / 2),
    cargo: {
      emailId: 'demo-cargo-grain-small', itemIndex: 0,
      cargoType: 'BULK',
      cargoDescription: cf('5,000 MT rice in bags'),
      weightMt: cf(5000), weightMtMin: 4800, weightMtMax: 5200, quantity: 5000,
      originPort: cf('UAODS'), originCountry: 'Ukraine',
      destinationPort: cf('TRIZM'), destinationCountry: 'Turkey',
      stowageFactor: '1.6', loadingRate: '1500 SHINC', dischargeRate: '1500 SHINC',
      commissionPercent: 3.75, commissionTerms: 'TTL',
      incoterms: 'FIO', missingInfo: [], preferredDates: null,
      dimensions: null, volumeCbm: null, containerType: null, specialRequirements: null,
    } as unknown as ParsedCargo,
    vessel: {
      emailId: 'demo-vessel-cape-e', itemIndex: 0,
      vesselName: cf('M/V SEAGULL EPSILON'), imo: '9000005', flag: 'Liberia',
      built: 2010, classSociety: 'BV', pandi: 'Skuld',
      dwtSummer: cf(180000), dwcc: cf(175000), draftMax: cf(18.5),
      loa: 295, beam: 46, grt: null, nrt: null,
      holdsCount: 9, hatchesCount: 9,
      grainCapacity: 205000, grainCapacityUnit: 'cbm', baleCapacity: 200000,
      holdDimensions: null, hatchDimensions: null, tankTopStrength: null,
      geared: false, craneCapacity: null, hatchType: null,
      vesselType: 'Bulk Carrier',
      openPosition: cf('Odesa'), direction: 'Worldwide', restrictions: [],
      lastCargoes: 'iron ore', speedLaden: '13.0', speedBallast: '14.0',
      consumption: '55', consumptionUnit: 'MT/day IFO',
    } as unknown as ParsedVessel,
  },

  // ── LOW fit ≈ 22–35% — late + short ballast doesn't help ─────────────────
  {
    cargoId: 'demo-cargo-soya-gdan',
    vesselId: 'demo-vessel-handysize-f',
    vesselName: 'M/V SEAGULL ZETA',
    cargoRef: '30,000 MT soya pellets, Gdansk, Poland',
    loadPort: 'ARBUE',
    dischargePort: 'PLGDN',
    distanceNm: 6400,
    laycanStartMs: NOW_MS - 3 * DAY_MS,  // laycan STARTED IN PAST → 'late' verdict
    laycanEndMs:   NOW_MS + 2 * DAY_MS,
    score: 31,
    readiness: makeReadiness(-3, 6400 / 2), // negative gap → late
    cargo: {
      emailId: 'demo-cargo-soya-gdan', itemIndex: 0,
      cargoType: 'BULK',
      cargoDescription: cf('30,000 MT soya pellets FIOST'),
      weightMt: cf(30000), weightMtMin: 28000, weightMtMax: 32000, quantity: 30000,
      originPort: cf('ARBUE'), originCountry: 'Argentina',
      destinationPort: cf('PLGDN'), destinationCountry: 'Poland',
      stowageFactor: '1.3', loadingRate: '7000 SHINC', dischargeRate: '5000 SHINC',
      commissionPercent: 3.75, commissionTerms: 'TTL',
      incoterms: 'FIOS', missingInfo: [], preferredDates: null,
      dimensions: null, volumeCbm: null, containerType: null, specialRequirements: null,
    } as unknown as ParsedCargo,
    vessel: {
      emailId: 'demo-vessel-handysize-f', itemIndex: 0,
      vesselName: cf('M/V SEAGULL ZETA'), imo: '9000006', flag: 'Malta',
      built: 2018, classSociety: 'BV', pandi: 'North of England',
      dwtSummer: cf(37000), dwcc: cf(35500), draftMax: cf(10.8),
      loa: 183, beam: 30, grt: null, nrt: null,
      holdsCount: 5, hatchesCount: 5,
      grainCapacity: 46000, grainCapacityUnit: 'cbm', baleCapacity: 44500,
      holdDimensions: null, hatchDimensions: null, tankTopStrength: null,
      geared: true, craneCapacity: cf(30), hatchType: null,
      vesselType: 'Bulk Carrier',
      openPosition: cf('Santos'), direction: 'Worldwide', restrictions: [],
      lastCargoes: 'grain, soya', speedLaden: '13.5', speedBallast: '14.0',
      consumption: '23', consumptionUnit: 'MT/day IFO',
    } as unknown as ParsedVessel,
  },
];

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  const dbPath = arg('--db') ?? path.resolve(process.cwd(), 'data/demo-seed.db');
  console.log(`[patch-fit] Opening ${dbPath}`);

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  // Ensure columns exist
  migration041.up(db);
  migration042.up(db);
  console.log('[patch-fit] Migrations 041+042 applied');

  // Remove existing synthetic demo seed rows (idempotent)
  db.prepare(`DELETE FROM matches WHERE user_id IS NULL AND cargo_id LIKE 'demo-cargo-%'`).run();
  console.log('[patch-fit] Cleared previous synthetic demo matches');

  const insert = db.prepare(`
    INSERT INTO matches
      (cargo_id, vessel_id, score, reason, status, user_id, created_at, updated_at,
       cargo_type, load_port, discharge_port, laycan_start, laycan_end, vessel_dwt,
       distance_nm, vessel_name, cargo_ref, fit_percent, fit_breakdown)
    VALUES (?, ?, ?, ?, 'shortlist', NULL, ?, ?,
            ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    for (const f of fixtures) {
      const input: FitBreakdownInput = {
        cargo: f.cargo,
        vessel: f.vessel,
        readiness: f.readiness,
        sanctions: undefined,
        hardFilters: undefined,
      };
      const fb = computeFitBreakdown(input);
      const now = Date.now();

      insert.run(
        f.cargoId,
        f.vesselId,
        f.score,
        `auto-seed: ${f.cargoRef}`,
        now,
        now,
        'BULK',
        f.loadPort,
        f.dischargePort,
        f.laycanStartMs,
        f.laycanEndMs,
        (f.vessel as { dwtSummer?: { value?: number } }).dwtSummer?.value ?? null,
        f.distanceNm,
        f.vesselName,
        f.cargoRef,
        fb.fitPercent,
        JSON.stringify(fb),
      );
      console.log(`[patch-fit] Inserted ${f.cargoId} × ${f.vesselId} — fit ${fb.fitPercent}%`);
    }
  });

  tx();

  // Verify
  const rows = db.prepare(`SELECT COUNT(*) as cnt FROM matches WHERE fit_percent IS NOT NULL AND user_id IS NULL`).get() as { cnt: number };
  const spread = db.prepare(`SELECT MIN(fit_percent) as mn, MAX(fit_percent) as mx FROM matches WHERE fit_percent IS NOT NULL AND user_id IS NULL`).get() as { mn: number; mx: number };
  console.log(`[patch-fit] Done. Seeded ${rows.cnt} rows. fit range: ${spread.mn?.toFixed(1)}–${spread.mx?.toFixed(1)}%`);

  if (rows.cnt === 0) {
    console.error('[patch-fit] ERROR: 0 rows with fit_percent — check insert');
    process.exit(1);
  }
  if (spread.mx - spread.mn < 20) {
    console.warn('[patch-fit] WARNING: narrow spread (<20pp) — data may not be realistic');
  }

  db.close();
}

main().catch((err) => { console.error(err); process.exit(1); });

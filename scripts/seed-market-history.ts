#!/usr/bin/env tsx
/**
 * seed-market-history.ts
 *
 * Backfills ~30 daily points per indicator ending at frozen_date 2026-05-28,
 * with realistic trends toward the current demo values.
 *
 * Indicators:
 *   - BDI, BCI, BSI, BHSI → baltic_indices table
 *   - VLSFO, MGO at NLRTM → bunker_prices table
 *   - EUA spot → eua_prices table
 *
 * Usage:
 *   npx tsx scripts/seed-market-history.ts [--dry] [--db /path/to.db]
 *
 * Flags:
 *   --dry    Print what would be inserted; no writes.
 *   --db X   Override DB path (default: SESSIONS_DB_PATH or data/sessions.db).
 *
 * Idempotent: uses ON CONFLICT ... DO UPDATE, so re-running is a no-op.
 */

import * as path from 'path';
import Database from 'better-sqlite3';
import { runMigrations } from '../lib/migrations/runner';
import { allMigrations } from '../lib/migrations/index';
import * as sqliteVec from 'sqlite-vec';

const FROZEN_DATE = '2026-05-28';
const DAYS = 30;

const argv = process.argv.slice(2);
const isDry = argv.includes('--dry');
const dbIdx = argv.indexOf('--db');
const dbPath = dbIdx !== -1 && argv[dbIdx + 1]
  ? argv[dbIdx + 1]!
  : (process.env['SESSIONS_DB_PATH'] ?? path.join(process.cwd(), 'data', 'sessions.db'));

export interface IndicatorSeries {
  dates: string[];
  values: number[];
}

/**
 * Generates an array of ISO date strings for DAYS days ending at endDate (inclusive).
 * Generates calendar days including weekends (demo data).
 */
export function generateDates(endDate: string, count: number): string[] {
  const end = new Date(endDate + 'T00:00:00Z');
  const dates: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setUTCDate(end.getUTCDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

/**
 * Deterministic seeded LCG — avoids Math.random() for reproducible output.
 * Not cryptographic; used only for demo value noise.
 */
export function makeLcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/**
 * Generates a realistic linear trend from startValue to endValue over DAYS days,
 * with small per-day noise (±noiseAbs). Deterministic per seedName.
 */
export function generateSeries(
  startValue: number,
  endValue: number,
  count: number,
  noiseAbs: number,
  seedName: string,
): number[] {
  const seed = seedName.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const rng = makeLcg(seed * 31337);
  const values: number[] = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 1 : i / (count - 1);
    const base = startValue + t * (endValue - startValue);
    const noise = (rng() * 2 - 1) * noiseAbs;
    values.push(Math.max(0, Math.round((base + noise) * 10) / 10));
  }
  // Force the last value to exactly match endValue (current demo value).
  values[count - 1] = endValue;
  return values;
}

interface BalticSpec {
  code: string;
  startValue: number;
  endValue: number;
  noiseAbs: number;
}

interface BunkerSpec {
  grade: string;
  port: string;
  startValue: number;
  endValue: number;
  noiseAbs: number;
}

interface EuaSpec {
  startValue: number;
  endValue: number;
  noiseAbs: number;
}

interface IndexSpec {
  indexName: string;
  unit: string;
  startValue: number;
  endValue: number;
  noiseAbs: number;
}

// Current demo values from frozen_date 2026-05-28.
// Trend direction matches sparklineDir in app/market/page.tsx:
//   BDI up, BCI up, BSI up, BHSI down, VLSFO up, MGO down, EUA up.
const BALTIC_SPECS: BalticSpec[] = [
  { code: 'BDI', startValue: 2800, endValue: 3226, noiseAbs: 45 },
  { code: 'BCI', startValue: 4600, endValue: 5517, noiseAbs: 80 },
  { code: 'BSI', startValue: 930,  endValue: 1100, noiseAbs: 20 },
  { code: 'BHSI', startValue: 980, endValue: 847,  noiseAbs: 15 },
];

const BUNKER_SPECS: BunkerSpec[] = [
  { grade: 'VLSFO', port: 'NLRTM', startValue: 652,  endValue: 699.5, noiseAbs: 6 },
  { grade: 'MGO',   port: 'NLRTM', startValue: 1255, endValue: 1192,  noiseAbs: 8 },
];

const EUA_SPEC: EuaSpec = { startValue: 68.0, endValue: 78.2, noiseAbs: 1.2 };

// Drewry World Container Index — breakbulk variant used in /market freight chart.
// endValue 2800 = current demo value (2026-05-28 seed row); gentle uptrend.
const INDEX_SPECS: IndexSpec[] = [
  { indexName: 'drewry-bb', unit: 'USD/FEU', startValue: 2720, endValue: 2800, noiseAbs: 25 },
];

export interface SeedResult {
  balticRows: number;
  bunkerRows: number;
  euaRows: number;
  marketIndexRows: number;
}

export function seedMarketHistory(db: Database.Database, dry: boolean): SeedResult {
  const dates = generateDates(FROZEN_DATE, DAYS);
  let balticRows = 0;
  let bunkerRows = 0;
  let euaRows = 0;
  let marketIndexRows = 0;
  const now = new Date().toISOString();

  // ── Baltic indices ──────────────────────────────────────────────────────────
  const balticStmt = dry ? null : db.prepare(`
    INSERT INTO baltic_indices (index_code, value, price_date, source, fetched_at)
    VALUES (?, ?, ?, 'demo-seed', ?)
    ON CONFLICT(index_code, price_date) DO UPDATE SET
      value = excluded.value,
      source = excluded.source,
      fetched_at = excluded.fetched_at
  `);

  for (const spec of BALTIC_SPECS) {
    const values = generateSeries(spec.startValue, spec.endValue, DAYS, spec.noiseAbs, spec.code);
    for (let i = 0; i < dates.length; i++) {
      const date = dates[i]!;
      const val = values[i]!;
      if (dry) {
        console.log(`[DRY] baltic_indices ${spec.code} ${date} = ${val}`);
      } else {
        balticStmt!.run(spec.code, val, date, now);
      }
      balticRows++;
    }
  }

  // ── Bunker prices ───────────────────────────────────────────────────────────
  const bunkerStmt = dry ? null : db.prepare(`
    INSERT INTO bunker_prices (port_unlocode, fuel_grade, price_usd_per_mt, price_date, source, fetched_at)
    VALUES (?, ?, ?, ?, 'demo-seed', ?)
    ON CONFLICT(port_unlocode, fuel_grade, price_date) DO UPDATE SET
      price_usd_per_mt = excluded.price_usd_per_mt,
      source = excluded.source,
      fetched_at = excluded.fetched_at
  `);

  for (const spec of BUNKER_SPECS) {
    const values = generateSeries(spec.startValue, spec.endValue, DAYS, spec.noiseAbs, spec.grade);
    for (let i = 0; i < dates.length; i++) {
      const date = dates[i]!;
      const val = values[i]!;
      if (dry) {
        console.log(`[DRY] bunker_prices ${spec.port} ${spec.grade} ${date} = ${val}`);
      } else {
        bunkerStmt!.run(spec.port, spec.grade, val, date, now);
      }
      bunkerRows++;
    }
  }

  // ── EUA prices ──────────────────────────────────────────────────────────────
  const euaStmt = dry ? null : db.prepare(`
    INSERT INTO eua_prices (price_date, price_eur_per_tco2, contract_type, source, fetched_at)
    VALUES (?, ?, 'spot', 'demo-seed', ?)
    ON CONFLICT(price_date, contract_type) DO UPDATE SET
      price_eur_per_tco2 = excluded.price_eur_per_tco2,
      source = excluded.source,
      fetched_at = excluded.fetched_at
  `);

  const euaValues = generateSeries(EUA_SPEC.startValue, EUA_SPEC.endValue, DAYS, EUA_SPEC.noiseAbs, 'EUA');
  for (let i = 0; i < dates.length; i++) {
    const date = dates[i]!;
    const val = euaValues[i]!;
    if (dry) {
      console.log(`[DRY] eua_prices spot ${date} = ${val}`);
    } else {
      euaStmt!.run(date, val, now);
    }
    euaRows++;
  }

  // ── Market indices (drewry-bb) ──────────────────────────────────────────────
  const marketStmt = dry ? null : db.prepare(`
    INSERT INTO market_indices (id, index_name, index_date, value, unit, source, fetched_at)
    VALUES (?, ?, ?, ?, ?, 'demo-seed', ?)
    ON CONFLICT(index_name, index_date) DO UPDATE SET
      value = excluded.value,
      source = excluded.source,
      fetched_at = excluded.fetched_at
  `);

  for (const spec of INDEX_SPECS) {
    const values = generateSeries(spec.startValue, spec.endValue, DAYS, spec.noiseAbs, spec.indexName);
    for (let i = 0; i < dates.length; i++) {
      const date = dates[i]!;
      const val = values[i]!;
      if (dry) {
        console.log(`[DRY] market_indices ${spec.indexName} ${date} = ${val} ${spec.unit}`);
      } else {
        const id = `${spec.indexName}-${date}`;
        marketStmt!.run(id, spec.indexName, date, val, spec.unit, now);
      }
      marketIndexRows++;
    }
  }

  return { balticRows, bunkerRows, euaRows, marketIndexRows };
}

if (require.main === module) {
  console.log(`DB: ${dbPath}`);
  if (isDry) console.log('--- DRY RUN (no writes) ---\n');

  let db: Database.Database | null = null;
  try {
    db = new Database(dbPath);
    sqliteVec.load(db);
    db.pragma('foreign_keys = ON');
    if (!isDry) {
      runMigrations(db, allMigrations);
    }
    const result = seedMarketHistory(db, isDry);

    if (isDry) {
      console.log(`\nWould write: ${result.balticRows} baltic + ${result.bunkerRows} bunker + ${result.euaRows} eua + ${result.marketIndexRows} drewry rows`);
    } else {
      console.log(`\n✓ Seeded ${result.balticRows} baltic + ${result.bunkerRows} bunker + ${result.euaRows} eua + ${result.marketIndexRows} drewry rows`);
      console.log('  Idempotent — safe to re-run.');
    }
  } finally {
    db?.close();
  }
}

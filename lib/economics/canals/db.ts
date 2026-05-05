import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import type { CanalTariffRow } from './types';

const CANAL_TARIFFS_SCHEMA = `
CREATE TABLE IF NOT EXISTS canal_tariffs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  canal TEXT NOT NULL,
  vessel_type TEXT NOT NULL,
  scnt_min INTEGER,
  scnt_max INTEGER,
  base_fee_usd REAL NOT NULL,
  per_scnt_fee_usd REAL NOT NULL DEFAULT 0,
  war_risk_zone TEXT,
  valid_from TEXT NOT NULL,
  valid_to TEXT,
  source TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_canal_lookup
  ON canal_tariffs(canal, vessel_type, valid_from, valid_to);
`;

const SEED_PATH = path.join(process.cwd(), 'scripts', 'seed-data', 'canal-tariffs-base.json');
const DEFAULT_DB_PATH =
  process.env.CANAL_DB_PATH ?? path.join(process.cwd(), 'data', 'canal.db');

let _db: Database.Database | null = null;

function openDb(): Database.Database {
  const dir = path.dirname(DEFAULT_DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const db = new Database(DEFAULT_DB_PATH);
  db.pragma('foreign_keys = ON');
  db.exec(CANAL_TARIFFS_SCHEMA);
  seedIfEmpty(db);
  return db;
}

function seedIfEmpty(db: Database.Database): void {
  const count = (db.prepare('SELECT COUNT(*) as n FROM canal_tariffs').get() as { n: number }).n;
  if (count > 0) return;

  if (!fs.existsSync(SEED_PATH)) return;

  const rows = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8')) as Omit<CanalTariffRow, 'id'>[];
  const insert = db.prepare(
    `INSERT INTO canal_tariffs
       (canal, vessel_type, scnt_min, scnt_max, base_fee_usd, per_scnt_fee_usd,
        war_risk_zone, valid_from, valid_to, source)
     VALUES
       (@canal, @vessel_type, @scnt_min, @scnt_max, @base_fee_usd, @per_scnt_fee_usd,
        @war_risk_zone, @valid_from, @valid_to, @source)`
  );
  for (const row of rows) {
    insert.run(row);
  }
}

export function getCanalDb(): Database.Database {
  if (!_db) {
    _db = openDb();
  }
  return _db;
}

/** For testing only — inject an in-memory DB (pass null to reset) */
export function _setCanalDb(db: Database.Database | null): void {
  _db = db;
}

/**
 * Query the active tariff row for a given canal, vessel_type, and unit value.
 * For Suez: unit = SCNT. For others: unit can be NT or 0 (flat fee).
 */
export function queryTariff(
  canal: string,
  vesselType: string,
  unit: number
): CanalTariffRow | null {
  const db = getCanalDb();
  const today = new Date().toISOString().slice(0, 10);
  const row = db
    .prepare<[string, string, number, number, string, string]>(
      `SELECT * FROM canal_tariffs
       WHERE canal = ?
         AND vessel_type = ?
         AND (scnt_min IS NULL OR scnt_min <= ?)
         AND (scnt_max IS NULL OR scnt_max >= ?)
         AND valid_from <= ?
         AND (valid_to IS NULL OR valid_to > ?)
       ORDER BY scnt_min ASC
       LIMIT 1`
    )
    .get(canal, vesselType, unit, unit, today, today) as CanalTariffRow | undefined;

  return row ?? null;
}

/**
 * Shared test helpers for canal DB setup.
 * Import from this module — NOT from test files — to avoid Jest hook leakage.
 */

import Database from 'better-sqlite3';

export const CANAL_TARIFFS_SCHEMA = `
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

export type SeedRow = {
  canal: string;
  vessel_type: string;
  scnt_min: number | null;
  scnt_max: number | null;
  base_fee_usd: number;
  per_scnt_fee_usd: number;
  war_risk_zone: string | null;
  valid_from: string;
  valid_to: string | null;
  source: string;
};

/** Suez bulker + tanker base tiers (no war risk zone) */
export const SUEZ_BASE_SEED: SeedRow[] = [
  { canal: 'suez', vessel_type: 'bulker', scnt_min: 0,     scnt_max: 5000,  base_fee_usd: 0, per_scnt_fee_usd: 3.00,  war_risk_zone: null, valid_from: '2025-01-01', valid_to: null, source: 'sca-2025' },
  { canal: 'suez', vessel_type: 'bulker', scnt_min: 5001,  scnt_max: 10000, base_fee_usd: 0, per_scnt_fee_usd: 4.50,  war_risk_zone: null, valid_from: '2025-01-01', valid_to: null, source: 'sca-2025' },
  { canal: 'suez', vessel_type: 'bulker', scnt_min: 10001, scnt_max: 20000, base_fee_usd: 0, per_scnt_fee_usd: 6.00,  war_risk_zone: null, valid_from: '2025-01-01', valid_to: null, source: 'sca-2025' },
  { canal: 'suez', vessel_type: 'bulker', scnt_min: 20001, scnt_max: 70000, base_fee_usd: 0, per_scnt_fee_usd: 7.755, war_risk_zone: null, valid_from: '2025-01-01', valid_to: null, source: 'sca-2025' },
  { canal: 'suez', vessel_type: 'bulker', scnt_min: 70001, scnt_max: null,  base_fee_usd: 0, per_scnt_fee_usd: 9.00,  war_risk_zone: null, valid_from: '2025-01-01', valid_to: null, source: 'sca-2025' },
  { canal: 'suez', vessel_type: 'tanker', scnt_min: 0,     scnt_max: 5000,  base_fee_usd: 0, per_scnt_fee_usd: 3.20,  war_risk_zone: null, valid_from: '2025-01-01', valid_to: null, source: 'sca-2025' },
  { canal: 'suez', vessel_type: 'tanker', scnt_min: 5001,  scnt_max: 10000, base_fee_usd: 0, per_scnt_fee_usd: 4.80,  war_risk_zone: null, valid_from: '2025-01-01', valid_to: null, source: 'sca-2025' },
  { canal: 'suez', vessel_type: 'tanker', scnt_min: 10001, scnt_max: 20000, base_fee_usd: 0, per_scnt_fee_usd: 6.20,  war_risk_zone: null, valid_from: '2025-01-01', valid_to: null, source: 'sca-2025' },
  { canal: 'suez', vessel_type: 'tanker', scnt_min: 20001, scnt_max: 70000, base_fee_usd: 0, per_scnt_fee_usd: 7.50,  war_risk_zone: null, valid_from: '2025-01-01', valid_to: null, source: 'sca-2025' },
  { canal: 'suez', vessel_type: 'tanker', scnt_min: 70001, scnt_max: null,  base_fee_usd: 0, per_scnt_fee_usd: 9.20,  war_risk_zone: null, valid_from: '2025-01-01', valid_to: null, source: 'sca-2025' },
];

export const ALL_CANAL_SEED: SeedRow[] = [
  ...SUEZ_BASE_SEED,
  { canal: 'panama',   vessel_type: 'bulker',    scnt_min: 0, scnt_max: null, base_fee_usd: 16500, per_scnt_fee_usd: 1.65, war_risk_zone: null, valid_from: '2025-01-01', valid_to: null, source: 'acp-2025-q1' },
  { canal: 'panama',   vessel_type: 'tanker',    scnt_min: 0, scnt_max: null, base_fee_usd: 22000, per_scnt_fee_usd: 1.95, war_risk_zone: null, valid_from: '2025-01-01', valid_to: null, source: 'acp-2025-q1' },
  { canal: 'panama',   vessel_type: 'container', scnt_min: 0, scnt_max: null, base_fee_usd: 27500, per_scnt_fee_usd: 2.75, war_risk_zone: null, valid_from: '2025-01-01', valid_to: null, source: 'acp-2025-q1' },
  { canal: 'panama',   vessel_type: 'general',   scnt_min: 0, scnt_max: null, base_fee_usd: 13200, per_scnt_fee_usd: 1.32, war_risk_zone: null, valid_from: '2025-01-01', valid_to: null, source: 'acp-2025-q1' },
  { canal: 'kiel',     vessel_type: 'bulker',    scnt_min: 0, scnt_max: null, base_fee_usd: 5000,  per_scnt_fee_usd: 0,    war_risk_zone: null, valid_from: '2025-01-01', valid_to: null, source: 'kiel-2025' },
  { canal: 'kiel',     vessel_type: 'tanker',    scnt_min: 0, scnt_max: null, base_fee_usd: 7000,  per_scnt_fee_usd: 0,    war_risk_zone: null, valid_from: '2025-01-01', valid_to: null, source: 'kiel-2025' },
  { canal: 'kiel',     vessel_type: 'container', scnt_min: 0, scnt_max: null, base_fee_usd: 8500,  per_scnt_fee_usd: 0,    war_risk_zone: null, valid_from: '2025-01-01', valid_to: null, source: 'kiel-2025' },
  { canal: 'kiel',     vessel_type: 'general',   scnt_min: 0, scnt_max: null, base_fee_usd: 4000,  per_scnt_fee_usd: 0,    war_risk_zone: null, valid_from: '2025-01-01', valid_to: null, source: 'kiel-2025' },
  { canal: 'bosporus', vessel_type: 'bulker',    scnt_min: 0, scnt_max: null, base_fee_usd: 8000,  per_scnt_fee_usd: 0,    war_risk_zone: null, valid_from: '2025-01-01', valid_to: null, source: 'bosporus-2025' },
  { canal: 'bosporus', vessel_type: 'tanker',    scnt_min: 0, scnt_max: null, base_fee_usd: 12000, per_scnt_fee_usd: 0,    war_risk_zone: null, valid_from: '2025-01-01', valid_to: null, source: 'bosporus-2025' },
  { canal: 'bosporus', vessel_type: 'container', scnt_min: 0, scnt_max: null, base_fee_usd: 10000, per_scnt_fee_usd: 0,    war_risk_zone: null, valid_from: '2025-01-01', valid_to: null, source: 'bosporus-2025' },
  { canal: 'bosporus', vessel_type: 'general',   scnt_min: 0, scnt_max: null, base_fee_usd: 6000,  per_scnt_fee_usd: 0,    war_risk_zone: null, valid_from: '2025-01-01', valid_to: null, source: 'bosporus-2025' },
];

export function makeTestDb(rows: SeedRow[] = ALL_CANAL_SEED): Database.Database {
  const db = new Database(':memory:');
  db.exec(CANAL_TARIFFS_SCHEMA);
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
  return db;
}

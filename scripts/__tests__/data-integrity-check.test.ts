/**
 * Behavioral tests for scripts/data-integrity-check.ts
 *
 * PI2: these tests invoke the actual script binary via child_process so the
 * full DB-open + header-print path is exercised, not just string matching.
 */

import { execFileSync, spawnSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';

const SCRIPT = path.resolve(__dirname, '../data-integrity-check.ts');
const TSX = path.resolve(__dirname, '../../node_modules/.bin/tsx');

function runScript(args: string[]): { stdout: string; stderr: string; code: number } {
  // Destructure out keys the child process should not inherit (NODE_ENV is readonly in Next.js types)
  const { SESSIONS_DB_PATH: _s, NODE_ENV: _n, ...childEnv } = process.env;
  const result = spawnSync(TSX, ['--no-deprecation', SCRIPT, ...args], {
    encoding: 'utf8',
    env: childEnv as unknown as NodeJS.ProcessEnv,
  });
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    code: result.status ?? 1,
  };
}

function makeTestDb(dbPath: string): void {
  const db = new Database(dbPath);
  sqliteVec.load(db);
  // Minimal schema: sessions + fx_rates (critical tables)
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, access_token TEXT, created_at INTEGER, expires_at INTEGER, data TEXT);
    CREATE TABLE IF NOT EXISTS fx_rates  (id INTEGER PRIMARY KEY, base TEXT, quote TEXT, rate REAL, source TEXT, fetched_at TEXT);
    CREATE TABLE IF NOT EXISTS charterers (id TEXT PRIMARY KEY, name TEXT, tier TEXT, payment_history TEXT, require_lc INTEGER, created_at TEXT);
    INSERT INTO sessions VALUES ('s1', 'tok', 1716000000, 1716100000, '{}');
    INSERT INTO fx_rates   VALUES (1, 'USD', 'EUR', 0.92, 'ecb-frankfurter', datetime('now'));
    INSERT INTO charterers VALUES ('c1', 'Cargill', 'blue-chip', '[]', 0, datetime('now'));
  `);
  db.close();
}

describe('data-integrity-check.ts', () => {
  let tmpDir: string;
  let tmpDb: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qk-audit-'));
    tmpDb = path.join(tmpDir, 'sessions.db');
    makeTestDb(tmpDb);
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('prints ENV label and DB path in the header', () => {
    const { stdout } = runScript(['--env', 'prod-test', '--db-path', tmpDb]);
    expect(stdout).toContain('ENV:     PROD-TEST');
    expect(stdout).toContain(`DB:      ${tmpDb}`);
    expect(stdout).toContain('EXISTS:  YES');
  });

  it('exits 1 and prints error when DB does not exist', () => {
    const { stdout, stderr, code } = runScript(['--db-path', '/tmp/nonexistent-qk-9999.db']);
    expect(code).toBe(1);
    expect(stdout).toContain('EXISTS:  NO');
    expect(stderr).toContain('ERROR: Database not found');
  });

  it('reports rows and freshness for populated tables', () => {
    const { stdout } = runScript(['--env', 'dev', '--db-path', tmpDb]);
    // sessions: 1 row — should be OK or EMPTY depends on criticality
    expect(stdout).toContain('sessions');
    // fx_rates: 1 row with ecb source → REAL
    expect(stdout).toMatch(/FX rates\s+1/);
    expect(stdout).toContain('REAL');
  });

  it('classifies static-seed source as SYNTHETIC', () => {
    // Add a bunker_prices row with static-seed source
    const db = new Database(tmpDb);
    db.exec(`
      CREATE TABLE IF NOT EXISTS bunker_prices (
        port_unlocode TEXT, fuel_grade TEXT, price_usd_per_mt REAL,
        price_date TEXT, source TEXT, fetched_at TEXT,
        UNIQUE(port_unlocode, fuel_grade, price_date)
      );
      INSERT OR IGNORE INTO bunker_prices VALUES ('NLRTM','VLSFO',791,'2026-05-09','static-seed',datetime('now'));
    `);
    db.close();
    const { stdout } = runScript(['--db-path', tmpDb]);
    expect(stdout).toContain('SYNTHETIC');
  });

  it('reports MISSING for tables not in the schema', () => {
    // A fresh DB with only sessions will show many tables as MISSING
    const bareDb = path.join(tmpDir, 'bare.db');
    const db2 = new Database(bareDb);
    db2.exec(`CREATE TABLE sessions (id TEXT PRIMARY KEY, access_token TEXT, created_at INTEGER, expires_at INTEGER, data TEXT);`);
    db2.close();
    const { stdout } = runScript(['--db-path', bareDb]);
    expect(stdout).toContain('MISSING');
  });

  it('default env label is DEV when --env is not passed', () => {
    const { stdout } = runScript(['--db-path', tmpDb]);
    expect(stdout).toContain('ENV:     DEV');
  });
});

/**
 * Behavioral tests for backfill-1021-cargo-data.ts
 *
 * Data-half of #1033 (engine fixes for #1021 CBM volume + #1023 DWT-range).
 * Tests run against a synthetic SQLite DB seeded so that the two in-scope cargo
 * rows carry the pre-backfill (null) state:
 *   - 19e07d7c0f5b66c5 item 0: volumeCbm=null         (#1021)
 *   - 19e07cc3ba833475 item 0: minVesselDwtMt=null,
 *                              maxVesselDwtMt=null     (#1023)
 * The unrelated Egypt-Med salt email (19e07caab607dfe5) is seeded with
 * volumeCbm=null and must stay null (out of scope).
 */
import Database from 'better-sqlite3';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as child_process from 'node:child_process';

const CBM_EMAIL_ID = '19e07d7c0f5b66c5'; // #1021 — volumeCbm
const DWT_EMAIL_ID = '19e07cc3ba833475'; // #1023 — min/maxVesselDwtMt
const SALT_EMAIL_ID = '19e07caab607dfe5'; // out of scope — must stay null

const SCRIPT_PATH = path.resolve(__dirname, '../backfill-1021-cargo-data.ts');
const REPO_ROOT = path.resolve(__dirname, '../../..');

// Pre-backfill (null) item 0 for the CBM cargo (#1021).
const CBM_STALE_ITEM_0 = {
  emailId: CBM_EMAIL_ID,
  itemIndex: 0,
  originPort: { value: 'Chennai', confidence: 'interpreted', sourceText: 'Chennai' },
  destinationPort: { value: 'Fujairah', confidence: 'interpreted', sourceText: 'Fujairah' },
  cargoDescription: { value: 'General cargo ~12,000 net CBM', confidence: 'interpreted', sourceText: 'CBM' },
  weightMt: null,
  weightMtMin: null,
  weightMtMax: null,
  volumeCbm: null, // pre-#1021 state — to be backfilled to 12000
  cargoType: 'BREAK_BULK',
  laycan: 'Mid to end May 2026',
  minVesselDwtMt: null,
  maxVesselDwtMt: null,
};

// Pre-backfill (null) item 0 for the DWT-range cargo (#1023).
const DWT_STALE_ITEM_0 = {
  emailId: DWT_EMAIL_ID,
  itemIndex: 0,
  originPort: { value: 'Thisvi', confidence: 'confirmed', sourceText: 'Thisvi' },
  destinationPort: { value: 'Monfalcone', confidence: 'confirmed', sourceText: 'Monfalcone' },
  cargoDescription: { value: 'Cargo not specified', confidence: 'uncertain', sourceText: 'cargo' },
  weightMt: null,
  weightMtMin: null,
  weightMtMax: null,
  volumeCbm: null,
  cargoType: 'OTHER',
  laycan: '17-22 May 2026',
  minVesselDwtMt: null, // pre-#1023 state — to be backfilled to 12000
  maxVesselDwtMt: null, // pre-#1023 state — to be backfilled to 14000
};

// Out-of-scope salt email — volumeCbm intentionally null, must stay null.
const SALT_ITEM_0 = {
  emailId: SALT_EMAIL_ID,
  itemIndex: 0,
  originPort: { value: 'Egypt Med', confidence: 'interpreted', sourceText: 'Egypt Med' },
  destinationPort: { value: 'POC', confidence: 'interpreted', sourceText: 'POC' },
  cargoDescription: { value: 'Salt in big bags', confidence: 'interpreted', sourceText: 'salt' },
  weightMt: { value: 5000, confidence: 'interpreted', sourceText: '5000' },
  weightMtMin: 4500,
  weightMtMax: 5500,
  volumeCbm: null, // intentionally null — must NOT be touched
  cargoType: 'BULK',
  laycan: 'Spot',
  minVesselDwtMt: null,
  maxVesselDwtMt: null,
};

function createSyntheticDb(dbPath: string): void {
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS parsed_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id TEXT NOT NULL DEFAULT 'demo',
      gmail_message_id TEXT NOT NULL,
      parse_type TEXT NOT NULL,
      parser_version TEXT NOT NULL DEFAULT '1.0',
      result_json TEXT NOT NULL,
      parsed_at INTEGER NOT NULL DEFAULT 0
    );
  `);
  const insert = db.prepare(
    `INSERT INTO parsed_results (gmail_message_id, parse_type, result_json) VALUES (?, 'cargo', ?)`,
  );
  insert.run(CBM_EMAIL_ID, JSON.stringify([CBM_STALE_ITEM_0]));
  insert.run(DWT_EMAIL_ID, JSON.stringify([DWT_STALE_ITEM_0]));
  insert.run(SALT_EMAIL_ID, JSON.stringify([SALT_ITEM_0]));
  db.close();
}

function runBackfill(dbPath: string, extraArgs: string[] = []): { stdout: string; stderr: string; exitCode: number } {
  const result = child_process.spawnSync('npx', ['tsx', SCRIPT_PATH, '--db', dbPath, ...extraArgs], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 30_000,
  });
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    exitCode: result.status ?? 1,
  };
}

function readItems(dbPath: string, emailId: string): Record<string, unknown>[] {
  const db = new Database(dbPath, { readonly: true });
  const row = db
    .prepare(`SELECT result_json FROM parsed_results WHERE gmail_message_id=? AND parse_type='cargo'`)
    .get(emailId) as { result_json: string };
  db.close();
  return JSON.parse(row.result_json);
}

describe('backfill-1021-cargo-data', () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'backfill-1021-test-'));
    dbPath = path.join(tmpDir, 'demo-seed.db');
    createSyntheticDb(dbPath);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('live run: sets volumeCbm=12000 (#1021) on the CBM cargo item 0', () => {
    const { exitCode } = runBackfill(dbPath);
    expect(exitCode).toBe(0);
    expect(readItems(dbPath, CBM_EMAIL_ID)[0].volumeCbm).toBe(12000);
  });

  it('live run: sets minVesselDwtMt=12000 / maxVesselDwtMt=14000 (#1023) on the DWT cargo item 0', () => {
    const { exitCode } = runBackfill(dbPath);
    expect(exitCode).toBe(0);
    const item0 = readItems(dbPath, DWT_EMAIL_ID)[0];
    expect(item0.minVesselDwtMt).toBe(12000);
    expect(item0.maxVesselDwtMt).toBe(14000);
  });

  it('dry run: leaves DB unchanged but logs WOULD-UPDATE for both in-scope emails', () => {
    const dbBefore = fs.readFileSync(dbPath);
    const { stdout, stderr, exitCode } = runBackfill(dbPath, ['--dry']);
    const output = stdout + stderr;

    expect(exitCode).toBe(0);
    // DB file must be byte-for-byte identical (no writes)
    expect(dbBefore.equals(fs.readFileSync(dbPath))).toBe(true);
    expect(output).toMatch(/WOULD-UPDATE/);
    expect(output).toMatch(CBM_EMAIL_ID);
    expect(output).toMatch(DWT_EMAIL_ID);
    // Values must still be null after a dry run
    expect(readItems(dbPath, CBM_EMAIL_ID)[0].volumeCbm).toBeNull();
    expect(readItems(dbPath, DWT_EMAIL_ID)[0].minVesselDwtMt).toBeNull();
  });

  it('does NOT touch the out-of-scope salt email (volumeCbm stays null)', () => {
    runBackfill(dbPath);
    expect(readItems(dbPath, SALT_EMAIL_ID)[0].volumeCbm).toBeNull();
  });

  it('leaves unrelated fields on in-scope rows untouched', () => {
    runBackfill(dbPath);
    const cbm = readItems(dbPath, CBM_EMAIL_ID)[0];
    expect(cbm.cargoType).toBe('BREAK_BULK');
    expect((cbm.originPort as { value: string }).value).toBe('Chennai');
    // #1023 fields not in this row's target set stay null
    expect(cbm.minVesselDwtMt).toBeNull();

    const dwt = readItems(dbPath, DWT_EMAIL_ID)[0];
    expect(dwt.cargoType).toBe('OTHER');
    // #1021 field not in this row's target set stays null
    expect(dwt.volumeCbm).toBeNull();
  });

  it('idempotent: second run produces 0 updates', () => {
    const r1 = runBackfill(dbPath);
    expect(r1.exitCode).toBe(0);

    const r2 = runBackfill(dbPath);
    const output = r2.stdout + r2.stderr;
    expect(r2.exitCode).toBe(0);
    expect(output).not.toMatch(/\bUPDATED emailId=/);
    expect(output).toMatch(/updated=0/i);
  });

  it('summary always includes updated / skipped-already-correct / skipped-missing', () => {
    const { stdout, stderr } = runBackfill(dbPath);
    const output = stdout + stderr;
    expect(output).toMatch(/updated=\d+/);
    expect(output).toMatch(/skipped-already-correct=\d+/);
    expect(output).toMatch(/skipped-missing=\d+/);
  });

  it('counts a missing row as skipped-missing (no crash) when an in-scope email is absent', () => {
    // Drop the CBM email row entirely → SKIPPED-MISSING for that target.
    const db = new Database(dbPath);
    db.prepare(`DELETE FROM parsed_results WHERE gmail_message_id=?`).run(CBM_EMAIL_ID);
    db.close();

    const { stdout, stderr, exitCode } = runBackfill(dbPath);
    const output = stdout + stderr;
    expect(exitCode).toBe(0);
    expect(output).toMatch(/SKIPPED-MISSING/);
    expect(output).toMatch(/skipped-missing=1/);
    // The DWT email is still present and gets updated.
    expect(readItems(dbPath, DWT_EMAIL_ID)[0].maxVesselDwtMt).toBe(14000);
  });
});

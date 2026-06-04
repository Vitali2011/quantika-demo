/**
 * Behavioral tests for backfill-815-weights.ts
 *
 * Tests run against a synthetic in-memory SQLite DB seeded with:
 * - ALL fixture emailIds from demo-parsed-cargoes.json (with pass-through or stale data)
 * - The Marmara cargo row specifically set to stale weights (pre-#815 state)
 */
import Database from 'better-sqlite3';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as child_process from 'node:child_process';

const MARMARA_EMAIL_ID = '19d5de87705baf9b';
const FIXTURE_PATH = path.resolve(__dirname, '../../../lib/sample-data/demo-parsed-cargoes.json');
const SCRIPT_PATH = path.resolve(__dirname, '../backfill-815-weights.ts');
const REPO_ROOT = path.resolve(__dirname, '../../..');

// Stale (pre-#815) item 0 for Marmara
const MARMARA_STALE_ITEM_0 = {
  emailId: MARMARA_EMAIL_ID,
  itemIndex: 0,
  originPort: { value: 'Marmara', confidence: 'confirmed', sourceText: 'marmara' },
  destinationPort: { value: 'Vera Cruz', confidence: 'confirmed', sourceText: 'vera cruz' },
  cargoDescription: { value: '14 pieces of Storage Tanks', confidence: 'interpreted', sourceText: 'tanks' },
  // Stale: null weight (pre-#815 state)
  weightMt: { value: null, confidence: 'not_stated', sourceText: '' },
  weightMtMin: null,
  weightMtMax: null,
  cargoType: 'PROJECT',
  laycan: '2026-05-15 to 2026-05-20',
  volumeCbm: 1920,
};

// Correct item 1 for Marmara (should be untouched)
const MARMARA_ITEM_1 = {
  emailId: MARMARA_EMAIL_ID,
  itemIndex: 1,
  originPort: { value: 'Karasu', confidence: 'confirmed', sourceText: 'karasu' },
  destinationPort: { value: 'Puerto Limon', confidence: 'confirmed', sourceText: 'puerto limon' },
  cargoDescription: { value: 'Hot Rolled Coils', confidence: 'confirmed', sourceText: 'hrc' },
  weightMt: { value: 10400, confidence: 'confirmed', sourceText: '10400 mts hrc' },
  weightMtMin: 10400,
  weightMtMax: 10400,
  cargoType: 'BULK',
  laycan: '2026-05-10 to 2026-05-15',
};

function getAllFixtureEmailIds(): string[] {
  const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8')) as Array<{ emailId: string }>;
  const ids = new Set(fixture.map((c) => c.emailId));
  return [...ids];
}

/**
 * Create a synthetic DB seeded with parsed_results rows for ALL fixture emailIds.
 * The Marmara row uses STALE weights; all others use pass-through fixture data.
 */
function createSyntheticDb(dbPath: string): void {
  const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8')) as Array<{
    emailId: string;
    itemIndex: number;
    [key: string]: unknown;
  }>;

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

  // Group fixture items by emailId
  const byEmail = new Map<string, typeof fixture>();
  for (const item of fixture) {
    const arr = byEmail.get(item.emailId) ?? [];
    arr.push(item);
    byEmail.set(item.emailId, arr);
  }

  const insert = db.prepare(
    `INSERT INTO parsed_results (gmail_message_id, parse_type, result_json) VALUES (?, 'cargo', ?)`,
  );

  for (const [emailId, items] of byEmail) {
    if (emailId === MARMARA_EMAIL_ID) {
      // Use stale data for Marmara to test the backfill
      insert.run(emailId, JSON.stringify([MARMARA_STALE_ITEM_0, MARMARA_ITEM_1]));
    } else {
      // Use the fixture data as-is (already correct post-#815)
      insert.run(emailId, JSON.stringify(items));
    }
  }

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

describe('backfill-815-weights', () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'backfill-815-test-'));
    dbPath = path.join(tmpDir, 'demo-seed.db');
    createSyntheticDb(dbPath);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('live run: sets weightMtMax=186, weightMt.value=186 on Marmara item 0', () => {
    const { exitCode, stdout, stderr } = runBackfill(dbPath);
    expect(exitCode).toBe(0);

    const db = new Database(dbPath, { readonly: true });
    const row = db.prepare(
      `SELECT result_json FROM parsed_results WHERE gmail_message_id=? AND parse_type='cargo'`,
    ).get(MARMARA_EMAIL_ID) as { result_json: string };
    db.close();

    const items = JSON.parse(row.result_json);
    const item0 = items[0];
    expect(item0.weightMtMax).toBe(186);
    expect(item0.weightMt).toMatchObject({ value: 186, confidence: 'interpreted' });
    expect(item0.weightMtMin).toBe(186);
  });

  it('dry run: leaves DB unchanged but logs WOULD-UPDATE', () => {
    const dbBefore = fs.readFileSync(dbPath);
    const { stdout, stderr, exitCode } = runBackfill(dbPath, ['--dry']);
    const output = stdout + stderr;

    expect(exitCode).toBe(0);
    // DB file must be byte-for-byte identical (no writes)
    const dbAfter = fs.readFileSync(dbPath);
    expect(dbBefore.equals(dbAfter)).toBe(true);
    // Must log WOULD-UPDATE for the stale row
    expect(output).toMatch(/WOULD-UPDATE/);
    expect(output).toMatch(MARMARA_EMAIL_ID);
  });

  it('non-weight fields remain untouched after live run', () => {
    runBackfill(dbPath);

    const db = new Database(dbPath, { readonly: true });
    const row = db.prepare(
      `SELECT result_json FROM parsed_results WHERE gmail_message_id=? AND parse_type='cargo'`,
    ).get(MARMARA_EMAIL_ID) as { result_json: string };
    db.close();

    const items = JSON.parse(row.result_json);
    const item0 = items[0];
    // Non-weight fields must be untouched
    expect(item0.cargoType).toBe('PROJECT');
    expect(item0.laycan).toBe('2026-05-15 to 2026-05-20');
    expect((item0.originPort as { value: string }).value).toBe('Marmara');
    expect((item0.destinationPort as { value: string }).value).toBe('Vera Cruz');
    expect(item0.volumeCbm).toBe(1920);
  });

  it('MISSING_ROW: refuses to write and exits non-zero when parsed_results row absent', () => {
    // Create a DB with empty parsed_results (no rows at all)
    const emptyDbPath = path.join(tmpDir, 'empty.db');
    const emptyDb = new Database(emptyDbPath);
    emptyDb.exec(`
      CREATE TABLE parsed_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id TEXT NOT NULL DEFAULT 'demo',
        gmail_message_id TEXT NOT NULL,
        parse_type TEXT NOT NULL,
        parser_version TEXT NOT NULL DEFAULT '1.0',
        result_json TEXT NOT NULL,
        parsed_at INTEGER NOT NULL DEFAULT 0
      );
    `);
    emptyDb.close();

    const { stdout, stderr, exitCode } = runBackfill(emptyDbPath);
    const output = stdout + stderr;

    expect(exitCode).not.toBe(0);
    expect(output).toMatch(/MISSING_ROW/);
  });

  it('idempotent: second run produces 0 updates', () => {
    const r1 = runBackfill(dbPath);
    expect(r1.exitCode).toBe(0);

    const r2 = runBackfill(dbPath);
    const output = r2.stdout + r2.stderr;
    expect(r2.exitCode).toBe(0);
    // No UPDATED lines on second run (all values already correct)
    expect(output).not.toMatch(/\bUPDATED emailId=/);
    // Summary must show 0 updates
    expect(output).toMatch(/updated=0/i);
  });

  it('summary always includes all four counters', () => {
    const { stdout, stderr } = runBackfill(dbPath);
    const output = stdout + stderr;
    expect(output).toMatch(/updated=\d+/);
    expect(output).toMatch(/skipped-already-correct=\d+/);
    expect(output).toMatch(/skipped-missing=\d+/);
    expect(output).toMatch(/skipped-ambiguous=\d+/);
  });
});

// ---------------------------------------------------------------------------
// --allow-missing mode
// ---------------------------------------------------------------------------

/**
 * Creates a DB where:
 * - one fixture emailId has NO row              → SKIPPED-MISSING
 * - one fixture emailId has an EMPTY items row  → SKIPPED-AMBIGUOUS (itemIndex OOB + no fingerprint match)
 * - MARMARA_EMAIL_ID has STALE weights          → will be UPDATED
 * - all other emailIds have correct fixture data → skipped-already-correct
 */
function createAllowMissingDb(dbPath: string): { missingId: string; ambiguousId: string } {
  const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8')) as Array<{
    emailId: string;
    itemIndex: number;
    [key: string]: unknown;
  }>;

  const byEmail = new Map<string, typeof fixture>();
  for (const item of fixture) {
    const arr = byEmail.get(item.emailId) ?? [];
    arr.push(item);
    byEmail.set(item.emailId, arr);
  }

  const otherIds = [...byEmail.keys()].filter((id) => id !== MARMARA_EMAIL_ID);
  const MISSING_ID = otherIds[0];
  const AMBIGUOUS_ID = otherIds[1];

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

  for (const [emailId, items] of byEmail) {
    if (emailId === MISSING_ID) continue; // absent → SKIPPED-MISSING

    if (emailId === AMBIGUOUS_ID) {
      // Empty array: itemIndex OOB + no fingerprint match → SKIPPED-AMBIGUOUS
      insert.run(emailId, JSON.stringify([]));
      continue;
    }

    if (emailId === MARMARA_EMAIL_ID) {
      insert.run(emailId, JSON.stringify([MARMARA_STALE_ITEM_0, MARMARA_ITEM_1]));
      continue;
    }

    insert.run(emailId, JSON.stringify(items));
  }

  db.close();
  return { missingId: MISSING_ID, ambiguousId: AMBIGUOUS_ID };
}

describe('backfill-815-weights --allow-missing', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'backfill-815-allowmissing-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('skips MISSING_ROW + AMBIGUOUS_MATCH, applies matched updates, exits 0', () => {
    const db = path.join(tmpDir, 'test.db');
    const { missingId, ambiguousId } = createAllowMissingDb(db);

    const { stdout, stderr, exitCode } = runBackfill(db, ['--allow-missing']);
    const output = stdout + stderr;

    expect(exitCode).toBe(0);
    expect(output).toMatch(/SKIPPED-MISSING/);
    expect(output).toMatch(/SKIPPED-AMBIGUOUS/);

    const conn = new Database(db, { readonly: true });
    const sel = conn.prepare(
      `SELECT result_json FROM parsed_results WHERE gmail_message_id=? AND parse_type='cargo'`,
    );

    // Marmara was updated
    const marmaraRow = sel.get(MARMARA_EMAIL_ID) as { result_json: string };
    const items = JSON.parse(marmaraRow.result_json);
    expect(items[0].weightMtMax).toBe(186);
    expect(items[0].weightMt).toMatchObject({ value: 186, confidence: 'interpreted' });

    // Ambiguous row must be unchanged (empty array — never corrupted)
    const ambiguousRow = sel.get(ambiguousId) as { result_json: string };
    expect(JSON.parse(ambiguousRow.result_json)).toEqual([]);

    // Missing row must still have no DB entry
    const missingRow = sel.get(missingId);
    expect(missingRow).toBeUndefined();

    conn.close();
  });

  it('strict mode (no flag) with missing row → ABORT, no writes', () => {
    const emptyDbPath = path.join(tmpDir, 'empty.db');
    const emptyDb = new Database(emptyDbPath);
    emptyDb.exec(`
      CREATE TABLE parsed_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id TEXT NOT NULL DEFAULT 'demo',
        gmail_message_id TEXT NOT NULL,
        parse_type TEXT NOT NULL,
        parser_version TEXT NOT NULL DEFAULT '1.0',
        result_json TEXT NOT NULL,
        parsed_at INTEGER NOT NULL DEFAULT 0
      );
    `);
    emptyDb.close();

    const { stdout, stderr, exitCode } = runBackfill(emptyDbPath);
    const output = stdout + stderr;

    expect(exitCode).not.toBe(0);
    expect(output).toMatch(/MISSING_ROW/);
  });

  it('--allow-missing --dry: exits 0, leaves DB unchanged, logs expected markers', () => {
    const db = path.join(tmpDir, 'dry.db');
    createAllowMissingDb(db);

    const before = fs.readFileSync(db);
    const { stdout, stderr, exitCode } = runBackfill(db, ['--allow-missing', '--dry']);
    const after = fs.readFileSync(db);
    const output = stdout + stderr;

    expect(exitCode).toBe(0);
    expect(before.equals(after)).toBe(true);
    expect(output).toMatch(/SKIPPED-MISSING/);
    expect(output).toMatch(/SKIPPED-AMBIGUOUS/);
    expect(output).toMatch(/WOULD-UPDATE/);
  });

  it('--allow-missing idempotent: second run produces 0 updates', () => {
    const db = path.join(tmpDir, 'idem.db');
    createAllowMissingDb(db);

    const r1 = runBackfill(db, ['--allow-missing']);
    expect(r1.exitCode).toBe(0);

    const r2 = runBackfill(db, ['--allow-missing']);
    const output = r2.stdout + r2.stderr;
    expect(r2.exitCode).toBe(0);
    expect(output).not.toMatch(/\bUPDATED emailId=/);
    expect(output).toMatch(/updated=0/i);
  });
});

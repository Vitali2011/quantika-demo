/**
 * Tests for backfill-payout.ts
 *
 * Unit tests: needsPayoutPatch + applyPayoutPatch (no DB, no LLM)
 * Behavioral/integration tests: subprocess with --mock-payout-fixture flag
 */
import Database from 'better-sqlite3';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as child_process from 'node:child_process';

import { needsPayoutPatch, applyPayoutPatch } from '../backfill-payout';

const SCRIPT_PATH = path.resolve(__dirname, '../backfill-payout.ts');
const REPO_ROOT = path.resolve(__dirname, '../../..');

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface SeedRow {
  emailId: string;
  items: object[];
  emailBody?: string;
}

function createTestDb(dbPath: string, rows: SeedRow[]): void {
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS emails (
      account_id        TEXT NOT NULL,
      gmail_message_id  TEXT NOT NULL,
      body              TEXT,
      PRIMARY KEY (account_id, gmail_message_id)
    );
    CREATE TABLE IF NOT EXISTS parsed_results (
      account_id        TEXT NOT NULL,
      gmail_message_id  TEXT NOT NULL,
      parse_type        TEXT NOT NULL,
      parser_version    TEXT NOT NULL,
      result_json       TEXT NOT NULL,
      parsed_at         TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (account_id, gmail_message_id, parse_type, parser_version)
    );
  `);
  const insertEmail = db.prepare(
    `INSERT INTO emails (account_id, gmail_message_id, body) VALUES ('demo', ?, ?)`,
  );
  const insertParsed = db.prepare(
    `INSERT INTO parsed_results (account_id, gmail_message_id, parse_type, parser_version, result_json)
     VALUES ('demo', ?, 'cargo', 'demo-seed-v1', ?)`,
  );
  for (const row of rows) {
    insertEmail.run(row.emailId, row.emailBody ?? 'Cargo inquiry. Freight payable on delivery.');
    insertParsed.run(row.emailId, JSON.stringify(row.items));
  }
  db.close();
}

function runScript(
  dbPath: string,
  extraArgs: string[] = [],
): { stdout: string; stderr: string; exitCode: number } {
  const result = child_process.spawnSync(
    'npx',
    ['tsx', SCRIPT_PATH, '--db', dbPath, ...extraArgs],
    { cwd: REPO_ROOT, encoding: 'utf8', timeout: 30_000 },
  );
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    exitCode: result.status ?? 1,
  };
}

// ─── Unit: needsPayoutPatch ───────────────────────────────────────────────────

describe('needsPayoutPatch', () => {
  it('returns true when any item lacks payoutCondition key', () => {
    expect(needsPayoutPatch([{ emailId: 'x', cargoType: 'BULK' }])).toBe(true);
  });

  it('returns false when all items have payoutCondition as null', () => {
    expect(needsPayoutPatch([{ emailId: 'x', payoutCondition: null }])).toBe(false);
  });

  it('returns false when all items have payoutCondition as string', () => {
    expect(needsPayoutPatch([{ emailId: 'x', payoutCondition: '100% on discharge' }])).toBe(false);
  });

  it('returns true when at least one item lacks key even if others have it', () => {
    expect(
      needsPayoutPatch([
        { emailId: 'x', payoutCondition: 'LC at sight' },
        { emailId: 'x', cargoType: 'BULK' }, // no key
      ]),
    ).toBe(true);
  });

  it('returns false for empty items array', () => {
    expect(needsPayoutPatch([])).toBe(false);
  });
});

// ─── Unit: applyPayoutPatch ──────────────────────────────────────────────────

describe('applyPayoutPatch', () => {
  it('sets payoutCondition on items missing the key', () => {
    const items = [{ emailId: 'a', cargoType: 'BULK' }];
    const { patched } = applyPayoutPatch(items as Record<string, unknown>[], 'payment on delivery');
    expect(patched).toBe(1);
    expect((items[0] as Record<string, unknown>)['payoutCondition']).toBe('payment on delivery');
  });

  it('sets payoutCondition to null when extracted value is null', () => {
    const items = [{ emailId: 'a' }];
    const { patched } = applyPayoutPatch(items as Record<string, unknown>[], null);
    expect(patched).toBe(1);
    expect((items[0] as Record<string, unknown>)['payoutCondition']).toBeNull();
  });

  it('skips items that already have payoutCondition key (even if null)', () => {
    const items = [
      { emailId: 'a', payoutCondition: null },
      { emailId: 'b', payoutCondition: 'existing' },
    ];
    const { patched } = applyPayoutPatch(items as Record<string, unknown>[], 'new value');
    expect(patched).toBe(0);
    expect((items[0] as Record<string, unknown>)['payoutCondition']).toBeNull();
    expect((items[1] as Record<string, unknown>)['payoutCondition']).toBe('existing');
  });

  it('does not modify other fields', () => {
    const items = [{ emailId: 'a', cargoType: 'BULK', weightMt: 1000 }];
    applyPayoutPatch(items as Record<string, unknown>[], 'freight on delivery');
    expect((items[0] as Record<string, unknown>)['cargoType']).toBe('BULK');
    expect((items[0] as Record<string, unknown>)['weightMt']).toBe(1000);
  });

  it('is idempotent: second call skips already-patched items', () => {
    const items = [{ emailId: 'a' }];
    applyPayoutPatch(items as Record<string, unknown>[], 'first patch');
    const { patched } = applyPayoutPatch(items as Record<string, unknown>[], 'second patch');
    expect(patched).toBe(0);
    expect((items[0] as Record<string, unknown>)['payoutCondition']).toBe('first patch');
  });

  it('patches only missing items in a mixed array', () => {
    const items = [
      { emailId: 'a', payoutCondition: 'existing' },
      { emailId: 'b' }, // missing
      { emailId: 'c', payoutCondition: null }, // already set (null)
    ];
    const { patched } = applyPayoutPatch(items as Record<string, unknown>[], 'new value');
    expect(patched).toBe(1);
    expect((items[0] as Record<string, unknown>)['payoutCondition']).toBe('existing');
    expect((items[1] as Record<string, unknown>)['payoutCondition']).toBe('new value');
    expect((items[2] as Record<string, unknown>)['payoutCondition']).toBeNull();
  });
});

// ─── Integration (subprocess) ────────────────────────────────────────────────

describe('backfill-payout (subprocess)', () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'backfill-payout-test-'));
    dbPath = path.join(tmpDir, 'demo-seed.db');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('dry run (default): leaves DB unchanged, logs WOULD-PATCH', () => {
    createTestDb(dbPath, [
      { emailId: 'email1', items: [{ emailId: 'email1', cargoType: 'BULK' }] },
    ]);

    const fixturePath = path.join(tmpDir, 'fixture.json');
    fs.writeFileSync(fixturePath, JSON.stringify({ email1: '100% on discharge' }));

    const dbBefore = fs.readFileSync(dbPath);
    const { stdout, stderr, exitCode } = runScript(dbPath, ['--mock-payout-fixture', fixturePath]);
    const dbAfter = fs.readFileSync(dbPath);
    const output = stdout + stderr;

    expect(exitCode).toBe(0);
    expect(dbBefore.equals(dbAfter)).toBe(true);
    expect(output).toMatch(/WOULD-PATCH/);
    expect(output).toMatch(/email1/);
  });

  it('--apply: writes payoutCondition into DB, other fields untouched', () => {
    createTestDb(dbPath, [
      {
        emailId: 'email1',
        items: [{ emailId: 'email1', cargoType: 'BULK', weightMt: 5000 }],
      },
    ]);

    const fixturePath = path.join(tmpDir, 'fixture.json');
    fs.writeFileSync(fixturePath, JSON.stringify({ email1: 'freight payable within 3 banking days' }));

    const { exitCode } = runScript(dbPath, ['--apply', '--mock-payout-fixture', fixturePath]);
    expect(exitCode).toBe(0);

    const db = new Database(dbPath, { readonly: true });
    const row = db
      .prepare(`SELECT result_json FROM parsed_results WHERE gmail_message_id='email1' AND parse_type='cargo'`)
      .get() as { result_json: string };
    db.close();

    const items = JSON.parse(row.result_json) as Record<string, unknown>[];
    expect(items[0]['payoutCondition']).toBe('freight payable within 3 banking days');
    expect(items[0]['cargoType']).toBe('BULK');
    expect(items[0]['weightMt']).toBe(5000);
  });

  it('idempotent: second --apply run produces 0 patches', () => {
    createTestDb(dbPath, [
      { emailId: 'email1', items: [{ emailId: 'email1', cargoType: 'BULK' }] },
    ]);

    const fixturePath = path.join(tmpDir, 'fixture.json');
    fs.writeFileSync(fixturePath, JSON.stringify({ email1: 'LC at sight' }));

    const r1 = runScript(dbPath, ['--apply', '--mock-payout-fixture', fixturePath]);
    expect(r1.exitCode).toBe(0);

    const r2 = runScript(dbPath, ['--apply', '--mock-payout-fixture', fixturePath]);
    const output = r2.stdout + r2.stderr;
    expect(r2.exitCode).toBe(0);
    expect(output).not.toMatch(/\bPATCHED emailId=/);
    expect(output).toMatch(/patched=0/i);
  });

  it('summary includes patched and skipped counters', () => {
    createTestDb(dbPath, [
      { emailId: 'e1', items: [{ emailId: 'e1' }] },
      { emailId: 'e2', items: [{ emailId: 'e2', payoutCondition: null }] }, // already set
    ]);

    const fixturePath = path.join(tmpDir, 'fixture.json');
    fs.writeFileSync(fixturePath, JSON.stringify({ e1: null, e2: null }));

    const { stdout, stderr } = runScript(dbPath, ['--apply', '--mock-payout-fixture', fixturePath]);
    const output = stdout + stderr;
    expect(output).toMatch(/patched=\d+/);
    expect(output).toMatch(/skipped-already-correct=\d+/);
  });

  it('logs MISSING-EMAIL and skips when email row absent in DB', () => {
    // Insert parsed_results row WITHOUT corresponding email row
    const db = new Database(dbPath);
    db.exec(`
      CREATE TABLE emails (account_id TEXT NOT NULL, gmail_message_id TEXT NOT NULL, body TEXT,
        PRIMARY KEY (account_id, gmail_message_id));
      CREATE TABLE parsed_results (account_id TEXT NOT NULL, gmail_message_id TEXT NOT NULL,
        parse_type TEXT NOT NULL, parser_version TEXT NOT NULL, result_json TEXT NOT NULL,
        parsed_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (account_id, gmail_message_id, parse_type, parser_version));
    `);
    db.prepare(
      `INSERT INTO parsed_results (account_id, gmail_message_id, parse_type, parser_version, result_json)
       VALUES ('demo', 'missing-email-id', 'cargo', 'demo-seed-v1', ?)`,
    ).run(JSON.stringify([{ emailId: 'missing-email-id' }]));
    db.close();

    const fixturePath = path.join(tmpDir, 'fixture.json');
    fs.writeFileSync(fixturePath, JSON.stringify({ 'missing-email-id': 'some payout' }));

    const { stdout, stderr, exitCode } = runScript(dbPath, [
      '--apply',
      '--mock-payout-fixture',
      fixturePath,
    ]);
    const output = stdout + stderr;
    expect(exitCode).toBe(0);
    expect(output).toMatch(/MISSING-EMAIL/);
  });
});

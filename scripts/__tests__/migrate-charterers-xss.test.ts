/**
 * PI2 behavioral tests for scripts/migrate-charterers-xss.ts
 *
 * Tests exercise the real SQLite DB (in-memory via temp file) and run the
 * actual script binary — not string matching, not mocks.
 */

import Database from 'better-sqlite3';
import { spawnSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import migration026 from '@/lib/migrations/026-charterers';

const SCRIPT = path.resolve(__dirname, '../migrate-charterers-xss.ts');

// Walk up from __dirname to find the nearest node_modules/.bin/tsx
// (worktrees share node_modules with the parent repo, so it may be 2+ levels up)
function findTsx(): string {
  let dir = __dirname;
  while (dir !== path.parse(dir).root) {
    const candidate = path.join(dir, 'node_modules', '.bin', 'tsx');
    if (fs.existsSync(candidate)) return candidate;
    dir = path.dirname(dir);
  }
  return 'tsx';
}
const TSX = findTsx();

function runMigration(dbPath: string, extraArgs: string[] = []) {
  const { SESSIONS_DB_PATH: _s, NODE_ENV: _n, ...childEnv } = process.env;
  const result = spawnSync(TSX, ['--no-deprecation', SCRIPT, '--db-path', dbPath, ...extraArgs], {
    encoding: 'utf8',
    env: childEnv as unknown as NodeJS.ProcessEnv,
  });
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    code: result.status ?? 1,
  };
}

function makeTempDb(): { dbPath: string; db: Database.Database } {
  const dbPath = path.join(os.tmpdir(), `charterers-xss-test-${Date.now()}.db`);
  const db = new Database(dbPath);
  migration026.up(db);
  return { dbPath, db };
}

describe('migrate-charterers-xss.ts', () => {
  it('exits 0 when no XSS rows exist', () => {
    const { dbPath, db } = makeTempDb();
    db.prepare(`INSERT INTO charterers (id, name, tier) VALUES (?, ?, ?)`).run('c1', 'Clean Corp', 'blue-chip');
    db.close();

    const { code, stdout } = runMigration(dbPath);
    expect(code).toBe(0);
    expect(stdout).toContain('clean');

    fs.unlinkSync(dbPath);
  });

  it('strips <script> from name in place', () => {
    const { dbPath, db } = makeTempDb();
    db.prepare(`INSERT INTO charterers (id, name, tier) VALUES (?, ?, ?)`).run(
      'xss1',
      '<script>alert(1)</script>Evil Corp',
      'blue-chip'
    );
    db.close();

    const { code } = runMigration(dbPath);
    expect(code).toBe(0);

    const verify = new Database(dbPath, { readonly: true });
    const row = verify.prepare<[string], { name: string }>(`SELECT name FROM charterers WHERE id = ?`).get('xss1');
    expect(row).toBeDefined();
    expect(row!.name).not.toContain('<script>');
    expect(row!.name).toContain('Evil Corp');
    verify.close();
    fs.unlinkSync(dbPath);
  });

  it('deletes row when name sanitizes to empty', () => {
    const { dbPath, db } = makeTempDb();
    db.prepare(`INSERT INTO charterers (id, name, tier) VALUES (?, ?, ?)`).run(
      'xss2',
      '<script>alert(1)</script>',
      'second'
    );
    db.close();

    const { code } = runMigration(dbPath);
    expect(code).toBe(0);

    const verify = new Database(dbPath, { readonly: true });
    const row = verify.prepare<[string], { id: string }>(`SELECT id FROM charterers WHERE id = ?`).get('xss2');
    expect(row).toBeUndefined();
    verify.close();
    fs.unlinkSync(dbPath);
  });

  it('strips XSS from notes field', () => {
    const { dbPath, db } = makeTempDb();
    db.prepare(`INSERT INTO charterers (id, name, tier, notes) VALUES (?, ?, ?, ?)`).run(
      'xss3',
      'Safe Corp',
      'weak',
      '<img src=x onerror=alert(document.cookie)>'
    );
    db.close();

    const { code } = runMigration(dbPath);
    expect(code).toBe(0);

    const verify = new Database(dbPath, { readonly: true });
    const row = verify.prepare<[string], { notes: string | null }>(`SELECT notes FROM charterers WHERE id = ?`).get('xss3');
    expect(row).toBeDefined();
    expect(row!.notes).not.toContain('onerror');
    expect(row!.notes).not.toContain('<img');
    verify.close();
    fs.unlinkSync(dbPath);
  });

  it('dry-run does not modify rows', () => {
    const { dbPath, db } = makeTempDb();
    const xssName = '<script>alert(1)</script>Evil Corp';
    db.prepare(`INSERT INTO charterers (id, name, tier) VALUES (?, ?, ?)`).run('xss4', xssName, 'blue-chip');
    db.close();

    const { code, stdout } = runMigration(dbPath, ['--dry-run']);
    expect(code).toBe(0);
    expect(stdout).toContain('dry-run');

    const verify = new Database(dbPath, { readonly: true });
    const row = verify.prepare<[string], { name: string }>(`SELECT name FROM charterers WHERE id = ?`).get('xss4');
    expect(row!.name).toBe(xssName);
    verify.close();
    fs.unlinkSync(dbPath);
  });

  it('exits 1 when DB file does not exist', () => {
    const { code } = runMigration('/nonexistent/path/db.sqlite');
    expect(code).toBe(1);
  });
});

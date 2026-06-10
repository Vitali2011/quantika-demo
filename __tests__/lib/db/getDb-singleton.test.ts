import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getDb } from '@/lib/db';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'getdb-singleton-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('getDb singleton (H4)', () => {
  it('two calls with the same path return the same instance', () => {
    const dbPath = path.join(tmpDir, 'test.db');
    const db1 = getDb(dbPath);
    const db2 = getDb(dbPath);
    expect(db1).toBe(db2);
  });

  it(':memory: calls return independent instances', () => {
    const db1 = getDb(':memory:');
    const db2 = getDb(':memory:');
    expect(db1).not.toBe(db2);
    db1.close();
    db2.close();
  });
});

describe('getDb WAL + busy_timeout (H5)', () => {
  it('sets journal_mode = WAL on new file connection', () => {
    const dbPath = path.join(tmpDir, 'wal.db');
    const db = getDb(dbPath);
    const mode = db.pragma('journal_mode', { simple: true }) as string;
    expect(mode).toBe('wal');
  });

  it('sets busy_timeout to a positive value', () => {
    const dbPath = path.join(tmpDir, 'busy.db');
    const db = getDb(dbPath);
    const timeout = db.pragma('busy_timeout', { simple: true }) as number;
    expect(timeout).toBeGreaterThan(0);
  });
});

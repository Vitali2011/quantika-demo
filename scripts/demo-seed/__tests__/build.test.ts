// scripts/demo-seed/__tests__/build.test.ts
import { build } from '../build';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';

const FIXTURES = path.resolve(__dirname, '../../../__tests__/fixtures/demo-seed');
const FIX_MANIFEST = path.resolve(__dirname, 'fixtures/manifest.fixture.json');

describe('build (Phase 1)', () => {
  let tmpDb: string;
  beforeEach(() => { tmpDb = path.join(os.tmpdir(), `demo-seed-${Date.now()}.db`); });
  afterEach(() => { if (fs.existsSync(tmpDb)) fs.unlinkSync(tmpDb); });

  it('writes a SQLite file with emails table populated', async () => {
    await build({ rawDir: FIXTURES, manifestPath: FIX_MANIFEST, outDb: tmpDb });
    const db = new Database(tmpDb);
    const count = db.prepare('SELECT COUNT(*) as c FROM emails').get() as { c: number };
    expect(count.c).toBe(5);
    db.close();
  });

  it('populates demo_seed_meta with frozen_date from manifest', async () => {
    await build({ rawDir: FIXTURES, manifestPath: FIX_MANIFEST, outDb: tmpDb });
    const db = new Database(tmpDb);
    const row = db.prepare('SELECT frozen_date FROM demo_seed_meta WHERE id = 1').get() as { frozen_date: string };
    expect(row.frozen_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    db.close();
  });

  it('shifts email.date by manifest offsetDays', async () => {
    await build({ rawDir: FIXTURES, manifestPath: FIX_MANIFEST, outDb: tmpDb });
    const db = new Database(tmpDb);
    // fixture-001: original internalDate 1775365800000 → 2026-04-05; offsetDays=45 → 2026-05-20
    const row = db.prepare("SELECT date FROM emails WHERE gmail_message_id = 'fixture001aabbcc1122'").get() as { date: string };
    expect(row.date.slice(0, 10)).toBe('2026-05-20');
    db.close();
  });

  it('shifts date strings in body matching laycan patterns', async () => {
    await build({ rawDir: FIXTURES, manifestPath: FIX_MANIFEST, outDb: tmpDb });
    const db = new Database(tmpDb);
    // fixture-001 body has "LAYCAN: 15-20 April 2026"; with +45d → crosses month boundary
    // 15 April + 45d = 30 May; 20 April + 45d = 4 June → "30 May - 4 June 2026"
    const row = db.prepare("SELECT body FROM emails WHERE gmail_message_id = 'fixture001aabbcc1122'").get() as { body: string };
    expect(row.body).not.toMatch(/15-20 April 2026/);
    expect(row.body).toMatch(/30 May - 4 June 2026/i);
    db.close();
  });
});

describe('build (Tasks 15+16) — anonymization + leak validator', () => {
  let tmpDb: string;
  beforeEach(() => { tmpDb = path.join(os.tmpdir(), `demo-seed-${Date.now()}.db`); });
  afterEach(() => { if (fs.existsSync(tmpDb)) fs.unlinkSync(tmpDb); });

  it('replaces broker name in body (DEMO BROKER → BROKER 1)', async () => {
    await build({ rawDir: FIXTURES, manifestPath: FIX_MANIFEST, outDb: tmpDb });
    const db = new Database(tmpDb);
    const row = db.prepare("SELECT body FROM emails WHERE gmail_message_id = 'fixture001aabbcc1122'").get() as { body: string };
    expect(row.body).not.toMatch(/DEMO BROKER/i);
    expect(row.body).toMatch(/BROKER 1/i);
    db.close();
  });

  it('replaces charterer name in body (FIXTURE GRAIN CO → GRAIN TRADER A)', async () => {
    await build({ rawDir: FIXTURES, manifestPath: FIX_MANIFEST, outDb: tmpDb });
    const db = new Database(tmpDb);
    const row = db.prepare("SELECT body FROM emails WHERE gmail_message_id = 'fixture001aabbcc1122'").get() as { body: string };
    expect(row.body).not.toMatch(/FIXTURE GRAIN CO/i);
    expect(row.body).toMatch(/GRAIN TRADER A/i);
    db.close();
  });

  it('replaces sender email in from_email column and broker name in from_name', async () => {
    await build({ rawDir: FIXTURES, manifestPath: FIX_MANIFEST, outDb: tmpDb });
    const db = new Database(tmpDb);
    const row = db.prepare("SELECT from_email, from_name FROM emails WHERE gmail_message_id = 'fixture001aabbcc1122'").get() as { from_email: string; from_name: string };
    expect(row.from_email).not.toBe('broker@demo.local');
    expect(row.from_email).toBe('broker1@demo.local');
    expect(row.from_name).toBe('BROKER 1');
    db.close();
  });

  it('throws anonymization leak error when forbiddenSubstrings appear in output', async () => {
    // 'BROKER 1' is the alias — it WILL appear in the anonymized output → leak detected
    await expect(
      build({ rawDir: FIXTURES, manifestPath: FIX_MANIFEST, outDb: tmpDb, forbiddenSubstrings: ['BROKER 1'] })
    ).rejects.toThrow(/anonymization leak/i);
  });
});

describe('build (Task 17) — parsed_results population', () => {
  let tmpDb: string;
  beforeEach(() => { tmpDb = path.join(os.tmpdir(), `demo-seed-${Date.now()}.db`); });
  afterEach(() => { if (fs.existsSync(tmpDb)) fs.unlinkSync(tmpDb); });

  it('populates parsed_results with classify and cargo/vessel rows', async () => {
    await build({ rawDir: FIXTURES, manifestPath: FIX_MANIFEST, outDb: tmpDb });
    const db = new Database(tmpDb);
    const count = db.prepare('SELECT COUNT(*) as c FROM parsed_results').get() as { c: number };
    expect(count.c).toBeGreaterThan(0);
    const sample = db.prepare('SELECT parse_type FROM parsed_results LIMIT 1').get() as { parse_type: string };
    expect(['classify', 'cargo', 'vessel', 'recap', 'other']).toContain(sample.parse_type);
    db.close();
  });
});

describe('build (Task 18) — pre-compute matches', () => {
  let tmpDb: string;
  beforeEach(() => { tmpDb = path.join(os.tmpdir(), `demo-seed-${Date.now()}.db`); });
  afterEach(() => { if (fs.existsSync(tmpDb)) fs.unlinkSync(tmpDb); });

  it('pre-computes matches table from cargo×vessel pairings', async () => {
    await build({ rawDir: FIXTURES, manifestPath: FIX_MANIFEST, outDb: tmpDb });
    const db = new Database(tmpDb);
    sqliteVec.load(db);
    const count = db.prepare('SELECT COUNT(*) as c FROM matches').get() as {c: number};
    // Fixtures: 2 cargo (001, 002) × 2 vessel (003, 004) = up to 4 candidate pairs
    // Real count depends on offset arithmetic; expect at least 1
    expect(count.c).toBeGreaterThanOrEqual(1);

    const sample = db.prepare('SELECT cargo_id, vessel_id, score FROM matches LIMIT 1').get() as any;
    expect(sample.cargo_id).toBeTruthy();
    expect(sample.vessel_id).toBeTruthy();
    expect(typeof sample.score).toBe('number');
    expect(sample.score).toBeGreaterThan(0);
    db.close();
  });
});

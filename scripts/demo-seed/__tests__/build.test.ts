// scripts/demo-seed/__tests__/build.test.ts
import { build } from '../build';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import Database from 'better-sqlite3';

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
});

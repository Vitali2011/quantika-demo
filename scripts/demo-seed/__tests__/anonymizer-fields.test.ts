import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { build } from '../build';

const FIXTURES = path.resolve(__dirname, '../../../__tests__/fixtures/demo-seed');
const FIX_MANIFEST = path.resolve(__dirname, 'fixtures/manifest.fixture.json');

describe('Anonymizer field-safety — CONTACT N must not leak into structured location fields', () => {
  let tmpDb: string;
  beforeEach(() => { tmpDb = path.join(os.tmpdir(), `anon-test-${Date.now()}.db`); });
  afterEach(() => { if (fs.existsSync(tmpDb)) fs.unlinkSync(tmpDb); });

  it('parsed_results vessel rows have no openPosition matching CONTACT N pattern', async () => {
    await build({ rawDir: FIXTURES, manifestPath: FIX_MANIFEST, outDb: tmpDb });
    const Database = (await import('better-sqlite3')).default;
    const db = new Database(tmpDb);
    const rows = db.prepare(`
      SELECT result_json FROM parsed_results WHERE parse_type = 'vessel'
    `).all() as Array<{ result_json: string }>;
    db.close();

    for (const row of rows) {
      const items = JSON.parse(row.result_json);
      const arr = Array.isArray(items) ? items : [items];
      for (const item of arr) {
        const pos = item?.openPosition;
        const posValue = typeof pos === 'object' && pos !== null ? pos?.value : pos;
        if (typeof posValue === 'string') {
          expect(posValue).not.toMatch(/^CONTACT\s+\d+$/i);
        }
      }
    }
  });

  it('parsed_results cargo rows have no originPort or destinationPort matching CONTACT N', async () => {
    await build({ rawDir: FIXTURES, manifestPath: FIX_MANIFEST, outDb: tmpDb });
    const Database = (await import('better-sqlite3')).default;
    const db = new Database(tmpDb);
    const rows = db.prepare(`
      SELECT result_json FROM parsed_results WHERE parse_type = 'cargo'
    `).all() as Array<{ result_json: string }>;
    db.close();

    for (const row of rows) {
      const items = JSON.parse(row.result_json);
      const arr = Array.isArray(items) ? items : [items];
      for (const item of arr) {
        for (const field of ['originPort', 'destinationPort']) {
          const v = item?.[field];
          const val = typeof v === 'object' && v !== null ? v?.value : v;
          if (typeof val === 'string') {
            expect(val).not.toMatch(/^CONTACT\s+\d+$/i);
          }
        }
      }
    }
  });
});

describe('sanitizeContactTokensFromLocations — unit', () => {
  // We import the sanitizer directly from build.ts if exported, or test via build integration.
  // Since the fixture corpus may not have a CONTACT-in-position case, also test the helper.
  it('clears CONTACT N from openPosition string', async () => {
    const { sanitizeContactTokensFromLocations } = await import('../build');
    const items = [{ openPosition: 'CONTACT 3', dwtSummer: 12000 }];
    const result = sanitizeContactTokensFromLocations(items);
    expect((result[0] as Record<string, unknown>).openPosition).toBeNull();
  });

  it('clears CONTACT N from openPosition.value (ConfidenceField shape)', async () => {
    const { sanitizeContactTokensFromLocations } = await import('../build');
    const items = [{ openPosition: { value: 'CONTACT 3', confidence: 'confirmed' }, dwtSummer: 12000 }];
    const result = sanitizeContactTokensFromLocations(items);
    const pos = (result[0] as Record<string, unknown>).openPosition as Record<string, unknown>;
    expect(pos.value).toBeNull();
  });

  it('leaves normal port names untouched', async () => {
    const { sanitizeContactTokensFromLocations } = await import('../build');
    const items = [{ openPosition: 'Rotterdam', originPort: 'Istanbul' }];
    const result = sanitizeContactTokensFromLocations(items);
    expect((result[0] as Record<string, unknown>).openPosition).toBe('Rotterdam');
  });

  it('clears CONTACT N from cargo originPort and destinationPort', async () => {
    const { sanitizeContactTokensFromLocations } = await import('../build');
    const items = [{ originPort: 'CONTACT 5', destinationPort: 'CONTACT 2', weightMt: 5000 }];
    const result = sanitizeContactTokensFromLocations(items);
    expect((result[0] as Record<string, unknown>).originPort).toBeNull();
    expect((result[0] as Record<string, unknown>).destinationPort).toBeNull();
  });

  // Regression #885-F1: AGENT N tokens must be sanitized the same as CONTACT N
  it('clears AGENT N from openPosition string (regression #885)', async () => {
    const { sanitizeContactTokensFromLocations } = await import('../build');
    const items = [{ openPosition: 'AGENT 3', dwtSummer: 12000 }];
    const result = sanitizeContactTokensFromLocations(items);
    expect((result[0] as Record<string, unknown>).openPosition).toBeNull();
  });

  it('does NOT clear "AGENT NAME" (non-numeric) from openPosition — no over-match', async () => {
    const { sanitizeContactTokensFromLocations } = await import('../build');
    const items = [{ openPosition: 'AGENT NAME', dwtSummer: 12000 }];
    const result = sanitizeContactTokensFromLocations(items);
    expect((result[0] as Record<string, unknown>).openPosition).toBe('AGENT NAME');
  });

  it('does NOT clear "AGENT 3 extra" (trailing text) from openPosition — no over-match', async () => {
    const { sanitizeContactTokensFromLocations } = await import('../build');
    const items = [{ openPosition: 'AGENT 3 extra', dwtSummer: 12000 }];
    const result = sanitizeContactTokensFromLocations(items);
    expect((result[0] as Record<string, unknown>).openPosition).toBe('AGENT 3 extra');
  });
});

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

let tmpDir: string;
let dbPath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-seed-test-'));
  dbPath = path.join(tmpDir, 'sessions.db');
  process.env.SESSIONS_DB_PATH = dbPath;
  jest.resetModules();
});

afterEach(() => {
  delete process.env.SESSIONS_DB_PATH;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('seedDemoForRegion', () => {
  it('seeds inquiries for MENA region and marks demo_seeded', async () => {
    const { startTrial, getTrialState } = await import('../trial');
    const { seedDemoForRegion } = await import('../onboarding/demo-seed');
    await startTrial('sess-seed-1', 'MENA');
    await seedDemoForRegion('sess-seed-1', 'MENA');
    const trial = await getTrialState('sess-seed-1');
    expect(trial!.demo_seeded).toBe(true);
  });

  it('is idempotent — second call does not duplicate data', async () => {
    const { startTrial } = await import('../trial');
    const { seedDemoForRegion, getSeededCount } = await import('../onboarding/demo-seed');
    await startTrial('sess-seed-2', 'Med');
    await seedDemoForRegion('sess-seed-2', 'Med');
    const countAfterFirst = await getSeededCount('sess-seed-2');
    await seedDemoForRegion('sess-seed-2', 'Med');
    const countAfterSecond = await getSeededCount('sess-seed-2');
    expect(countAfterFirst).toBe(countAfterSecond);
    expect(countAfterFirst).toBeGreaterThan(0);
  });

  it('filters correctly by region — WAFR seeds contain WAFR ports', async () => {
    const { startTrial } = await import('../trial');
    const { seedDemoForRegion, getSeededEmails } = await import('../onboarding/demo-seed');
    await startTrial('sess-seed-3', 'WAFR');
    await seedDemoForRegion('sess-seed-3', 'WAFR');
    const emails = await getSeededEmails('sess-seed-3');
    expect(emails.length).toBeGreaterThan(0);
    const bodies = emails.map((e: { body: string }) => e.body).join(' ');
    // WAFR region should contain West African ports
    expect(bodies).toMatch(/Lagos|Tema|Abidjan|Dakar/i);
  });

  it('seeds at least 5 inquiries for each region', async () => {
    for (const region of ['MENA', 'Med', 'WAFR'] as const) {
      jest.resetModules();
      const freshTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `demo-seed-${region}-`));
      const freshDbPath = path.join(freshTmpDir, 'sessions.db');
      process.env.SESSIONS_DB_PATH = freshDbPath;

      const freshTrial = await import('../trial');
      const freshSeed = await import('../onboarding/demo-seed');
      await freshTrial.startTrial(`sess-${region}`, region);
      await freshSeed.seedDemoForRegion(`sess-${region}`, region);
      const count = await freshSeed.getSeededCount(`sess-${region}`);
      expect(count).toBeGreaterThanOrEqual(5);

      fs.rmSync(freshTmpDir, { recursive: true, force: true });
    }
  });
});

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

let tmpDir: string;
let dbPath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trial-test-'));
  dbPath = path.join(tmpDir, 'sessions.db');
  process.env.SESSIONS_DB_PATH = dbPath;
  jest.resetModules();
});

afterEach(() => {
  delete process.env.SESSIONS_DB_PATH;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('startTrial', () => {
  it('creates a trial with ends_at = started_at + 14 days', async () => {
    const { startTrial } = await import('../trial');
    const trial = await startTrial('sess-1', 'MENA');
    const started = new Date(trial.started_at).getTime();
    const ends = new Date(trial.ends_at).getTime();
    const fourteenDays = 14 * 24 * 60 * 60 * 1000;
    expect(ends - started).toBe(fourteenDays);
  });

  it('sets region correctly', async () => {
    const { startTrial } = await import('../trial');
    const trial = await startTrial('sess-2', 'Med');
    expect(trial.region).toBe('Med');
  });

  it('starts with activated_at = null and demo_seeded = false', async () => {
    const { startTrial } = await import('../trial');
    const trial = await startTrial('sess-3', 'WAFR');
    expect(trial.activated_at).toBeNull();
    expect(trial.demo_seeded).toBe(false);
  });
});

describe('getTrialState', () => {
  it('returns null for unknown session', async () => {
    const { getTrialState } = await import('../trial');
    const trial = await getTrialState('nonexistent');
    expect(trial).toBeNull();
  });

  it('returns the trial after startTrial', async () => {
    const { startTrial, getTrialState } = await import('../trial');
    await startTrial('sess-4', 'MENA');
    const trial = await getTrialState('sess-4');
    expect(trial).not.toBeNull();
    expect(trial!.session_id).toBe('sess-4');
  });
});

describe('markActivated', () => {
  it('sets activated_at to a non-null ISO string', async () => {
    const { startTrial, markActivated, getTrialState } = await import('../trial');
    await startTrial('sess-5', 'Med');
    await markActivated('sess-5');
    const trial = await getTrialState('sess-5');
    expect(trial!.activated_at).not.toBeNull();
    expect(new Date(trial!.activated_at!).getTime()).toBeGreaterThan(0);
  });
});

describe('daysRemaining', () => {
  it('returns 14 for a trial just started', async () => {
    const { startTrial, daysRemaining } = await import('../trial');
    const trial = await startTrial('sess-6', 'MENA');
    expect(daysRemaining(trial)).toBe(14);
  });

  it('returns 0 when trial is expired', async () => {
    const { daysRemaining, TrialState } = await import('../trial');
    const pastTrial: TrialState = {
      session_id: 'expired',
      started_at: '2020-01-01T00:00:00.000Z',
      ends_at: '2020-01-15T00:00:00.000Z',
      activated_at: null,
      region: 'MENA',
      demo_seeded: false,
    };
    expect(daysRemaining(pastTrial)).toBe(0);
  });
});

describe('isExpired', () => {
  it('returns false for a fresh trial', async () => {
    const { startTrial, isExpired } = await import('../trial');
    const trial = await startTrial('sess-7', 'WAFR');
    expect(isExpired(trial)).toBe(false);
  });

  it('returns true for a past trial', async () => {
    const { isExpired, TrialState } = await import('../trial');
    const pastTrial: TrialState = {
      session_id: 'old',
      started_at: '2020-01-01T00:00:00.000Z',
      ends_at: '2020-01-15T00:00:00.000Z',
      activated_at: null,
      region: 'Med',
      demo_seeded: false,
    };
    expect(isExpired(pastTrial)).toBe(true);
  });
});

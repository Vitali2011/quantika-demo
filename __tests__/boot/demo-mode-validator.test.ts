/**
 * Task 22: validateDemoBoot — fail-fast if demo-seed.db missing in DEMO_MODE.
 */
import { validateDemoBoot } from '@/lib/demo-mode-validator';
import * as fs from 'fs';

describe('validateDemoBoot', () => {
  const ORIG_DEMO_MODE = process.env.DEMO_MODE;
  const ORIG_DB_PATH = process.env.SESSIONS_DB_PATH;

  afterEach(() => {
    process.env.DEMO_MODE = ORIG_DEMO_MODE;
    process.env.SESSIONS_DB_PATH = ORIG_DB_PATH;
  });

  it('throws if DEMO_MODE=true and SESSIONS_DB_PATH does not exist', () => {
    process.env.DEMO_MODE = 'true';
    process.env.SESSIONS_DB_PATH = `/tmp/does-not-exist-${Date.now()}.db`;
    expect(() => validateDemoBoot()).toThrow(/demo-seed\.db.*not found/i);
  });

  it('passes silently if DEMO_MODE=true and demo-seed.db exists', () => {
    const tmp = `/tmp/test-demo-${Date.now()}.db`;
    fs.writeFileSync(tmp, 'x');
    process.env.DEMO_MODE = 'true';
    process.env.SESSIONS_DB_PATH = tmp;
    expect(() => validateDemoBoot()).not.toThrow();
    fs.unlinkSync(tmp);
  });

  it('is a no-op when DEMO_MODE != true', () => {
    process.env.DEMO_MODE = 'false';
    // No SESSIONS_DB_PATH set — would throw if checked
    process.env.SESSIONS_DB_PATH = '/nonexistent/path.db';
    expect(() => validateDemoBoot()).not.toThrow();
  });
});

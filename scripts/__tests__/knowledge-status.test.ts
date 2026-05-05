/**
 * Test for scripts/knowledge/status.ts
 *
 * Verifies that `npm run knowledge:status` outputs a table of knowledge sources.
 */
import { execFileSync } from 'child_process';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '..', '..');
const scriptPath = path.join(repoRoot, 'scripts/knowledge/status.ts');

describe('scripts/knowledge/status.ts', () => {
  it('exits 0 and prints knowledge sources table', () => {
    const out = execFileSync('npx', ['tsx', scriptPath], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, SESSIONS_DB_PATH: ':memory:' },
    });

    // Should contain table headers
    expect(out).toMatch(/slug/i);
    expect(out).toMatch(/health/i);
    expect(out).toMatch(/last.*sync/i);

    // Should list at least one source (from bootstrap)
    expect(out).toMatch(/ofac|eu-sanctions|distances/i);
  }, 30_000);

  it('supports filtering by slug', () => {
    const out = execFileSync('npx', ['tsx', scriptPath, 'ofac'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, SESSIONS_DB_PATH: ':memory:' },
    });

    expect(out).toMatch(/ofac/i);
    // Should NOT contain other sources when filtered
    expect(out).not.toMatch(/distances/i);
  }, 30_000);
});

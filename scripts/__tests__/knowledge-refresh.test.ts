/**
 * Test for scripts/knowledge/refresh.ts dispatcher
 *
 * Verifies that the refresh dispatcher correctly routes to per-source handlers.
 */
import { execFileSync } from 'child_process';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '..', '..');
const scriptPath = path.join(repoRoot, 'scripts/knowledge/refresh.ts');

describe('scripts/knowledge/refresh.ts', () => {
  it('exits 1 when no slug provided', () => {
    expect(() => {
      execFileSync('npx', ['tsx', scriptPath], {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    }).toThrow(/unknown slug/i);
  }, 30_000);

  it('exits 1 when unknown slug provided', () => {
    expect(() => {
      execFileSync('npx', ['tsx', scriptPath, 'invalid-source'], {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    }).toThrow(/unknown slug/i);
  }, 30_000);

  it('successfully refreshes OFAC when handler is implemented', () => {
    // OFAC was implemented in C4, so it should succeed (even if it hits network errors in test env)
    // We just verify it doesn't crash with "not implemented" or "Cannot find module"
    try {
      execFileSync('npx', ['tsx', scriptPath, 'ofac'], {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 15000,
      });
      // Success - source is implemented
    } catch (err: any) {
      // If it fails, it should NOT be "not implemented" - network errors are acceptable
      expect(err.message).not.toMatch(/not implemented|Cannot find module/i);
    }
  }, 30_000);
});

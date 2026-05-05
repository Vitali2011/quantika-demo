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

  it('exits 1 when source handler not implemented yet', () => {
    // All sources are placeholders in Phase 1 B5, so they should fail gracefully
    expect(() => {
      execFileSync('npx', ['tsx', scriptPath, 'ofac'], {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    }).toThrow(/not implemented|Cannot find module/i);
  }, 30_000);
});

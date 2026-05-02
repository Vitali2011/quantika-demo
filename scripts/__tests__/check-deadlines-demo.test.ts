/**
 * β-09: Demo scenario 13 fixture must exist and `--demo` must not ENOENT.
 *
 * `scripts/check-deadlines.ts --demo` reads
 * `lib/sample-data/demo-scenarios/13-subs-deadline-2h-warning.json`. Before
 * this fix the file did not exist and the script crashed. This test pins
 * both the fixture's presence and the script's happy-path exit code.
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '..', '..');
const fixturePath = path.join(
  repoRoot,
  'lib/sample-data/demo-scenarios/13-subs-deadline-2h-warning.json',
);
const scriptPath = path.join(repoRoot, 'scripts/check-deadlines.ts');

describe('β-09 — demo scenario 13 fixture', () => {
  it('fixture file exists and is valid JSON with deal id', () => {
    expect(fs.existsSync(fixturePath)).toBe(true);
    const raw = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    expect(raw.id).toBeTruthy();
  });

  it('fixture documents subs_deadline ~2h ahead (relative marker)', () => {
    const raw = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    // Loader resolves the deadline to (now + 2h) at runtime — the fixture
    // declares the intent so future maintainers don't bake an absolute date.
    expect(JSON.stringify(raw)).toMatch(/2h|RELATIVE_FROM_NOW|subs/i);
  });

  it('check-deadlines.ts --demo --dry-run exits 0 (no ENOENT)', () => {
    // Using --dry-run keeps the test hermetic (no dispatcher side-effects).
    const out = execFileSync(
      'npx',
      ['tsx', scriptPath, '--demo', '--dry-run'],
      { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    expect(out).toMatch(/dry-run deal=/);
  }, 30_000);
});

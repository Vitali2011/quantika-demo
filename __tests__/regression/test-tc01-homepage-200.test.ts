/**
 * TC-01 Regression Guard — Homepage 200 / better-sqlite3 crash
 *
 * Protects against reintroduction of the crash-loop fixed in PR #38.
 * Root cause: Next.js was bundling better-sqlite3 instead of treating it as
 * an external native module, causing a crash on first request to /.
 *
 * RED condition: remove 'better-sqlite3' from serverExternalPackages in next.config.mjs
 *
 * Input contract: reads next.config.mjs and lib/db.ts (if present) from filesystem.
 * No runtime inputs — types exhausted by file paths.
 */

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');

describe('TC-01: Homepage 200 — better-sqlite3 config regression', () => {
  const nextConfigPath = path.join(ROOT, 'next.config.mjs');
  let nextConfigSource: string;

  beforeAll(() => {
    expect(fs.existsSync(nextConfigPath)).toBe(true);
    nextConfigSource = fs.readFileSync(nextConfigPath, 'utf-8');
  });

  it("next.config.mjs must include 'better-sqlite3' in serverExternalPackages", () => {
    // PR #38 fix: native module must not be bundled by Next.js webpack/Turbopack.
    // If this entry is missing, the app crashes with "Cannot find module" on startup.
    expect(nextConfigSource).toMatch(/serverExternalPackages\s*:/);
    expect(nextConfigSource).toContain("'better-sqlite3'");
  });

  it("'better-sqlite3' must appear inside the serverExternalPackages array, not in comments", () => {
    // Regression: ensure it's an actual config entry, not commented-out documentation.
    const uncommentedLines = nextConfigSource
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('//'))
      .join('\n');
    expect(uncommentedLines).toContain("'better-sqlite3'");
  });

  it('no direct require() call for better-sqlite3 at module scope outside a function body', () => {
    // Calling require('better-sqlite3') at the top level of a module loaded during
    // Next.js startup would bypass the serverExternalPackages guard and re-introduce the crash.
    // Acceptable: require() inside a function body (lazy load) or dynamic import().
    const dbFiles = ['lib/db.ts', 'lib/db.js'].map((f) => path.join(ROOT, f));
    for (const dbFile of dbFiles) {
      if (!fs.existsSync(dbFile)) continue;
      const src = fs.readFileSync(dbFile, 'utf-8');
      // A top-level require looks like: const X = require('better-sqlite3') at indent-0
      const topLevelRequire = /^(?![ \t]).*require\(['"]better-sqlite3['"]\)/m;
      expect(src).not.toMatch(topLevelRequire);
    }
  });
});

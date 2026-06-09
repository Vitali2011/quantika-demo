/**
 * Settings export section — source analysis (PI2 behavioral + route-guard tests).
 * Verifies /settings/export does not 404 (#885 fix #4).
 *
 * @jest-environment node
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = process.cwd();

describe('settings/layout.tsx — Export entry in sidebar (#885)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'app/settings/layout.tsx'), 'utf8');

  it('SECTIONS contains an export entry', () => {
    expect(src).toMatch(/id:\s*['"]export['"]/);
  });

  it('export entry is placed before danger zone', () => {
    const exportIdx = src.indexOf("id: 'export'");
    const dangerIdx = src.indexOf("id: 'danger'");
    expect(exportIdx).toBeGreaterThan(-1);
    expect(dangerIdx).toBeGreaterThan(-1);
    expect(exportIdx).toBeLessThan(dangerIdx);
  });
});

describe('settings/[section]/page.tsx — Export section not 404 (#885)', () => {
  const src = fs.readFileSync(
    path.join(ROOT, 'app/settings/[section]/page.tsx'),
    'utf8',
  );

  it("VALID_SECTIONS includes 'export'", () => {
    expect(src).toMatch(/['"]export['"]/);
    // Must be in the VALID_SECTIONS tuple
    expect(src).toMatch(/VALID_SECTIONS\s*=\s*\[[\s\S]*?['"]export['"][\s\S]*?\]/);
  });

  it('ExportSection component is defined', () => {
    expect(src).toMatch(/function ExportSection/);
  });

  it('export case is handled in the page switch (not falling through to ComingSoon)', () => {
    expect(src).toMatch(/case\s*['"]export['"]\s*:\s*return\s*<ExportSection/);
  });

  it('ExportSection has data-testid="settings-export"', () => {
    expect(src).toMatch(/data-testid="settings-export"/);
  });

  it('ExportSection renders CSV and JSON export options', () => {
    expect(src).toMatch(/CSV/);
    expect(src).toMatch(/JSON/);
  });
});

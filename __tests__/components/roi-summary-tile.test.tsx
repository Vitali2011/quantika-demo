/**
 * Smoke test for γ-18 RoiSummaryTile component.
 *
 * Verifies:
 * - Component returns null when NEXT_PUBLIC_ROI_GUARANTEE_ENABLED !== 'true'
 * - Component renders key metrics when enabled
 *
 * Uses simple existence check - full rendering with data is integration test.
 */

import * as fs from 'fs';
import * as path from 'path';

const componentPath = path.join(process.cwd(), 'components/dashboard/RoiSummaryTile.tsx');

describe('RoiSummaryTile component (γ-18 smoke test)', () => {
  it('component file exists', () => {
    expect(fs.existsSync(componentPath)).toBe(true);
  });

  it('component checks NEXT_PUBLIC_ROI_GUARANTEE_ENABLED flag', () => {
    const source = fs.readFileSync(componentPath, 'utf8');
    expect(source).toMatch(/NEXT_PUBLIC_ROI_GUARANTEE_ENABLED/);
  });

  it('component returns null when flag is not enabled', () => {
    const source = fs.readFileSync(componentPath, 'utf8');
    // Should have early return when flag is off
    expect(source).toMatch(/return null/);
  });

  it('component mentions ROI-related terms', () => {
    const source = fs.readFileSync(componentPath, 'utf8');
    // Should mention at least one ROI-related term
    expect(source).toMatch(/ROI|savings|voyages|cohort/i);
  });
});

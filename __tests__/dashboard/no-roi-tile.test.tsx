import fs from 'node:fs';
import path from 'node:path';

describe('dashboard: ROI tile fully removed', () => {
  it('dashboard page no longer imports RoiSummaryTile', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'app/dashboard/page.tsx'), 'utf8');
    expect(src).not.toMatch(/RoiSummaryTile/);
    expect(src).not.toMatch(/ROI_GUARANTEE_ENABLED/);
  });
  it('tile component and api route are deleted', () => {
    expect(fs.existsSync(path.join(process.cwd(), 'components/dashboard/RoiSummaryTile.tsx'))).toBe(false);
    expect(fs.existsSync(path.join(process.cwd(), 'app/api/analytics/roi/route.ts'))).toBe(false);
  });
});

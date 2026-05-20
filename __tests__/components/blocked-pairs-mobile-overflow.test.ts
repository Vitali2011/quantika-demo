/**
 * TDD: Bug #293 — BlockedPairsCard (inline in dashboard/page.tsx) must not
 * overflow at 375px mobile viewport. Checks Tailwind class invariants that
 * prevent horizontal overflow in the sanctions and filter-blocked flex rows.
 *
 * Uses static JSX source analysis — no React rendering required.
 */
import * as fs from 'fs';
import * as path from 'path';

const pagePath = path.join(process.cwd(), 'app/dashboard/page.tsx');
const source = fs.readFileSync(pagePath, 'utf8');

describe('BlockedPairsCard mobile overflow (Bug #293)', () => {
  it('SANCTIONS badge has shrink-0 to prevent compression on narrow viewports', () => {
    // The SANCTIONS badge span must have shrink-0 in its className
    expect(source).toContain('rounded-full shrink-0');
  });

  it('reason span does not use max-w-sm (384px > 375px viewport, causes overflow)', () => {
    // max-w-sm on a flex item without min-w-0 overflows at 375px
    const sanctionSection = source.slice(
      source.indexOf('sanctionsBlocked.map'),
      source.indexOf('filterBlocked.length'),
    );
    expect(sanctionSection).not.toContain('max-w-sm');
  });

  it('reason span has min-w-0 so truncate works in flex context', () => {
    const sanctionSection = source.slice(
      source.indexOf('sanctionsBlocked.map'),
      source.indexOf('filterBlocked.length'),
    );
    expect(sanctionSection).toContain('min-w-0');
  });

  it('filterBlocked reason span does not use max-w-sm', () => {
    const filterSection = source.slice(
      source.indexOf('filterBlocked.map'),
      source.indexOf('/* ── Recaps'),
    );
    expect(filterSection).not.toContain('max-w-sm');
  });

  it('flex row containers have overflow-hidden to clip any residual overflow', () => {
    const blockedSection = source.slice(
      source.indexOf('sanctionsBlocked.map'),
      source.indexOf('/* ── Recaps'),
    );
    expect(blockedSection).toContain('overflow-hidden');
  });
});

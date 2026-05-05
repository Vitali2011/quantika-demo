/**
 * TDD tests for βf2-02: render specialRequirements array-of-objects as readable text.
 *
 * Browser shows "Special: [object Object],[object Object]" because safeRender()
 * gets an array of objects instead of expected string | null.
 * The fix: renderSpecialRequirements() normalises the value before rendering.
 *
 * We test a pure function extracted from app/cargo/[id]/page.tsx so we don't
 * need to mount the server component in jsdom.
 */

import { renderSpecialRequirements } from '@/lib/cargo-render';

describe('renderSpecialRequirements (βf2-02)', () => {
  it('TDD-1: array of {label} objects → readable comma-separated text, no [object Object]', () => {
    const result = renderSpecialRequirements([{ label: 'Frozen' }, { label: 'Hazardous' }]);
    expect(result).toContain('Frozen');
    expect(result).toContain('Hazardous');
    expect(result).not.toContain('[object Object]');
  });

  it('TDD-2: plain string array → joined text', () => {
    const result = renderSpecialRequirements(['Frozen', 'Hazardous']);
    expect(result).toBe('Frozen, Hazardous');
    expect(result).not.toContain('[object Object]');
  });

  it('TDD-3: empty array → empty string, no crash', () => {
    const result = renderSpecialRequirements([]);
    expect(result).toBe('');
    expect(result).not.toContain('[object Object]');
  });

  it('TDD-4: null → empty string, no crash', () => {
    const result = renderSpecialRequirements(null);
    expect(result).toBe('');
  });

  it('TDD-5: mixed keys {name} and {label} → both rendered', () => {
    const result = renderSpecialRequirements([{ name: 'Frozen' }, { label: 'Hazardous' }]);
    expect(result).toContain('Frozen');
    expect(result).toContain('Hazardous');
    expect(result).not.toContain('[object Object]');
  });
});

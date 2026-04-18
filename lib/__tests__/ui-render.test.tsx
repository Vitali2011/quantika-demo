import { safeRender, getConf, ConfIcon } from '../ui-render';
import type { Renderable } from '../types';

// ── safeRender ──────────────────────────────────────────────────────────────

describe('safeRender', () => {
  it('returns empty string for null', () => {
    expect(safeRender(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(safeRender(undefined)).toBe('');
  });

  it('returns string as-is', () => {
    expect(safeRender('Rotterdam')).toBe('Rotterdam');
  });

  it('converts number to string', () => {
    expect(safeRender(42)).toBe('42');
  });

  it('converts boolean true to "Yes"', () => {
    expect(safeRender(true as Renderable)).toBe('Yes');
  });

  it('converts boolean false to "No"', () => {
    expect(safeRender(false as Renderable)).toBe('No');
  });

  it('extracts string value from ConfidenceField object', () => {
    const field: Renderable = { value: 'Hamburg', confidence: 'confirmed' };
    expect(safeRender(field)).toBe('Hamburg');
  });

  it('extracts number value from ConfidenceField object as string', () => {
    const field: Renderable = { value: 75000, confidence: 'interpreted' };
    expect(safeRender(field)).toBe('75000');
  });
});

// ── getConf ─────────────────────────────────────────────────────────────────

describe('getConf', () => {
  it('returns confidence from a ConfidenceField object', () => {
    const field: Renderable = { value: 'Rotterdam', confidence: 'confirmed' };
    expect(getConf(field)).toBe('confirmed');
  });

  it('returns interpreted confidence', () => {
    const field: Renderable = { value: 'Hamburg', confidence: 'interpreted' };
    expect(getConf(field)).toBe('interpreted');
  });

  it('returns uncertain confidence', () => {
    const field: Renderable = { value: 'Lagos', confidence: 'uncertain' };
    expect(getConf(field)).toBe('uncertain');
  });

  it('returns undefined for plain string', () => {
    expect(getConf('Rotterdam')).toBeUndefined();
  });

  it('returns undefined for null', () => {
    expect(getConf(null)).toBeUndefined();
  });
});

// ── ConfIcon ─────────────────────────────────────────────────────────────────

describe('ConfIcon', () => {
  it('returns span with question mark for uncertain confidence', () => {
    const el = ConfIcon({ confidence: 'uncertain' });
    expect(el).not.toBeNull();
    expect(el?.type).toBe('span');
    expect(el?.props.children).toBe('❓');
  });

  it('returns span with warning for interpreted confidence', () => {
    const el = ConfIcon({ confidence: 'interpreted' });
    expect(el).not.toBeNull();
    expect(el?.type).toBe('span');
    expect(el?.props.children).toBe('⚠️');
  });

  it('returns span with checkmark for confirmed confidence', () => {
    const el = ConfIcon({ confidence: 'confirmed' });
    expect(el).not.toBeNull();
    expect(el?.type).toBe('span');
    expect(el?.props.children).toBe('✅');
  });

  it('returns null for undefined confidence', () => {
    expect(ConfIcon({ confidence: undefined })).toBeNull();
  });

  it('returns null when called with no args (empty props)', () => {
    expect(ConfIcon({})).toBeNull();
  });
});

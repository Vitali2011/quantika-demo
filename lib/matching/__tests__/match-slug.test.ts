import { toMatchSlug, fromMatchSlug } from '@/lib/matching/match-slug';

describe('toMatchSlug', () => {
  it('encodes cargo and vessel ids with -- separator', () => {
    expect(toMatchSlug('demo-cargo-001', 'demo-vessel-001')).toBe(
      'demo-cargo-001--demo-vessel-001',
    );
  });

  it('is stable — same inputs produce same slug', () => {
    const a = toMatchSlug('cargo-x', 'vessel-y');
    const b = toMatchSlug('cargo-x', 'vessel-y');
    expect(a).toBe(b);
  });
});

describe('fromMatchSlug', () => {
  it('round-trips with toMatchSlug', () => {
    const slug = toMatchSlug('demo-cargo-economics', 'demo-vessel-economics');
    const result = fromMatchSlug(slug);
    expect(result).toEqual({
      cargo_id: 'demo-cargo-economics',
      vessel_id: 'demo-vessel-economics',
    });
  });

  it('returns null for non-slug strings (no -- separator)', () => {
    expect(fromMatchSlug('abc')).toBeNull();
    expect(fromMatchSlug('123')).toBeNull();
    expect(fromMatchSlug('')).toBeNull();
  });

  it('returns null when cargo_id is empty', () => {
    expect(fromMatchSlug('--vessel-1')).toBeNull();
  });

  it('returns null when vessel_id is empty', () => {
    expect(fromMatchSlug('cargo-1--')).toBeNull();
  });
});

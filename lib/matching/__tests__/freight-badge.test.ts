import { freightBadge, FREIGHT_BADGE_CLASSES } from '@/lib/matching/freight-badge';

describe('freightBadge', () => {
  it('manual → pen icon, not dimmed', () => {
    const b = freightBadge('manual');
    expect(b.tone).toBe('manual');
    expect(b.dimmed).toBe(false);
    expect(b.label).toContain('✎');
  });

  it('parsed → check icon', () => {
    const b = freightBadge('parsed');
    expect(b.tone).toBe('parsed');
    expect(b.dimmed).toBe(false);
    expect(b.label).toContain('✓');
  });

  it('baltic includes the index date when provided', () => {
    const b = freightBadge('baltic', '2026-05-09');
    expect(b.tone).toBe('baltic');
    expect(b.label).toContain('2026-05-09');
    expect(b.label).toContain('Baltic');
  });

  it('baltic without a date still labels Baltic', () => {
    expect(freightBadge('baltic').label).toContain('Baltic');
  });

  it('estimated → dimmed + "not confirmed" title', () => {
    const b = freightBadge('estimated');
    expect(b.tone).toBe('estimate');
    expect(b.dimmed).toBe(true);
    expect(b.title.toLowerCase()).toContain('not confirmed');
    expect(b.label).toContain('≈');
  });

  it('unknown / null source falls back to the estimate badge', () => {
    expect(freightBadge(null).tone).toBe('estimate');
    expect(freightBadge(undefined).tone).toBe('estimate');
    expect(freightBadge('something-else').tone).toBe('estimate');
  });

  it('every tone has a non-empty class', () => {
    (['manual', 'parsed', 'baltic', 'estimate'] as const).forEach((t) => {
      expect(FREIGHT_BADGE_CLASSES[t]).toBeTruthy();
    });
  });
});

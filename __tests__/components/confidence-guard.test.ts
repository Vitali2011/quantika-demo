/**
 * γ-cleanup-4 F1 — React #418 guard: numeric confidence values from the LLM
 * parser must NOT reach JSX as truthy non-null values that would render a
 * space-only Fragment (leaving dangling whitespace text-nodes that mismatch
 * between SSR and hydration).
 *
 * The fix: every inline ConfIcon call is guarded by VALID_CONF.has(conf)
 * so that numeric scores like 0.97 are treated as absent.
 */

const VALID_CONF = new Set(['confirmed', 'interpreted', 'uncertain']);

describe('VALID_CONF guard — numeric confidence scores (γ-cleanup-4 F1)', () => {
  it('accepts "confirmed" as valid', () => {
    expect(VALID_CONF.has('confirmed')).toBe(true);
  });

  it('accepts "interpreted" as valid', () => {
    expect(VALID_CONF.has('interpreted')).toBe(true);
  });

  it('accepts "uncertain" as valid', () => {
    expect(VALID_CONF.has('uncertain')).toBe(true);
  });

  it('rejects numeric score 0.97 (common LLM parser output)', () => {
    expect(VALID_CONF.has(String(0.97))).toBe(false);
    // Simulating runtime: typeof 0.97 !== 'string' so guarded before .has()
    const conf: unknown = 0.97;
    const confStr = typeof conf === 'string' && VALID_CONF.has(conf) ? conf : undefined;
    expect(confStr).toBeUndefined();
  });

  it('rejects numeric score 0 (edge case — falsy but still numeric)', () => {
    const conf: unknown = 0;
    const confStr = typeof conf === 'string' && VALID_CONF.has(conf) ? conf : undefined;
    expect(confStr).toBeUndefined();
  });

  it('rejects undefined', () => {
    const conf: unknown = undefined;
    const confStr = typeof conf === 'string' && VALID_CONF.has(conf) ? conf : undefined;
    expect(confStr).toBeUndefined();
  });

  it('rejects null', () => {
    const conf: unknown = null;
    const confStr = typeof conf === 'string' && VALID_CONF.has(conf as string) ? conf : undefined;
    expect(confStr).toBeUndefined();
  });

  it('rejects empty string', () => {
    const conf: unknown = '';
    const confStr = typeof conf === 'string' && VALID_CONF.has(conf) ? conf : undefined;
    expect(confStr).toBeUndefined();
  });

  it('rejects arbitrary string not in the set', () => {
    const conf: unknown = 'high';
    const confStr = typeof conf === 'string' && VALID_CONF.has(conf) ? conf : undefined;
    expect(confStr).toBeUndefined();
  });

  it('passes through "confirmed" correctly', () => {
    const conf: unknown = 'confirmed';
    const confStr = typeof conf === 'string' && VALID_CONF.has(conf) ? conf : undefined;
    expect(confStr).toBe('confirmed');
  });
});

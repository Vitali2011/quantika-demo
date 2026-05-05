import { describe, it, expect } from '@jest/globals';
import { getEndpointSpec, ENDPOINTS } from '../endpoint-specs';
import type { Endpoint } from '../corpus';

describe('endpoint-specs registry', () => {
  it('exposes all 4 endpoints', () => {
    expect(new Set(ENDPOINTS)).toEqual(
      new Set<Endpoint>(['parse-cargo', 'parse-vessel', 'parse-recap', 'classify']),
    );
  });

  it.each(['parse-cargo', 'parse-vessel', 'parse-recap', 'classify'] as const)(
    '%s has a substantive systemPrompt and an outputSchema',
    (endpoint) => {
      const spec = getEndpointSpec(endpoint);
      expect(typeof spec.systemPrompt).toBe('string');
      expect(spec.systemPrompt.length).toBeGreaterThan(50);
      expect(spec.outputSchema).toBeDefined();
      expect(typeof spec.outputSchema).toBe('object');
      // Minimal contract: schema declares a top-level type
      expect((spec.outputSchema as { type?: unknown }).type).toBeDefined();
    },
  );

  it('throws on unknown endpoint', () => {
    // @ts-expect-error — runtime guard
    expect(() => getEndpointSpec('parse-nonsense')).toThrow();
  });
});

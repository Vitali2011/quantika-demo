import { generateCsrfToken } from '@/lib/csrf';

describe('CSRF token edge runtime compatibility (BUILD-01)', () => {
  it('does not import node:crypto', () => {
    // Static check — load the module source and ensure no `from 'crypto'`
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '../../lib/csrf.ts'), 'utf8');
    expect(src).not.toMatch(/from\s+['"]crypto['"]|require\(['"]crypto['"]\)/);
  });

  it('generates 64-char hex token', () => {
    const token = generateCsrfToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('generates unique tokens (entropy check)', () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 100; i++) tokens.add(generateCsrfToken());
    expect(tokens.size).toBe(100);
  });

  it('uses globalThis.crypto.getRandomValues (works in edge runtime)', () => {
    // Mock globalThis.crypto to verify it's the path used
    const original = globalThis.crypto.getRandomValues.bind(globalThis.crypto);
    let called = 0;
    globalThis.crypto.getRandomValues = (arr: any) => {
      called++;
      return original(arr);
    };
    try {
      generateCsrfToken();
      expect(called).toBeGreaterThan(0);
    } finally {
      globalThis.crypto.getRandomValues = original;
    }
  });
});

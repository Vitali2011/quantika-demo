/**
 * @jest-environment jsdom
 *
 * spec-betafix-15 — XSS attack-vector matrix for the centralized
 * sanitizeForCompose helper. Each vector represents a class of bypass
 * the old blacklist sanitizer let through (BUG-β-stab-04-XSSBypass) plus
 * the canonical innerHTML sinks (BUG-β-13-XSS, BUG-β-13-AttrXSS).
 */
import { sanitizeForCompose } from '../inserts/sanitize';
import { buildBimcoInsert, type BimcoClauseId } from '../inserts/bimco';

const ATTACK_VECTORS: Array<{ name: string; html: string; forbidden: string }> = [
  { name: 'inline script', html: '<script>alert(1)</script>', forbidden: 'script' },
  { name: 'img onerror', html: '<img src=x onerror=alert(1)>', forbidden: 'onerror' },
  { name: 'svg onload', html: '<svg onload=alert(1)>', forbidden: 'onload' },
  { name: 'iframe', html: '<iframe src="//evil"></iframe>', forbidden: 'iframe' },
  { name: 'object', html: '<object data="//evil"></object>', forbidden: 'object' },
  { name: 'embed', html: '<embed src="//evil">', forbidden: 'embed' },
  {
    name: 'style tag',
    html: '<style>body{background:url(javascript:alert(1))}</style>',
    forbidden: 'style',
  },
  {
    name: 'CRLF javascript scheme',
    html: '<a href="JAVA\nSCRIPT:alert(1)">x</a>',
    forbidden: 'javascript',
  },
  {
    name: 'entity-encoded javascript scheme',
    html: '<a href="&#106;avascript:x">x</a>',
    forbidden: 'javascript',
  },
  {
    name: 'slash separator handler',
    html: '<img/onerror=alert(1) src=x>',
    forbidden: 'onerror',
  },
];

describe('sanitizeForCompose — attack vector matrix', () => {
  ATTACK_VECTORS.forEach(({ name, html, forbidden }) => {
    it(`sanitizes: ${name}`, () => {
      const safe = sanitizeForCompose(html).toLowerCase();
      expect(safe).not.toContain(forbidden);
    });
  });

  it('preserves allowed tags: p, strong, br, table, td, th, tr', () => {
    const html =
      '<p><strong>x</strong><br/></p>' +
      '<table><tr><th>h</th><td>d</td></tr></table>';
    const safe = sanitizeForCompose(html);
    expect(safe).toContain('<p>');
    expect(safe).toContain('<strong>');
    expect(safe).toContain('<table>');
    expect(safe).toContain('<td>');
    expect(safe).toContain('<th>');
  });

  it('strips href to javascript: while keeping safe http(s) links', () => {
    const safe = sanitizeForCompose(
      '<a href="javascript:alert(1)">bad</a><a href="https://example.com">ok</a>',
    );
    expect(safe.toLowerCase()).not.toContain('javascript:');
    expect(safe).toContain('https://example.com');
  });
});

describe('bimco buildBimcoInsert — clauseId allow-list', () => {
  it('throws on unknown clauseId (runtime allow-list, not just TS union)', () => {
    expect(() =>
      buildBimcoInsert('x" onmouseover="alert(1)"' as unknown as BimcoClauseId),
    ).toThrow(/unknown|invalid/i);
  });

  it('accepts every documented clauseId without throwing', () => {
    expect(() => buildBimcoInsert('war')).not.toThrow();
    expect(() => buildBimcoInsert('sanctions')).not.toThrow();
    expect(() => buildBimcoInsert('cyber')).not.toThrow();
    expect(() => buildBimcoInsert('bio')).not.toThrow();
  });

  it('emits a properly-quoted data-bimco-clause attribute', () => {
    const out = buildBimcoInsert('war');
    expect(out.html).toContain('data-bimco-clause="war"');
    expect(out.html).not.toMatch(/onmouseover/i);
  });
});

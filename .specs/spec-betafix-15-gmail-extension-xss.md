# spec-betafix-15-gmail-extension-xss

**Plan:** beta-fixes | **Batch:** 4 | **Severity:** CRITICAL
**Source bugs:** BUG-β-13-XSS, BUG-β-stab-04-XSSBypass, BUG-β-13-AttrXSS, BUG-β-13-EconomicsZeroPath (adversarial findings)
**Read first:** `.specs/SHARED_CONTEXT-beta-fixes.md`

## Bug family

1. `extensions/gmail/inserts/index.ts:55` — `wrapper.innerHTML = payload.html` без санитизации (XSS sink).
2. `app/api/extension/draft/route.ts:28-33` — blacklist sanitizer (`stripDangerousTags`) bypass-able: `<iframe>`, `<object>`, `<embed>`, `<style>`, entity-encoded `javascript:`, CRLF-broken schemes survive.
3. `extensions/gmail/inserts/bimco.ts:57` — `data-bimco-clause="${clauseId}"` где clauseId user-controlled string без escape `"`.
4. `extensions/gmail/inserts/economics.ts:56` — `esc()` strips `<>&` но не `"` → attribute-context injection.

`sanitize-html` уже в package.json deps — использовать его (не нужно ставить DOMPurify).

## Files in scope

- `extensions/gmail/inserts/index.ts` (innerHTML sink)
- `extensions/gmail/inserts/bimco.ts` (clauseId allow-list + attr escape)
- `extensions/gmail/inserts/economics.ts` (esc upgrade)
- `extensions/gmail/inserts/passport.ts` — **только если требует обновлённый esc()**, но NaN guards там — другая спека (BUG-βf-20). Только esc() trade-off.
- `app/api/extension/draft/route.ts` (replace blacklist sanitizer)
- `extensions/gmail/__tests__/xss.test.ts` (новый — fuzz-style attack vectors)
- `app/api/extension/draft/__tests__/route.test.ts`

## Files FORBIDDEN

- `extensions/gmail/inserts/passport.ts` строки 54,65 — BUG-βf-20 трогает `toLocaleString` там; coordinate чтобы не overlap. **Резолюция:** spec-15 владеет только `esc()` helper в passport.ts, если он там есть. NaN-guards не трогает.

## TDD RED — attack vector matrix

```ts
// extensions/gmail/__tests__/xss.test.ts
import { sanitizeForCompose } from '../inserts/sanitize';

const ATTACK_VECTORS = [
  { name: 'inline script', html: '<img src=x onerror=alert(1)>', forbidden: 'onerror' },
  { name: 'svg onload', html: '<svg onload=alert(1)>', forbidden: 'onload' },
  { name: 'iframe', html: '<iframe src="//evil"></iframe>', forbidden: 'iframe' },
  { name: 'object', html: '<object data="//evil"></object>', forbidden: 'object' },
  { name: 'embed', html: '<embed src="//evil">', forbidden: 'embed' },
  { name: 'style tag', html: '<style>body{background:url(javascript:alert(1))}</style>', forbidden: 'style' },
  { name: 'CRLF javascript:', html: '<a href="JAVA\nSCRIPT:alert(1)">x</a>', forbidden: 'javascript' },
  { name: 'entity javascript:', html: '<a href="&#106;avascript:x">x</a>', forbidden: 'javascript' },
  { name: 'slash separator', html: '<img/onerror=alert(1)>', forbidden: 'onerror' },
];

ATTACK_VECTORS.forEach(({ name, html, forbidden }) => {
  it(`sanitizes: ${name}`, () => {
    const safe = sanitizeForCompose(html);
    expect(safe.toLowerCase()).not.toContain(forbidden);
  });
});

it('preserves allowed tags: p, strong, br, table, td, th, tr', () => {
  const html = '<p><strong>x</strong><br/></p><table><tr><th>h</th><td>d</td></tr></table>';
  const safe = sanitizeForCompose(html);
  expect(safe).toContain('<p>');
  expect(safe).toContain('<strong>');
  expect(safe).toContain('<table>');
  expect(safe).toContain('<td>');
});
```

```ts
// bimco.ts attribute injection
import { buildBimcoInsert } from '../inserts/bimco';

it('clauseId vetted via Set allow-list', () => {
  expect(() => buildBimcoInsert('x" onmouseover="alert(1)"' as any)).toThrow(/unknown clause/);
  expect(() => buildBimcoInsert('war')).not.toThrow();
});

it('esc() escapes " and \'', () => {
  const out = esc('a"b\'c<d>&e');
  expect(out).not.toContain('"');
  expect(out).not.toContain("'");
  expect(out).toContain('&quot;');
  expect(out).toContain('&#39;');
});
```

## Fix sketch

### 1. Centralized sanitizer (`extensions/gmail/inserts/sanitize.ts`):
```ts
import sanitizeHtml from 'sanitize-html';

export function sanitizeForCompose(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ['p', 'strong', 'em', 'br', 'div', 'span', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'ul', 'ol', 'li'],
    allowedAttributes: {
      table: ['border', 'cellpadding', 'cellspacing'],
      td: ['colspan', 'rowspan'],
      th: ['colspan', 'rowspan'],
      div: ['data-bimco-clause', 'data-quantika-insert'],
      span: ['data-quantika-field'],
    },
    allowedSchemes: ['http', 'https', 'mailto'], // explicit; no javascript:
    transformTags: { /* optional */ },
  });
}
```

### 2. `index.ts` use sanitizer:
```ts
import { sanitizeForCompose } from './sanitize';
const wrapper = composeEl.ownerDocument.createElement('div');
wrapper.innerHTML = sanitizeForCompose(payload.html);
```

### 3. `bimco.ts`:
```ts
const ALLOWED_CLAUSES = new Set<BimcoClauseId>(['war', 'sanctions', 'cyber', 'bio']);
export function buildBimcoInsert(clauseId: BimcoClauseId): InsertPayload {
  if (!ALLOWED_CLAUSES.has(clauseId)) throw new Error(`unknown clause: ${clauseId}`);
  // … esc(clauseId) для attr context уже не нужен т.к. clauseId — известная константа
}
```

### 4. Upgrade `esc()` (in inserts/* helpers) to escape `"` and `'`:
```ts
function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
```

### 5. `app/api/extension/draft/route.ts` replace `stripDangerousTags`:
```ts
import { sanitizeForCompose } from '@/extensions/gmail/inserts/sanitize';
// or define server-side equivalent с тем же allow-list

function safeDraftHtml(html: string): string {
  return sanitizeForCompose(html);
}
```

## Acceptance criteria

- [ ] Все attack vectors из ATTACK_VECTORS не проходят (no onerror/onload/iframe/object/embed/style/javascript: в output).
- [ ] Allowed tags preserved.
- [ ] `esc()` escapes `"` и `'`.
- [ ] `buildBimcoInsert` throws на unknown clauseId.
- [ ] `app/api/extension/draft` использует new sanitizer; старый `stripDangerousTags` deprecated/removed.
- [ ] Existing extension tests green.
- [ ] No new dependencies (sanitize-html уже в package.json).

## Commit

`fix(βf-15-gmail-extension-xss): replace blacklist with sanitize-html allow-list + Set-allow-list для clauseId + escape quotes in esc()`

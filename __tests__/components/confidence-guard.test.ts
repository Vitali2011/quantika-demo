/**
 * γ-cleanup-4 F1 — React #418 guard: numeric confidence values from the LLM
 * parser must NOT reach JSX as truthy non-null values that would render a
 * space-only Fragment (leaving dangling whitespace text-nodes that mismatch
 * between SSR and hydration).
 *
 * The fix: every inline ConfIcon call is guarded by VALID_CONF.has(conf) inside
 * components/clickable-field.tsx so that numeric scores like 0.97 are treated as
 * absent.
 *
 * U5 / #679 — HONEST REWRITE. The previous version declared its OWN
 * `const VALID_CONF = new Set([...])` and a local re-implementation of the guard
 * expression, then tested THAT. It never imported the SUT — deleting the real
 * guard (or every SUT file) left all assertions green. This rewrite renders the
 * REAL ClickableField component via react-dom/server and asserts on the produced
 * markup, so the actual VALID_CONF guard in clickable-field.tsx is exercised.
 *
 * Mutation contract: remove the `VALID_CONF.has(confidence)` check in
 * clickable-field.tsx (e.g. `const confStr = typeof confidence === 'string' ?
 * confidence : undefined`) and the "numeric score renders no icon" cases go RED
 * (a numeric confidence would slip through). Verified in the U5 report.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ClickableField } from '@/components/clickable-field';

// Icon titles map 1:1 to the three valid confidence labels in ConfIcon.
const ICON_TITLE = {
  confirmed: 'Confirmed from email',
  interpreted: 'AI interpreted',
  uncertain: 'Uncertain — check original',
} as const;

function render(confidence: unknown): string {
  return renderToStaticMarkup(
    createElement(ClickableField, {
      label: 'Freight',
      value: 42,
      // deliberately bypass the prop type to simulate runtime LLM payloads
      confidence: confidence as never,
    }),
  );
}

// Extract the inner content of the value <span class="font-medium">…</span>.
// This is where the React #418 dangling-whitespace text-node appears when a
// non-allowlisted confidence leaks past the guard (e.g. "42 " instead of "42").
function valueSpanInner(html: string): string {
  const m = html.match(/<span class="font-medium">([\s\S]*?)<\/span>/);
  if (!m) throw new Error(`value span not found in: ${html}`);
  return m[1];
}

describe('ClickableField VALID_CONF guard — real component render (γ-cleanup-4 F1)', () => {
  it('renders the ✅ icon for "confirmed"', () => {
    const html = render('confirmed');
    expect(html).toContain(`title="${ICON_TITLE.confirmed}"`);
    expect(html).toContain('✅');
  });

  it('renders the ⚠️ icon for "interpreted"', () => {
    const html = render('interpreted');
    expect(html).toContain(`title="${ICON_TITLE.interpreted}"`);
  });

  it('renders the ❓ icon for "uncertain"', () => {
    const html = render('uncertain');
    expect(html).toContain(`title="${ICON_TITLE.uncertain}"`);
  });

  it('renders NO icon AND NO dangling whitespace for a numeric LLM score 0.97 (React #418)', () => {
    const html = render(0.97);
    expect(html).not.toContain('title=');
    expect(html).not.toMatch(/[✅⚠️❓]/u);
    // The exact bug signature: the value span must be "42" — NOT "42 " with a
    // trailing space text-node (which is what the unguarded code produces and
    // what triggers the SSR/hydration mismatch).
    expect(valueSpanInner(html)).toBe('42');
  });

  it('renders NO icon for numeric 0 (falsy but still numeric)', () => {
    const html = render(0);
    expect(html).not.toContain('title=');
    expect(valueSpanInner(html)).toBe('42');
  });

  it('renders NO icon for an arbitrary non-allowlisted string ("high")', () => {
    const html = render('high');
    expect(html).not.toContain('title=');
    expect(html).not.toMatch(/[✅⚠️❓]/u);
    expect(valueSpanInner(html)).toBe('42');
  });

  it('renders NO dangling whitespace for undefined / null / empty string', () => {
    expect(valueSpanInner(render(undefined))).toBe('42');
    expect(valueSpanInner(render(null))).toBe('42');
    expect(valueSpanInner(render(''))).toBe('42');
  });

  it('the VALID confidence labels DO append the icon span (asymmetry proves the guard)', () => {
    // Sanity: a valid label produces "42 <span…>✅</span>" — the space here is
    // intentional and paired with a real icon node, so it does NOT dangle.
    expect(valueSpanInner(render('confirmed'))).toMatch(/^42 <span title=/);
  });
});

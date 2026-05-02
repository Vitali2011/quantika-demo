/**
 * Central sanitizer for Gmail extension compose inserts.
 *
 * BUG-β-13-XSS / BUG-β-stab-04-XSSBypass:
 * Single allow-list-based sanitizer used by:
 *   - extensions/gmail/inserts/index.ts (innerHTML sink in compose surface)
 *   - app/api/extension/draft/route.ts  (server-side draft body sanitization)
 *
 * Why allow-list and not a regex blacklist:
 *   Blacklists miss <iframe>, <object>, <embed>, <style>, slash-form attribute
 *   handlers (`<img/onerror=...>`), entity-encoded `javascript:`, and
 *   CRLF-broken schemes. The sanitize-html parser drops anything outside the
 *   allow-list, closing all of these.
 */
import sanitizeHtml from 'sanitize-html';

/** Tags allowed in compose inserts (rich body + tables for economics/passport). */
const ALLOWED_TAGS: string[] = [
  'p',
  'strong',
  'em',
  'b',
  'i',
  'u',
  'br',
  'div',
  'span',
  'a',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'ul',
  'ol',
  'li',
];

/**
 * Per-tag allowed attributes. `data-*` is permitted on every tag via wildcard
 * (`data-*` is inert by spec — no JS execution, no resource loading) so
 * downstream code can use `data-testid`, `data-quantika-*`, etc. without each
 * one being threaded through the allow-list.
 */
const ALLOWED_ATTRIBUTES: sanitizeHtml.IOptions['allowedAttributes'] = {
  a: ['href', 'title'],
  table: ['border', 'cellpadding', 'cellspacing'],
  td: ['colspan', 'rowspan'],
  th: ['colspan', 'rowspan'],
  '*': ['data-*'],
};

/**
 * Sanitize an HTML fragment for safe insertion into a Gmail compose surface
 * or for embedding into a server-built draft response.
 *
 * Drops every tag/attribute outside the allow-list, restricts URL schemes to
 * http/https/mailto on `href`, and discards (rather than escapes) disallowed
 * tags so they never reach the DOM.
 */
export function sanitizeForCompose(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesAppliedToAttributes: ['href'],
    disallowedTagsMode: 'discard',
  });
}

/**
 * Gmail one-click inserts — format detection + DOM insertion.
 *
 * Spec β-13. Compose surface in Gmail is one of:
 *   • contenteditable[role=textbox] (HTML mode — rich compose, default)
 *   • textarea (plain-text mode — opt-in)
 *
 * For inline replies Gmail renders the original message inside
 * <blockquote class="gmail_quote">. We must NEVER touch that subtree —
 * inserts go BEFORE it (at the end of the user's reply, above the quote).
 */

import DOMPurify from 'dompurify';

/**
 * BUG-β-13-XSS: allow-list of HTML tags + attrs permitted in compose inserts.
 * Anything outside this list is stripped before being written to innerHTML.
 */
const ALLOWED_TAGS = [
  'p',
  'strong',
  'em',
  'br',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'div',
  'span',
];
const ALLOWED_ATTR = [
  'border',
  'cellpadding',
  'cellspacing',
  'colspan',
  'rowspan',
  'data-bimco-clause',
];

export type ComposeFormat = 'html' | 'plain';

export interface InsertResult {
  /** Rich HTML payload — used in contenteditable Gmail compose. */
  html: string;
  /** Plain-text payload — used in textarea Gmail compose. */
  plain: string;
}

/**
 * Heuristic: contenteditable element ⇒ html, textarea ⇒ plain, otherwise plain.
 */
export function detectComposeFormat(composeEl: HTMLElement): ComposeFormat {
  if (!composeEl) return 'plain';
  const tag = composeEl.tagName?.toLowerCase();
  if (tag === 'textarea' || tag === 'input') return 'plain';
  const editable = composeEl.getAttribute?.('contenteditable');
  const role = composeEl.getAttribute?.('role');
  if (editable && editable !== 'false' && role === 'textbox') return 'html';
  if (composeEl.getAttribute?.('g_editable') === 'true') return 'html';
  return 'plain';
}

/**
 * Inserts payload into compose at the appropriate spot.
 *
 * • textarea  → appends payload.plain to .value
 * • html mode → inserts payload.html BEFORE the gmail_quote blockquote
 *               (or at end of body if no quoted block is present)
 */
export function insertIntoCompose(composeEl: HTMLElement, payload: InsertResult): void {
  const format = detectComposeFormat(composeEl);

  if (format === 'plain') {
    const ta = composeEl as unknown as HTMLTextAreaElement;
    const sep = ta.value && !ta.value.endsWith('\n') ? '\n' : '';
    ta.value = ta.value + sep + payload.plain + '\n';
    return;
  }

  const quote = composeEl.querySelector('blockquote.gmail_quote');
  const wrapper = composeEl.ownerDocument.createElement('div');
  // BUG-β-13-XSS: sanitize via DOMPurify allow-list before writing to innerHTML.
  // Use the compose document's window so DOMPurify operates on the same realm.
  const win = composeEl.ownerDocument.defaultView ?? globalThis;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const purify = (DOMPurify as any).sanitize
    ? DOMPurify
    : // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (DOMPurify as any)(win);
  wrapper.innerHTML = purify.sanitize(payload.html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
  });
  if (quote) {
    composeEl.insertBefore(wrapper, quote);
  } else {
    composeEl.appendChild(wrapper);
  }
}

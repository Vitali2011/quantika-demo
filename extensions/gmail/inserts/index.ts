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

import { sanitizeForCompose } from './sanitize';

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
 *
 * BUG-β-13-XSS / BUG-β-stab-04-XSSBypass: payload.html is run through
 * the centralized allow-list sanitizer (sanitizeForCompose) before being
 * written to innerHTML. Anything outside the allow-list is discarded.
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
  wrapper.innerHTML = sanitizeForCompose(payload.html);
  if (quote) {
    composeEl.insertBefore(wrapper, quote);
  } else {
    composeEl.appendChild(wrapper);
  }
}

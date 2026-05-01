/**
 * @jest-environment jsdom
 *
 * Spec β-13: detectComposeFormat & insertIntoCompose.
 *
 * Heuristic — Gmail compose root is a contenteditable[role=textbox]; if its
 * innerHTML contains real markup tags we treat it as HTML mode, else plain.
 * insertIntoCompose must NOT touch existing quoted-reply blocks
 * (`<blockquote class="gmail_quote">`).
 */
import {
  detectComposeFormat,
  insertIntoCompose,
  type InsertResult,
} from '../../../extensions/gmail/inserts';

function htmlCompose(inner: string): HTMLElement {
  const el = document.createElement('div');
  el.setAttribute('contenteditable', 'true');
  el.setAttribute('role', 'textbox');
  el.setAttribute('aria-label', 'Message Body');
  el.setAttribute('g_editable', 'true');
  el.innerHTML = inner;
  document.body.appendChild(el);
  return el;
}

function plainCompose(text: string): HTMLElement {
  const el = document.createElement('textarea');
  el.value = text;
  document.body.appendChild(el);
  return el as unknown as HTMLElement;
}

describe('detectComposeFormat', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('returns html for contenteditable compose with markup', () => {
    const el = htmlCompose('<div>Hello <b>there</b></div>');
    expect(detectComposeFormat(el)).toBe('html');
  });

  it('returns html for contenteditable compose even when text-only (Gmail default)', () => {
    const el = htmlCompose('Hello');
    expect(detectComposeFormat(el)).toBe('html');
  });

  it('returns plain for textarea compose', () => {
    const el = plainCompose('hi there');
    expect(detectComposeFormat(el)).toBe('plain');
  });

  it('returns plain for non-editable div', () => {
    const el = document.createElement('div');
    el.textContent = 'just text';
    document.body.appendChild(el);
    expect(detectComposeFormat(el)).toBe('plain');
  });
});

describe('insertIntoCompose', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  const payload: InsertResult = {
    html: '<table data-testid="ins"><tr><td>R1</td></tr></table>',
    plain: 'R1\tvalue',
  };

  it('appends html payload into html compose', () => {
    const el = htmlCompose('<div>Body</div>');
    insertIntoCompose(el, payload);
    expect(el.innerHTML).toContain('data-testid="ins"');
    expect(el.innerHTML).toContain('Body');
  });

  it('appends plain payload into textarea compose', () => {
    const el = plainCompose('Hello\n');
    insertIntoCompose(el, payload);
    expect((el as unknown as HTMLTextAreaElement).value).toContain('R1\tvalue');
    expect((el as unknown as HTMLTextAreaElement).value).toContain('Hello');
  });

  it('does NOT corrupt the gmail_quote blockquote (inline-reply preserved)', () => {
    const el = htmlCompose(
      '<div>My reply</div>' +
        '<blockquote class="gmail_quote">' +
        '<div>On Mon, Apr 28, 2026 at 9:00 AM, Alice wrote:</div>' +
        '<div>&gt; Original text</div>' +
        '</blockquote>',
    );
    insertIntoCompose(el, payload);
    const bq = el.querySelector('blockquote.gmail_quote');
    expect(bq).not.toBeNull();
    expect(bq!.innerHTML).toContain('Original text');
    expect(bq!.innerHTML).toContain('Alice wrote');
    // payload inserted BEFORE quoted block
    const insIdx = el.innerHTML.indexOf('data-testid="ins"');
    const bqIdx = el.innerHTML.indexOf('gmail_quote');
    expect(insIdx).toBeGreaterThan(-1);
    expect(insIdx).toBeLessThan(bqIdx);
  });

  it('inserts at end of body when no quoted block present', () => {
    const el = htmlCompose('<div>only body</div>');
    insertIntoCompose(el, payload);
    expect(el.innerHTML.indexOf('data-testid="ins"')).toBeGreaterThan(
      el.innerHTML.indexOf('only body'),
    );
  });
});

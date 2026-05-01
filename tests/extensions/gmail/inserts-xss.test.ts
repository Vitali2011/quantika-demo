/**
 * @jest-environment jsdom
 *
 * BUG-β-13-XSS: insertIntoCompose must sanitize html via DOMPurify allow-list.
 */
import { insertIntoCompose } from '../../../extensions/gmail/inserts/index';

function makeCompose(): HTMLElement {
  const div = document.createElement('div');
  div.setAttribute('contenteditable', 'true');
  div.setAttribute('role', 'textbox');
  document.body.appendChild(div);
  return div;
}

describe('BUG-β-13-XSS — DOMPurify allow-list in insertIntoCompose', () => {
  it('strips <script> tags injected via payload.html', () => {
    const compose = makeCompose();
    insertIntoCompose(compose, {
      html: '<p>safe</p><script>window.__pwn=1</script>',
      plain: 'safe',
    });
    expect(compose.innerHTML).not.toMatch(/<script/i);
    expect(compose.innerHTML).toContain('safe');
  });

  it('strips img onerror handlers', () => {
    const compose = makeCompose();
    insertIntoCompose(compose, {
      html: '<img src=x onerror="window.__pwn=1">',
      plain: 'x',
    });
    expect(compose.innerHTML.toLowerCase()).not.toContain('onerror');
  });

  it('strips iframes', () => {
    const compose = makeCompose();
    insertIntoCompose(compose, {
      html: '<iframe src="//evil"></iframe><p>ok</p>',
      plain: 'ok',
    });
    expect(compose.innerHTML.toLowerCase()).not.toContain('<iframe');
  });
});

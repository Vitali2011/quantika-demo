/**
 * Tests for GhostTextController (spec α-12).
 * Uses DOM stubs (jsdom via jest/node env + JSDOM workaround) — no chrome global needed.
 * The controller is pure DOM logic so we import directly from source.
 */

// Minimal DOM env for node test environment
import { JSDOM } from 'jsdom';

function makeTextarea(dom: JSDOM): HTMLTextAreaElement {
  const ta = dom.window.document.createElement('textarea') as HTMLTextAreaElement;
  dom.window.document.body.appendChild(ta);
  return ta;
}

// We import the class via a dynamic-style import to keep chrome-global free
// The module must not reference chrome at module level.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { GhostTextController } = require('../../extensions/gmail/src/content/ghost-text');

describe('GhostTextController', () => {
  let dom: JSDOM;
  let textarea: HTMLTextAreaElement;

  beforeEach(() => {
    dom = new JSDOM('<!DOCTYPE html><body></body>');
    textarea = makeTextarea(dom);
  });

  it('mount() injects a ghost-text span overlaying the textarea', () => {
    const ctrl = new GhostTextController(textarea, 'Dear Sir, please find attached...');
    ctrl.mount();
    const span = textarea.parentElement?.querySelector('.qtk-ghost') as HTMLSpanElement;
    expect(span).not.toBeNull();
    expect(span.textContent).toBe('Dear Sir, please find attached...');
    expect(span.style.opacity).toBe('0.4');
  });

  it('unmount() removes the ghost span', () => {
    const ctrl = new GhostTextController(textarea, 'hello');
    ctrl.mount();
    ctrl.unmount();
    const span = textarea.parentElement?.querySelector('.qtk-ghost');
    expect(span).toBeNull();
  });

  it('accept() inserts draft text into textarea value and removes span', () => {
    const ctrl = new GhostTextController(textarea, 'Accepted draft text');
    ctrl.mount();
    ctrl.accept();
    expect(textarea.value).toBe('Accepted draft text');
    expect(textarea.parentElement?.querySelector('.qtk-ghost')).toBeNull();
  });

  it('dismiss() removes span without changing textarea value', () => {
    textarea.value = 'existing content';
    const ctrl = new GhostTextController(textarea, 'ghost draft');
    ctrl.mount();
    ctrl.dismiss();
    expect(textarea.value).toBe('existing content');
    expect(textarea.parentElement?.querySelector('.qtk-ghost')).toBeNull();
  });

  it('Tab key event calls accept()', () => {
    const ctrl = new GhostTextController(textarea, 'Tab draft');
    ctrl.mount();
    const acceptSpy = jest.spyOn(ctrl, 'accept');
    const event = new dom.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    textarea.dispatchEvent(event);
    expect(acceptSpy).toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
  });

  it('Escape key event calls dismiss()', () => {
    const ctrl = new GhostTextController(textarea, 'Esc draft');
    ctrl.mount();
    const dismissSpy = jest.spyOn(ctrl, 'dismiss');
    const event = new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    textarea.dispatchEvent(event);
    expect(dismissSpy).toHaveBeenCalled();
  });

  it('any other keystroke silently dismisses (no accept, no textarea change)', () => {
    textarea.value = '';
    const ctrl = new GhostTextController(textarea, 'silent dismiss draft');
    ctrl.mount();
    const acceptSpy = jest.spyOn(ctrl, 'accept');
    const dismissSpy = jest.spyOn(ctrl, 'dismiss');
    const event = new dom.window.KeyboardEvent('keydown', { key: 'a', bubbles: true });
    textarea.dispatchEvent(event);
    expect(acceptSpy).not.toHaveBeenCalled();
    expect(dismissSpy).toHaveBeenCalled();
    expect(textarea.value).toBe('');
  });
});

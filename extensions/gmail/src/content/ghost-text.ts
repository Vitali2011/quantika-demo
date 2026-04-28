/**
 * GhostTextController — overlays a translucent draft suggestion on a compose textarea.
 *
 * Keyboard behaviour:
 *   Tab    → accept(): insert draft into textarea, remove overlay
 *   Escape → dismiss(): remove overlay silently
 *   Other  → dismiss() silently (no accept)
 */
export class GhostTextController {
  private span: HTMLSpanElement | null = null;
  private handler: ((e: KeyboardEvent) => void) | null = null;

  constructor(
    private readonly textarea: HTMLTextAreaElement,
    private readonly draftText: string,
  ) {}

  mount(): void {
    if (this.span) return;

    const span = this.textarea.ownerDocument.createElement('span');
    span.className = 'qtk-ghost';
    span.textContent = this.draftText;
    span.style.cssText = [
      'position:absolute',
      'top:0',
      'left:0',
      'pointer-events:none',
      'white-space:pre-wrap',
      'color:inherit',
      'opacity:0.4',
      'font:inherit',
      'padding:inherit',
    ].join(';');

    const wrapper = this.textarea.parentElement;
    if (wrapper) {
      wrapper.style.position = wrapper.style.position || 'relative';
      wrapper.appendChild(span);
    }
    this.span = span;

    this.handler = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        this.accept();
      } else if (e.key === 'Escape') {
        this.dismiss();
      } else {
        this.dismiss();
      }
    };
    this.textarea.addEventListener('keydown', this.handler);
  }

  unmount(): void {
    this.span?.remove();
    this.span = null;
    if (this.handler) {
      this.textarea.removeEventListener('keydown', this.handler);
      this.handler = null;
    }
  }

  accept(): void {
    this.textarea.value = this.draftText;
    this.unmount();
  }

  dismiss(): void {
    this.unmount();
  }
}

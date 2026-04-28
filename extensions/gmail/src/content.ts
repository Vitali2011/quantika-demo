(function () {
  // ── Ghost-text state ────────────────────────────────────────────────────────
  // Inline minimal ghost-text logic to avoid bundler cross-module issues
  // in the IIFE content script context. Full class lives in content/ghost-text.ts.

  interface GhostCtrl {
    mount(): void;
    unmount(): void;
    accept(): void;
    dismiss(): void;
  }

  function makeGhostCtrl(textarea: HTMLTextAreaElement, draftText: string): GhostCtrl {
    let span: HTMLSpanElement | null = null;
    let handler: ((e: KeyboardEvent) => void) | null = null;

    function unmount(): void {
      span?.remove();
      span = null;
      if (handler) {
        textarea.removeEventListener('keydown', handler);
        handler = null;
      }
    }

    function accept(): void {
      textarea.value = draftText;
      unmount();
    }

    function dismiss(): void {
      unmount();
    }

    function mount(): void {
      if (span) return;
      const el = document.createElement('span');
      el.className = 'qtk-ghost';
      el.textContent = draftText;
      el.style.cssText =
        'position:absolute;top:0;left:0;pointer-events:none;white-space:pre-wrap;color:inherit;opacity:0.4;font:inherit;padding:inherit';
      const wrapper = textarea.parentElement;
      if (wrapper) {
        wrapper.style.position = wrapper.style.position || 'relative';
        wrapper.appendChild(el);
      }
      span = el;
      handler = (e: KeyboardEvent) => {
        if (e.key === 'Tab') {
          e.preventDefault();
          accept();
        } else {
          dismiss();
        }
      };
      textarea.addEventListener('keydown', handler);
    }

    return { mount, unmount, accept, dismiss };
  }

  let activeGhost: GhostCtrl | null = null;

  // ── Listen for SHOW_GHOST_TEXT from background ──────────────────────────────
  chrome.runtime.onMessage.addListener(
    (msg: { type: string; draftText?: string }, _sender, sendResponse) => {
      if (msg.type === 'SHOW_GHOST_TEXT' && msg.draftText) {
        injectGhostText(msg.draftText);
        sendResponse({ ok: true });
      }
      return false;
    },
  );

  function injectGhostText(draftText: string): void {
    activeGhost?.unmount();
    activeGhost = null;

    const textarea = document.querySelector(
      '[role="textbox"][aria-label*="Message Body"]',
    ) as HTMLTextAreaElement | null;
    if (!textarea) return;

    const ctrl = makeGhostCtrl(textarea, draftText);
    ctrl.mount();
    activeGhost = ctrl;
  }

  // ── MutationObserver: badge + ghost-text cleanup ────────────────────────────
  const observer = new MutationObserver(() => {
    const composeDialogs = document.querySelectorAll('[role="dialog"]');
    composeDialogs.forEach(d => {
      if (!d.querySelector('.quantika-badge')) {
        const badge = document.createElement('div');
        badge.className = 'quantika-badge';
        badge.textContent = '⚓ Quantika ready';
        badge.style.cssText =
          'position:absolute;top:8px;right:8px;background:#1e40af;color:white;padding:2px 6px;font-size:11px;border-radius:3px;z-index:99999';
        (d as HTMLElement).style.position = 'relative';
        d.appendChild(badge);
      }
    });

    // Dismiss ghost if compose closed
    if (activeGhost) {
      const textbox = document.querySelector('[role="textbox"][aria-label*="Message Body"]');
      if (!textbox) {
        activeGhost.unmount();
        activeGhost = null;
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
})();

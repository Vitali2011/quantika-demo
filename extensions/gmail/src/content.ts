(function() {
  console.log('[Quantika] content script loaded on', location.hostname);
  const observer = new MutationObserver(() => {
    const composeDialogs = document.querySelectorAll('[role="dialog"]');
    composeDialogs.forEach(d => {
      if (!d.querySelector('.quantika-badge')) {
        const badge = document.createElement('div');
        badge.className = 'quantika-badge';
        badge.textContent = '⚓ Quantika ready';
        badge.style.cssText = 'position:absolute;top:8px;right:8px;background:#1e40af;color:white;padding:2px 6px;font-size:11px;border-radius:3px;z-index:99999';
        (d as HTMLElement).style.position = 'relative';
        d.appendChild(badge);
      }
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();

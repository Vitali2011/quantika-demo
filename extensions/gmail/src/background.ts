chrome.runtime.onInstalled.addListener(() => {
  console.log('[Quantika] Extension installed');
});
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  // Placeholder for message passing — wiring lands in spec-12
  if (msg.type === 'PING') { sendResponse({ ok: true, version: '0.1.0' }); return true; }
  return false;
});
export {};

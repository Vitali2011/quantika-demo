import { fetchContext, fetchDraft } from './api-client';
import { renderCargo, renderVessels, renderPassport } from './render';

let selectedVessel: Record<string, unknown> | null = null;
let currentDraftText: string | null = null;
let currentCargo: Record<string, unknown> | null = null;

function setStatus(msg: string): void {
  const el = document.getElementById('status-bar');
  if (el) el.textContent = msg;
}

function showRoot(): void {
  const loading = document.getElementById('loading');
  const root = document.getElementById('root');
  if (loading) loading.style.display = 'none';
  if (root) root.style.display = '';
}

async function init(): Promise<void> {
  try {
    // Get current Gmail message ID from URL hash (Gmail format: #inbox/messageId)
    const parts = location.hash.replace('#', '').split('/');
    const messageId = parts[parts.length - 1] || '';

    const ctx = await fetchContext(messageId);
    currentCargo = ctx.parsedCargo;
    currentDraftText = ctx.draftQuoteText;

    renderCargo(
      document.getElementById('cargo-fields') as HTMLElement,
      ctx.parsedCargo,
    );

    renderVessels(
      document.getElementById('vessel-list') as HTMLElement,
      ctx.topMatches,
      (match) => {
        selectedVessel = match.vessel;
        renderPassport(
          document.getElementById('passport-content') as HTMLElement,
          match.vessel,
        );
      },
    );

    showRoot();
  } catch (err) {
    showRoot();
    setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

document.getElementById('btn-draft')?.addEventListener('click', () => {
  if (!currentDraftText) {
    setStatus('No draft available — run context first');
    return;
  }
  chrome.runtime.sendMessage({ type: 'SHOW_GHOST_TEXT', draftText: currentDraftText });
  setStatus('Draft injected into compose window');
});

document.getElementById('btn-benchmark')?.addEventListener('click', () => {
  setStatus('Benchmark data — available in Wave β');
});

document.getElementById('btn-passport')?.addEventListener('click', async () => {
  if (!selectedVessel || !currentCargo) {
    setStatus('Select a vessel first');
    return;
  }
  try {
    const res = await fetchDraft(
      currentCargo,
      (selectedVessel.imo as string) || 'unknown',
      'Broker',
    );
    chrome.runtime.sendMessage({ type: 'SHOW_GHOST_TEXT', draftText: res.draftText });
    setStatus('Passport draft injected');
  } catch (err) {
    setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
  }
});

init();
export {};

const API_BASE = 'https://demo.quantika.org';

type MessageType = 'PING' | 'FETCH_CONTEXT' | 'FETCH_DRAFT' | 'SHOW_GHOST_TEXT';

interface ExtMessage {
  type: MessageType;
  [key: string]: unknown;
}

chrome.runtime.onInstalled.addListener(() => {
  // Extension installed — nothing to do yet
});

chrome.runtime.onMessage.addListener((msg: ExtMessage, _sender, sendResponse) => {
  switch (msg.type) {
    case 'PING':
      sendResponse({ ok: true, version: '0.1.0' });
      return true;

    case 'FETCH_CONTEXT': {
      const messageId = String(msg.messageId || '');
      fetchContext(messageId)
        .then(data => sendResponse({ data }))
        .catch(err => sendResponse({ error: String(err) }));
      return true;
    }

    case 'FETCH_DRAFT': {
      fetchDraft(
        msg.parsedCargo as Record<string, unknown>,
        String(msg.vesselId || ''),
        String(msg.brokerName || ''),
      )
        .then(data => sendResponse({ data }))
        .catch(err => sendResponse({ error: String(err) }));
      return true;
    }

    case 'SHOW_GHOST_TEXT': {
      chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
        const tabId = tabs[0]?.id;
        if (tabId !== undefined) {
          chrome.tabs.sendMessage(tabId, {
            type: 'SHOW_GHOST_TEXT',
            draftText: msg.draftText,
          });
        }
      });
      sendResponse({ ok: true });
      return true;
    }

    default:
      return false;
  }
});

async function fetchContext(messageId: string): Promise<unknown> {
  const token = await getStoredToken();
  const url = `${API_BASE}/api/extension/context?messageId=${encodeURIComponent(messageId)}`;
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchDraft(
  parsedCargo: Record<string, unknown>,
  vesselId: string,
  brokerName: string,
): Promise<unknown> {
  const token = await getStoredToken();
  const res = await fetch(`${API_BASE}/api/extension/draft`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    credentials: 'include',
    body: JSON.stringify({ parsedCargo, vesselId, brokerName }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function getStoredToken(): Promise<string | null> {
  return new Promise(resolve => {
    chrome.storage.local.get(['session_token'], result => {
      resolve((result.session_token as string) || null);
    });
  });
}

export {};

/**
 * Cross-context HTTP wrapper for the Gmail sidebar.
 * Sends messages to background service worker which performs the actual fetch.
 */

export interface ContextResponse {
  parsedCargo: Record<string, unknown> | null;
  topMatches: Array<{ vessel: Record<string, unknown>; score: number }>;
  draftQuoteText: string | null;
}

export interface DraftResponse {
  draftText: string;
}

export async function fetchContext(messageId: string): Promise<ContextResponse> {
  return sendMessage<ContextResponse>({
    type: 'FETCH_CONTEXT',
    messageId,
  });
}

export async function fetchDraft(
  parsedCargo: Record<string, unknown>,
  vesselId: string,
  brokerName: string,
): Promise<DraftResponse> {
  return sendMessage<DraftResponse>({
    type: 'FETCH_DRAFT',
    parsedCargo,
    vesselId,
    brokerName,
  });
}

function sendMessage<T>(message: Record<string, unknown>): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: { error?: string; data?: T }) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (response?.error) {
        reject(new Error(response.error));
        return;
      }
      resolve(response?.data as T);
    });
  });
}

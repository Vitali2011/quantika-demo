/**
 * Build corpus from raw Gmail thread objects.
 * Produces Email[] suitable for etms-corpus.json.
 */

import type { Email } from '../types';
import { extractTextPart, extractHeaders, parseFromHeader, GmailPayload } from './mime-decode';
import { unwrapForwardLayers } from './forward-unwrap';

/** Minimal Gmail thread shape (what import-gmail-emails.ts writes) */
export interface RawMessage {
  id: string;
  threadId: string;
  snippet?: string;
  labelIds?: string[];
  payload?: GmailPayload;
  internalDate?: string; // ms since epoch as string
}

export interface RawThread {
  id: string;
  messages?: RawMessage[];
}

/**
 * Convert a single Gmail message to Email.
 * Returns null if the message has no usable payload.
 */
function messageToEmail(message: RawMessage, threadId: string): Email | null {
  const payload = message.payload;
  if (!payload) return null;

  const headers = extractHeaders(payload);
  const rawBody = extractTextPart(payload);

  // Unwrap forwarded layers
  const unwrapped = unwrapForwardLayers(rawBody, headers);
  const body = unwrapped.innermostBody || rawBody || '';

  // Determine sender info
  // Prefer original sender from unwrapped forward; fall back to message headers
  const rawFrom =
    (unwrapped.layerCount > 0 && unwrapped.originalFrom)
      ? unwrapped.originalFrom
      : (headers.get('from') ?? '');

  const { fromName, fromEmail } = parseFromHeader(rawFrom);

  const from = rawFrom || (headers.get('from') ?? '');
  const to = headers.get('to') ?? '';

  // Subject: prefer original from unwrapped if available
  const subject =
    (unwrapped.layerCount > 0 && unwrapped.originalSubject)
      ? unwrapped.originalSubject
      : (headers.get('subject') ?? '');

  // Date: prefer unwrapped original, then Date header, then internalDate
  let date: string;
  const rawDate =
    (unwrapped.layerCount > 0 && unwrapped.originalDate)
      ? unwrapped.originalDate
      : (headers.get('date') ?? '');

  if (rawDate) {
    try {
      date = new Date(rawDate).toISOString();
    } catch {
      date = rawDate;
    }
  } else if (message.internalDate) {
    date = new Date(parseInt(message.internalDate, 10)).toISOString();
  } else {
    date = new Date(0).toISOString();
  }

  // Snippet: prefer Gmail-provided, else first 200 chars of body
  const snippet = message.snippet
    ? message.snippet
    : body.replace(/\s+/g, ' ').trim().slice(0, 200);

  return {
    id: message.id,
    threadId,
    from,
    fromName,
    fromEmail,
    to,
    subject,
    date,
    body,
    snippet,
    labelIds: message.labelIds ?? [],
  };
}

/**
 * Build corpus from an array of raw Gmail threads.
 * Each thread contributes ALL its messages (reply chain).
 */
export function buildCorpusFromThreads(threads: RawThread[]): Email[] {
  const result: Email[] = [];

  for (const thread of threads) {
    const messages = thread.messages ?? [];
    for (const message of messages) {
      const email = messageToEmail(message, thread.id);
      if (email !== null) {
        result.push(email);
      }
    }
  }

  return result;
}

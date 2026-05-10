/**
 * MIME decode utilities for Gmail API payloads.
 * Pure functions — no LLM, no network, no side effects.
 */

import sanitizeHtml from 'sanitize-html';

/** Gmail message payload structure (minimal subset we need) */
export interface GmailPayload {
  mimeType?: string;
  headers?: Array<{ name: string; value: string }>;
  body?: { data?: string; size?: number };
  parts?: GmailPayload[];
}

/**
 * Decode Gmail base64url encoded string to UTF-8 text.
 * Gmail uses base64url (- instead of +, _ instead of /) without padding.
 */
export function decodeBase64Url(s: string): string {
  // Normalize base64url → base64
  const base64 = s.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64').toString('utf-8');
}

/**
 * Recursively walk a Gmail MIME payload tree and extract plain text.
 * Priority: text/plain > text/html (stripped). Attachments are ignored.
 * Returns empty string if nothing found.
 */
export function extractTextPart(payload: GmailPayload): string {
  if (!payload) return '';

  // If this node has parts, recurse
  if (payload.parts && payload.parts.length > 0) {
    // First pass: look for text/plain
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain') {
        const data = part.body?.data;
        if (data) return decodeBase64Url(data);
      }
    }
    // Second pass: look for text/html
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html') {
        const data = part.body?.data;
        if (data) {
          const html = decodeBase64Url(data);
          return stripHtml(html);
        }
      }
    }
    // Third pass: recurse into multipart children
    for (const part of payload.parts) {
      if (part.mimeType?.startsWith('multipart/')) {
        const text = extractTextPart(part);
        if (text) return text;
      }
    }
    return '';
  }

  // Leaf node
  const mimeType = payload.mimeType ?? '';
  const data = payload.body?.data;
  if (!data) return '';

  if (mimeType === 'text/plain') {
    return decodeBase64Url(data);
  }

  if (mimeType === 'text/html') {
    const html = decodeBase64Url(data);
    return stripHtml(html);
  }

  return '';
}

/**
 * Strip HTML tags and decode entities to plain text.
 */
function stripHtml(html: string): string {
  const stripped = sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} });
  // Collapse excessive whitespace but preserve paragraph breaks
  return stripped
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Extract message headers as a lowercase-keyed Map.
 * Multiple values for the same header are joined with '; '.
 */
export function extractHeaders(payload: GmailPayload): Map<string, string> {
  const map = new Map<string, string>();
  const headers = payload.headers ?? [];
  for (const h of headers) {
    const key = h.name.toLowerCase();
    const existing = map.get(key);
    if (existing !== undefined) {
      map.set(key, `${existing}; ${h.value}`);
    } else {
      map.set(key, h.value);
    }
  }
  return map;
}

/**
 * Parse a "From" header into { name, email } components.
 * Handles:
 *   - "John Doe <john@example.com>"
 *   - "<john@example.com>"
 *   - "john@example.com"
 */
export function parseFromHeader(from: string): { fromName: string | null; fromEmail: string | null } {
  if (!from) return { fromName: null, fromEmail: null };

  const angleMatch = from.match(/^(.*?)<([^>]+)>\s*$/);
  if (angleMatch) {
    const name = angleMatch[1].trim().replace(/^"|"$/g, '') || null;
    const email = angleMatch[2].trim() || null;
    return { fromName: name || null, fromEmail: email };
  }

  // Plain email address
  if (from.includes('@')) {
    return { fromName: null, fromEmail: from.trim() };
  }

  return { fromName: from.trim() || null, fromEmail: null };
}

import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + '...';
}

export function formatDate(dateStr: string): string {
  try {
    // Pin timeZone to UTC so server (UTC) and client (user-local) render the
    // same string. Without this, dates rendered in server components and
    // hydrated on the client differ by one day for users east/west of UTC,
    // triggering React #418 hydration warnings.
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    });
  } catch {
    return dateStr;
  }
}

export function formatRelativeTime(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'today';
    if (diffDays === 1) return '1 day ago';
    return `${diffDays} days ago`;
  } catch {
    return dateStr;
  }
}

export function safeJsonParse<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

export function formatNumber(n: number | null | undefined, opts?: Intl.NumberFormatOptions): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '0';
  return new Intl.NumberFormat('en-US', opts).format(n);
}

export function sanitizeEmailBody(body: string): string {
  return body
    .replace(/<file:\/\/\/[^>]*>/gi, '')
    .replace(/<mailto:([^>]+)>/gi, '$1')
    .replace(/<(https?:\/\/[^>]+)>/gi, '$1')
    .replace(/<(?:SENDER|CONTACT|BROKER|AGENT)\s+\d+>/gi, '')
    .replace(/^.*(AVG|Avast|Norton|Kaspersky|ESET|McAfee).*virus.*$/gim, '')
    .replace(/^[ \t]*\+{3,}[ \t]*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const HTML_ENTITY_MAP: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/**
 * Decode common HTML entities (named + numeric) in a plain text string.
 * Safe for SSR — does not use DOMParser. Use before rendering text that
 * may contain entity-encoded characters (e.g. email snippets/bodies).
 */
export function decodeHtmlEntities(s: string): string {
  if (!s) return s;
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, ent) => {
    if (ent[0] === '#') {
      const code = ent[1] === 'x' || ent[1] === 'X'
        ? parseInt(ent.slice(2), 16)
        : parseInt(ent.slice(1), 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return match;
      try {
        return String.fromCodePoint(code);
      } catch {
        return match;
      }
    }
    const mapped = HTML_ENTITY_MAP[ent.toLowerCase()];
    return mapped ?? match;
  });
}

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

export function sanitizeEmailBody(body: string): string {
  return body
    .replace(/<file:\/\/\/[^>]*>/gi, '')
    .replace(/<mailto:([^>]+)>/gi, '$1')
    .replace(/<(https?:\/\/[^>]+)>/gi, '$1')
    .replace(/^.*(AVG|Avast|Norton|Kaspersky|ESET|McAfee).*virus.*$/gim, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

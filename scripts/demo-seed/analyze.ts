import * as fs from 'fs';
import * as path from 'path';
import type { Manifest, OffsetEntry } from './manifest-schema';

export interface AnalyzeOptions {
  rawDir: string;
  frozenDate: string; // YYYY-MM-DD
  demoWindowDays: number;
}

// Gmail thread JSON shape (from .private/raw-emails/*.json)
interface GmailThread {
  id: string;
  historyId?: string;
  messages: GmailMessage[];
}

interface GmailMessagePart {
  partId?: string;
  mimeType?: string;
  body?: { data?: string; size?: number };
  parts?: GmailMessagePart[];
}

interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string; // unix ms as string
  payload?: {
    headers?: Array<{ name: string; value: string }>;
    body?: { data?: string; size?: number };
    parts?: GmailMessagePart[];
  };
}

// Flat internal representation used within analyze.ts
export interface FlatEmail {
  threadId: string;   // from messages[0].threadId or top-level id
  messageId: string;  // from messages[0].id
  fromName?: string;  // e.g. "DEMO BROKER"
  fromEmail?: string; // e.g. "broker@demo.local"
  subject?: string;
  date: string;       // ISO string derived from internalDate
  body: string;       // decoded text/plain body
}

function decodeBase64Url(b64url: string): string {
  return Buffer.from(b64url.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

function extractTextBody(part: GmailMessagePart): string {
  if (part.body?.data) {
    return decodeBase64Url(part.body.data);
  }
  if (part.parts) {
    const textPart = part.parts.find((p) => p.mimeType === 'text/plain');
    if (textPart?.body?.data) return decodeBase64Url(textPart.body.data);
    const htmlPart = part.parts.find((p) => p.mimeType === 'text/html');
    if (htmlPart?.body?.data) {
      return decodeBase64Url(htmlPart.body.data)
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }
    for (const child of part.parts) {
      const nested = extractTextBody(child);
      if (nested) return nested;
    }
  }
  return '';
}

function parseFromHeader(from: string): { fromName?: string; fromEmail?: string } {
  const match = from.match(/^"?([^"<]*)"?\s*<?([^>]*)>?$/);
  if (match) {
    const name = match[1].trim() || undefined;
    const email = match[2].trim() || undefined;
    return { fromName: name, fromEmail: email || from };
  }
  return { fromEmail: from };
}

export function normalizeRawEmail(rawJson: unknown): FlatEmail {
  const thread = rawJson as GmailThread;
  const msg = thread.messages[0];
  const headers = msg.payload?.headers ?? [];
  const getHeader = (name: string) =>
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';

  const internalDateMs = msg.internalDate ? parseInt(msg.internalDate, 10) : NaN;
  const date = isNaN(internalDateMs)
    ? new Date(getHeader('Date')).toISOString()
    : new Date(internalDateMs).toISOString();

  const { fromName, fromEmail } = parseFromHeader(getHeader('From'));
  const body = msg.payload ? extractTextBody(msg.payload as GmailMessagePart) : '';

  return {
    threadId: msg.threadId || thread.id,
    messageId: msg.id,
    fromName,
    fromEmail,
    subject: getHeader('Subject') || undefined,
    date,
    body,
  };
}

function readCorpus(rawDir: string): FlatEmail[] {
  const files = fs.readdirSync(rawDir).filter((f) => f.endsWith('.json')).sort();
  return files.map((f) => {
    const raw = JSON.parse(fs.readFileSync(path.join(rawDir, f), 'utf8'));
    return normalizeRawEmail(raw);
  });
}

export async function analyze(opts: AnalyzeOptions): Promise<Manifest> {
  const corpus = readCorpus(opts.rawDir);
  const frozen = new Date(opts.frozenDate + 'T00:00:00.000Z');

  const offsets: Record<string, OffsetEntry> = {};
  for (const email of corpus) {
    const emailD = new Date(email.date);
    const days = Math.round((frozen.getTime() - emailD.getTime()) / 86_400_000);
    // Naive: place email ~7 days before frozenDate. Real parser logic added in Task 10.
    const offsetDays = -days + -7;
    offsets[email.threadId] = {
      offsetDays,
      rationale: 'naive: place email ~7 days before frozenDate',
      shifted_fields: ['email.date'],
    };
  }

  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    raw_emails_dir: opts.rawDir,
    raw_emails_count: corpus.length,
    frozenDate: opts.frozenDate,
    demo_window_days: opts.demoWindowDays,
    offsets,
    anonymization: { vessels: {}, charterers: {}, brokers: {}, sender_emails: {} },
    stats: {
      active_laycans_after_shift: 0,
      stale_laycans_after_shift: 0,
      anonymization_unknowns: [],
    },
  };
}

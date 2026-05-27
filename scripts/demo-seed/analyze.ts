import * as fs from 'fs';
import * as path from 'path';
import type { Manifest, OffsetEntry } from './manifest-schema';
import { parseLaycan, parseVesselOpenDate } from '@/lib/sailing/date-parsing';

export interface AnalyzeOptions {
  rawDir: string;
  frozenDate: string; // YYYY-MM-DD
  demoWindowDays: number;
  /** Pre-existing aliases to preserve (additive — new names get new counters). */
  seedAnonymization?: Manifest['anonymization'];
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

// Parsed facts extracted from email body using pure string parsing (no LLM).
export interface ParsedFacts {
  category: 'cargo' | 'vessel' | 'recap' | 'other';
  laycanStart?: Date;
  laycanEnd?: Date;
  openDate?: Date;
  vesselNames: string[];   // regex-extracted from body/subject (best-effort)
  brokers: string[];       // from Gmail From header name
  senderEmails: string[];  // from Gmail From header email
  charterers: string[];    // always empty (requires LLM); populate via seedAnonymization
}

/** Vessel name pattern: M/V or M/T followed by uppercase name until a delimiter. */
const VESSEL_NAME_RE = /\bM\/[VT]\s+([A-Z][A-Z0-9\s\-]+?)(?=[,.\n]|$|\s+(?:DWT|DWCC|TBN|ETA|open|opens|FLAG|tradi|built))/gi;

function extractVesselNames(text: string): string[] {
  const names: string[] = [];
  let m: RegExpExecArray | null;
  VESSEL_NAME_RE.lastIndex = 0;
  while ((m = VESSEL_NAME_RE.exec(text)) !== null) {
    const name = ('M/V ' + m[1]).trim().replace(/\s+/g, ' ');
    if (name.length > 4) names.push(name);
  }
  return [...new Set(names)];
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

/**
 * Classify email and extract date facts using pure string parsing.
 * No LLM calls — uses subject keywords + regex extraction + lib/sailing/date-parsing.
 */
export function extractFacts(email: FlatEmail): ParsedFacts {
  const subjectLower = (email.subject ?? '').toLowerCase();
  const body = email.body;

  // Classify by subject keywords
  let category: ParsedFacts['category'] = 'other';
  if (/recap|fixture confirmed|cp signed/i.test(subjectLower)) {
    category = 'recap';
  } else if (/vessel\s*(open|position|avail)|tbn\s*vessel|open\s*vessel/i.test(subjectLower)) {
    category = 'vessel';
  } else if (/cargo|enquiry|inquiry|shipment|freight/i.test(subjectLower)) {
    category = 'cargo';
  }

  // Extract vessel names from subject + body (best-effort regex)
  const vesselNames = extractVesselNames((email.subject ?? '') + '\n' + body);

  // Broker name and sender email come from Gmail From header
  const brokers = email.fromName ? [email.fromName] : [];
  const senderEmails = email.fromEmail ? [email.fromEmail] : [];

  const facts: ParsedFacts = { category, vesselNames, brokers, senderEmails, charterers: [] };

  if (category === 'cargo') {
    // Extract LAYCAN: <string> from body
    const laycanMatch = body.match(/\bLAYCAN[:\s]+([^\n]+)/i);
    if (laycanMatch) {
      const laycanStr = laycanMatch[1].trim();
      const refYear = new Date(email.date).getUTCFullYear();
      const range = parseLaycan(laycanStr, refYear);
      if (range) {
        facts.laycanStart = range.start;
        facts.laycanEnd = range.end;
      }
    }
  } else if (category === 'vessel') {
    // Extract OPEN DATE: <string> from body
    const openDateMatch = body.match(/\bOPEN\s+DATE[:\s]+([^\n]+)/i);
    if (openDateMatch) {
      const openDateStr = openDateMatch[1].trim();
      const refYear = new Date(email.date).getUTCFullYear();
      const d = parseVesselOpenDate(openDateStr, refYear);
      if (d) facts.openDate = d;
    }
  }

  return facts;
}

export async function analyze(opts: AnalyzeOptions): Promise<Manifest> {
  // Sort corpus by threadId for deterministic counter assignment
  const corpus = readCorpus(opts.rawDir).sort((a, b) => a.threadId.localeCompare(b.threadId));
  const frozen = new Date(opts.frozenDate + 'T00:00:00.000Z');

  // Build anonymization map starting from seed (additive — preserve existing aliases)
  const seed = opts.seedAnonymization;
  const anonymization: Manifest['anonymization'] = {
    vessels: seed ? { ...seed.vessels } : {},
    charterers: seed ? { ...seed.charterers } : {},
    brokers: seed ? { ...seed.brokers } : {},
    sender_emails: seed ? { ...seed.sender_emails } : {},
  };
  const counters = {
    vessels: Object.keys(anonymization.vessels).length,
    charterers: Object.keys(anonymization.charterers).length,
    brokers: Object.keys(anonymization.brokers).length,
    sender_emails: Object.keys(anonymization.sender_emails).length,
  };

  function alias(kind: keyof typeof counters, real: string, prefix: string): void {
    if (!real || anonymization[kind][real]) return;
    counters[kind] += 1;
    anonymization[kind][real] = `${prefix} ${counters[kind]}`;
  }

  const offsets: Record<string, OffsetEntry> = {};
  for (const email of corpus) {
    const emailD = new Date(email.date);
    const facts = extractFacts(email);

    // Populate anonymization map from extracted names
    for (const v of facts.vesselNames) alias('vessels', v, 'M/V DEMO');
    for (const b of facts.brokers) alias('brokers', b, 'BROKER');
    for (const e of facts.senderEmails) alias('sender_emails', e, 'SENDER');
    for (const c of facts.charterers) alias('charterers', c, 'CHARTERER');

    const shifted: string[] = ['email.date'];
    let offsetDays: number;
    let rationale: string;

    if (facts.category === 'cargo' && facts.laycanStart && facts.laycanEnd) {
      // Place laycan midpoint at frozenDate + 7d
      const midLay = new Date((facts.laycanStart.getTime() + facts.laycanEnd.getTime()) / 2);
      const target = new Date(frozen.getTime() + 7 * 86_400_000);
      offsetDays = Math.round((target.getTime() - midLay.getTime()) / 86_400_000);
      shifted.push('laycan_start', 'laycan_end');
      rationale = `laycan midpoint ${midLay.toISOString().slice(0, 10)} → ${target.toISOString().slice(0, 10)}`;
    } else if (facts.category === 'vessel' && facts.openDate) {
      // Place open_date at frozenDate + 3d
      const target = new Date(frozen.getTime() + 3 * 86_400_000);
      offsetDays = Math.round((target.getTime() - facts.openDate.getTime()) / 86_400_000);
      shifted.push('open_date');
      rationale = `open_date ${facts.openDate.toISOString().slice(0, 10)} → ${target.toISOString().slice(0, 10)}`;
    } else {
      // Fallback: place email ~7 days before frozenDate
      const days = Math.round((frozen.getTime() - emailD.getTime()) / 86_400_000);
      offsetDays = -days + -7;
      rationale = `email.date ${emailD.toISOString().slice(0, 10)} → frozenDate ${opts.frozenDate} (fallback)`;
    }

    offsets[email.threadId] = { offsetDays, rationale, shifted_fields: shifted };
  }

  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    raw_emails_dir: opts.rawDir,
    raw_emails_count: corpus.length,
    frozenDate: opts.frozenDate,
    demo_window_days: opts.demoWindowDays,
    offsets,
    anonymization,
    stats: {
      active_laycans_after_shift: 0,
      stale_laycans_after_shift: 0,
      anonymization_unknowns: [],
    },
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const arg = (k: string) => {
    const i = argv.indexOf(k);
    return i === -1 ? undefined : argv[i + 1];
  };

  const rawDir = arg('--raw-dir') ?? path.resolve(process.cwd(), '.private/raw-emails');
  const frozenDate = arg('--frozen-date');
  if (!frozenDate) {
    console.error('Usage: tsx scripts/demo-seed/analyze.ts --frozen-date YYYY-MM-DD [--raw-dir DIR] [--out FILE]');
    process.exit(2);
  }
  const demoWindowDays = parseInt(arg('--window') ?? '14', 10);
  const outFile = arg('--out') ?? path.resolve(process.cwd(), 'scripts/demo-seed/manifest.json');

  // If existing manifest present — re-use anonymization (additive)
  let seedAnon: Manifest['anonymization'] | undefined;
  if (fs.existsSync(outFile)) {
    try {
      const prev = JSON.parse(fs.readFileSync(outFile, 'utf8'));
      seedAnon = prev.anonymization;
    } catch {/* ignore */}
  }

  const manifest = await analyze({ rawDir, frozenDate, demoWindowDays, seedAnonymization: seedAnon });
  fs.writeFileSync(outFile, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Wrote ${outFile}: ${manifest.raw_emails_count} emails, ${Object.keys(manifest.offsets).length} offsets`);
}

if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1); });
}

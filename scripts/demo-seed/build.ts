// scripts/demo-seed/build.ts
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import Database from 'better-sqlite3';
import { runMigrations } from '@/lib/migrations/runner';
import { allMigrations } from '@/lib/migrations/index';
import { ManifestSchema, type Manifest } from './manifest-schema';
import { normalizeRawEmail, extractFacts, type FlatEmail } from './analyze';

const PARSER_VERSION = 'demo-seed-v1';

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

function shiftIsoDate(iso: string, offsetDays: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString();
}

/**
 * Shift dates in plain text body. Recognizes:
 *   - ISO "YYYY-MM-DD"
 *   - "DD-DD Month YYYY" range (e.g. "15-20 April 2026"), handles cross-month
 */
function shiftBodyDates(body: string, offsetDays: number): string {
  let out = body;

  // ISO YYYY-MM-DD
  out = out.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (_m, y, mo, d) =>
    shiftIsoDate(`${y}-${mo}-${d}T00:00:00Z`, offsetDays).slice(0, 10),
  );

  // "DD-DD Month YYYY" range (e.g. "15-20 April 2026")
  out = out.replace(
    /\b(\d{1,2})\s*-\s*(\d{1,2})\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{4})\b/gi,
    (_match, d1, d2, mon, y) => {
      const monthIdx = MONTH_NAMES.findIndex((m) =>
        m.toLowerCase().startsWith(mon.slice(0, 3).toLowerCase()),
      );
      const start = new Date(Date.UTC(+y, monthIdx, +d1));
      const end = new Date(Date.UTC(+y, monthIdx, +d2));
      start.setUTCDate(start.getUTCDate() + offsetDays);
      end.setUTCDate(end.getUTCDate() + offsetDays);
      const sameMonth =
        start.getUTCMonth() === end.getUTCMonth() &&
        start.getUTCFullYear() === end.getUTCFullYear();
      if (sameMonth) {
        return `${start.getUTCDate()}-${end.getUTCDate()} ${MONTH_NAMES[start.getUTCMonth()]} ${start.getUTCFullYear()}`;
      }
      return `${start.getUTCDate()} ${MONTH_NAMES[start.getUTCMonth()]} - ${end.getUTCDate()} ${MONTH_NAMES[end.getUTCMonth()]} ${end.getUTCFullYear()}`;
    },
  );

  return out;
}

export interface BuildOptions {
  rawDir: string;
  manifestPath: string;
  outDb: string;
  forbiddenSubstrings?: string[];
}

/**
 * Replace all occurrences of keys in `map` within `text`, case-insensitively.
 * Longer keys are replaced first to avoid partial-match issues.
 */
function applyAnonymization(text: string, map: Record<string, string>): string {
  const entries = Object.entries(map).sort((a, b) => b[0].length - a[0].length);
  let out = text;
  for (const [original, alias] of entries) {
    const escaped = original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(escaped, 'gi'), alias);
  }
  return out;
}

function loadManifest(p: string): Manifest {
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  return ManifestSchema.parse(raw);
}

function loadCorpus(rawDir: string): FlatEmail[] {
  return fs
    .readdirSync(rawDir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => {
      const raw = JSON.parse(fs.readFileSync(path.join(rawDir, f), 'utf8'));
      return normalizeRawEmail(raw);
    });
}

function hashManifest(m: Manifest): string {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({ ...m, generated_at: '' }))
    .digest('hex')
    .slice(0, 16);
}

export async function build(opts: BuildOptions): Promise<void> {
  const manifest = loadManifest(opts.manifestPath);
  const corpus = loadCorpus(opts.rawDir);

  if (fs.existsSync(opts.outDb)) fs.unlinkSync(opts.outDb);
  const db = new Database(opts.outDb);

  // runMigrations also loads sqlite-vec internally (see runner.ts)
  runMigrations(db, allMigrations);

  const insertEmail = db.prepare(`
    INSERT INTO emails (account_id, gmail_message_id, thread_id, from_addr, from_name, from_email,
                        to_addr, subject, date, body, snippet, label_ids, fetched_at)
    VALUES (@account_id, @gmail_message_id, @thread_id, @from_addr, @from_name, @from_email,
            @to_addr, @subject, @date, @body, @snippet, @label_ids, @fetched_at)
  `);

  const insertParsed = db.prepare(`
    INSERT INTO parsed_results (account_id, gmail_message_id, parse_type, parser_version, result_json, parsed_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    for (const email of corpus) {
      const offset = manifest.offsets[email.threadId];
      if (offset === undefined) {
        throw new Error(`manifest missing offset for threadId=${email.threadId}`);
      }
      const shiftedDate = shiftIsoDate(email.date, offset.offsetDays);
      const shiftedBody = shiftBodyDates(email.body ?? '', offset.offsetDays);
      const shiftedSubject = shiftBodyDates(email.subject ?? '', offset.offsetDays);

      // Build combined anonymization map: vessels + charterers + brokers (body/subject)
      const bodyMap: Record<string, string> = {
        ...manifest.anonymization.vessels,
        ...manifest.anonymization.charterers,
        ...manifest.anonymization.brokers,
      };
      const anonBody = applyAnonymization(shiftedBody, bodyMap);
      const anonSubject = applyAnonymization(shiftedSubject, bodyMap);

      // from_name: direct lookup in brokers map (case-insensitive key match)
      const fromNameRaw = email.fromName ?? '';
      const brokerKey = Object.keys(manifest.anonymization.brokers).find(
        (k) => k.toLowerCase() === fromNameRaw.toLowerCase(),
      );
      const anonFromName = brokerKey
        ? manifest.anonymization.brokers[brokerKey]
        : fromNameRaw;

      // from_email: direct lookup in sender_emails map
      const fromEmailRaw = email.fromEmail ?? '';
      const anonFromEmail =
        manifest.anonymization.sender_emails[fromEmailRaw] ?? fromEmailRaw;

      // Leak validation (Task 16)
      const forbidden = opts.forbiddenSubstrings ?? [];
      for (const needle of forbidden) {
        for (const [field, value] of [
          ['body', anonBody],
          ['subject', anonSubject],
          ['from_name', anonFromName],
          ['from_email', anonFromEmail],
        ] as [string, string][]) {
          if (value.includes(needle)) {
            throw new Error(
              `anonymization leak in ${email.threadId} (${field}): "${needle}" still present after replacement`,
            );
          }
        }
      }

      insertEmail.run({
        account_id: 'demo',
        gmail_message_id: email.messageId,
        thread_id: email.threadId,
        from_addr: anonFromEmail,
        from_name: anonFromName,
        from_email: anonFromEmail,
        to_addr: '',
        subject: anonSubject,
        date: shiftedDate,
        body: anonBody,
        snippet: anonBody.slice(0, 200),
        label_ids: '[]',
        fetched_at: manifest.generated_at,
      });

      // Populate parsed_results using regex-based extractFacts (LLM-free)
      const facts = extractFacts({
        threadId: email.threadId,
        messageId: email.messageId,
        fromName: anonFromName,
        fromEmail: anonFromEmail,
        subject: anonSubject,
        date: shiftedDate,
        body: anonBody,
      });

      // Always insert classify row
      insertParsed.run('demo', email.messageId, 'classify', PARSER_VERSION,
        JSON.stringify({ category: facts.category }), manifest.generated_at);

      // Insert category-specific row if relevant dates extracted
      if (facts.category === 'cargo' && (facts.laycanStart || facts.laycanEnd)) {
        insertParsed.run('demo', email.messageId, 'cargo', PARSER_VERSION,
          JSON.stringify({
            laycan: facts.laycanStart && facts.laycanEnd
              ? { start: facts.laycanStart.toISOString(), end: facts.laycanEnd.toISOString() }
              : null,
          }),
          manifest.generated_at);
      } else if (facts.category === 'vessel' && facts.openDate) {
        insertParsed.run('demo', email.messageId, 'vessel', PARSER_VERSION,
          JSON.stringify({ openDate: facts.openDate.toISOString() }),
          manifest.generated_at);
      }
    }

    db.prepare(
      'INSERT INTO demo_seed_meta (id, frozen_date, manifest_hash) VALUES (1, ?, ?)',
    ).run(manifest.frozenDate, hashManifest(manifest));
  });

  tx();
  db.close();
}

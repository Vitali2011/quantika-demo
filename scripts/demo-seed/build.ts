// scripts/demo-seed/build.ts
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import Database from 'better-sqlite3';
import { runMigrations } from '@/lib/migrations/runner';
import { allMigrations } from '@/lib/migrations/index';
import { ManifestSchema, type Manifest } from './manifest-schema';
import { normalizeRawEmail, type FlatEmail } from './analyze';

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

  const tx = db.transaction(() => {
    for (const email of corpus) {
      const offset = manifest.offsets[email.threadId];
      if (offset === undefined) {
        throw new Error(`manifest missing offset for threadId=${email.threadId}`);
      }
      const shiftedDate = shiftIsoDate(email.date, offset.offsetDays);
      const shiftedBody = shiftBodyDates(email.body ?? '', offset.offsetDays);
      const shiftedSubject = shiftBodyDates(email.subject ?? '', offset.offsetDays);

      insertEmail.run({
        account_id: 'demo',
        gmail_message_id: email.messageId,
        thread_id: email.threadId,
        from_addr: email.fromEmail ?? '',
        from_name: email.fromName ?? '',
        from_email: email.fromEmail ?? '',
        to_addr: '',
        subject: shiftedSubject,
        date: shiftedDate,
        body: shiftedBody,
        snippet: shiftedBody.slice(0, 200),
        label_ids: '[]',
        fetched_at: manifest.generated_at,
      });
    }

    db.prepare(
      'INSERT INTO demo_seed_meta (id, frozen_date, manifest_hash) VALUES (1, ?, ?)',
    ).run(manifest.frozenDate, hashManifest(manifest));
  });

  tx();
  db.close();
}

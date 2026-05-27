// scripts/demo-seed/build.ts
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import Database from 'better-sqlite3';
import { runMigrations } from '@/lib/migrations/runner';
import { allMigrations } from '@/lib/migrations/index';
import { ManifestSchema, type Manifest } from './manifest-schema';
import { normalizeRawEmail, type FlatEmail } from './analyze';

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
      // Phase 1 — write unshifted email (date shift applied in Task 14)
      insertEmail.run({
        account_id: 'demo',
        gmail_message_id: email.messageId,
        thread_id: email.threadId,
        from_addr: email.fromEmail ?? '',
        from_name: email.fromName ?? '',
        from_email: email.fromEmail ?? '',
        to_addr: '',
        subject: email.subject ?? '',
        date: email.date,
        body: email.body,
        snippet: email.body.slice(0, 200),
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

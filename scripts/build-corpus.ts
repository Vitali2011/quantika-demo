/**
 * Build ETMS corpus from raw Gmail thread JSON files.
 *
 * Usage:
 *   tsx scripts/build-corpus.ts
 *
 * Reads:  .private/raw-emails/*.json   (each file = one RawThread)
 * Writes: .private/etms-corpus.json    (Email[] pretty JSON)
 */

import fs from 'fs';
import path from 'path';
import { buildCorpusFromThreads, RawThread } from '../lib/corpus/build';

const RAW_EMAILS_DIR = path.resolve(process.cwd(), '.private', 'raw-emails');
const OUTPUT_FILE = path.resolve(process.cwd(), '.private', 'etms-corpus.json');

export async function run(): Promise<void> {
  // Guard: directory must exist and contain at least one JSON file
  if (!fs.existsSync(RAW_EMAILS_DIR)) {
    console.error('run npm run import:emails first');
    process.exit(1);
  }

  const files = fs
    .readdirSync(RAW_EMAILS_DIR)
    .filter((f) => f.endsWith('.json'));

  if (files.length === 0) {
    console.error('run npm run import:emails first');
    process.exit(1);
  }

  // Load all thread files
  const threads: RawThread[] = [];
  for (const file of files) {
    const fullPath = path.join(RAW_EMAILS_DIR, file);
    try {
      const raw = fs.readFileSync(fullPath, 'utf-8');
      const thread = JSON.parse(raw) as RawThread;
      threads.push(thread);
    } catch (err) {
      console.warn(`Warning: failed to parse ${file}: ${(err as Error).message}`);
    }
  }

  // Build corpus
  const emails = buildCorpusFromThreads(threads);

  // Write output (pretty 2-space JSON)
  const outputDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(emails, null, 2), 'utf-8');

  console.log(`Built corpus: ${emails.length} emails → ${OUTPUT_FILE}`);
}

// Run when invoked directly (not imported in tests)
if (require.main === module) {
  run().catch((err: unknown) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

#!/usr/bin/env tsx
/**
 * scripts/import-gmail-emails.ts
 *
 * Incrementally downloads Gmail threads tagged with `_ ETMS - Management`
 * and writes each thread as a raw JSON file to `.private/raw-emails/<threadId>.json`.
 *
 * Usage:
 *   tsx scripts/import-gmail-emails.ts [--dry-run] [--limit N] [--since YYYY-MM-DD] [--force]
 *
 * Flags:
 *   --dry-run        Print what would be fetched, write nothing.
 *   --limit N        Stop after N threads.
 *   --since DATE     Only fetch threads after this date (YYYY-MM-DD).
 *   --force          Overwrite existing files (default: skip).
 *
 * Auth:
 *   Reads OAuth creds and refresh_token via scripts/lib/oauth-shared.ts.
 *   If refresh_token is missing, exits with instructions.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { gmail_v1 } from 'googleapis';
import { loadOAuthCredentials, loadRefreshToken, createGmailClient } from './lib/oauth-shared';
import {
  shouldSkipThread,
  buildLabelQuery,
  withBackoff,
  threadFilePath,
} from './lib/import-helpers';

const LABEL_NAME = '_ ETMS - Management';
const OUTPUT_DIR = path.resolve(process.cwd(), '.private/raw-emails');

// ── Parse CLI flags (no yargs/commander — simple argv) ─────────────────────

function parseArgs(argv: string[]): {
  dryRun: boolean;
  limit: number | null;
  since: string | undefined;
  force: boolean;
} {
  const dryRun = argv.includes('--dry-run');
  const force = argv.includes('--force');

  let limit: number | null = null;
  const limitIdx = argv.indexOf('--limit');
  if (limitIdx !== -1 && argv[limitIdx + 1]) {
    const parsed = parseInt(argv[limitIdx + 1], 10);
    if (!isNaN(parsed) && parsed > 0) limit = parsed;
  }

  let since: string | undefined;
  const sinceIdx = argv.indexOf('--since');
  if (sinceIdx !== -1 && argv[sinceIdx + 1]) {
    since = argv[sinceIdx + 1];
  }

  return { dryRun, limit, since, force };
}

// ── Main ───────────────────────────────────────────────────────────────────

export interface RunOptions {
  dryRun: boolean;
  limit: number | null;
  since: string | undefined;
  force: boolean;
  outputDir?: string;
  /** Injectable Gmail client (for tests). If provided, skips OAuth credential loading. */
  gmailClient?: gmail_v1.Gmail;
}

export async function run(opts: RunOptions): Promise<{ written: number; skipped: number; errors: number }> {
  const { dryRun, limit, since, force } = opts;
  const outputDir = opts.outputDir ?? OUTPUT_DIR;

  let gmail: gmail_v1.Gmail;
  if (opts.gmailClient) {
    gmail = opts.gmailClient;
  } else {
    // Fail fast: load credentials
    let refreshToken: string;
    try {
      refreshToken = loadRefreshToken();
      if (!refreshToken) {
        throw new Error('empty');
      }
    } catch {
      console.error(
        '❌  refresh_token not found.\n' +
          '   Run `npm run setup:gmail-oauth` to authenticate and store your token.',
      );
      process.exit(1);
    }
    const creds = loadOAuthCredentials();
    gmail = createGmailClient(creds, refreshToken!);
  }

  // Ensure output directory exists
  if (!dryRun) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const query = buildLabelQuery(LABEL_NAME, since);
  console.log(`🔍  Gmail query: ${query}`);
  if (dryRun) console.log('   [--dry-run mode — no files will be written]');

  // ── Pagination: collect all thread stubs ──────────────────────────────────
  const allThreadStubs: Array<{ id: string; snippet?: string; historyId?: string }> = [];
  let pageToken: string | undefined;

  do {
    const response = await withBackoff(() =>
      gmail.users.threads.list({
        userId: 'me',
        q: query,
        ...(pageToken ? { pageToken } : {}),
      }),
    );

    const { threads = [], nextPageToken } = response.data;
    allThreadStubs.push(...(threads as typeof allThreadStubs));
    pageToken = nextPageToken ?? undefined;

    // Honour --limit during collection too (avoid huge fetches)
    if (limit !== null && allThreadStubs.length >= limit) break;
  } while (pageToken);

  const stubs = limit !== null ? allThreadStubs.slice(0, limit) : allThreadStubs;
  console.log(`📬  Found ${stubs.length} thread(s) to process.`);

  // ── Per-thread fetch & write ──────────────────────────────────────────────
  let skipped = 0;
  let written = 0;
  let errors = 0;

  for (const stub of stubs) {
    const { id } = stub;
    const filePath = threadFilePath(outputDir, id);

    if (shouldSkipThread(filePath, force)) {
      console.log(`  skip: ${id}`);
      skipped++;
      continue;
    }

    if (dryRun) {
      console.log(`  [dry-run] would fetch: ${id}`);
      continue;
    }

    try {
      const threadResponse = await withBackoff(() =>
        gmail.users.threads.get({
          userId: 'me',
          id,
          format: 'full',
        }),
      );

      const threadData = threadResponse.data;
      fs.writeFileSync(filePath, JSON.stringify(threadData, null, 2), 'utf-8');
      console.log(`  ✅  wrote: ${id}`);
      written++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ⚠️  error fetching thread ${id}: ${msg}`);
      errors++;
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(
    `\nDone. written=${written} skipped=${skipped} errors=${errors}${dryRun ? ' (dry-run)' : ''}`,
  );

  return { written, skipped, errors };
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const { errors } = await run(opts);
  if (errors > 0) process.exit(1);
}

// Only run main() when executed directly (not when imported by tests).
// Detection: in Node/tsx the entry file's import.meta.url matches process.argv[1].
// In Jest (CommonJS transform), require.main === module serves the same purpose.
if (require.main === module) {
  main().catch((err: unknown) => {
    console.error('Fatal:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}

/**
 * β-15 / βf-10: cron entrypoint for nightly auto pre-quote pipeline.
 *
 * Invoked once per night (e.g. systemd timer at 03:00 server local).
 * Single-shot — does not use setInterval. Exits 0 on success, 1 on fatal
 * error. Per-email errors are reported in the JSON payload but do not
 * cause non-zero exit (they're isolated by design).
 *
 * Usage:
 *   node scripts/auto-prequote-cron.ts            # real Gmail flow
 *   node scripts/auto-prequote-cron.ts --demo     # sample cargo fixtures
 *   AUTO_PREQUOTE_DEMO=1 node scripts/auto-prequote-cron.ts
 *
 * βf-10: --demo wires sample cargo emails from
 * `lib/sample-data/cargo-inquiries.json` (the canonical fixture set; the
 * spec referenced an earlier path `cargo-emails-v2/` that was renamed
 * before merge — same data, current location). Without --demo, the
 * existing fetcher (default empty / Gmail when wired) is used and the
 * prod path is unchanged.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  runAutoPrequote,
  type AutoPrequoteResult,
  type RunOptions,
} from '../lib/auto-prequote/pipeline';
import {
  setEmailFetcher,
  type PendingEmail,
} from '../lib/auto-prequote/queue';

interface SampleCargoEmail {
  id: string;
  from: string;
  fromEmail?: string;
  subject: string;
  body: string;
}

/**
 * Load fixture cargo inquiries and project them onto the PendingEmail shape
 * expected by the pipeline. Read-only — fixture file is untouched.
 */
export function loadDemoEmails(): PendingEmail[] {
  const fixturePath = path.join(
    __dirname,
    '..',
    'lib',
    'sample-data',
    'cargo-inquiries.json',
  );
  if (!fs.existsSync(fixturePath)) return [];
  const raw = JSON.parse(
    fs.readFileSync(fixturePath, 'utf-8'),
  ) as SampleCargoEmail[];
  return raw.map((e) => ({
    id: e.id,
    from: e.from,
    subject: e.subject,
    body: e.body,
  }));
}

export interface CronOptions extends RunOptions {
  demo?: boolean;
}

/**
 * Programmatic cron entry — used by tests and the CLI wrapper below.
 * When `demo` is truthy (or AUTO_PREQUOTE_DEMO=1), the email fetcher is
 * wired to load fixture cargo inquiries; otherwise the currently-configured
 * fetcher is left alone (preserving prod Gmail flow).
 */
export async function runAutoPrequoteCron(
  opts: CronOptions = {},
): Promise<AutoPrequoteResult> {
  const demo = Boolean(opts.demo) || process.env.AUTO_PREQUOTE_DEMO === '1';
  if (demo) {
    const emails = loadDemoEmails();
    setEmailFetcher(async () => emails);
  }
  const { demo: _demoIgnored, ...runOpts } = opts;
  return runAutoPrequote(runOpts);
}

// CLI entry — only run when invoked directly (skip during test imports).
if (require.main === module) {
  const demoFlag = process.argv.includes('--demo');
  runAutoPrequoteCron({ demo: demoFlag })
    .then((result) => {
      console.log(JSON.stringify(result));
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

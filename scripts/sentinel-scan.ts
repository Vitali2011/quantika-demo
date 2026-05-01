#!/usr/bin/env tsx
/**
 * β-09: Sanction Sentinel CLI entry point.
 *
 *   tsx scripts/sentinel-scan.ts --mode=cron
 *   tsx scripts/sentinel-scan.ts --mode=event --since=2026-04-29T00:00:00Z
 *
 * Logging — structured JSON (each line is a self-contained record).
 * Exit codes:
 *   0 — scan succeeded (even on 0 alerts)
 *   1 — error during scan
 */

import { scanActiveDeals, type ActiveDeal } from '@/lib/sanctions/sentinel';

interface CliArgs {
  mode: 'cron' | 'event';
  since?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = { mode: 'cron' };
  for (const a of argv.slice(2)) {
    const m = /^--([^=]+)=(.*)$/.exec(a);
    if (!m) continue;
    const [, key, val] = m;
    if (key === 'mode') {
      if (val === 'cron' || val === 'event') out.mode = val;
    } else if (key === 'since') {
      out.since = val;
    }
  }
  return out;
}

function log(record: Record<string, unknown>): void {
  process.stdout.write(JSON.stringify({ ts: new Date().toISOString(), ...record }) + '\n');
}

/**
 * Default deals provider — returns []. Wire to your real deals module:
 *   import { listActiveDeals } from '@/lib/deals';
 */
async function defaultDealsProvider(): Promise<ActiveDeal[]> {
  return [];
}

export async function main(argv: string[] = process.argv): Promise<number> {
  const args = parseArgs(argv);
  log({ event: 'sentinel.start', mode: args.mode, since: args.since });

  try {
    const alerts = await scanActiveDeals({
      source: args.mode === 'cron' ? 'cron' : 'event-driven',
      since: args.since,
      dealsProvider: defaultDealsProvider,
      dispatch: true,
    });
    log({
      event: 'sentinel.complete',
      alertCount: alerts.length,
      bySeverity: alerts.reduce<Record<string, number>>((acc, a) => {
        acc[a.severity] = (acc[a.severity] ?? 0) + 1;
        return acc;
      }, {}),
    });
    return 0;
  } catch (err) {
    log({
      event: 'sentinel.error',
      error: err instanceof Error ? err.message : String(err),
    });
    return 1;
  }
}

// Only auto-run when invoked directly, not when imported by tests.
const isDirectInvocation =
  typeof require !== 'undefined' &&
  typeof module !== 'undefined' &&
  require.main === module;

if (isDirectInvocation) {
  main().then((code) => process.exit(code));
}

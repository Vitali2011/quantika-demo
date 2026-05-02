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
 *
 * βf-08: defaultDealsProvider now loads from `@/lib/sample-data/deals`
 * (or, when `SENTINEL_DEALS_DB` env var is set, from a SQLite path —
 * left as a stub for future DB wiring). Previously hardcoded `return [];`
 * which made the scanner always report 0 deals processed.
 */

import {
  scanActiveDeals,
  type ActiveDeal,
  type SentinelAlert,
} from '@/lib/sanctions/sentinel';
import { sampleDeals } from '@/lib/sample-data/deals';

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
 * Default deals provider.
 *
 * - If `SENTINEL_DEALS_DB` is set, callers should wire a DB loader here
 *   (deferred to a future spec — kept as a thin guard so prod can opt in
 *   without code changes).
 * - Otherwise, falls back to the in-repo `sampleDeals` fixture so the
 *   scanner always has something to scan in dev / CI / demo runs.
 */
export async function defaultDealsProvider(): Promise<ActiveDeal[]> {
  if (process.env.SENTINEL_DEALS_DB) {
    // Future: load from SQLite at process.env.SENTINEL_DEALS_DB.
    // For now, behave as if the DB is empty so prod doesn't accidentally
    // scan demo fixtures when an explicit DB path is configured.
    return [];
  }
  return sampleDeals;
}

export interface RunSentinelScanOptions {
  mode?: 'cron' | 'event';
  since?: string;
  dealsProvider?: () => ActiveDeal[] | Promise<ActiveDeal[]>;
  dispatch?: boolean;
}

export interface RunSentinelScanResult {
  alerts: SentinelAlert[];
  processedDealsCount: number;
}

/**
 * Library-style entry used by tests and other modules. Returns both the
 * generated alerts and the number of deals actually processed (so a
 * `0 alerts` outcome can be distinguished from a `0 deals scanned` one).
 */
export async function runSentinelScan(
  opts: RunSentinelScanOptions = {},
): Promise<RunSentinelScanResult> {
  const provider = opts.dealsProvider ?? defaultDealsProvider;
  const deals = await provider();
  const alerts = await scanActiveDeals({
    source: opts.mode === 'event' ? 'event-driven' : 'cron',
    since: opts.since,
    dealsProvider: () => deals, // pre-resolved so we can count below
    dispatch: opts.dispatch ?? false,
  });
  return { alerts, processedDealsCount: deals.length };
}

export async function main(argv: string[] = process.argv): Promise<number> {
  const args = parseArgs(argv);
  log({ event: 'sentinel.start', mode: args.mode, since: args.since });

  try {
    const { alerts, processedDealsCount } = await runSentinelScan({
      mode: args.mode,
      since: args.since,
      dispatch: true,
    });
    log({
      event: 'sentinel.complete',
      processedDealsCount,
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

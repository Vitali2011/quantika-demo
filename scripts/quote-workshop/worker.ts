/**
 * Standalone quote-workshop worker. Runs OUTSIDE the Next.js runtime (no NEXT_RUNTIME).
 * Serial drain: claims one job, calls callClaudeCliRaw (blocking spawnSync), notifies Next, repeat.
 * Exits when queue is empty.
 */
import type Database from 'better-sqlite3';
import { getStore } from '@/lib/session-store';
import { callClaudeCliRaw } from '@/lib/ai-provider';
import { claimNextJob, completeJob, failJob, reapStaleJobs, heartbeatJob } from '@/lib/quote-jobs/store';
import { buildQuotePrompt } from '@/lib/quote-jobs/prompt';
import { getMatch } from '@/lib/matching/matches-repository';
import { isRagEnabled } from '@/lib/knowledge/flags';
import { today } from '@/lib/clock';
import type { ParsedCargo } from '@/lib/types';

/**
 * #1034: a multi-cargo email yields several parsedCargos that share one emailId,
 * distinguished only by itemIndex. Resolving by emailId ALONE returns item 0
 * regardless of which item the match is for. Mirror the (emailId|itemIndex)
 * keying used by persist-session-matches.ts:50 and app/match/[id]/page.tsx:85 —
 * read the target item index from the job's match (migration 049 stores match_id).
 */
export function selectParsedCargo(
  db: Database.Database,
  session: { parsedCargos?: ParsedCargo[] } | null | undefined,
  job: { email_id: string; match_id: string | null },
): ParsedCargo | undefined {
  let targetItemIndex = 0;
  if (job.match_id && /^[0-9]+$/.test(job.match_id)) {
    const m = getMatch(db, Number(job.match_id));
    if (m?.cargo_item_index != null) targetItemIndex = m.cargo_item_index;
  }
  return (session?.parsedCargos ?? []).find(
    (r) => r.emailId === job.email_id && r.itemIndex === targetItemIndex,
  );
}

const MODEL = process.env.DRAFT_QUOTE_CLI_MODEL ?? 'claude-sonnet-4-6';
const BUDGET = Number(process.env.DRAFT_QUOTE_CLI_BUDGET_USD) || 0.20;
const INTERNAL_URL = process.env.INTERNAL_EVENT_URL ?? 'http://127.0.0.1:3000/api/internal/quote-event';
const TTL_MS = Number(process.env.QUOTE_JOB_TTL_MS) || 300_000;

async function notify(sessionId: string, job: { id: string; status: string; email_id: string; result?: string; error?: string }) {
  try {
    await fetch(INTERNAL_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-internal-token': process.env.INTERNAL_EVENT_TOKEN ?? '' },
      body: JSON.stringify({ sessionId, job }),
    });
  } catch (e) {
    console.warn('[quote-worker] SSE notify failed (UI will fall back to polling):', e);
  }
}

async function main() {
  const store = getStore();
  const db = store.getDb();
  reapStaleJobs(db, TTL_MS);

  for (;;) {
    const job = claimNextJob(db);
    if (!job) break;

    const session = store.getSession(job.session_id);
    const parsedCargo = selectParsedCargo(db, session, job);
    if (!parsedCargo) {
      failJob(db, job.id, 'session or parsed cargo no longer available');
      await notify(job.session_id, { id: job.id, status: 'error', email_id: job.email_id, error: 'session expired' });
      continue;
    }
    const email = (session?.emails ?? []).find((e: { id: string }) => e.id === job.email_id);

    // Heartbeat: callClaudeCliRaw blocks the event loop (spawnSync). Start a background
    // heartbeat using setInterval BEFORE the call so updated_at stays fresh during long runs.
    // The interval runs in the background Node timer queue but the spawnSync prevents it from
    // firing. We use a workaround: run heartbeat after the call if the call succeeds quickly,
    // or accept that spawnSync blocks it. For extra safety, we also heartbeat before the call.
    heartbeatJob(db, job.id);

    try {
      // #1018: anchor the quote to the demo-frozen (or live real) date via lib/clock.today.
      // Runs outside the Next runtime; if the demo seed is unavailable, degrade to no
      // anchor rather than crashing the quote.
      let nowIso: string | undefined;
      try { nowIso = today(); } catch (e) { console.warn('[quote-worker] demo clock unavailable; quote omits date anchor:', e); }
      const { system, user } = await buildQuotePrompt({ parsedCargo, email, ragEnabled: isRagEnabled(), matchId: job.match_id ?? undefined, db, nowIso });
      // NOTE: callClaudeCliRaw is synchronous (spawnSync) and will block the event loop.
      // Heartbeat before and after is the best we can do without async subprocess.
      const { text } = callClaudeCliRaw(system, user, MODEL, { maxBudgetUsd: BUDGET, timeoutMs: 85_000 });
      heartbeatJob(db, job.id);
      completeJob(db, job.id, text);
      await notify(job.session_id, { id: job.id, status: 'done', email_id: job.email_id, result: text });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'claude CLI failed';
      failJob(db, job.id, msg);
      await notify(job.session_id, { id: job.id, status: 'error', email_id: job.email_id, error: 'Quote generation failed — please retry.' });
    }
  }
}

// Entry guard: `npm run quote:workshop` (tsx) drains the queue; under jest
// (NODE_ENV=test) the module is imported to unit-test selectParsedCargo, so we
// must NOT spawn the drain loop / process.exit on import.
if (process.env.NODE_ENV !== 'test') {
  main().then(() => process.exit(0)).catch((e) => { console.error('[quote-worker] fatal:', e); process.exit(1); });
}

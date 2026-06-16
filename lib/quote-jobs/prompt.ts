import type Database from 'better-sqlite3';
import { DRAFT_QUOTE_SYSTEM_PROMPT } from '@/lib/prompts';
import { resolveSenderName } from '@/lib/utils/resolve-sender-name';
import { buildMatchQuoteContext } from './match-context';

interface BuildArgs {
  parsedCargo: { emailId: string; cargoType?: string; cargoDescription?: unknown };
  email?: { id: string; from?: string | null; fromName?: string | null; subject?: string | null; body?: string | null };
  ragEnabled: boolean;
  /** When provided, appends a MATCH ECONOMICS block to the user prompt with real numbers. */
  matchId?: string;
  /** Database instance needed to resolve match numbers (required when matchId is set). */
  db?: Database.Database;
  /** Frozen "today" ISO date (YYYY-MM-DD). When set, anchors the quote's temporal reasoning (#1018). */
  nowIso?: string;
}

export async function buildQuotePrompt({ parsedCargo, email, ragEnabled, matchId, db, nowIso }: BuildArgs): Promise<{ system: string; user: string }> {
  const fromName = resolveSenderName({ fromName: email?.fromName, from: email?.from });

  const ragContextParts: string[] = [];
  if (ragEnabled) {
    const cargoDesc = (() => {
      const d = parsedCargo.cargoDescription;
      if (!d) return '';
      if (typeof d === 'object' && 'value' in (d as object)) return String((d as { value: unknown }).value) || '';
      return String(d);
    })();
    const query = `${parsedCargo.cargoType || ''} ${cargoDesc}`.trim() || 'bulk cargo safety stowage';
    const [{ retrieve }, { getDb }] = await Promise.all([
      import('@/lib/knowledge/embeddings/retriever'),
      import('@/lib/db'),
    ]);
    const db = getDb();
    try {
      const imsbc = await retrieve(`IMSBC ${query}`, { vectorTable: 'imsbc_vec', ftsTable: 'imsbc_fts', topN: 3, db });
      if (imsbc.length) ragContextParts.push('=== IMSBC Cargo Safety Context ===',
        ...imsbc.map(c => `[IMSBC-${c.metadata?.id ?? c.chunkId}] ${c.content}`), '===================================');
    } catch (e) { console.warn('[quote-prompt] IMSBC RAG failed:', e); }
    try {
      const igc = await retrieve(`IGC grain gas ${query}`, { vectorTable: 'igc_vec', ftsTable: 'igc_fts', topN: 3, db });
      if (igc.length) ragContextParts.push('=== IGC Grain/Gas Cargo Context ===',
        ...igc.map(c => `[IGC-${c.metadata?.id ?? c.chunkId}] ${c.content}`), '====================================');
    } catch (e) { console.warn('[quote-prompt] IGC RAG failed:', e); }
  }

  const baseSystem = ragContextParts.length
    ? `${DRAFT_QUOTE_SYSTEM_PROMPT}\n\n${ragContextParts.join('\n')}`
    : DRAFT_QUOTE_SYSTEM_PROMPT;
  // #1018: anchor temporal reasoning to a known "today" so the LLM stops calling fresh
  // future laycans "elapsed". In demo this is the frozen date; in live it is real today
  // (resolved by the caller via lib/clock.today). Injected into system only — the user
  // prompt stays byte-stable for the frozen-template snapshot (PI3).
  const system = nowIso
    ? `${baseSystem}\n\nCURRENT DATE: ${nowIso}. Treat this as "today" for all temporal reasoning. Do NOT describe a laycan on or after ${nowIso} as elapsed, expired, or past — those dates are in the future.`
    : baseSystem;

  let user = `
Parsed cargo inquiry data:
${JSON.stringify(parsedCargo, null, 2)}

Original email:
From: ${email?.from || ''}
Subject: ${email?.subject || ''}
Body: ${email?.body?.slice(0, 1500) || ''}

Address the reply to: ${fromName}

Generate a professional draft quote email.`;

  // Append match economics block when matchId + db are available.
  // System prompt (DRAFT_QUOTE_SYSTEM_PROMPT) is not edited — its [RATE TO BE CONFIRMED]
  // literal is suppressed by the block's own instruction when an offered rate is present.
  if (matchId && db) {
    const ctx = await buildMatchQuoteContext(db, matchId);
    if (ctx) {
      user = user + '\n\n' + ctx.block;
    }
  }

  return { system, user };
}

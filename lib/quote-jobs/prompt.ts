import { DRAFT_QUOTE_SYSTEM_PROMPT } from '@/lib/prompts';
import { resolveSenderName } from '@/lib/utils/resolve-sender-name';

interface BuildArgs {
  parsedCargo: { emailId: string; cargoType?: string; cargoDescription?: unknown };
  email?: { id: string; from?: string; fromName?: string; subject?: string; body?: string };
  ragEnabled: boolean;
}

export async function buildQuotePrompt({ parsedCargo, email, ragEnabled }: BuildArgs): Promise<{ system: string; user: string }> {
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

  const system = ragContextParts.length
    ? `${DRAFT_QUOTE_SYSTEM_PROMPT}\n\n${ragContextParts.join('\n')}`
    : DRAFT_QUOTE_SYSTEM_PROMPT;

  const user = `
Parsed cargo inquiry data:
${JSON.stringify(parsedCargo, null, 2)}

Original email:
From: ${email?.from || ''}
Subject: ${email?.subject || ''}
Body: ${email?.body?.slice(0, 1500) || ''}

Address the reply to: ${fromName}

Generate a professional draft quote email.`;

  return { system, user };
}

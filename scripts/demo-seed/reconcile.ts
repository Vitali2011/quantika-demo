// scripts/demo-seed/reconcile.ts
import * as fs from 'fs';
import * as path from 'path';
import { cfValue } from '@/lib/types';
import { callAiText, extractJson } from '@/lib/ai-provider';
import { corpusHash, loadLlmCacheIfAny, type LlmCache } from './llm-cache';
import type { Manifest } from './manifest-schema';
import { readReconcileCache, writeReconcileCache } from './reconcile-cache';

const DEFAULT_RAW = '.private/raw-emails';
const RECONCILE_TIMEOUT_MS = 120_000;

export type EntityKind = 'vessel' | 'charterer' | 'broker' | 'sender_email';

export interface EntityMention {
  kind: EntityKind;
  raw: string;
  emailId: string;
}

export interface ReconcileGroup {
  kind: EntityKind;
  canonical: string;
  aliases: string[];
}

export interface ReconcileResult {
  anonymization: Manifest['anonymization'];
  canonical: Record<string, string>; // raw -> canonical
  conflicts: string[];
}

const PSEUDO_PREFIX: Record<EntityKind, (n: number) => string> = {
  vessel: (n) => `M/V SEAGULL ${n}`,
  charterer: (n) => `GRAIN TRADER ${String.fromCharCode(64 + n)}`, // 1 -> A
  broker: (n) => (n === 1 ? 'DEMO BROKER' : `DEMO BROKER ${n}`),
  sender_email: (n) => `broker${n === 1 ? '' : n}@demo.local`,
};

function pushIf(arr: EntityMention[], kind: EntityKind, raw: unknown, emailId: string): void {
  const v = typeof raw === 'string' ? raw.trim() : '';
  if (v) arr.push({ kind, raw: v, emailId });
}

export function collectMentions(cache: LlmCache): EntityMention[] {
  const out: EntityMention[] = [];
  for (const v of cache.parsedVessels) pushIf(out, 'vessel', cfValue(v.vesselName), v.emailId);
  for (const r of cache.parsedFixtureRecaps) {
    pushIf(out, 'vessel', cfValue(r.vesselName), r.emailId);
    pushIf(out, 'charterer', cfValue(r.charterers), r.emailId);
    pushIf(out, 'charterer', cfValue(r.account), r.emailId);
    pushIf(out, 'broker', r.broker, r.emailId);
  }
  for (const c of cache.classifications) {
    pushIf(out, 'charterer', c.originalSenderCompany, c.emailId);
  }
  return out;
}

export function buildReconcilePrompt(mentions: EntityMention[]): { system: string; user: string } {
  const system = [
    'You are a maritime-data reconciliation assistant.',
    'You are given a list of entity name MENTIONS extracted from many shipping emails.',
    'Group mentions that refer to the SAME real-world entity (same vessel / same company), tolerating spelling, punctuation, and abbreviation differences (e.g. "M/V SPRING WIND" == "SPRING WIND" == "MV SPRINGWIND").',
    'Pick ONE canonical form per group (the most complete real name seen).',
    'Flag a conflict ONLY when the same raw string clearly denotes two different entities in different emails.',
    'Return STRICT JSON: {"groups":[{"kind":"vessel|charterer|broker|sender_email","canonical":"<name>","aliases":["<raw>",...]}],"conflicts":["<human-readable>",...]}.',
    'Every input raw string MUST appear in exactly one group\'s aliases. Do not invent names.',
  ].join('\n');
  const user = JSON.stringify({ mentions });
  return { system, user };
}

export function parseReconcileResponse(raw: string, mentions: EntityMention[]): ReconcileResult {
  const parsed = JSON.parse(raw) as { groups: ReconcileGroup[]; conflicts?: string[] };
  const anonymization: Manifest['anonymization'] = { vessels: {}, charterers: {}, brokers: {}, sender_emails: {} };
  const canonical: Record<string, string> = {};

  // Deterministic order: by first appearance of any alias in the mentions list.
  const firstIdx = (g: ReconcileGroup) =>
    Math.min(...g.aliases.map((a) => {
      const i = mentions.findIndex((m) => m.raw === a);
      return i === -1 ? Number.MAX_SAFE_INTEGER : i;
    }));
  const ordered = [...parsed.groups].sort((a, b) => firstIdx(a) - firstIdx(b));

  const counters: Record<EntityKind, number> = { vessel: 0, charterer: 0, broker: 0, sender_email: 0 };
  const bucket: Record<EntityKind, keyof Manifest['anonymization']> = {
    vessel: 'vessels', charterer: 'charterers', broker: 'brokers', sender_email: 'sender_emails',
  };
  for (const g of ordered) {
    counters[g.kind] += 1;
    const pseudo = PSEUDO_PREFIX[g.kind](counters[g.kind]);
    for (const alias of g.aliases) {
      anonymization[bucket[g.kind]][alias] = pseudo;
      canonical[alias] = g.canonical;
    }
  }
  return { anonymization, canonical, conflicts: parsed.conflicts ?? [] };
}

export async function reconcile(opts: { rawDir: string; model?: string }): Promise<ReconcileResult> {
  const cache = loadLlmCacheIfAny(opts.rawDir);
  if (!cache) throw new Error(`[reconcile] no llm-cache for ${opts.rawDir} — run seed:parse first`);
  const mentions = collectMentions(cache);
  const hash = corpusHash(opts.rawDir);

  let rawJson = readReconcileCache(opts.rawDir, hash);
  if (!rawJson) {
    const { system, user } = buildReconcilePrompt(mentions);
    const text = await callAiText('RECONCILE', system, user, {
      timeoutMs: RECONCILE_TIMEOUT_MS,
      model: opts.model ?? 'claude-opus-4-8',
    });
    rawJson = extractJson(text);
    writeReconcileCache(opts.rawDir, hash, rawJson);
  }
  return parseReconcileResponse(rawJson, mentions);
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const get = (k: string) => {
    const i = argv.indexOf(k);
    return i === -1 ? undefined : argv[i + 1];
  };
  const rawDir = path.resolve(get('--raw-dir') ?? DEFAULT_RAW);
  const model = get('--model') ?? 'claude-opus-4-8';
  reconcile({ rawDir, model })
    .then((r) => {
      const out = path.join(rawDir, '.reconcile-cache', 'result.json');
      fs.writeFileSync(out, JSON.stringify(r, null, 2) + '\n');
      console.log(
        `[reconcile] ${Object.keys(r.canonical).length} aliases grouped, ${r.conflicts.length} conflicts. Wrote ${out}`,
      );
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}

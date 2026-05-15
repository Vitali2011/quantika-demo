#!/usr/bin/env -S npx tsx
/**
 * Phase 0 Step 1: Classify 154 ETMS emails via production classify prompt.
 *
 * Uses Bedrock Sonnet 4.6 (Opus 4.7 not activated on this account).
 * Batches 20 emails per call (same as production).
 * Determines applicable_endpoints per email based on classification category.
 *
 * Output: .private/etms-corpus-classified.json
 *
 * Usage:
 *   AI_PROVIDER=bedrock npx tsx --env-file=.env.local scripts/progonq/classify-corpus.ts [--limit N]
 *
 * Env (from .env.local):
 *   AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY  (required)
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { callAiText } from '@/lib/ai-provider';
import { CLASSIFICATION_SYSTEM_PROMPT } from '@/lib/prompts';

const BATCH_SIZE = 20;
const SCOPE = 'CLASSIFY';
const MODEL = 'us.anthropic.claude-sonnet-4-6';
const MAX_BODY_CHARS = 3000;
const CONCURRENCY = 3;

const CORPUS_PATH = path.resolve(process.cwd(), '.private/etms-corpus.json');
const OUT_PATH = path.resolve(process.cwd(), '.private/etms-corpus-classified.json');

interface RawEmail {
  id: string;
  from: string;
  subject: string;
  date: string;
  body: string;
  snippet: string;
}

interface AiClassification {
  id: string;
  category: string;
  urgency: string;
  confidence: number;
  is_unanswered: boolean;
  days_without_reply: number | null;
  original_sender: string | null;
  original_sender_company: string | null;
}

export interface ClassifiedEmail extends RawEmail {
  classification: AiClassification;
  applicable_endpoints: string[];
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max) + '\n[truncated]';
}

function applicableEndpoints(category: string): string[] {
  const eps = ['classify'];
  if (category === 'CARGO_INQUIRY' || category === 'TCT_REQUEST') eps.push('parse-cargo');
  if (category === 'VESSEL_POSITION' || category === 'FIXTURE_RECAP') eps.push('parse-vessel');
  if (category === 'FIXTURE_RECAP') eps.push('parse-recap');
  return eps;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function extractJson(text: string): unknown {
  let s = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const start = s.search(/[{[]/);
  if (start > 0) s = s.slice(start);
  // Find matching closing bracket, ignoring trailing garbage after the JSON
  const opener = s[0];
  if (opener !== '{' && opener !== '[') return JSON.parse(s);
  const closer = opener === '{' ? '}' : ']';
  let depth = 0, inStr = false, esc = false, end = -1;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (esc) { esc = false; continue; }
    if (c === '\\' && inStr) { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === opener) depth++;
    else if (c === closer && --depth === 0) { end = i; break; }
  }
  return JSON.parse(end > 0 ? s.slice(0, end + 1) : s);
}

async function classifyBatch(emails: RawEmail[]): Promise<AiClassification[]> {
  const input = emails.map((e) => ({
    id: e.id,
    subject: e.subject,
    from: e.from,
    date: e.date,
    body_preview: truncate(e.body || e.snippet, MAX_BODY_CHARS),
  }));
  const today = new Date().toISOString().split('T')[0];
  const text = await callAiText(
    SCOPE,
    CLASSIFICATION_SYSTEM_PROMPT,
    `Today's date: ${today}\n\n${JSON.stringify(input)}`,
    { model: MODEL, maxTokens: 4096, timeoutMs: 120_000 },
  );
  const result = extractJson(text) as { classifications: AiClassification[] };
  return result.classifications ?? [];
}

async function main() {
  const limitArg = process.argv.indexOf('--limit');
  const limit = limitArg >= 0 ? parseInt(process.argv[limitArg + 1], 10) : Infinity;

  const corpus: RawEmail[] = JSON.parse(readFileSync(CORPUS_PATH, 'utf-8'));
  const emails = isFinite(limit) ? corpus.slice(0, limit) : corpus;
  console.error(`[classify-corpus] ${emails.length} emails to classify`);

  // Resume from existing output if partial
  const existing: Map<string, ClassifiedEmail> = new Map();
  if (existsSync(OUT_PATH)) {
    const prev: ClassifiedEmail[] = JSON.parse(readFileSync(OUT_PATH, 'utf-8'));
    for (const e of prev) existing.set(e.id, e);
    console.error(`[classify-corpus] resuming — ${existing.size} already classified`);
  }

  const pending = emails.filter((e) => !existing.has(e.id));
  const batches = chunk(pending, BATCH_SIZE);

  let batchIdx = 0;
  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const group = batches.slice(i, i + CONCURRENCY);
    await Promise.all(
      group.map(async (batch) => {
        const n = ++batchIdx;
        let attempt = 0;
        while (attempt < 4) {
          attempt++;
          try {
            const classifications = await classifyBatch(batch);
            const byId = new Map(classifications.map((c) => [c.id, c]));
            for (const email of batch) {
              const cl = byId.get(email.id);
              if (!cl) {
                console.error(`[batch ${n}] WARN: no classification for ${email.id}`);
                continue;
              }
              existing.set(email.id, {
                ...email,
                classification: cl,
                applicable_endpoints: applicableEndpoints(cl.category),
              });
            }
            console.error(`[batch ${n}] ok — ${batch.length} emails (total done: ${existing.size}/${emails.length})`);
            break;
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            const delay = [1000, 5000, 30000][attempt - 1] ?? 60000;
            console.error(`[batch ${n}] attempt ${attempt} ERR: ${msg.slice(0, 120)} — retry in ${delay / 1000}s`);
            if (attempt >= 4) throw err;
            await sleep(delay);
          }
        }
        // Persist after every batch
        const result = emails
          .map((e) => existing.get(e.id))
          .filter((e): e is ClassifiedEmail => !!e);
        writeFileSync(OUT_PATH, JSON.stringify(result, null, 2));
      }),
    );
  }

  const result = emails
    .map((e) => existing.get(e.id))
    .filter((e): e is ClassifiedEmail => !!e);
  writeFileSync(OUT_PATH, JSON.stringify(result, null, 2));

  // Summary
  const counts: Record<string, number> = {};
  const epCounts: Record<string, number> = {};
  for (const e of result) {
    counts[e.classification.category] = (counts[e.classification.category] ?? 0) + 1;
    for (const ep of e.applicable_endpoints) {
      epCounts[ep] = (epCounts[ep] ?? 0) + 1;
    }
  }
  console.error(`\n[classify-corpus] DONE — ${result.length}/${emails.length} classified`);
  console.error('Categories:', JSON.stringify(counts, null, 2));
  console.error('Endpoint coverage:', JSON.stringify(epCounts, null, 2));
  console.error(`Output: ${OUT_PATH}`);
}

if (require.main === module) {
  main().catch((e) => {
    console.error('FATAL', e);
    process.exit(1);
  });
}

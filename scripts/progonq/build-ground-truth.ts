#!/usr/bin/env -S npx tsx
/**
 * Phase 0 Step 2: Build ground truth by running production parsers on
 * applicable emails from the classified corpus.
 *
 * Uses Bedrock Sonnet 4.6 as extractor for each (email, endpoint) pair.
 * Resumable: skips pairs already present in output file.
 *
 * Output: .private/etms-corpus-ground-truth.json
 *   Shape: { [emailId]: { [endpoint]: <parsed output> } }
 *
 * Usage:
 *   AI_PROVIDER=bedrock npx tsx --env-file=.env.local scripts/progonq/build-ground-truth.ts [--endpoint classify] [--limit N]
 *
 * Env (from .env.local):
 *   AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY  (required)
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { callAiText } from '@/lib/ai-provider';
import {
  CLASSIFICATION_SYSTEM_PROMPT,
  CARGO_INQUIRY_PARSER_PROMPT,
  VESSEL_POSITION_PARSER_PROMPT,
  FIXTURE_RECAP_PARSER_PROMPT,
} from '@/lib/prompts';
import type { ClassifiedEmail } from './classify-corpus';

const MODEL = 'us.anthropic.claude-sonnet-4-6';
const MAX_BODY_CHARS = 3000;
const CONCURRENCY = 1;
const REQUEST_DELAY_MS = 500; // spacing between sequential Bedrock calls
const CLASSIFY_BATCH = 20;

const CLASSIFIED_PATH = path.resolve(process.cwd(), '.private/etms-corpus-classified.json');
const OUT_PATH = path.resolve(process.cwd(), '.private/etms-corpus-ground-truth.json');

type Endpoint = 'classify' | 'parse-cargo' | 'parse-vessel' | 'parse-recap';
type GroundTruth = Record<string, Partial<Record<Endpoint, unknown>>>;

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max) + '\n[truncated]';
}

function buildUserPrompt(endpoint: Endpoint, email: ClassifiedEmail): string {
  const header = `From: ${email.from}\nSubject: ${email.subject}\nDate: ${email.date}`;
  switch (endpoint) {
    case 'parse-cargo':
      return `${header}\n\n${truncate(email.body || email.snippet, MAX_BODY_CHARS)}`;
    case 'parse-vessel':
    case 'parse-recap':
      return `${header}\n\n${email.body || email.snippet}`;
    case 'classify':
      // Handled separately via batched classify
      return JSON.stringify({ id: email.id, subject: email.subject, from: email.from, date: email.date, body_preview: truncate(email.body || email.snippet, MAX_BODY_CHARS) });
  }
}

function getSystemPrompt(endpoint: Endpoint): string {
  switch (endpoint) {
    case 'classify':    return CLASSIFICATION_SYSTEM_PROMPT;
    case 'parse-cargo': return CARGO_INQUIRY_PARSER_PROMPT;
    case 'parse-vessel': return VESSEL_POSITION_PARSER_PROMPT;
    case 'parse-recap': return FIXTURE_RECAP_PARSER_PROMPT;
  }
}

function stripFences(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function extractJson(text: string): unknown {
  let s = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const start = s.search(/[{[]/);
  if (start > 0) s = s.slice(start);
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

const SCOPE_MAP: Record<Endpoint, string> = {
  classify: 'CLASSIFY',
  'parse-cargo': 'PARSE_CARGO',
  'parse-vessel': 'PARSE_VESSEL',
  'parse-recap': 'RECAP',
};

async function extractOne(endpoint: Endpoint, email: ClassifiedEmail): Promise<unknown> {
  const system = getSystemPrompt(endpoint);
  const user = buildUserPrompt(endpoint, email);
  const scope = SCOPE_MAP[endpoint];

  let attempt = 0;
  while (attempt < 4) {
    attempt++;
    try {
      await sleep(REQUEST_DELAY_MS);
      const text = await callAiText(
        scope,
        system,
        endpoint === 'classify'
          ? `Today's date: ${new Date().toISOString().split('T')[0]}\n\n[${user}]`
          : user,
        { model: MODEL, maxTokens: 4096, timeoutMs: 90_000 },
      );
      const parsed = extractJson(text);
      // For classify, unwrap classifications[0]
      if (endpoint === 'classify') {
        const cl = parsed as { classifications?: unknown[] };
        return cl.classifications?.[0] ?? parsed;
      }
      return parsed;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const delay = [5000, 15000, 60000][attempt - 1] ?? 60000;
      if (attempt >= 4) throw err;
      console.error(`  [${endpoint}/${email.id}] attempt ${attempt} ERR: ${msg.slice(0, 100)} — retry in ${delay / 1000}s`);
      await sleep(delay);
    }
  }
  throw new Error('unreachable');
}

async function pLimit<T>(tasks: (() => Promise<T>)[], concurrency: number): Promise<T[]> {
  const results: T[] = [];
  let idx = 0;
  async function worker() {
    while (idx < tasks.length) {
      const i = idx++;
      results[i] = await tasks[i]();
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

async function main() {
  const endpointFilter = process.argv.includes('--endpoint')
    ? [process.argv[process.argv.indexOf('--endpoint') + 1] as Endpoint]
    : (['classify', 'parse-cargo', 'parse-vessel', 'parse-recap'] as Endpoint[]);
  const limitArg = process.argv.indexOf('--limit');
  const limit = limitArg >= 0 ? parseInt(process.argv[limitArg + 1], 10) : Infinity;

  if (!existsSync(CLASSIFIED_PATH)) {
    console.error(`ERROR: ${CLASSIFIED_PATH} not found — run classify-corpus.ts first`);
    process.exit(1);
  }

  const classified: ClassifiedEmail[] = JSON.parse(readFileSync(CLASSIFIED_PATH, 'utf-8'));
  const corpus = isFinite(limit) ? classified.slice(0, limit) : classified;

  // Load existing ground truth
  const gt: GroundTruth = existsSync(OUT_PATH)
    ? JSON.parse(readFileSync(OUT_PATH, 'utf-8'))
    : {};

  // Build work items
  const workItems: Array<{ email: ClassifiedEmail; endpoint: Endpoint }> = [];
  for (const email of corpus) {
    for (const endpoint of endpointFilter) {
      if (!email.applicable_endpoints.includes(endpoint)) continue;
      if (gt[email.id]?.[endpoint] !== undefined) continue; // already done
      workItems.push({ email, endpoint });
    }
  }

  console.error(`[build-ground-truth] ${workItems.length} pairs to process (${corpus.length} emails × up to ${endpointFilter.length} endpoints)`);
  let done = 0;
  let errors = 0;

  const tasks = workItems.map(({ email, endpoint }) => async () => {
    try {
      const output = await extractOne(endpoint, email);
      if (!gt[email.id]) gt[email.id] = {};
      gt[email.id][endpoint] = output;
      done++;
      if (done % 10 === 0 || done === workItems.length) {
        writeFileSync(OUT_PATH, JSON.stringify(gt, null, 2));
        console.error(`[build-ground-truth] ${done}/${workItems.length} done (${errors} errors)`);
      }
    } catch (err) {
      errors++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[build-ground-truth] ERROR ${endpoint}/${email.id}: ${msg.slice(0, 120)}`);
      if (!gt[email.id]) gt[email.id] = {};
      gt[email.id][endpoint] = { __error: msg.slice(0, 200) };
    }
  });

  await pLimit(tasks, CONCURRENCY);
  writeFileSync(OUT_PATH, JSON.stringify(gt, null, 2));

  // Summary
  const counts: Partial<Record<Endpoint, { ok: number; error: number }>> = {};
  for (const [, endpointMap] of Object.entries(gt)) {
    for (const [ep, val] of Object.entries(endpointMap) as [Endpoint, unknown][]) {
      if (!counts[ep]) counts[ep] = { ok: 0, error: 0 };
      if (val && typeof val === 'object' && '__error' in (val as object)) {
        counts[ep]!.error++;
      } else {
        counts[ep]!.ok++;
      }
    }
  }
  console.error(`\n[build-ground-truth] DONE`);
  console.error('Per-endpoint stats:', JSON.stringify(counts, null, 2));
  console.error(`Output: ${OUT_PATH}`);
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});

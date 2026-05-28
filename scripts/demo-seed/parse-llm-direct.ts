// scripts/demo-seed/parse-llm-direct.ts
/**
 * Drive 153 emails through LLM parsers directly (no HTTP dev-server needed).
 * Processes emails sequentially to avoid ETIMEDOUT from parallel Vertex AI calls.
 *
 * Usage:
 *   npx tsx scripts/demo-seed/parse-llm-direct.ts \
 *     [--raw-dir DIR] [--batch-size N]
 *
 * Writes results to <rawDir>/.llm-cache/<corpusHash>.json.
 * Re-running is a no-op if the cache already has data (populated cache hit).
 */
import * as fs from 'fs';
import * as path from 'path';
import 'dotenv/config';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), override: false });

import { callAiJson, callAiText } from '@/lib/ai-provider';
import { getClassifyPrompt } from '@/lib/prompts/classify';
import { CARGO_INQUIRY_PARSER_PROMPT } from '@/lib/prompts/parse-cargo';
import { VESSEL_POSITION_PARSER_PROMPT } from '@/lib/prompts/parse-vessel';
import { FIXTURE_RECAP_PARSER_PROMPT } from '@/lib/prompts/parse-recap';
import { CLASSIFY_SCHEMA, PARSE_CARGO_SCHEMA, PARSE_VESSEL_SCHEMA, PARSE_RECAP_SCHEMA } from '@/lib/schemas';
import { classifyEmails, type AiClassification } from '@/lib/classification-service';
import { buildCargoPrompts, parseCargoAIResponse } from '@/lib/parsing/parse-cargo-ai';
import { buildVesselPrompt, parseVesselAIResponse } from '@/lib/parsing/parse-vessel-helpers';
import { parseRecapAIResponse } from '@/lib/parsing/parse-recap-helpers';
import { applyGearedFallback } from '@/lib/parsing/geared-fallback';
import type { Email, ParsedCargo, ParsedVessel, ParsedFixtureRecap, Classification } from '@/lib/types';
import { normalizeRawEmail, type FlatEmail } from './analyze';
import { corpusHash, loadLlmCacheIfAny, writeCache, type LlmCache } from './llm-cache';
import { MAX_EMAIL_BODY_CHARS } from '@/lib/constants';
import { truncateText } from '@/lib/utils';

const DEFAULT_RAW = '.private/raw-emails';
const DEFAULT_CLASSIFY_BATCH = 15;
const LLM_TIMEOUT_MS = 120_000;

let SEED_MODEL = 'claude-opus-4-8';

interface Args {
  rawDir: string;
  classifyBatchSize: number;
  model: string;
}

function parseArgs(argv: string[]): Args {
  const get = (k: string) => { const i = argv.indexOf(k); return i === -1 ? undefined : argv[i + 1]; };
  return {
    rawDir: path.resolve(get('--raw-dir') ?? DEFAULT_RAW),
    classifyBatchSize: parseInt(get('--batch-size') ?? String(DEFAULT_CLASSIFY_BATCH), 10),
    model: get('--model') ?? 'claude-opus-4-8',
  };
}

function flatToEmail(flat: FlatEmail): Email {
  return {
    id: flat.messageId,
    threadId: flat.threadId,
    from: flat.fromName ? `${flat.fromName} <${flat.fromEmail ?? ''}>` : (flat.fromEmail ?? ''),
    fromName: flat.fromName ?? null,
    fromEmail: flat.fromEmail ?? null,
    to: '',
    subject: flat.subject ?? '',
    date: flat.date,
    body: flat.body,
    snippet: flat.body.slice(0, 200),
    labelIds: [],
  };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function classifyBatch(emails: Email[], batchIdx: number, total: number): Promise<AiClassification[]> {
  const todayIso = new Date().toISOString().split('T')[0];
  const batch = emails.map(e => ({
    id: e.id,
    subject: e.subject,
    from: e.from,
    date: e.date,
    body_preview: truncateText(e.body || e.snippet, MAX_EMAIL_BODY_CHARS),
  }));
  process.stdout.write(`  classify batch ${batchIdx + 1}/${total} (${emails.length} emails)... `);
  const t0 = Date.now();
  const result = await callAiJson<{ classifications: AiClassification[] }>(
    'CLASSIFY',
    getClassifyPrompt(),
    `Today's date: ${todayIso}\n\n${JSON.stringify(batch)}`,
    { timeoutMs: LLM_TIMEOUT_MS, responseSchema: CLASSIFY_SCHEMA, model: SEED_MODEL },
  );
  console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s`);
  return result.classifications ?? [];
}

async function parseCargoBatch(emails: Email[]): Promise<ParsedCargo[]> {
  const prompts = buildCargoPrompts(emails);
  const results: ParsedCargo[] = [];
  for (let i = 0; i < emails.length; i++) {
    const email = emails[i];
    process.stdout.write(`  cargo [${i + 1}/${emails.length}] ${email.subject?.slice(0, 40)}... `);
    const t0 = Date.now();
    try {
      const raw = await callAiText('PARSE_CARGO', CARGO_INQUIRY_PARSER_PROMPT, prompts[i], {
        timeoutMs: LLM_TIMEOUT_MS,
        responseSchema: PARSE_CARGO_SCHEMA,
        model: SEED_MODEL,
      });
      const parsed = parseCargoAIResponse(raw, email.id);
      results.push(...parsed);
      console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s → ${parsed.length} cargoes`);
    } catch (e) {
      console.log(`SKIP (${e instanceof Error ? e.message.slice(0, 60) : 'error'})`);
    }
  }
  return results;
}

async function parseVesselBatch(emails: Email[]): Promise<ParsedVessel[]> {
  const results: ParsedVessel[] = [];
  for (let i = 0; i < emails.length; i++) {
    const email = emails[i];
    process.stdout.write(`  vessel [${i + 1}/${emails.length}] ${email.subject?.slice(0, 40)}... `);
    const t0 = Date.now();
    try {
      const prompt = buildVesselPrompt(email);
      const raw = await callAiText('PARSE_VESSEL', VESSEL_POSITION_PARSER_PROMPT, prompt, {
        timeoutMs: LLM_TIMEOUT_MS,
        responseSchema: PARSE_VESSEL_SCHEMA,
        model: SEED_MODEL,
      });
      const parsed = parseVesselAIResponse(raw, email.id, email.subject);
      const fallbacked = applyGearedFallback(parsed, email.body);
      results.push(...fallbacked);
      console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s → ${parsed.length} vessels`);
    } catch (e) {
      console.log(`SKIP (${e instanceof Error ? e.message.slice(0, 60) : 'error'})`);
    }
  }
  return results;
}

async function parseRecapBatch(emails: Email[]): Promise<ParsedFixtureRecap[]> {
  const results: ParsedFixtureRecap[] = [];
  for (let i = 0; i < emails.length; i++) {
    const email = emails[i];
    process.stdout.write(`  recap [${i + 1}/${emails.length}] ${email.subject?.slice(0, 40)}... `);
    const t0 = Date.now();
    try {
      const userPrompt = `From: ${email.from}\nSubject: ${email.subject}\nDate: ${email.date}\n\n${email.body}`;
      const raw = await callAiText('PARSE_RECAP', FIXTURE_RECAP_PARSER_PROMPT, userPrompt, {
        timeoutMs: LLM_TIMEOUT_MS,
        responseSchema: PARSE_RECAP_SCHEMA,
        model: SEED_MODEL,
      });
      const parsed = parseRecapAIResponse(raw, email.id);
      if (parsed) results.push(parsed);
      console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s → ${parsed ? 1 : 0} recaps`);
    } catch (e) {
      console.log(`SKIP (${e instanceof Error ? e.message.slice(0, 60) : 'error'})`);
    }
  }
  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  SEED_MODEL = args.model;

  if (!fs.existsSync(args.rawDir)) {
    console.error(`Raw dir does not exist: ${args.rawDir}`);
    process.exit(2);
  }

  const hash = corpusHash(args.rawDir);
  console.log(`[parse-llm-direct] corpus hash: ${hash}`);

  const existingCache = loadLlmCacheIfAny(args.rawDir);
  if (existingCache) {
    const total =
      existingCache.classifications.length +
      existingCache.parsedCargos.length +
      existingCache.parsedVessels.length +
      existingCache.parsedFixtureRecaps.length;
    if (total > 0) {
      console.log('[parse-llm-direct] cache hit — nothing to do.');
      return;
    }
    console.log('[parse-llm-direct] cache file exists but is empty — re-parsing.');
  }

  const files = fs.readdirSync(args.rawDir).filter((f) => f.endsWith('.json')).sort();
  const emails: Email[] = files.map((f) => {
    const raw = JSON.parse(fs.readFileSync(path.join(args.rawDir, f), 'utf8'));
    return flatToEmail(normalizeRawEmail(raw));
  });
  console.log(`[parse-llm-direct] loaded ${emails.length} emails`);

  // ── CLASSIFY ───────────────────────────────────────────────────────────────
  console.log(`\n[classify] ${emails.length} emails in batches of ${args.classifyBatchSize}...`);
  const emailBatches = chunk(emails, args.classifyBatchSize);
  const allAiClassifications: AiClassification[] = [];
  for (let i = 0; i < emailBatches.length; i++) {
    const results = await classifyBatch(emailBatches[i], i, emailBatches.length);
    allAiClassifications.push(...results);
  }
  const { classifications } = classifyEmails(emails, allAiClassifications);
  console.log(`[classify] done: ${classifications.length} classified`);
  const byCategory = classifications.reduce((acc, c) => {
    acc[c.category] = (acc[c.category] ?? 0) + 1; return acc;
  }, {} as Record<string, number>);
  console.log('  categories:', JSON.stringify(byCategory));

  // ── PARSE CARGO ────────────────────────────────────────────────────────────
  const cargoIds = classifications.filter(c => c.category === 'CARGO_INQUIRY').map(c => c.emailId);
  const cargoEmails = emails.filter(e => cargoIds.includes(e.id));
  console.log(`\n[parse-cargo] ${cargoEmails.length} CARGO_INQUIRY emails...`);
  const parsedCargos = await parseCargoBatch(cargoEmails);
  console.log(`[parse-cargo] done: ${parsedCargos.length} cargoes`);

  // ── PARSE VESSEL ───────────────────────────────────────────────────────────
  const vesselIds = classifications.filter(c => c.category === 'VESSEL_POSITION').map(c => c.emailId);
  const vesselEmails = emails.filter(e => vesselIds.includes(e.id));
  console.log(`\n[parse-vessel] ${vesselEmails.length} VESSEL_POSITION emails...`);
  const parsedVessels = await parseVesselBatch(vesselEmails);
  console.log(`[parse-vessel] done: ${parsedVessels.length} vessels`);

  // ── PARSE RECAP ────────────────────────────────────────────────────────────
  const recapIds = classifications.filter(c => c.category === 'FIXTURE_RECAP').map(c => c.emailId);
  const recapEmails = emails.filter(e => recapIds.includes(e.id));
  console.log(`\n[parse-recap] ${recapEmails.length} FIXTURE_RECAP emails...`);
  const parsedFixtureRecaps = await parseRecapBatch(recapEmails);
  console.log(`[parse-recap] done: ${parsedFixtureRecaps.length} recaps`);

  // ── WRITE CACHE ────────────────────────────────────────────────────────────
  const cache: LlmCache = {
    corpusHash: hash,
    generatedAt: new Date().toISOString(),
    classifications,
    parsedCargos,
    parsedVessels,
    parsedFixtureRecaps,
  };

  writeCache(args.rawDir, cache);
  const stats = fs.statSync(path.join(args.rawDir, '.llm-cache', `${hash}.json`));
  console.log(
    `\n[parse-llm-direct] wrote cache: ${(stats.size / 1024).toFixed(1)} KB ` +
    `(classifications=${classifications.length} cargos=${parsedCargos.length} ` +
    `vessels=${parsedVessels.length} recaps=${parsedFixtureRecaps.length})`,
  );
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

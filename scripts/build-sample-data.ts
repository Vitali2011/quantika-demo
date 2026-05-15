/**
 * Offline generator that replaces the curated V2 demo corpus with the full
 * 154-email real ETMS corpus.
 *
 * Reads .private/etms-corpus.json, runs the app's own classify + parse-cargo +
 * parse-vessel functions, and atomically rewrites the demo fixtures in
 * lib/sample-data/.
 *
 * Pure helpers (computeDateOffsets, splitByCategory) are exported and unit-
 * tested; the LLM orchestration in main() is validated by running it.
 *
 * See docs/plans/2026-05-14-etms-demo-corpus-migration{,-design}.md
 */

import { promises as fs } from 'fs';
import path from 'path';
import pLimit from 'p-limit';

import { callAiJson, callAiText } from '@/lib/ai-provider';
import { CLASSIFY_SCHEMA, PARSE_CARGO_SCHEMA, PARSE_VESSEL_SCHEMA } from '@/lib/schemas';
import {
  CLASSIFICATION_SYSTEM_PROMPT,
  CARGO_INQUIRY_PARSER_PROMPT,
  VESSEL_POSITION_PARSER_PROMPT,
} from '@/lib/prompts';
import { endpointLlmTimeout } from '@/lib/openai-helpers';
import { MAX_EMAIL_BODY_CHARS } from '@/lib/constants';
import { truncateText } from '@/lib/utils';
import {
  LLM_TIMEOUT_MS,
  PARSE_CARGO_CONCURRENCY,
  withRetry429,
} from '@/lib/parse-cargo-helpers';
import { classifyEmails, AiClassification } from '@/lib/classification-service';
import {
  buildCargoPrompts,
  parseCargoAIResponse,
  type RawCargoItem,
} from '@/lib/parsing/parse-cargo-ai';
import {
  applyCargoRateFallback,
  applyCargoTypeFallback,
} from '@/lib/parsing/cargo-rate-fallback';
import {
  buildVesselPrompt,
  parseVesselAIResponse,
} from '@/lib/parsing/parse-vessel-helpers';
import { applyGearedFallback } from '@/lib/parsing/geared-fallback';

import type {
  Email,
  Classification,
  EmailCategory,
  ParsedCargo,
  ParsedVessel,
} from '../lib/types';

// ---------- Pure helpers (unit-tested) ---------------------------------------

const MS_PER_DAY = 86_400_000;

/**
 * Per-email offset in whole days from the newest email in the corpus.
 * Newest email gets 0; older ones get negative day counts.
 *
 * Used to derive _meta.emailDateOffsetDays so rebaseDates() can shift the
 * envelope date forward at seed-time, keeping the demo's inbox visually fresh.
 */
export function computeDateOffsets(emails: Email[]): Map<string, number> {
  const dayIndex = (iso: string): number =>
    Math.floor(new Date(iso).getTime() / MS_PER_DAY);
  const maxDay = Math.max(...emails.map((e) => dayIndex(e.date)));
  const out = new Map<string, number>();
  for (const e of emails) out.set(e.id, dayIndex(e.date) - maxDay);
  return out;
}

export interface CategoryBuckets {
  cargoInquiries: string[];
  vesselPositions: string[];
  fixtureRecaps: string[];
  clientReplies: string[];
  documents: string[];
  vesselCerts: string[];
}

const CATEGORY_TO_BUCKET: Record<EmailCategory, keyof CategoryBuckets> = {
  CARGO_INQUIRY: 'cargoInquiries',
  TCT_REQUEST: 'cargoInquiries',
  OTHER: 'cargoInquiries',
  VESSEL_POSITION: 'vesselPositions',
  FIXTURE_RECAP: 'fixtureRecaps',
  CLIENT_REPLY: 'clientReplies',
  DOCUMENT: 'documents',
  VESSEL_CERTIFICATE: 'vesselCerts',
};

/**
 * Partition email IDs by classification category into the six sample-data
 * fixture buckets. Throws on unknown category so a classifier glitch surfaces
 * at generation time instead of silently dropping emails.
 */
export function splitByCategory(classifications: Classification[]): CategoryBuckets {
  const buckets: CategoryBuckets = {
    cargoInquiries: [],
    vesselPositions: [],
    fixtureRecaps: [],
    clientReplies: [],
    documents: [],
    vesselCerts: [],
  };
  for (const c of classifications) {
    const bucket = CATEGORY_TO_BUCKET[c.category as EmailCategory];
    if (!bucket) {
      throw new Error(`Unknown category: ${c.category} (email ${c.emailId})`);
    }
    buckets[bucket].push(c.emailId);
  }
  return buckets;
}

// ---------- LLM orchestration ------------------------------------------------

const SAMPLE_DATA_DIR = path.resolve(process.cwd(), 'lib', 'sample-data');
const CORPUS_PATH = path.resolve(process.cwd(), '.private', 'etms-corpus.json');
const CLASSIFY_BATCH_SIZE = 20;

interface EmailInput {
  id: string;
  subject: string;
  from: string;
  date: string;
  body_preview: string;
}

async function loadCorpus(): Promise<Email[]> {
  let raw: string;
  try {
    raw = await fs.readFile(CORPUS_PATH, 'utf-8');
  } catch (e) {
    throw new Error(
      `Corpus not found at ${CORPUS_PATH}. Run 'npm run build:corpus' first.`,
    );
  }
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('Corpus must be a non-empty Email[]');
  }
  return parsed as Email[];
}

async function classifyAll(emails: Email[]): Promise<Classification[]> {
  const input: EmailInput[] = emails.map((e) => ({
    id: e.id,
    subject: e.subject,
    from: e.from,
    date: e.date,
    body_preview: truncateText(e.body || e.snippet, MAX_EMAIL_BODY_CHARS),
  }));
  const todayIso = new Date().toISOString().split('T')[0];
  const batches: EmailInput[][] = [];
  for (let i = 0; i < input.length; i += CLASSIFY_BATCH_SIZE) {
    batches.push(input.slice(i, i + CLASSIFY_BATCH_SIZE));
  }
  console.log(
    `[classify] ${input.length} emails in ${batches.length} batches of ≤${CLASSIFY_BATCH_SIZE}`,
  );
  const all: AiClassification[] = [];
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    process.stdout.write(`  batch ${i + 1}/${batches.length} (${batch.length} emails)... `);
    const result = await callAiJson<{ classifications: AiClassification[] }>(
      'CLASSIFY',
      CLASSIFICATION_SYSTEM_PROMPT,
      `Today's date: ${todayIso}\n\n${JSON.stringify(batch)}`,
      { timeoutMs: endpointLlmTimeout(120), responseSchema: CLASSIFY_SCHEMA },
    );
    all.push(...(result.classifications ?? []));
    console.log('ok');
  }
  const { classifications } = classifyEmails(emails, all);
  return classifications;
}

async function parseCargoAll(
  emails: Email[],
): Promise<{ parsed: ParsedCargo[]; failed: string[] }> {
  const limit = pLimit(PARSE_CARGO_CONCURRENCY);
  const prompts = buildCargoPrompts(emails);
  const out: ParsedCargo[] = [];
  const failed: string[] = [];
  let done = 0;
  await Promise.all(
    emails.map((email, i) =>
      limit(async () => {
        try {
          const result = await withRetry429(() =>
            callAiJson<RawCargoItem>('PARSE_CARGO', CARGO_INQUIRY_PARSER_PROMPT, prompts[i], {
              timeoutMs: LLM_TIMEOUT_MS,
              maxTokens: 16000,
              model: process.env.PARSE_CARGO_GEMINI_MODEL,
              responseSchema: PARSE_CARGO_SCHEMA,
              temperature: 0,
              seed: 42,
            }),
          );
          const items = parseCargoAIResponse(JSON.stringify(result), email.id);
          const enriched = items
            .map((c) => applyCargoRateFallback(c, email.body))
            .map((c) => applyCargoTypeFallback(c));
          out.push(...enriched);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(`  [parse-cargo] ${email.id}: ${msg.slice(0, 120)}`);
          failed.push(email.id);
        }
        done++;
        if (done % 10 === 0 || done === emails.length) {
          console.log(`[parse-cargo] ${done}/${emails.length}`);
        }
      }),
    ),
  );
  console.log(`[parse-cargo] done: ${out.length} parsed records, ${failed.length} failures`);
  return { parsed: out, failed };
}

async function parseVesselAll(
  emails: Email[],
): Promise<{ parsed: ParsedVessel[]; failed: string[] }> {
  const limit = pLimit(3);
  const out: ParsedVessel[] = [];
  const failed: string[] = [];
  let done = 0;
  await Promise.all(
    emails.map((email) =>
      limit(async () => {
        try {
          const prompt = buildVesselPrompt(email);
          const raw = await callAiText(
            'PARSE_VESSEL',
            VESSEL_POSITION_PARSER_PROMPT,
            prompt,
            { timeoutMs: endpointLlmTimeout(60), responseSchema: PARSE_VESSEL_SCHEMA },
          );
          const items = parseVesselAIResponse(raw, email.id, email.subject);
          const corrected = applyGearedFallback(items, email.body);
          out.push(...corrected);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(`  [parse-vessel] ${email.id}: ${msg.slice(0, 120)}`);
          failed.push(email.id);
        }
        done++;
        if (done % 10 === 0 || done === emails.length) {
          console.log(`[parse-vessel] ${done}/${emails.length}`);
        }
      }),
    ),
  );
  console.log(`[parse-vessel] done: ${out.length} parsed records, ${failed.length} failures`);
  return { parsed: out, failed };
}

async function writeJson(filename: string, data: unknown): Promise<void> {
  const target = path.join(SAMPLE_DATA_DIR, filename);
  await fs.writeFile(target, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  console.log(`  wrote ${filename}`);
}

async function main(): Promise<void> {
  console.log('=== ETMS demo-corpus generator ===');
  const emails = await loadCorpus();
  console.log(`loaded ${emails.length} emails from ${CORPUS_PATH}`);

  // Phase 1: classification
  const classifications = await classifyAll(emails);

  // Phase 2: split by category
  const buckets = splitByCategory(classifications);
  console.log(
    `buckets: cargo=${buckets.cargoInquiries.length} vessel=${buckets.vesselPositions.length} recap=${buckets.fixtureRecaps.length} reply=${buckets.clientReplies.length} doc=${buckets.documents.length} cert=${buckets.vesselCerts.length}`,
  );

  // Phase 3: date offsets + attach _meta
  const offsets = computeDateOffsets(emails);
  const emailById = new Map(emails.map((e) => [e.id, e]));
  const attachMeta = (ids: string[]) =>
    ids
      .map((id) => emailById.get(id))
      .filter((e): e is Email => e !== undefined)
      .map((e) => ({
        ...e,
        _meta: { emailDateOffsetDays: offsets.get(e.id) ?? 0 },
      }));

  // Phase 4: write email files
  console.log('writing email files...');
  await writeJson('cargo-inquiries.json', attachMeta(buckets.cargoInquiries));
  await writeJson('vessel-positions.json', attachMeta(buckets.vesselPositions));
  await writeJson('fixture-recaps.json', attachMeta(buckets.fixtureRecaps));
  await writeJson('client-replies.json', attachMeta(buckets.clientReplies));
  await writeJson('documents.json', attachMeta(buckets.documents));
  await writeJson('vessel-certs.json', attachMeta(buckets.vesselCerts));

  // Phase 5: parse cargo — only CARGO_INQUIRY, matching /api/ai/parse-cargo route filter.
  // (Deviation from plan Task 4 Step 6 which mentioned TCT_REQUEST too: the production
  // route doesn't parse TCT, so neither do we — keeps demo's cached parsedCargos a
  // strict subset of what live parsing would produce.)
  const cargoInquiryIds = new Set(
    classifications.filter((c) => c.category === 'CARGO_INQUIRY').map((c) => c.emailId),
  );
  const cargoToParse = emails.filter((e) => cargoInquiryIds.has(e.id));
  console.log(`[parse-cargo] parsing ${cargoToParse.length} CARGO_INQUIRY emails`);
  const { parsed: parsedCargos, failed: cargoFailed } = await parseCargoAll(cargoToParse);
  await writeJson('demo-parsed-cargoes.json', parsedCargos);

  // Phase 6: parse vessel
  const vesselIdSet = new Set(buckets.vesselPositions);
  const vesselToParse = emails.filter((e) => vesselIdSet.has(e.id));
  console.log(`[parse-vessel] parsing ${vesselToParse.length} VESSEL_POSITION emails`);
  const { parsed: parsedVessels, failed: vesselFailed } = await parseVesselAll(vesselToParse);
  await writeJson('demo-parsed-vessels.json', parsedVessels);

  // Phase 7: write classifications
  await writeJson('demo-classifications.json', classifications);

  // Phase 8: summary
  const totalFailed = cargoFailed.length + vesselFailed.length;
  const totalAttempted = cargoToParse.length + vesselToParse.length;
  const failPct = totalAttempted > 0 ? (totalFailed / totalAttempted) * 100 : 0;
  console.log('=== SUMMARY ===');
  console.log(`emails: ${emails.length}`);
  console.log(
    `buckets: cargo=${buckets.cargoInquiries.length} vessel=${buckets.vesselPositions.length} recap=${buckets.fixtureRecaps.length} reply=${buckets.clientReplies.length} doc=${buckets.documents.length} cert=${buckets.vesselCerts.length}`,
  );
  console.log(
    `parsed: cargo=${parsedCargos.length}/${cargoToParse.length}, vessel=${parsedVessels.length}/${vesselToParse.length}`,
  );
  console.log(`failures: ${totalFailed}/${totalAttempted} (${failPct.toFixed(1)}%)`);
  if (cargoFailed.length) console.log(`  cargo failed: ${cargoFailed.join(', ')}`);
  if (vesselFailed.length) console.log(`  vessel failed: ${vesselFailed.join(', ')}`);
  if (failPct > 10) {
    console.error('FATAL: more than 10% LLM failure rate — investigate before committing fixtures');
    process.exit(1);
  }
  console.log('OK — fixtures written to lib/sample-data/');
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

#!/usr/bin/env -S npx tsx
/**
 * Build an independent Opus/Sonnet ground truth dataset for Wave γ Quality Push (Spec 02).
 *
 * For each (case, endpoint) pair in the corpus, calls Bedrock Sonnet 4.6 with
 * the production system prompt + email body, then deep-compares the result
 * against baseline-pro25.json.
 *
 * Output files:
 *   - scripts/wave-gamma-bake-off/ground-truth-opus.json
 *     Same shape as baseline-pro25.json: { [caseId]: { [endpoint]: <parsed JSON> } }
 *   - scripts/wave-gamma-bake-off/ground-truth-vs-pro-diff.json
 *     Per-(case, endpoint) diff with classification
 *
 * Usage:
 *   npx tsx scripts/wave-gamma-bake-off/build-ground-truth.ts [--limit N] [--endpoint <name>] [--concurrency N]
 *
 * Env:
 *   AI_PROVIDER=bedrock
 *   BEDROCK_MODEL_ID=us.anthropic.claude-opus-4-7   (required by assertBedrockEnv)
 *   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import pLimit from 'p-limit';

import { callAiText as defaultCallAiText } from '@/lib/ai-provider';
import { loadCorpus, type Endpoint } from './corpus';
import { getEndpointSpec, ENDPOINTS } from './endpoint-specs';
import { deepFieldDiff, type DiffSummary } from './diff-utils';

// ─── Types ──────────────────────────────────────────────────────────────────────

export type CallAiTextFn = (
  scope: string,
  system: string,
  user: string,
  opts?: { model?: string; maxTokens?: number; timeoutMs?: number; signal?: AbortSignal },
) => Promise<string>;

export type DiffClassification =
  | 'consensus'       // Sonnet and Pro agree
  | 'pro_wrong'       // Differs, and Pro had known issues from Spec 01 validator
  | 'opus_wrong'      // Sonnet returned a parse error / malformed output
  | 'both_unsure';    // Differs, no strong signal either way

export interface PairDiff {
  case_id: string;
  endpoint: string;
  classification: DiffClassification;
  diff: DiffSummary;
  sonnet_parse_error?: string;
}

export interface GroundTruthDiffOutput {
  generated_at: string;
  extractor_model: string;
  total_pairs: number;
  consensus: number;
  pro_wrong: number;
  opus_wrong: number;
  both_unsure: number;
  pairs: PairDiff[];
}

interface ReferenceMap {
  [caseId: string]: Partial<Record<Endpoint, unknown>>;
}

interface ProIssuesOutput {
  issues: Array<{ case_id: string; endpoint: string; severity: string; field: string; class: string; what: string }>;
}

// ─── Constants ──────────────────────────────────────────────────────────────────

const EXTRACTOR_SCOPE = 'wave_gamma_ground_truth';
const EXTRACTOR_MODEL = 'us.anthropic.claude-sonnet-4-6';
const EXTRACTOR_MAX_TOKENS = 4096;

const BASELINE_PATH = path.join(__dirname, 'baseline-pro25.json');
const GROUND_TRUTH_PATH = path.join(__dirname, 'ground-truth-opus.json');
const DIFF_PATH = path.join(__dirname, 'ground-truth-vs-pro-diff.json');
const PRO_ISSUES_PATH = path.resolve(
  process.cwd(),
  '.specs/wave-gamma-vertex/quality-push/pro-baseline-issues.json',
);

// ─── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Strip ```json ... ``` fences if the model adds them despite instructions.
 * Also extracts the outermost JSON object/array if the model prefixes
 * preamble text before the JSON (e.g. "I'll parse this email...\n{...}").
 */
export function stripFences(text: string): string {
  let cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  // If the result starts with { or [, it's already JSON — return as-is
  if (cleaned.startsWith('{') || cleaned.startsWith('[')) {
    return cleaned;
  }

  // Try to extract the first JSON object or array from the text
  const jsonStart = cleaned.search(/[\[{]/);
  if (jsonStart === -1) return cleaned;

  const jsonCandidate = cleaned.slice(jsonStart);

  // Find the matching closing brace/bracket by counting depth
  const opener = jsonCandidate[0];
  const closer = opener === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < jsonCandidate.length; i++) {
    const ch = jsonCandidate[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === opener) depth++;
    if (ch === closer) {
      depth--;
      if (depth === 0) {
        return jsonCandidate.slice(0, i + 1);
      }
    }
  }

  // If we couldn't find balanced braces, return the candidate as-is and let JSON.parse fail
  return jsonCandidate;
}

/**
 * Load Pro 2.5 baseline. Returns empty map if file is absent.
 */
function loadBaseline(): ReferenceMap {
  if (!existsSync(BASELINE_PATH)) return {};
  try {
    return JSON.parse(readFileSync(BASELINE_PATH, 'utf-8')) as ReferenceMap;
  } catch {
    return {};
  }
}

/**
 * Load pro-baseline-issues.json for cross-referencing known Pro problems.
 * Returns a Set of "caseId/endpoint" keys that had issues.
 */
function loadProIssueKeys(): Set<string> {
  const keys = new Set<string>();
  if (!existsSync(PRO_ISSUES_PATH)) return keys;
  try {
    const data = JSON.parse(readFileSync(PRO_ISSUES_PATH, 'utf-8')) as ProIssuesOutput;
    if (Array.isArray(data.issues)) {
      for (const issue of data.issues) {
        // Only count medium+ severity as "Pro had issues"
        if (['med', 'high', 'crit'].includes(issue.severity)) {
          keys.add(`${issue.case_id}/${issue.endpoint}`);
        }
      }
    }
  } catch {
    // Non-fatal — if file is corrupt, we just won't cross-reference
  }
  return keys;
}

/**
 * Classify a diff result given Pro baseline issues.
 */
export function classifyDiff(
  caseId: string,
  endpoint: string,
  diff: DiffSummary,
  proIssueKeys: Set<string>,
  sonnetParseError?: string,
): DiffClassification {
  // If Sonnet returned a parse error, it's an opus_wrong
  if (sonnetParseError) return 'opus_wrong';

  // If all fields match, it's consensus
  if (diff.mismatching === 0 && diff.aOnly === 0 && diff.bOnly === 0) {
    return 'consensus';
  }

  // If Pro had known issues at this (case, endpoint), classify as pro_wrong
  const key = `${caseId}/${endpoint}`;
  if (proIssueKeys.has(key)) {
    return 'pro_wrong';
  }

  // Otherwise, can't determine — both_unsure
  return 'both_unsure';
}

/**
 * Extract JSON from model response with retry and backoff on throttle.
 * Returns parsed JSON or null + error string if extraction fails.
 */
export async function extractWithRetry(
  callFn: CallAiTextFn,
  systemPrompt: string,
  userPrompt: string,
  maxAttempts: number = 5,
): Promise<{ json: unknown | null; error?: string }> {
  let lastErr: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const rawText = await callFn(EXTRACTOR_SCOPE, systemPrompt, userPrompt, {
        model: EXTRACTOR_MODEL,
        maxTokens: EXTRACTOR_MAX_TOKENS,
      });

      const cleaned = stripFences(rawText);
      try {
        const parsed = JSON.parse(cleaned);
        return { json: parsed };
      } catch {
        // Model returned text that doesn't parse as JSON
        return {
          json: null,
          error: `Malformed JSON from extractor. Raw snippet: ${cleaned.slice(0, 200)}`,
        };
      }
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      const isThrottle = /too many (tokens|requests)|throttl|rate.?limit|429|ServiceUnavailable|503/i.test(msg);

      if (!isThrottle || attempt === maxAttempts - 1) {
        return {
          json: null,
          error: `Extractor call failed after ${attempt + 1} attempt(s): ${msg}`,
        };
      }

      // Exponential backoff with jitter
      const baseMs = 1000 * Math.pow(2, attempt);
      const jitter = Math.floor(Math.random() * 500);
      await new Promise((r) => setTimeout(r, baseMs + jitter));
    }
  }

  return {
    json: null,
    error: `Extractor call failed after ${maxAttempts} retries: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
  };
}

// ─── Core pipeline ──────────────────────────────────────────────────────────────

export interface BuildGroundTruthOptions {
  callAiText?: CallAiTextFn;
  limit?: number;
  endpoint?: string;
  concurrency?: number;
}

export async function buildGroundTruth(
  options: BuildGroundTruthOptions = {},
): Promise<{ groundTruth: ReferenceMap; diffOutput: GroundTruthDiffOutput }> {
  const callFn: CallAiTextFn = options.callAiText ?? defaultCallAiText;
  const concurrency = options.concurrency ?? 3;

  // Load inputs
  const corpus = await loadCorpus();
  const baseline = loadBaseline();
  const proIssueKeys = loadProIssueKeys();

  console.log(`[ground-truth] Loaded ${corpus.length} corpus cases.`);
  console.log(`[ground-truth] Baseline has ${Object.keys(baseline).length} case entries.`);
  console.log(`[ground-truth] Pro issues reference has ${proIssueKeys.size} flagged (case, endpoint) keys.`);

  // Build list of (case, endpoint) pairs
  interface WorkItem {
    caseId: string;
    endpoint: Endpoint;
    email: string;
    systemPrompt: string;
  }

  let pairs: WorkItem[] = [];
  for (const cse of corpus) {
    for (const endpoint of cse.endpoints) {
      if (!ENDPOINTS.includes(endpoint)) continue;
      const spec = getEndpointSpec(endpoint);
      pairs.push({
        caseId: cse.id,
        endpoint,
        email: cse.email,
        systemPrompt: spec.systemPrompt,
      });
    }
  }

  // Apply filters
  if (options.endpoint) {
    pairs = pairs.filter((p) => p.endpoint === options.endpoint);
  }
  if (options.limit && options.limit > 0) {
    pairs = pairs.slice(0, options.limit);
  }

  console.log(`[ground-truth] Processing ${pairs.length} (case, endpoint) pairs with concurrency=${concurrency}`);

  // Run extraction
  const groundTruth: ReferenceMap = {};
  const diffPairs: PairDiff[] = [];
  let completed = 0;
  let parseErrors = 0;

  const limit = pLimit(concurrency);
  const tasks = pairs.map((pair) =>
    limit(async () => {
      const result = await extractWithRetry(callFn, pair.systemPrompt, pair.email);

      completed++;

      if (result.json !== null) {
        if (!groundTruth[pair.caseId]) groundTruth[pair.caseId] = {};
        groundTruth[pair.caseId][pair.endpoint] = result.json;
      } else {
        parseErrors++;
      }

      // Cross-compare with Pro baseline
      const proOutput = baseline[pair.caseId]?.[pair.endpoint] ?? null;
      const sonnetOutput = result.json;

      const diff = deepFieldDiff(sonnetOutput, proOutput, {
        numericTolerance: 0.01,
        caseInsensitive: true,
      });

      const classification = classifyDiff(
        pair.caseId,
        pair.endpoint,
        diff,
        proIssueKeys,
        result.error,
      );

      const pairDiff: PairDiff = {
        case_id: pair.caseId,
        endpoint: pair.endpoint,
        classification,
        diff,
      };
      if (result.error) {
        pairDiff.sonnet_parse_error = result.error;
      }

      diffPairs.push(pairDiff);

      const status = result.error ? `ERR: ${result.error.slice(0, 60)}` : classification;
      console.log(
        `[ground-truth] [${completed}/${pairs.length}] ${pair.caseId}/${pair.endpoint}: ${status}`,
      );
    }),
  );

  await Promise.all(tasks);

  // Tally classifications
  let consensus = 0;
  let proWrong = 0;
  let opusWrong = 0;
  let bothUnsure = 0;

  for (const pd of diffPairs) {
    switch (pd.classification) {
      case 'consensus': consensus++; break;
      case 'pro_wrong': proWrong++; break;
      case 'opus_wrong': opusWrong++; break;
      case 'both_unsure': bothUnsure++; break;
    }
  }

  const diffOutput: GroundTruthDiffOutput = {
    generated_at: new Date().toISOString(),
    extractor_model: EXTRACTOR_MODEL,
    total_pairs: diffPairs.length,
    consensus,
    pro_wrong: proWrong,
    opus_wrong: opusWrong,
    both_unsure: bothUnsure,
    pairs: diffPairs,
  };

  console.log(`\n[ground-truth] Extraction complete.`);
  console.log(`  Total pairs: ${diffPairs.length}`);
  console.log(`  Parse errors: ${parseErrors}`);
  console.log(`  Consensus: ${consensus}`);
  console.log(`  Pro wrong: ${proWrong}`);
  console.log(`  Opus/Sonnet wrong: ${opusWrong}`);
  console.log(`  Both unsure: ${bothUnsure}`);

  return { groundTruth, diffOutput };
}

// ─── CLI entrypoint ─────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): BuildGroundTruthOptions {
  const opts: BuildGroundTruthOptions = {};
  for (let i = 2; i < argv.length; i++) {
    switch (argv[i]) {
      case '--limit':
        opts.limit = parseInt(argv[++i], 10);
        break;
      case '--endpoint':
        opts.endpoint = argv[++i];
        break;
      case '--concurrency':
        opts.concurrency = parseInt(argv[++i], 10);
        break;
    }
  }
  return opts;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv);
  const { groundTruth, diffOutput } = await buildGroundTruth(opts);

  // Write ground truth
  mkdirSync(path.dirname(GROUND_TRUTH_PATH), { recursive: true });
  writeFileSync(GROUND_TRUTH_PATH, JSON.stringify(groundTruth, null, 2) + '\n', 'utf-8');
  console.log(`[ground-truth] Wrote ${GROUND_TRUTH_PATH}`);

  // Write diff
  mkdirSync(path.dirname(DIFF_PATH), { recursive: true });
  writeFileSync(DIFF_PATH, JSON.stringify(diffOutput, null, 2) + '\n', 'utf-8');
  console.log(`[ground-truth] Wrote ${DIFF_PATH}`);
}

// Only run main when executed directly (not when imported by tests)
const isDirectRun =
  typeof require !== 'undefined' &&
  require.main === module;

const isTsxRun = process.argv[1] && (
  process.argv[1].endsWith('build-ground-truth.ts') ||
  process.argv[1].endsWith('build-ground-truth.js')
);

if (isDirectRun || isTsxRun) {
  main().catch((err) => {
    console.error('[ground-truth] Fatal error:', err);
    process.exit(1);
  });
}

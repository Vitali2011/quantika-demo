/**
 * Pro 2.5 baseline validator — Wave γ Quality Push (Spec 01).
 *
 * Spot-checks every (caseId, endpoint) pair in baseline-pro25.json by asking
 * Sonnet 4.6 (via Bedrock) to QA-review each parser output against the
 * original email and the endpoint's system prompt.
 *
 * Usage:
 *   npx tsx scripts/wave-gamma-bake-off/validate-baseline.ts [--limit N] [--endpoint <name>] [--out <path>]
 *
 * Env:
 *   AI_PROVIDER=bedrock
 *   JUDGE_BEDROCK_MODEL=us.anthropic.claude-sonnet-4-6   (or falls back to BEDROCK_MODEL_ID)
 *   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, BEDROCK_MODEL_ID
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { callAiText as defaultCallAiText } from '@/lib/ai-provider';
import { loadCorpus, type Endpoint } from './corpus';
import { getEndpointSpec } from './endpoint-specs';

// ─── Types ──────────────────────────────────────────────────────────────────────

export type CallAiTextFn = (
  scope: string,
  system: string,
  user: string,
  opts?: { model?: string; maxTokens?: number; timeoutMs?: number; signal?: AbortSignal },
) => Promise<string>;

export type IssueSeverity = 'low' | 'med' | 'high' | 'crit';

export type IssueClass =
  | 'missing_required_field'
  | 'hallucination'
  | 'schema_violation'
  | 'extraction_error'
  | 'format_error'
  | 'validator_error';

export interface ValidatorIssue {
  severity: IssueSeverity;
  field: string;
  class: IssueClass;
  what: string;
}

export interface CaseResult {
  case_id: string;
  endpoint: string;
  issues: ValidatorIssue[];
}

export interface SeverityBucket {
  crit: number;
  high: number;
  med: number;
  low: number;
}

export interface ValidatorOutput {
  generated_at: string;
  validator_model: string;
  total_cases: number;
  cases_with_issues: number;
  by_severity: SeverityBucket;
  by_endpoint: Record<string, SeverityBucket>;
  issues: Array<ValidatorIssue & { case_id: string; endpoint: string }>;
}

// ─── Constants ──────────────────────────────────────────────────────────────────

const VALIDATOR_SCOPE = 'wave_gamma_baseline_validator';
const VALIDATOR_MAX_TOKENS = 2048;

const DEFAULT_OUTPUT_PATH = path.resolve(
  process.cwd(),
  '.specs/wave-gamma-vertex/quality-push/pro-baseline-issues.json',
);

/**
 * Resolve the validator model at call time (not import time) so env overrides
 * and tests can control it.
 */
export function resolveValidatorModel(): string {
  return (
    process.env.JUDGE_BEDROCK_MODEL ||
    process.env.BEDROCK_MODEL_ID ||
    'us.anthropic.claude-sonnet-4-6'
  );
}

const VALIDATOR_SYSTEM_PROMPT = `You are a strict data extraction QA reviewer. Below is:
1. The system prompt the parser was given (defines required fields, types, schema)
2. The original input email
3. The parser's output JSON

Find errors of the following classes:
- missing_required_field: required field empty/null/missing
- hallucination: value present but not derivable from input
- schema_violation: wrong type, wrong enum, wrong shape
- extraction_error: value derivable from input but parser got it wrong
- format_error: malformed JSON / invalid structure

Respond ONLY with JSON: { "case_id": "...", "endpoint": "...", "issues": [{"severity": "low|med|high|crit", "field": "...", "class": "...", "what": "..."}] }`;

// ─── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Strip ```json ... ``` fences if the model adds them despite instructions.
 */
function stripFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function emptySeverityBucket(): SeverityBucket {
  return { crit: 0, high: 0, med: 0, low: 0 };
}

function addToSeverityBucket(bucket: SeverityBucket, severity: IssueSeverity): void {
  if (severity in bucket) {
    bucket[severity]++;
  }
}

// ─── Core validation ────────────────────────────────────────────────────────────

export interface ValidateBaselineOptions {
  callAiText?: CallAiTextFn;
  limit?: number;
  endpoint?: string;
  outPath?: string;
  concurrency?: number;
}

interface BaselinePair {
  caseId: string;
  endpoint: Endpoint;
  parserOutput: unknown;
  email: string;
  systemPrompt: string;
}

/**
 * Validate a single (case, endpoint) pair by calling the AI judge.
 * Returns a CaseResult — on malformed responses, returns a single
 * validator_error issue rather than crashing the run.
 */
export async function validateSinglePair(
  pair: BaselinePair,
  callFn: CallAiTextFn,
): Promise<CaseResult> {
  const userMessage = JSON.stringify(
    {
      case_id: pair.caseId,
      endpoint: pair.endpoint,
      system_prompt: pair.systemPrompt,
      email: pair.email,
      parser_output: pair.parserOutput,
    },
    null,
    2,
  );

  // Retry with exponential backoff on throttle errors (up to 5 attempts)
  const maxAttempts = 5;
  let rawText = '';
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      rawText = await callFn(VALIDATOR_SCOPE, VALIDATOR_SYSTEM_PROMPT, userMessage, {
        model: resolveValidatorModel(),
        maxTokens: VALIDATOR_MAX_TOKENS,
      });
      lastErr = undefined;
      break;
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      const isThrottle = /too many tokens|throttl|rate.?limit|429|ServiceUnavailable|503/i.test(msg);
      if (!isThrottle || attempt === maxAttempts - 1) {
        // Non-throttle error or exhausted retries — return as validator_error
        return {
          case_id: pair.caseId,
          endpoint: pair.endpoint,
          issues: [
            {
              severity: 'high',
              field: '_validator',
              class: 'validator_error',
              what: `Validator call failed: ${msg}`,
            },
          ],
        };
      }
      const baseMs = 1000 * Math.pow(2, attempt);
      const jitter = Math.floor(Math.random() * 500);
      await new Promise((r) => setTimeout(r, baseMs + jitter));
    }
  }
  if (lastErr) {
    return {
      case_id: pair.caseId,
      endpoint: pair.endpoint,
      issues: [
        {
          severity: 'high',
          field: '_validator',
          class: 'validator_error',
          what: `Validator call failed after retries: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
        },
      ],
    };
  }

  // Parse the response
  const cleaned = stripFences(rawText);
  try {
    const parsed = JSON.parse(cleaned) as CaseResult;
    // Ensure issues is always an array
    return {
      case_id: pair.caseId,
      endpoint: pair.endpoint,
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
    };
  } catch {
    // Malformed JSON from the model — record as validator_error, don't crash
    return {
      case_id: pair.caseId,
      endpoint: pair.endpoint,
      issues: [
        {
          severity: 'high',
          field: '_validator',
          class: 'validator_error',
          what: `Malformed JSON from validator model. Raw snippet: ${cleaned.slice(0, 200)}`,
        },
      ],
    };
  }
}

/**
 * Aggregate an array of CaseResults into the final ValidatorOutput.
 */
export function aggregateResults(
  results: CaseResult[],
  validatorModel: string,
): ValidatorOutput {
  const bySeverity = emptySeverityBucket();
  const byEndpoint: Record<string, SeverityBucket> = {};
  const flatIssues: Array<ValidatorIssue & { case_id: string; endpoint: string }> = [];
  let casesWithIssues = 0;

  for (const r of results) {
    if (r.issues.length > 0) {
      casesWithIssues++;
    }
    if (!byEndpoint[r.endpoint]) {
      byEndpoint[r.endpoint] = emptySeverityBucket();
    }
    for (const issue of r.issues) {
      const sev = issue.severity as IssueSeverity;
      addToSeverityBucket(bySeverity, sev);
      addToSeverityBucket(byEndpoint[r.endpoint], sev);
      flatIssues.push({
        ...issue,
        case_id: r.case_id,
        endpoint: r.endpoint,
      });
    }
  }

  return {
    generated_at: new Date().toISOString(),
    validator_model: validatorModel,
    total_cases: results.length,
    cases_with_issues: casesWithIssues,
    by_severity: bySeverity,
    by_endpoint: byEndpoint,
    issues: flatIssues,
  };
}

/**
 * Main validation pipeline. Loads baseline, corpus, and endpoint specs, then
 * validates each (case, endpoint) pair with the AI judge.
 */
export async function runValidation(
  options: ValidateBaselineOptions = {},
): Promise<ValidatorOutput> {
  const callFn: CallAiTextFn = options.callAiText ?? defaultCallAiText;
  const concurrency = options.concurrency ?? 3;

  // Load baseline
  const baselinePath = path.join(__dirname, 'baseline-pro25.json');
  const baseline: Record<string, Record<string, unknown>> = JSON.parse(
    readFileSync(baselinePath, 'utf-8'),
  );

  // Load corpus
  const corpus = await loadCorpus();
  const corpusMap = new Map(corpus.map((c) => [c.id, c]));

  // Build list of (caseId, endpoint) pairs
  let pairs: BaselinePair[] = [];
  for (const [caseId, endpoints] of Object.entries(baseline)) {
    for (const [endpoint, parserOutput] of Object.entries(endpoints)) {
      const corpusCase = corpusMap.get(caseId);
      if (!corpusCase) {
        console.warn(`[validate-baseline] Corpus case not found: ${caseId}, skipping`);
        continue;
      }

      let spec;
      try {
        spec = getEndpointSpec(endpoint as Endpoint);
      } catch {
        console.warn(`[validate-baseline] Unknown endpoint: ${endpoint}, skipping`);
        continue;
      }

      pairs.push({
        caseId,
        endpoint: endpoint as Endpoint,
        parserOutput,
        email: corpusCase.email,
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

  console.log(
    `[validate-baseline] Validating ${pairs.length} (case, endpoint) pairs with concurrency=${concurrency}`,
  );

  // Run with p-limit concurrency
  const pLimit = (await import('p-limit')).default;
  const limit = pLimit(concurrency);
  let completed = 0;

  const resultPromises = pairs.map((pair) =>
    limit(async () => {
      const result = await validateSinglePair(pair, callFn);
      completed++;
      const issueCount = result.issues.length;
      console.log(
        `[validate-baseline] [${completed}/${pairs.length}] ${pair.caseId}/${pair.endpoint}: ${issueCount} issue(s)`,
      );
      return result;
    }),
  );

  const results = await Promise.all(resultPromises);

  // Aggregate
  const validatorModel = resolveValidatorModel();
  const output = aggregateResults(results, validatorModel);

  return output;
}

// ─── CLI entrypoint ─────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): ValidateBaselineOptions {
  const opts: ValidateBaselineOptions = {};
  for (let i = 2; i < argv.length; i++) {
    switch (argv[i]) {
      case '--limit':
        opts.limit = parseInt(argv[++i], 10);
        break;
      case '--endpoint':
        opts.endpoint = argv[++i];
        break;
      case '--out':
        opts.outPath = argv[++i];
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
  const outPath = opts.outPath ?? DEFAULT_OUTPUT_PATH;

  const output = await runValidation(opts);

  // Ensure output directory exists
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\n[validate-baseline] Output written to ${outPath}`);
  console.log(`  total_cases: ${output.total_cases}`);
  console.log(`  cases_with_issues: ${output.cases_with_issues}`);
  console.log(`  by_severity: ${JSON.stringify(output.by_severity)}`);
}

// Only run main when executed directly (not when imported by tests)
const isDirectRun =
  typeof require !== 'undefined' &&
  require.main === module;

// For tsx / ESM, detect if this file is the entrypoint
const isTsxRun = process.argv[1] && (
  process.argv[1].endsWith('validate-baseline.ts') ||
  process.argv[1].endsWith('validate-baseline.js')
);

if (isDirectRun || isTsxRun) {
  main().catch((err) => {
    console.error('[validate-baseline] Fatal error:', err);
    process.exit(1);
  });
}

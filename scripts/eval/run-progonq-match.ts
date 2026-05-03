/**
 * progonq matching-prompt runner.
 *
 * Reads .progonq/corpus/<category>/sample-NNN.json files, invokes MATCH_PROMPT
 * via the project's lib/openai wrapper, saves results to
 * .progonq/results/run-NNN.json, and updates .progonq/budget.json with
 * char-based token-cost estimate.
 *
 * Usage:
 *   npx tsx scripts/eval/run-progonq-match.ts                  # all cases, auto run-id
 *   npx tsx scripts/eval/run-progonq-match.ts --case bulk_open_position
 *   npx tsx scripts/eval/run-progonq-match.ts --run-id run-001 --corpus-dir .progonq/corpus
 *
 * IMPORTANT: requires CLIPROXY_API_KEY env var (or .env). AI_MODEL_LIGHT
 * controls which model is invoked (default gpt-5.3-codex per constants.ts;
 * progonq config asks for gpt-4o-mini — set AI_MODEL_LIGHT=gpt-4o-mini).
 */

import * as fs from 'fs';
import * as path from 'path';
import { callAiJson, LLMTimeoutError } from '../../lib/openai';
import { MATCH_PROMPT } from '../../lib/prompts/match';
import { AI_MODEL_HEAVY } from '../../lib/constants';

interface CorpusCase {
  id: string;
  category: string;
  edge_case_summary?: string;
  input: {
    cargo_inquiries: unknown[];
    vessel_positions: unknown[];
    readiness: unknown[];
  };
}

interface RawMatch {
  cargo_email_id: string;
  cargo_item_index: number;
  vessel_email_id: string;
  vessel_item_index: number;
  score: number;
  match_level: 'good' | 'possible' | 'weak';
  match_reasons: string[];
  issues: string[];
}

interface CaseResult {
  caseId: string;
  category: string;
  inputCardinality: { cargoes: number; vessels: number; readiness_pairs: number };
  output: { matches: RawMatch[] } | null;
  parseError?: string;
  durationMs: number;
  costEstimate: { promptChars: number; outputChars: number; tokensIn: number; tokensOut: number; usd: number };
}

interface RunResult {
  runId: string;
  timestamp: string;
  model: string;
  cases: CaseResult[];
  totalsCost: { tokensIn: number; tokensOut: number; usd: number };
}

// Conservative pricing — gpt-4o-mini is $0.150/1M in, $0.600/1M out.
// gpt-5.3-codex pricing TBD; use 0.5/2.0 as rough mid-tier guard.
const PRICING_PER_1M: Record<string, { in: number; out: number }> = {
  'gpt-4o-mini': { in: 0.15, out: 0.60 },
  'gpt-5.3-codex': { in: 0.5, out: 2.0 },
  'gpt-5.5': { in: 1.25, out: 5.0 },
  default: { in: 1.0, out: 4.0 },
};

function pad3(n: number): string {
  return String(n).padStart(3, '0');
}

function nextRunId(resultsDir: string): string {
  if (!fs.existsSync(resultsDir)) return 'run-001';
  const ids = fs.readdirSync(resultsDir)
    .filter(f => /^run-\d{3}\.json$/.test(f))
    .map(f => parseInt(f.slice(4, 7), 10))
    .filter(n => !isNaN(n));
  const max = ids.length ? Math.max(...ids) : 0;
  return `run-${pad3(max + 1)}`;
}

function estimateCost(promptChars: number, outputChars: number, model: string) {
  const tokensIn = Math.ceil(promptChars / 4);
  const tokensOut = Math.ceil(outputChars / 4);
  const price = PRICING_PER_1M[model] ?? PRICING_PER_1M.default;
  const usd = (tokensIn / 1e6) * price.in + (tokensOut / 1e6) * price.out;
  return { promptChars, outputChars, tokensIn, tokensOut, usd };
}

function loadCorpus(corpusDir: string, onlyCategory?: string): CorpusCase[] {
  const cases: CorpusCase[] = [];
  if (!fs.existsSync(corpusDir)) {
    throw new Error(`Corpus directory not found: ${corpusDir}`);
  }
  const cats = fs.readdirSync(corpusDir).filter(f => {
    const full = path.join(corpusDir, f);
    return fs.statSync(full).isDirectory();
  });
  for (const cat of cats) {
    if (onlyCategory && cat !== onlyCategory) continue;
    const samples = fs.readdirSync(path.join(corpusDir, cat))
      .filter(f => f.endsWith('.json'))
      .sort();
    for (const s of samples) {
      const full = path.join(corpusDir, cat, s);
      const data = JSON.parse(fs.readFileSync(full, 'utf8')) as CorpusCase;
      cases.push(data);
    }
  }
  return cases;
}

function updateBudget(budgetPath: string, runId: string, totals: { tokensIn: number; tokensOut: number; usd: number }, failCount: number) {
  if (!fs.existsSync(budgetPath)) return;
  const b = JSON.parse(fs.readFileSync(budgetPath, 'utf8'));
  b.rounds_used = (b.rounds_used ?? 0) + 1;
  b.tokens_used_total = (b.tokens_used_total ?? 0) + totals.tokensIn + totals.tokensOut;
  b.tokens_usd_total = +((b.tokens_usd_total ?? 0) + totals.usd).toFixed(4);
  b.trajectory = b.trajectory ?? [];
  const trend = b.trajectory.length > 0 && totals.usd > b.trajectory[b.trajectory.length - 1].tokens_usd * 1.5
    ? 'spike' : (b.trajectory.length === 0 ? 'initial' : 'stable');
  b.trajectory.push({
    round: b.rounds_used,
    run_id: runId,
    tokens_used: totals.tokensIn + totals.tokensOut,
    tokens_usd: +totals.usd.toFixed(4),
    cumulative_usd: b.tokens_usd_total,
    fail_count: failCount,
    trend,
  });
  fs.writeFileSync(budgetPath, JSON.stringify(b, null, 2));
}

async function main() {
  const argv = process.argv.slice(2);
  const arg = (name: string) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };

  const repoRoot = path.resolve(__dirname, '..', '..');
  const corpusDir = arg('--corpus-dir') ?? path.join(repoRoot, '.progonq', 'corpus');
  const resultsDir = path.join(repoRoot, '.progonq', 'results');
  const budgetPath = path.join(repoRoot, '.progonq', 'budget.json');
  const onlyCategory = arg('--case');
  const runId = arg('--run-id') ?? nextRunId(resultsDir);
  const model = process.env.AI_MODEL_HEAVY || AI_MODEL_HEAVY;

  console.log(`\n🚀  progonq matching runner: ${runId}`);
  console.log(`    Corpus: ${corpusDir}${onlyCategory ? ` (only ${onlyCategory})` : ''}`);
  console.log(`    Output: ${path.join(resultsDir, `${runId}.json`)}`);
  console.log(`    Model:  ${model}\n`);

  const cases = loadCorpus(corpusDir, onlyCategory);
  if (cases.length === 0) {
    console.error('No corpus cases found.');
    process.exit(2);
  }

  if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });

  const results: CaseResult[] = [];
  let totalsIn = 0, totalsOut = 0, totalsUsd = 0, failCount = 0;

  for (const c of cases) {
    const inputCardinality = {
      cargoes: c.input.cargo_inquiries.length,
      vessels: c.input.vessel_positions.length,
      readiness_pairs: c.input.readiness.length,
    };
    const promptPayload = JSON.stringify({
      cargo_inquiries: c.input.cargo_inquiries,
      vessel_positions: c.input.vessel_positions,
      readiness: c.input.readiness,
    });
    const promptChars = promptPayload.length + MATCH_PROMPT.length;
    const t0 = Date.now();
    let output: { matches: RawMatch[] } | null = null;
    let parseError: string | undefined;

    process.stdout.write(`  ▶ ${c.id} (${inputCardinality.readiness_pairs} pairs)... `);

    try {
      output = await callAiJson<{ matches: RawMatch[] }>(
        promptPayload,
        MATCH_PROMPT,
        model,
        { matches: [] },
      );
      // callAiJson silently returns the fallback `{matches:[]}` on provider
      // errors (logged via logger.error but never thrown). For corpus cases
      // with N>=1 pre-filtered pairs an empty matches array is suspicious —
      // pre-filter contract guarantees feasible pairs reach the LLM, so a
      // healthy LLM should return ~N matches, not 0. Treat as failure so the
      // round is not falsely PASSed.
      if (
        output &&
        Array.isArray(output.matches) &&
        output.matches.length === 0 &&
        inputCardinality.readiness_pairs > 0
      ) {
        parseError = `silent fallback: 0 matches for ${inputCardinality.readiness_pairs} input pairs (likely provider error swallowed by wrapper — check logger.error output)`;
        failCount++;
      }
    } catch (err) {
      parseError = err instanceof Error ? err.message : String(err);
      if (err instanceof LLMTimeoutError) parseError = `timeout: ${parseError}`;
      failCount++;
    }

    const durationMs = Date.now() - t0;
    const outputChars = output ? JSON.stringify(output).length : 0;
    const cost = estimateCost(promptChars, outputChars, model);
    totalsIn += cost.tokensIn;
    totalsOut += cost.tokensOut;
    totalsUsd += cost.usd;

    if (parseError) console.log(`❌ ${parseError} (${durationMs}ms)`);
    else if (output) console.log(`✅ ${output.matches?.length ?? 0} matches, ~$${cost.usd.toFixed(4)}, ${durationMs}ms`);

    results.push({
      caseId: c.id,
      category: c.category,
      inputCardinality,
      output,
      ...(parseError ? { parseError } : {}),
      durationMs,
      costEstimate: cost,
    });
  }

  const runResult: RunResult = {
    runId,
    timestamp: new Date().toISOString(),
    model,
    cases: results,
    totalsCost: { tokensIn: totalsIn, tokensOut: totalsOut, usd: +totalsUsd.toFixed(4) },
  };

  const outPath = path.join(resultsDir, `${runId}.json`);
  fs.writeFileSync(outPath, JSON.stringify(runResult, null, 2));
  updateBudget(budgetPath, runId, { tokensIn: totalsIn, tokensOut: totalsOut, usd: totalsUsd }, failCount);

  console.log(`\n📊  Round summary`);
  console.log(`    Cases:      ${results.length}`);
  console.log(`    Errors:     ${failCount}`);
  console.log(`    Tokens in:  ${totalsIn.toLocaleString()}`);
  console.log(`    Tokens out: ${totalsOut.toLocaleString()}`);
  console.log(`    Est. cost:  $${totalsUsd.toFixed(4)}`);
  console.log(`    Saved → ${outPath}\n`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

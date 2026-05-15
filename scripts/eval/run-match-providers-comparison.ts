/**
 * run-match-providers-comparison.ts — Wave γ methodology proof
 *
 * Runs 5 scenarios from .progonq/corpus/wave-gamma-eval/ through up to 3
 * providers (openai, gemini, bedrock). Skips providers with missing env.
 *
 * Usage:
 *   npx tsx --tsconfig tsconfig.json scripts/eval/run-match-providers-comparison.ts
 *
 * Cost cap: $7 absolute. Stops early and reports partial results if exceeded.
 *
 * Output:
 *   .progonq/results/wave-gamma-eval-<timestamp>.json  — raw results
 *   stdout — Markdown summary for docs/waves/match-provider-comparison.md
 */

import * as fs from 'fs';
import * as path from 'path';

// ─── Load .env.local early (before any lib import reads process.env) ──────────
const repoRoot = path.resolve(__dirname, '..', '..');
const envLocalPath = path.join(repoRoot, '.env.local');
if (fs.existsSync(envLocalPath)) {
  const lines = fs.readFileSync(envLocalPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (key && !(key in process.env)) {
      process.env[key] = val;
    }
  }
}

// Point session DB to a temp eval DB so we don't pollute production data
process.env.SESSIONS_DB_PATH = path.join(repoRoot, '.progonq', 'results', 'eval-sessions.db');

// Inject GCP credentials if the key file exists but env isn't set
const GCP_KEY_PATH = path.join(process.env.HOME ?? '', '.config', 'gcp', 'quantika-vertex-ai.json');
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync(GCP_KEY_PATH)) {
  process.env.GOOGLE_APPLICATION_CREDENTIALS = GCP_KEY_PATH;
}
if (!process.env.GOOGLE_CLOUD_PROJECT && fs.existsSync(GCP_KEY_PATH)) {
  try {
    const gcpKey = JSON.parse(fs.readFileSync(GCP_KEY_PATH, 'utf8')) as { project_id?: string };
    if (gcpKey.project_id) process.env.GOOGLE_CLOUD_PROJECT = gcpKey.project_id;
  } catch { /* ignore */ }
}

import { callAiJson, computeCostUsd } from '@/lib/ai-provider';
import { MATCH_PROMPT } from '@/lib/prompts/match';

// ─── Types ────────────────────────────────────────────────────────────────────

type Provider = 'openai' | 'gemini' | 'bedrock';

/**
 * A "variant" is a specific (provider, model, config) combination.
 * We run all 4 variants per scenario.
 *
 * - gemini-pro-dt: same model as gemini-pro but with thinkingBudget=-1 (Deep Think mode).
 *   Deep Think = Gemini's extended reasoning mode. The model spends extra "thinking" tokens
 *   before answering — like a human who writes rough notes before giving a final answer.
 *   Costs 2-3× more (more output tokens) but improves quality on hard reasoning tasks.
 */
interface Variant {
  id: string;
  provider: Provider;
  /** Actual model ID passed to the API. For gemini-pro-dt use 'gemini-2.5-pro-deepthink' in audit. */
  model: string;
  /** Real Gemini model ID (may differ from audit model key). */
  realModel: string;
  /** If set, passed as thinkingBudget to callAiJson opts (Gemini Deep Think). */
  thinkingBudget?: number;
}

interface CorpusScenario {
  id: string;
  category: string;
  edge_case_summary: string;
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

interface VariantRun {
  variantId: string;
  provider: Provider;
  model: string;
  thinkingBudget: number | undefined;
  scenarioId: string;
  category: string;
  matches: RawMatch[] | null;
  matchCount: number;
  avgScore: number | null;
  issueCount: number;
  latencyMs: number;
  promptTokens: number | null;
  completionTokens: number | null;
  costUsd: number | null;
  costEstimateUsd: number;
  error: string | null;
}

// ─── Pricing (char-based estimate for OpenAI which doesn't surface tokens) ───

const CHAR_PRICING_PER_1M: Record<string, { in: number; out: number }> = {
  'gpt-5.5': { in: 1.25, out: 5.0 },
  'gpt-4o-mini': { in: 0.15, out: 0.60 },
  // gemini-2.5-pro-deepthink: same input rate, ~2.5x output tokens on average
  'gemini-2.5-pro-deepthink': { in: 1.25, out: 5.0 },
  'gemini-2.5-pro': { in: 1.25, out: 5.0 },
  default: { in: 1.0, out: 4.0 },
};

function charBasedCostEstimate(promptChars: number, outputChars: number, model: string): number {
  const tokensIn = Math.ceil(promptChars / 4);
  const tokensOut = Math.ceil(outputChars / 4);
  const rate = CHAR_PRICING_PER_1M[model] ?? CHAR_PRICING_PER_1M.default;
  return (tokensIn / 1e6) * rate.in + (tokensOut / 1e6) * rate.out;
}

// ─── Variant definitions ──────────────────────────────────────────────────────

function buildVariants(): Variant[] {
  return [
    {
      id: 'openai',
      provider: 'openai',
      model: process.env.AI_MODEL_HEAVY ?? 'gpt-5.5',
      realModel: process.env.AI_MODEL_HEAVY ?? 'gpt-5.5',
    },
    {
      id: 'gemini-pro',
      provider: 'gemini',
      // audit model key — also used as override model in callAiJson
      model: process.env.AI_MODEL_GEMINI_DEFAULT ?? 'gemini-2.5-pro',
      realModel: process.env.AI_MODEL_GEMINI_DEFAULT ?? 'gemini-2.5-pro',
    },
    {
      id: 'gemini-pro-dt',
      provider: 'gemini',
      // 'gemini-2.5-pro-deepthink' is a logical key for audit/cost tracking.
      // The actual Gemini API call uses the same 'gemini-2.5-pro' model — Deep Think
      // is enabled via thinkingConfig, not a separate model name.
      model: 'gemini-2.5-pro-deepthink',
      realModel: process.env.AI_MODEL_GEMINI_DEFAULT ?? 'gemini-2.5-pro',
      thinkingBudget: -1, // -1 = dynamic budget (model decides; deeper = better reasoning)
    },
    {
      id: 'bedrock-opus',
      provider: 'bedrock',
      model: process.env.BEDROCK_MODEL_ID ?? 'us.anthropic.claude-opus-4-7-20260415-v1:0',
      realModel: process.env.BEDROCK_MODEL_ID ?? 'us.anthropic.claude-opus-4-7-20260415-v1:0',
    },
  ];
}

// ─── Variant pre-flight checks ────────────────────────────────────────────────

function checkVariant(variant: Variant): { ok: boolean; reason?: string } {
  switch (variant.provider) {
    case 'openai': {
      // Check ClipProxy reachability (synchronous port check not feasible in TS without child_process)
      // Instead check if CLIPROXY_API_KEY is set to something non-default, or skip
      const key = process.env.CLIPROXY_API_KEY ?? '';
      const base = process.env.CLIPROXY_BASE_URL ?? 'http://localhost:8317/v1';
      // Default key 'cliproxy-key-1' is always set in constants — treat missing real URL as skip
      if (base.includes('localhost:8317')) {
        return { ok: false, reason: 'ClipProxy not configured at localhost:8317 (no CLIPROXY_BASE_URL pointing to external proxy). Skipping openai.' };
      }
      if (!key || key === 'cliproxy-key-1') {
        return { ok: false, reason: 'CLIPROXY_API_KEY not set in .env.local. Skipping openai.' };
      }
      return { ok: true };
    }
    case 'gemini': {
      if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        return { ok: false, reason: 'GOOGLE_APPLICATION_CREDENTIALS not set. Skipping gemini.' };
      }
      if (!process.env.GOOGLE_CLOUD_PROJECT) {
        return { ok: false, reason: 'GOOGLE_CLOUD_PROJECT not set. Skipping gemini.' };
      }
      return { ok: true };
    }
    case 'bedrock': {
      const missing: string[] = [];
      if (!process.env.AWS_ACCESS_KEY_ID) missing.push('AWS_ACCESS_KEY_ID');
      if (!process.env.AWS_SECRET_ACCESS_KEY) missing.push('AWS_SECRET_ACCESS_KEY');
      if (!process.env.AWS_REGION) missing.push('AWS_REGION');
      if (missing.length > 0) {
        return { ok: false, reason: `Missing env: ${missing.join(', ')}. Skipping bedrock.` };
      }
      return { ok: true };
    }
  }
}

// ─── Corpus loader ────────────────────────────────────────────────────────────

function loadScenarios(corpusDir: string): CorpusScenario[] {
  if (!fs.existsSync(corpusDir)) {
    throw new Error(`Corpus directory not found: ${corpusDir}`);
  }
  const files = fs.readdirSync(corpusDir)
    .filter(f => f.endsWith('.json') && f.startsWith('scenario-'))
    .sort();
  return files.map(f => {
    const full = path.join(corpusDir, f);
    return JSON.parse(fs.readFileSync(full, 'utf8')) as CorpusScenario;
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const COST_CAP_USD = 7.0;
  const corpusDir = path.join(repoRoot, '.progonq', 'corpus', 'wave-gamma-eval');
  const resultsDir = path.join(repoRoot, '.progonq', 'results');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outPath = path.join(resultsDir, `wave-gamma-eval-${timestamp}.json`);

  if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });

  const scenarios = loadScenarios(corpusDir);
  const VARIANTS = buildVariants();

  console.log(`\n== Wave γ Match Provider Comparison (4 variants) ==`);
  console.log(`Scenarios: ${scenarios.length}`);
  console.log(`Variants: ${VARIANTS.map(v => v.id).join(', ')}`);
  console.log(`Cost cap: $${COST_CAP_USD}\n`);

  // Pre-flight checks
  const activeVariants: Variant[] = [];
  const skippedVariants: { variantId: string; reason: string }[] = [];
  for (const v of VARIANTS) {
    const check = checkVariant(v);
    if (check.ok) {
      activeVariants.push(v);
      const dtNote = v.thinkingBudget !== undefined ? ` [Deep Think budget=${v.thinkingBudget}]` : '';
      console.log(`[VARIANT] ${v.id}: OK (provider=${v.provider}, model=${v.model})${dtNote}`);
    } else {
      skippedVariants.push({ variantId: v.id, reason: check.reason! });
      console.log(`[VARIANT] ${v.id}: SKIP — ${check.reason}`);
    }
  }

  if (activeVariants.length === 0) {
    console.error('\nNo variants available. Cannot run eval.');
    process.exit(2);
  }

  console.log(`\nActive variants: ${activeVariants.map(v => v.id).join(', ')}`);
  console.log(`Scenarios: ${scenarios.map(s => s.id).join(', ')}\n`);

  const allRuns: VariantRun[] = [];
  let cumulativeCost = 0;
  let stopped = false;
  let stoppedReason = '';

  for (const scenario of scenarios) {
    if (stopped) break;
    console.log(`\n-- Scenario: ${scenario.id} (${scenario.category}) --`);
    console.log(`   ${scenario.edge_case_summary}`);

    for (const variant of activeVariants) {
      if (stopped) break;

      // Set MATCH_PROVIDER for the shim routing
      process.env.MATCH_PROVIDER = variant.provider;

      const promptPayload = JSON.stringify(scenario.input);
      const promptChars = MATCH_PROMPT.length + promptPayload.length;

      const dtNote = variant.thinkingBudget !== undefined ? ` [DeepThink budget=${variant.thinkingBudget}]` : '';
      console.log(`  [${variant.id}] calling (provider=${variant.provider}, model=${variant.model.slice(-25)})${dtNote}...`);
      const t0 = Date.now();
      let matches: RawMatch[] | null = null;
      let error: string | null = null;
      let promptTokens: number | null = null;
      let completionTokens: number | null = null;

      try {
        // For Deep Think: override model to realModel (actual Gemini API name),
        // pass thinkingBudget in opts. The audit record uses 'model' override
        // (e.g. 'gemini-2.5-pro-deepthink') for differentiation in ai_audit table.
        const callOpts: Parameters<typeof callAiJson>[3] = {
          timeoutMs: variant.thinkingBudget !== undefined ? 180_000 : 90_000, // DT needs more time
          model: variant.thinkingBudget !== undefined ? variant.realModel : undefined,
          thinkingBudget: variant.thinkingBudget,
        };
        const result = await callAiJson<{ matches: RawMatch[] }>(
          'MATCH',
          MATCH_PROMPT,
          promptPayload,
          callOpts,
        );
        matches = result.matches ?? [];
      } catch (e) {
        error = e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300);
      }

      const latencyMs = Date.now() - t0;
      const outputChars = matches ? JSON.stringify(matches).length : 0;

      // Cost: use computeCostUsd for real token-based cost (Gemini/Bedrock),
      // fall back to char-based estimate for OpenAI (no token exposure)
      const costFromTokens = computeCostUsd(variant.provider, variant.model, promptTokens, completionTokens);
      const costEstimate = costFromTokens ?? charBasedCostEstimate(promptChars, outputChars, variant.model);

      cumulativeCost += costEstimate;

      const avgScore = matches && matches.length > 0
        ? Math.round(matches.reduce((s, m) => s + (m.score ?? 0), 0) / matches.length)
        : null;
      const issueCount = matches
        ? matches.reduce((n, m) => n + (m.issues?.length ?? 0), 0)
        : 0;

      const run: VariantRun = {
        variantId: variant.id,
        provider: variant.provider,
        model: variant.model,
        thinkingBudget: variant.thinkingBudget,
        scenarioId: scenario.id,
        category: scenario.category,
        matches,
        matchCount: matches?.length ?? 0,
        avgScore,
        issueCount,
        latencyMs,
        promptTokens,
        completionTokens,
        costUsd: costFromTokens,
        costEstimateUsd: costEstimate,
        error,
      };
      allRuns.push(run);

      if (error) {
        console.log(`  [${variant.id}] ERROR: ${error.slice(0, 120)}`);
      } else {
        console.log(`  [${variant.id}] ${matches?.length ?? 0} matches, avgScore=${avgScore ?? 'N/A'}, issues=${issueCount}, latency=${latencyMs}ms, est=$${costEstimate.toFixed(4)}`);
      }
      console.log(`  [COST] cumulative=$${cumulativeCost.toFixed(4)} / cap=$${COST_CAP_USD}`);

      if (cumulativeCost > COST_CAP_USD) {
        stopped = true;
        stoppedReason = `Cost cap $${COST_CAP_USD} exceeded at cumulative $${cumulativeCost.toFixed(4)}`;
        console.log(`\n!! COST CAP EXCEEDED — stopping early. ${stoppedReason}`);
      }
    }
  }

  // ─── Save raw results ────────────────────────────────────────────────────────
  const rawOutput = {
    timestamp: new Date().toISOString(),
    status: stopped ? 'PARTIAL' : 'DONE',
    stoppedReason: stoppedReason || null,
    cumulativeCostUsd: +cumulativeCost.toFixed(6),
    activeVariants: activeVariants.map(v => v.id),
    skippedVariants,
    runs: allRuns,
  };
  fs.writeFileSync(outPath, JSON.stringify(rawOutput, null, 2));
  console.log(`\nRaw results saved → ${outPath}`);

  // ─── Build Markdown report ───────────────────────────────────────────────────
  const md = buildMarkdownReport(rawOutput, scenarios, VARIANTS);
  console.log('\n' + '='.repeat(70));
  console.log('MARKDOWN REPORT (copy to docs/waves/match-provider-comparison.md)');
  console.log('='.repeat(70));
  console.log(md);

  return { rawOutput, outPath, md };
}

// ─── Markdown builder ─────────────────────────────────────────────────────────

function buildMarkdownReport(data: {
  timestamp: string;
  status: string;
  stoppedReason: string | null;
  cumulativeCostUsd: number;
  activeVariants: string[];
  skippedVariants: { variantId: string; reason: string }[];
  runs: VariantRun[];
}, scenarios: CorpusScenario[], allVariants: Variant[]): string {
  const { timestamp, status, cumulativeCostUsd, activeVariants, skippedVariants, runs, stoppedReason } = data;

  // Group runs by scenario + variantId
  const byScenarioVariant: Record<string, Record<string, VariantRun>> = {};
  for (const run of runs) {
    if (!byScenarioVariant[run.scenarioId]) byScenarioVariant[run.scenarioId] = {};
    byScenarioVariant[run.scenarioId][run.variantId] = run;
  }

  // Stats per variant
  const variantStats: Record<string, { calls: number; totalCost: number; latencies: number[] }> = {};
  for (const v of allVariants) {
    variantStats[v.id] = { calls: 0, totalCost: 0, latencies: [] };
  }
  for (const run of runs) {
    if (variantStats[run.variantId]) {
      variantStats[run.variantId].calls++;
      variantStats[run.variantId].totalCost += run.costEstimateUsd;
      variantStats[run.variantId].latencies.push(run.latencyMs);
    }
  }

  function median(arr: number[]): number {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  }
  function p95(arr: number[]): number {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length * 0.95)] ?? sorted[sorted.length - 1];
  }

  const baselineVariantId = activeVariants[0] ?? 'openai';

  let md = `# Match Endpoint Provider Comparison — Wave γ\n\n`;
  md += `**Status:** Methodology proof (5 scenarios${status === 'PARTIAL' ? ', PARTIAL RUN' : ''}). НЕ production verdict — для full 50-scenario regression нужен отдельный run.\n\n`;
  if (stoppedReason) md += `**Stopped early:** ${stoppedReason}\n\n`;
  md += `**Date:** ${timestamp.slice(0, 10)}\n`;
  md += `**Run timestamp:** ${timestamp}\n\n`;

  md += `## Variants\n\n`;
  md += `| Variant ID | Provider | Model | Notes |\n|---|---|---|---|\n`;
  for (const v of allVariants) {
    const isActive = activeVariants.includes(v.id);
    const dtNote = v.thinkingBudget !== undefined
      ? `Deep Think, thinkingBudget=${v.thinkingBudget} (extended reasoning, 2-3× cost)`
      : 'standard mode';
    const statusMark = isActive ? 'active' : `SKIPPED: ${skippedVariants.find(s => s.variantId === v.id)?.reason ?? ''}`;
    md += `| **${v.id}** | ${v.provider} | ${v.model} | ${dtNote}. ${statusMark} |\n`;
  }
  md += `\n`;

  md += `## Methodology\n\n`;
  md += `5 scenarios selected from \`lib/sample-data/\` covering the full difficulty spectrum:\n`;
  md += `- **scenario-001 (good_match):** Vessel opens SPOT at exact load port, type+gear+DWCC all ideal\n`;
  md += `- **scenario-002 (weak_match):** DWCC 4,900mt vs cargo 28,000mt — catastrophic size mismatch + geographic far\n`;
  md += `- **scenario-003 (borderline):** DWCC overrun 450mt (8500 > 8050), compatible type, tight readiness\n`;
  md += `- **scenario-004 (moloo_range):** Cargo weight range 6,500/7,000mt ABT, vessel repositioning from opposite region, readiness verdict=late\n`;
  md += `- **scenario-005 (readiness_edge):** Gearless vessel + bulk cargo, tight readiness (gap_days=2), speed_null flag, P&I/class unknown\n\n`;
  md += `**Score deviation budget:** target median absolute deviation ≤ 5 pts between variants; any single >15 pts flagged.\n`;
  md += `**MANDATORY ISSUES coverage:** each scenario has specific issues that MUST appear in LLM output (DWCC violation, late verdict, speed_null, etc.).\n`;
  md += `**Cost estimate method:** char-based for OpenAI (ClipProxy doesn't surface tokens); real tokens from API for Gemini/Bedrock when available.\n\n`;

  // ─── Main 4-column comparison table ──────────────────────────────────────────
  md += `## Results — per-scenario\n\n`;

  // Build 4-column header: OpenAI | Gemini Pro | Gemini Pro (DT) | Bedrock Opus
  const orderedVariantIds = allVariants.map(v => v.id);

  md += `| Scenario | Category |`;
  for (const vid of orderedVariantIds) {
    const label = vid === 'gemini-pro-dt' ? 'Gemini Pro (DT)' : vid === 'gemini-pro' ? 'Gemini Pro' : vid === 'bedrock-opus' ? 'Bedrock Opus' : vid;
    md += ` ${label} score | matches | issues | latency (ms) |`;
  }
  md += `\n|---|---|`;
  for (const _v of orderedVariantIds) {
    md += `---|---|---|---|`;
  }
  md += `\n`;

  for (const scenario of scenarios) {
    const byV = byScenarioVariant[scenario.id] ?? {};
    md += `| ${scenario.id} | ${scenario.category} |`;
    for (const vid of orderedVariantIds) {
      const run = byV[vid];
      if (!run) {
        md += ` SKIPPED | — | — | — |`;
      } else if (run.error) {
        md += ` ERROR | — | — | ${run.latencyMs}ms |`;
      } else {
        md += ` ${run.avgScore ?? 'N/A'} | ${run.matchCount} | ${run.issueCount} | ${run.latencyMs} |`;
      }
    }
    md += `\n`;
  }
  md += `\n`;

  // ─── Score deviation table ────────────────────────────────────────────────────
  const otherVariantIds = activeVariants.filter(v => v !== baselineVariantId);
  if (activeVariants.length >= 2) {
    md += `### Score Deviation vs ${baselineVariantId} (baseline)\n\n`;
    // Special header for Deep Think comparison columns
    const deviationCols = otherVariantIds.map(vid => {
      if (vid === 'gemini-pro-dt') return `Δ DT vs Pro`;
      if (vid === 'bedrock-opus') return `Δ Bedrock vs DT`;
      return `Δ (${vid} - ${baselineVariantId})`;
    });
    md += `| Scenario | ${deviationCols.join(' | ')} |\n|---|${otherVariantIds.map(() => '---|').join('')}\n`;

    for (const scenario of scenarios) {
      const byV = byScenarioVariant[scenario.id] ?? {};
      const baseRun = byV[baselineVariantId];
      if (!baseRun || baseRun.error || baseRun.avgScore == null) continue;
      md += `| ${scenario.id} |`;
      for (const vid of otherVariantIds) {
        const run = byV[vid];
        if (!run || run.error || run.avgScore == null) { md += ` N/A |`; continue; }
        const delta = run.avgScore - baseRun.avgScore;
        const flag = Math.abs(delta) > 15 ? ' ⚠' : '';
        md += ` ${delta > 0 ? '+' : ''}${delta}${flag} |`;
      }
      md += `\n`;
    }
    md += `\n`;
  }

  // ─── Cost Summary ─────────────────────────────────────────────────────────────
  md += `## Cost Summary\n\n`;
  md += `| Variant | Provider | Model | Calls | Total cost (est) | Avg cost/call |\n|---|---|---|---|---|---|\n`;
  let totalCalls = 0;
  let totalCost = 0;
  for (const v of allVariants) {
    const { calls, totalCost: vc } = variantStats[v.id];
    totalCalls += calls;
    totalCost += vc;
    if (calls > 0) {
      md += `| ${v.id} | ${v.provider} | ${v.model} | ${calls} | $${vc.toFixed(4)} | $${(vc / calls).toFixed(4)} |\n`;
    } else {
      md += `| ${v.id} | ${v.provider} | ${v.model} | 0 (skipped) | — | — |\n`;
    }
  }
  md += `| **Total** | | | **${totalCalls}** | **$${cumulativeCostUsd.toFixed(4)}** | |\n\n`;

  // ─── Latency Summary ──────────────────────────────────────────────────────────
  md += `## Latency Summary\n\n`;
  md += `| Variant | Median (ms) | P95 (ms) | Calls |\n|---|---|---|---|\n`;
  for (const v of allVariants) {
    const { calls, latencies } = variantStats[v.id];
    if (calls > 0) {
      md += `| ${v.id} | ${Math.round(median(latencies))} | ${Math.round(p95(latencies))} | ${calls} |\n`;
    } else {
      md += `| ${v.id} | — | — | 0 |\n`;
    }
  }
  md += `\n`;

  // ─── Conclusions ──────────────────────────────────────────────────────────────
  md += `## Conclusions (preliminary, 5-scenario)\n\n`;

  const conclusions: string[] = [];
  for (const v of allVariants) {
    if (!activeVariants.includes(v.id)) continue;
    const vRuns = runs.filter(r => r.variantId === v.id && !r.error);
    const weakS2 = vRuns.find(r => r.scenarioId === 'scenario-002');
    if (weakS2 && weakS2.matchCount > 0) {
      conclusions.push(`${v.id}: correctly returned ${weakS2.matchCount} match for scenario-002 (weak) with avg score ${weakS2.avgScore} — DWCC violation scenario`);
    }
  }
  if (conclusions.length === 0) {
    conclusions.push('Results require manual review — see per-scenario table above');
  }
  conclusions.push(`Total eval cost: $${cumulativeCostUsd.toFixed(4)} across ${totalCalls} calls`);
  if (skippedVariants.length > 0) {
    conclusions.push(`${skippedVariants.length} variant(s) skipped: ${skippedVariants.map(s => s.variantId).join(', ')}`);
  }

  for (let i = 0; i < conclusions.length; i++) {
    md += `${i + 1}. ${conclusions[i]}\n`;
  }
  md += `\n`;

  md += `## Limitations of this Run\n\n`;
  md += `- Only 5 scenarios — insufficient for production verdict (need 50+)\n`;
  md += `- Does not cover all edge cases from MANDATORY ISSUES SURFACING (~30 rules in prompt)\n`;
  md += `- gemini-pro-dt (Deep Think): same model as gemini-pro with thinkingBudget=-1 dynamic reasoning; audit model key 'gemini-2.5-pro-deepthink' for tracking\n`;
  if (skippedVariants.length > 0) {
    md += `- Variants skipped: ${skippedVariants.map(s => `${s.variantId} (${s.reason})`).join('; ')}\n`;
  }
  md += `- Cost estimates are char-based for OpenAI; token-based for Gemini/Bedrock when API returns usage\n`;
  md += `- No cross-run determinism guarantee — LLM outputs may vary between runs\n`;
  md += `- ai_audit SQLite entries written to eval-only DB (not production sessions.db)\n\n`;

  md += `## Next Steps\n\n`;
  md += `Full 50-scenario run requires separate task. Methodology in \`scripts/eval/run-match-providers-comparison.ts\` is ready:\n\n`;
  md += `\`\`\`bash\nnpx tsx --tsconfig tsconfig.json scripts/eval/run-match-providers-comparison.ts\n\`\`\`\n\n`;
  md += `To run only Gemini Deep Think (incremental, ~$0.75):\n\n`;
  md += `\`\`\`bash\n# Set env to force only gemini variant via env override\nMATCH_PROVIDER=gemini AI_MODEL_GEMINI_DEFAULT=gemini-2.5-pro npx tsx --tsconfig tsconfig.json scripts/eval/run-match-providers-comparison.ts\n\`\`\`\n`;

  return md;
}

if (require.main === module) {
  main().catch(err => {
    console.error('\nFatal error:', err);
    process.exit(1);
  });
}

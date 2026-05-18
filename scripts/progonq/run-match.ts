#!/usr/bin/env -S npx tsx
/**
 * progonq runner for match endpoint.
 *
 * Reuses existing parsed cargo + vessel corpora — each match scenario references
 * etms-parse-cargo/scenario-NNN.json + etms-parse-vessel/scenario-NNN.json.
 *
 * Runs analyzePairs() directly (bypass HTTP) and saves matches + blockedMatches
 * to .progonq/results/etms-match-<round>.json.
 *
 * Eval reference date is fixed (2026-05-01) so cargo laycans in May/June 2026 are future.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/progonq/run-match.ts [--round R0] [--scenario etms-match-001-...]
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { callAiJson } from '@/lib/ai-provider';
import { MATCH_PROMPT } from '@/lib/prompts';
import { analyzePairs, AiScorer, RawMatch } from '@/lib/matching/pair-analyzer';
import { parseCargoAIResponse } from '@/lib/parsing/parse-cargo-ai';
import { parseVesselAIResponse } from '@/lib/parsing/parse-vessel-helpers';

const SCOPE = 'MATCH';
const REQUEST_DELAY_MS = 600;
const EVAL_REF_DATE = new Date('2026-05-01T00:00:00Z');

const CORPUS_ROOT = path.resolve(process.cwd(), '.progonq/corpus');
const MATCH_CORPUS_DIR = path.join(CORPUS_ROOT, 'etms-match');
const RESULTS_DIR = path.resolve(process.cwd(), '.progonq/results');

interface MatchScenario {
  id: string;
  category: 'strong' | 'marginal' | 'weak' | 'no-match';
  cargo_ref: string;
  vessel_ref: string;
  expected: {
    should_be_hard_filtered: boolean;
    match_level: string | null;
    score_range: [number, number] | null;
    must_cite_facts: string[];
    must_NOT_invent: string[];
    hard_filter_reason?: string;
  };
  notes?: string;
}

interface RunResult {
  scenario_id: string;
  category: string;
  duration_ms: number;
  cargo_ref: string;
  vessel_ref: string;
  expected: MatchScenario['expected'];
  matches: unknown[];
  blocked_matches: unknown[];
  error?: string;
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

function loadParsedCargo(refPath: string) {
  const fullPath = path.join(CORPUS_ROOT, `${refPath}.json`);
  const sc = JSON.parse(readFileSync(fullPath, 'utf-8'));
  const raw = JSON.stringify(sc.reference_output);
  return parseCargoAIResponse(raw, sc.id);
}

function loadParsedVessel(refPath: string) {
  const fullPath = path.join(CORPUS_ROOT, `${refPath}.json`);
  const sc = JSON.parse(readFileSync(fullPath, 'utf-8'));
  const raw = JSON.stringify(sc.reference_output);
  const subject = sc.input?.subject ?? null;
  return parseVesselAIResponse(raw, sc.id, subject);
}

async function runScenario(scenario: MatchScenario): Promise<RunResult> {
  const t0 = Date.now();

  let parsedCargos, parsedVessels;
  try {
    parsedCargos = loadParsedCargo(scenario.cargo_ref);
    parsedVessels = loadParsedVessel(scenario.vessel_ref);
  } catch (e: unknown) {
    return {
      scenario_id: scenario.id,
      category: scenario.category,
      duration_ms: Date.now() - t0,
      cargo_ref: scenario.cargo_ref,
      vessel_ref: scenario.vessel_ref,
      expected: scenario.expected,
      matches: [],
      blocked_matches: [],
      error: `load_error: ${(e instanceof Error ? e.message : String(e)).slice(0, 200)}`,
    };
  }

  if (parsedCargos.length === 0 || parsedVessels.length === 0) {
    return {
      scenario_id: scenario.id,
      category: scenario.category,
      duration_ms: Date.now() - t0,
      cargo_ref: scenario.cargo_ref,
      vessel_ref: scenario.vessel_ref,
      expected: scenario.expected,
      matches: [],
      blocked_matches: [],
      error: `empty_parse: cargos=${parsedCargos.length} vessels=${parsedVessels.length}`,
    };
  }

  const aiScorer: AiScorer = async ({ cargoData, vesselData, readinessData }) => {
    const promptPayload = JSON.stringify({
      cargo_inquiries: cargoData,
      vessel_positions: vesselData,
      readiness: readinessData,
    });
    let lastErr = '';
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const result = await callAiJson<{ matches: RawMatch[] }>(
          SCOPE,
          MATCH_PROMPT,
          promptPayload,
          { timeoutMs: 120_000, maxTokens: 32_000 },
        );
        return result.matches || [];
      } catch (e: unknown) {
        lastErr = (e instanceof Error ? e.message : String(e)).slice(0, 160);
        console.error(`  [${scenario.id}] scorer attempt ${attempt} ERR: ${lastErr} — retry in ${attempt * 2}s`);
        await sleep(attempt * 2_000);
      }
    }
    throw new Error(`aiScorer failed after 3 attempts: ${lastErr}`);
  };

  try {
    const { matches, blockedMatches } = await analyzePairs(
      parsedCargos,
      parsedVessels,
      aiScorer,
      { refYear: EVAL_REF_DATE.getUTCFullYear(), today: EVAL_REF_DATE },
    );
    return {
      scenario_id: scenario.id,
      category: scenario.category,
      duration_ms: Date.now() - t0,
      cargo_ref: scenario.cargo_ref,
      vessel_ref: scenario.vessel_ref,
      expected: scenario.expected,
      matches,
      blocked_matches: blockedMatches,
    };
  } catch (e: unknown) {
    return {
      scenario_id: scenario.id,
      category: scenario.category,
      duration_ms: Date.now() - t0,
      cargo_ref: scenario.cargo_ref,
      vessel_ref: scenario.vessel_ref,
      expected: scenario.expected,
      matches: [],
      blocked_matches: [],
      error: `analyze_error: ${(e instanceof Error ? e.message : String(e)).slice(0, 200)}`,
    };
  }
}

async function main() {
  mkdirSync(RESULTS_DIR, { recursive: true });
  const roundIdx = process.argv.indexOf('--round');
  const round = roundIdx >= 0 ? process.argv[roundIdx + 1] : 'R0';
  const sidIdx = process.argv.indexOf('--scenario');
  const onlySid = sidIdx >= 0 ? process.argv[sidIdx + 1] : null;

  const outPath = path.join(RESULTS_DIR, `etms-match-${round}.json`);
  const existing: RunResult[] = existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf-8')) : [];
  const done = new Set(existing.map(r => r.scenario_id));

  const files = readdirSync(MATCH_CORPUS_DIR).filter(f => f.startsWith('scenario-') && f.endsWith('.json')).sort();
  const results: RunResult[] = [...existing];

  let okCount = existing.filter(r => !r.error).length;
  let errCount = existing.filter(r => r.error).length;
  let count = 0;

  console.error(`[run-match] round=${round} total=${files.length} pending=${files.length - existing.length}`);

  for (const file of files) {
    const sc = JSON.parse(readFileSync(path.join(MATCH_CORPUS_DIR, file), 'utf-8')) as MatchScenario;
    if (onlySid && sc.id !== onlySid) continue;
    if (done.has(sc.id)) continue;
    const r = await runScenario(sc);
    results.push(r);
    if (r.error) errCount++; else okCount++;
    count++;
    writeFileSync(outPath, JSON.stringify(results, null, 2));
    console.error(`[run-match] ${count}/${files.length - existing.length} [${sc.id}] matches=${r.matches.length} blocked=${r.blocked_matches.length} ${r.error ? 'ERR: ' + r.error : 'ok'} (${r.duration_ms}ms)`);
    await sleep(REQUEST_DELAY_MS);
  }

  console.error(`\n[run-match] DONE round=${round} ok=${okCount} err=${errCount}`);
  console.error(`Output: ${outPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });

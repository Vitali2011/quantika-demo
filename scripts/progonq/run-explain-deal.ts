#!/usr/bin/env -S npx tsx
/**
 * progonq runner for explain-deal endpoint.
 *
 * Reads scenarios from .progonq/corpus/etms-explain-deal/, calls callAiText
 * directly (bypasses HTTP/session), saves raw outputs + parsed sections to
 * .progonq/results/etms-explain-deal-<round>.json.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/progonq/run-explain-deal.ts [--round R0] [--scenario etms-explain-deal-001]
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { callAiText } from '@/lib/ai-provider';
import {
  EXPLAIN_DEAL_SYSTEM_PROMPT_EN,
  EXPLAIN_DEAL_SYSTEM_PROMPT_AR,
} from '@/lib/prompts';
import type { Match, ParsedCargo, ParsedVessel } from '@/lib/types';
import type { RunResult, ExpectedCriteria } from './judge-explain-deal';

const SCOPE = 'EXPLAIN_DEAL';
const REQUEST_DELAY_MS = 1200;

const CORPUS_DIR = path.resolve(process.cwd(), '.progonq/corpus/etms-explain-deal');
const RESULTS_DIR = path.resolve(process.cwd(), '.progonq/results');

const SECTION_HEADERS_EN = [
  'Market Context',
  'Deal Rationale',
  'Key Risks',
  'Recommended Next Steps',
] as const;

const SECTION_HEADERS_AR = [
  'سياق السوق',
  'مبررات الصفقة',
  'المخاطر الرئيسية',
  'الخطوات التالية الموصى بها',
] as const;

// ─── Scenario shape ───────────────────────────────────────────────────────────

interface ExplainDealScenario {
  id: string;
  source: string;
  category: string;
  language: 'en' | 'ar';
  input: {
    match: Match;
    cargo: ParsedCargo | null;
    vessel: ParsedVessel | null;
  };
  expected: ExpectedCriteria;
}

// ─── Section parser (mirrors route.ts logic — kept local to avoid modifying prod) ──

function findHeaderIdx(text: string, header: string): number {
  const escaped = header.replace(/[.*+?^\${}()|[\]\\]/g, '\\$&');
  const anchored = new RegExp(
    `(^|\\n)\\s*(?:\\*\\*|#{1,4}\\s*|\\d+\\.\\s*)?${escaped}(?:\\*\\*|:)?\\s*(?=\\n|$)`,
  );
  const m = anchored.exec(text);
  if (m) return m.index + m[0].indexOf(header);
  return text.indexOf(header);
}

function parseSections(text: string, headers: readonly string[]) {
  return headers.map((header, i) => {
    const nextHeader = headers[i + 1];
    const headerIdx = findHeaderIdx(text, header);
    if (headerIdx === -1) return { heading: header, content: '' };

    const afterHeader = text.slice(headerIdx + header.length);
    const contentStart = afterHeader.replace(/^[\s:*\n]+/, '');
    let content: string;
    if (nextHeader) {
      const nextIdx = findHeaderIdx(contentStart, nextHeader);
      content = nextIdx !== -1 ? contentStart.slice(0, nextIdx).trim() : contentStart.trim();
    } else {
      content = contentStart.trim();
    }
    return { heading: header, content };
  });
}

// ─── Prompt builder (mirrors route.ts buildUserPrompt) ────────────────────────

function buildUserPrompt(match: Match, cargo: ParsedCargo | null, vessel: ParsedVessel | null): string {
  return `MATCH DATA:

Score: ${match.score}/100 (${match.matchLevel.toUpperCase()})
Match Reasons: ${match.matchReasons.join('; ') || 'none'}
Issues: ${match.issues.join('; ') || 'none'}

CARGO:
${cargo ? JSON.stringify(cargo, null, 2) : 'Not available'}

VESSEL:
${vessel ? JSON.stringify(vessel, null, 2) : 'Not available'}

ECONOMICS:
${match.economics ? JSON.stringify(match.economics, null, 2) : 'Not available'}

SCORE BREAKDOWN:
${match.scoreBreakdown ? JSON.stringify(match.scoreBreakdown, null, 2) : 'Not available'}

Please produce the 4-section narrative based on this data.`;
}

// ─── Runner ───────────────────────────────────────────────────────────────────

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

async function runScenario(sc: ExplainDealScenario): Promise<RunResult> {
  const t0 = Date.now();
  const headers = sc.language === 'ar' ? SECTION_HEADERS_AR : SECTION_HEADERS_EN;
  const systemPrompt = sc.language === 'ar' ? EXPLAIN_DEAL_SYSTEM_PROMPT_AR : EXPLAIN_DEAL_SYSTEM_PROMPT_EN;
  const userPrompt = buildUserPrompt(sc.input.match, sc.input.cargo, sc.input.vessel);

  let lastErr = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const rawText = await callAiText(SCOPE, systemPrompt, userPrompt, {
        timeoutMs: 90_000,
      });
      const sections = parseSections(rawText, headers);
      return {
        scenario_id: sc.id,
        category: sc.category,
        language: sc.language,
        duration_ms: Date.now() - t0,
        raw_text: rawText,
        sections,
        expected: sc.expected,
      };
    } catch (e: unknown) {
      lastErr = (e instanceof Error ? e.message : String(e)).slice(0, 200);
      console.error(`  [${sc.id}] attempt ${attempt} ERR: ${lastErr} — retry in ${attempt * 2}s`);
      await sleep(attempt * 2_000);
    }
  }

  return {
    scenario_id: sc.id,
    category: sc.category,
    language: sc.language,
    duration_ms: Date.now() - t0,
    raw_text: '',
    sections: [],
    expected: sc.expected,
    error: `ai_error after 3 attempts: ${lastErr}`,
  };
}

async function main() {
  mkdirSync(RESULTS_DIR, { recursive: true });

  const roundIdx = process.argv.indexOf('--round');
  const round = roundIdx >= 0 ? process.argv[roundIdx + 1] : 'R0';
  const sidIdx = process.argv.indexOf('--scenario');
  const onlySid = sidIdx >= 0 ? process.argv[sidIdx + 1] : null;

  const outPath = path.join(RESULTS_DIR, `etms-explain-deal-${round}.json`);
  const existing: RunResult[] = existsSync(outPath)
    ? JSON.parse(readFileSync(outPath, 'utf-8'))
    : [];
  const done = new Set(existing.map(r => r.scenario_id));
  const results: RunResult[] = [...existing];

  const files = readdirSync(CORPUS_DIR)
    .filter(f => f.startsWith('scenario-') && f.endsWith('.json'))
    .sort();

  let okCount = existing.filter(r => !r.error).length;
  let errCount = existing.filter(r => r.error).length;
  let count = 0;

  console.error(`[run-explain-deal] round=${round} total=${files.length} pending=${files.length - existing.length}`);

  for (const file of files) {
    const sc = JSON.parse(readFileSync(path.join(CORPUS_DIR, file), 'utf-8')) as ExplainDealScenario;
    if (onlySid && sc.id !== onlySid) continue;
    if (done.has(sc.id)) continue;

    const r = await runScenario(sc);
    results.push(r);
    if (r.error) errCount++; else okCount++;
    count++;

    writeFileSync(outPath, JSON.stringify(results, null, 2));
    console.error(`[run-explain-deal] ${count}/${files.length - existing.length} [${sc.id}] sections=${r.sections.length} ${r.error ? 'ERR: ' + r.error : 'ok'} (${r.duration_ms}ms)`);
    await sleep(REQUEST_DELAY_MS);
  }

  console.error(`\n[run-explain-deal] DONE round=${round} ok=${okCount} err=${errCount}`);
  console.error(`Output: ${outPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });

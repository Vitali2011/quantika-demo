#!/usr/bin/env -S npx tsx
/**
 * progonq judge for match endpoint.
 *
 * Reads .progonq/results/etms-match-<round>.json and produces a comparison
 * report against expected outcomes. Not PASS/FAIL — exploratory baseline.
 *
 * Usage:
 *   npx tsx scripts/progonq/judge-match.ts [--round R0]
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const RESULTS_DIR = path.resolve(process.cwd(), '.progonq/results');

interface ScoreBreakdownComp {
  label: string;
  points: number;
  max: number;
  reason?: string;
}

interface MatchOutput {
  cargoEmailId: string;
  cargoItemIndex: number;
  vesselEmailId: string;
  vesselItemIndex: number;
  score: number;
  matchLevel: string;
  matchReasons: string[];
  issues: string[];
  readiness?: { verdict?: string; gapDays?: number | null };
  scoreBreakdown?: { components?: ScoreBreakdownComp[] };
}

interface RunResult {
  scenario_id: string;
  category: string;
  duration_ms: number;
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
  matches: MatchOutput[];
  blocked_matches: unknown[];
  error?: string;
}

interface Verdict {
  scenario_id: string;
  category: string;
  pass_count: number;
  fail_count: number;
  warn_count: number;
  notes: string[];
}

function checkSubstring(haystack: string, needles: string[]): string[] {
  const found: string[] = [];
  const lower = haystack.toLowerCase();
  for (const n of needles) {
    if (lower.includes(n.toLowerCase())) found.push(n);
  }
  return found;
}

/**
 * Fuzzy fact check: at least one significant word from `fact` must appear
 * in `reasonsText`. We strip stop-words and require ≥1 distinctive word.
 */
function factCited(fact: string, reasonsText: string): boolean {
  const stop = new Set(['the', 'and', 'or', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'with', 'is', 'vs', 'be', 'of', 'mt']);
  const words = fact.toLowerCase().split(/[\s,()-]+/).filter(w => w.length >= 4 && !stop.has(w));
  const lower = reasonsText.toLowerCase();
  // Require ≥2 distinctive words from fact present in reasons (rough semantic match)
  let hits = 0;
  for (const w of words) {
    if (lower.includes(w)) hits++;
    if (hits >= 2) return true;
  }
  return false;
}

function judgeOne(r: RunResult): Verdict {
  const v: Verdict = {
    scenario_id: r.scenario_id,
    category: r.category,
    pass_count: 0,
    fail_count: 0,
    warn_count: 0,
    notes: [],
  };

  if (r.error) {
    v.notes.push(`ERROR: ${r.error}`);
    v.fail_count++;
    return v;
  }

  const exp = r.expected;

  // Aggregate text from all matches' reasons and issues for hallucination/fact checks
  const allReasonsText = r.matches.flatMap(m => m.matchReasons || []).join('\n');
  const allIssuesText = r.matches.flatMap(m => m.issues || []).join('\n');
  const combinedText = `${allReasonsText}\n${allIssuesText}`;

  // ─── 1. Hard-filter check (for no-match scenarios) ──────────────────────────
  if (exp.should_be_hard_filtered) {
    if (r.matches.length === 0) {
      v.notes.push(`✓ Hard-filtered as expected (matches=0, blocked=${r.blocked_matches.length})`);
      v.pass_count++;
    } else {
      v.notes.push(`✗ EXPECTED hard-filter but got ${r.matches.length} match(es). Hard-filter reason: ${exp.hard_filter_reason}`);
      v.fail_count++;
      for (const m of r.matches) {
        v.notes.push(`    Match: score=${m.score} level=${m.matchLevel}`);
      }
    }
  } else {
    // ─── 2. Score range check ───────────────────────────────────────────────
    if (exp.score_range && r.matches.length > 0) {
      const [min, max] = exp.score_range;
      const scores = r.matches.map(m => m.score);
      const inRange = scores.filter(s => s >= min && s <= max);
      if (inRange.length === scores.length) {
        v.notes.push(`✓ All ${scores.length} match scores ${scores.join(',')} in expected [${min},${max}]`);
        v.pass_count++;
      } else {
        v.notes.push(`✗ Scores ${scores.join(',')} — expected [${min},${max}]`);
        v.fail_count++;
      }
    } else if (r.matches.length === 0) {
      v.notes.push(`⚠ No matches in output (expected ${exp.match_level} score ${exp.score_range?.join('-')})`);
      v.warn_count++;
    }

    // ─── 3. Match level check ───────────────────────────────────────────────
    if (exp.match_level && r.matches.length > 0) {
      const levels = r.matches.map(m => m.matchLevel);
      const allMatch = levels.every(l => l === exp.match_level);
      if (allMatch) {
        v.notes.push(`✓ All match_level = ${exp.match_level}`);
        v.pass_count++;
      } else {
        v.notes.push(`✗ match_level got [${levels.join(',')}] — expected ${exp.match_level}`);
        v.fail_count++;
      }
    }

    // ─── 4. Must-cite facts check ───────────────────────────────────────────
    if (exp.must_cite_facts.length > 0) {
      const cited: string[] = [];
      const missing: string[] = [];
      for (const fact of exp.must_cite_facts) {
        if (factCited(fact, combinedText)) cited.push(fact);
        else missing.push(fact);
      }
      if (cited.length === exp.must_cite_facts.length) {
        v.notes.push(`✓ All ${cited.length} must-cite facts present (semantic)`);
        v.pass_count++;
      } else {
        v.notes.push(`⚠ ${cited.length}/${exp.must_cite_facts.length} must-cite facts present`);
        for (const m of missing) v.notes.push(`    MISSING: "${m}"`);
        v.warn_count++;
      }
    }
  }

  // ─── 5. Hallucination check (all scenarios) ───────────────────────────────
  if (exp.must_NOT_invent.length > 0) {
    // Check for incriminating substrings (must be specific to avoid false positives)
    const tripWords: Record<string, string[]> = {
      'P&I IG-club satisfied': ['p&i ig', 'p&i club satisfied', 'ig club satisfied', 'ig p&i satisfied'],
      'Hold cleanliness restriction': ['hold cleanliness satisfied', 'cleaning restriction satisfied'],
      'Charterer-specific policy': ['cargill strict', 'trafigura refuses', 'vitol policy', 'glencore strict'],
      'Vetting clearance': ['vetting clearance satisfied', 'vetting passed', 'rightship clearance'],
    };
    const hits: string[] = [];
    for (const guard of exp.must_NOT_invent) {
      const matchKey = Object.keys(tripWords).find(k => guard.includes(k.split(' —')[0].split(':')[0]));
      const trips = matchKey ? tripWords[matchKey] : [];
      const found = checkSubstring(combinedText, trips);
      if (found.length > 0) hits.push(`${guard}: ${found.join(', ')}`);
    }
    if (hits.length === 0) {
      v.notes.push(`✓ No hallucinations from ${exp.must_NOT_invent.length} guards`);
      v.pass_count++;
    } else {
      v.notes.push(`✗ HALLUCINATION HITS:`);
      for (const h of hits) v.notes.push(`    ${h}`);
      v.fail_count++;
    }
  }

  return v;
}

function summarizeBreakdown(r: RunResult): string {
  if (r.matches.length === 0) return '';
  const m = r.matches[0];
  if (!m.scoreBreakdown?.components) return '';
  return m.scoreBreakdown.components
    .map(c => `${c.label}=${c.points}/${c.max}`)
    .join(', ');
}

function main() {
  const roundIdx = process.argv.indexOf('--round');
  const round = roundIdx >= 0 ? process.argv[roundIdx + 1] : 'R0';
  const resultsPath = path.join(RESULTS_DIR, `etms-match-${round}.json`);
  const results: RunResult[] = JSON.parse(readFileSync(resultsPath, 'utf-8'));

  const verdicts: Verdict[] = results.map(judgeOne);

  // ─── Aggregate stats ──────────────────────────────────────────────────────
  const byCategory: Record<string, { pass: number; fail: number; warn: number; total: number }> = {};
  for (const v of verdicts) {
    if (!byCategory[v.category]) byCategory[v.category] = { pass: 0, fail: 0, warn: 0, total: 0 };
    byCategory[v.category].total += 1;
    byCategory[v.category].pass += v.pass_count;
    byCategory[v.category].fail += v.fail_count;
    byCategory[v.category].warn += v.warn_count;
  }

  // ─── Build markdown report ────────────────────────────────────────────────
  const lines: string[] = [];
  lines.push(`# match parser eval — round ${round}`);
  lines.push('');
  lines.push(`**Scenarios:** ${results.length}`);
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push('');
  lines.push('## Summary by category');
  lines.push('');
  lines.push('| Category | Scenarios | Pass checks | Warn | Fail |');
  lines.push('|---|---|---|---|---|');
  for (const [cat, s] of Object.entries(byCategory)) {
    lines.push(`| ${cat} | ${s.total} | ${s.pass} | ${s.warn} | ${s.fail} |`);
  }
  lines.push('');
  lines.push('## Per-scenario detail');
  lines.push('');

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const v = verdicts[i];
    lines.push(`### ${v.scenario_id} (${v.category})`);
    lines.push('');
    lines.push(`**Cargo:** \`${r.cargo_ref}\` | **Vessel:** \`${r.vessel_ref}\` | **Duration:** ${r.duration_ms}ms`);
    lines.push('');

    const exp = r.expected;
    if (exp.should_be_hard_filtered) {
      lines.push(`**Expected:** hard-filter drop. Reason: ${exp.hard_filter_reason}`);
    } else {
      lines.push(`**Expected:** level=\`${exp.match_level}\` score=${exp.score_range?.join('-')}`);
    }

    if (r.matches.length > 0) {
      lines.push('');
      lines.push('**Got:**');
      for (const m of r.matches) {
        lines.push(`- score=${m.score} level=\`${m.matchLevel}\` readiness=\`${m.readiness?.verdict ?? '?'}\` gap=${m.readiness?.gapDays ?? '?'}d`);
      }
      const bd = summarizeBreakdown(r);
      if (bd) lines.push(`- breakdown: ${bd}`);
    } else {
      lines.push('');
      lines.push(`**Got:** 0 matches (blocked=${r.blocked_matches.length})`);
    }

    lines.push('');
    lines.push(`**Verdict:** pass=${v.pass_count} warn=${v.warn_count} fail=${v.fail_count}`);
    lines.push('');
    for (const n of v.notes) lines.push(n.startsWith('    ') ? n : `- ${n}`);
    lines.push('');
  }

  const outPath = path.join(RESULTS_DIR, `etms-match-${round}-report.md`);
  writeFileSync(outPath, lines.join('\n'));
  console.log(`Report: ${outPath}`);
  console.log('');
  console.log('Summary:');
  for (const [cat, s] of Object.entries(byCategory)) {
    console.log(`  ${cat}: ${s.total} scenarios, ${s.pass}P ${s.warn}W ${s.fail}F`);
  }
}

main();

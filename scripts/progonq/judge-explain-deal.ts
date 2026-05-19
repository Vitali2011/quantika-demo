#!/usr/bin/env -S npx tsx
/**
 * progonq judge for explain-deal endpoint.
 *
 * Reads .progonq/results/etms-explain-deal-<round>.json and produces a quality
 * report against per-scenario expected criteria.
 *
 * Checks:
 *   1. Section presence — all 4 expected sections present and non-empty
 *   2. Fact citation — must_cite_facts strings appear in output
 *   3. Hallucination guard — must_not_contain strings absent from output
 *   4. Language — output language matches expected (en/ar)
 *
 * Usage:
 *   npx tsx scripts/progonq/judge-explain-deal.ts [--round R0]
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const RESULTS_DIR = path.resolve(process.cwd(), '.progonq/results');

// ─── Types (exported for tests) ───────────────────────────────────────────────

export interface ExpectedCriteria {
  sections_present: string[];
  must_cite_facts: string[];
  must_not_contain: string[];
  language: 'en' | 'ar';
}

export interface RunResult {
  scenario_id: string;
  category: string;
  language: 'en' | 'ar';
  duration_ms: number;
  raw_text: string;
  sections: { heading: string; content: string }[];
  expected: ExpectedCriteria;
  error?: string;
}

export interface SectionCheck {
  header: string;
  verdict: 'PASS' | 'WARN' | 'FAIL';
  note: string;
}

export interface FactCheck {
  fact: string;
  verdict: 'PASS' | 'FAIL';
  note: string;
}

export interface HallucinationCheck {
  guard: string;
  passed: boolean;
  note: string;
}

export interface LanguageCheck {
  expected: 'en' | 'ar';
  detected: 'en' | 'ar';
  passed: boolean;
  note: string;
}

export interface ScenarioVerdict {
  scenario_id: string;
  category: string;
  overall: 'PASS' | 'WARN' | 'FAIL';
  section_checks: SectionCheck[];
  fact_checks: FactCheck[];
  hallucination_checks: HallucinationCheck[];
  language_check: LanguageCheck;
  notes: string[];
  pass_count: number;
  warn_count: number;
  fail_count: number;
}

// ─── Core judge functions (exported for tests) ────────────────────────────────

/**
 * Check whether each expected section header is present in the raw text
 * and has non-empty content.
 *
 * PASS: header found and content non-empty
 * WARN: header found but content is effectively empty (whitespace only)
 * FAIL: header not found in text
 */
function lineAnchoredIdx(text: string, header: string): number {
  const escaped = header.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('(^|\\n)' + escaped, 'i');
  const m = re.exec(text);
  if (!m) return -1;
  return m.index + m[1].length;
}

export function checkSections(text: string, expectedHeaders: string[]): SectionCheck[] {
  const results: SectionCheck[] = [];

  for (let i = 0; i < expectedHeaders.length; i++) {
    const header = expectedHeaders[i];
    const nextHeader = expectedHeaders[i + 1];

    const headerIdx = lineAnchoredIdx(text, header);
    if (headerIdx === -1) {
      results.push({ header, verdict: 'FAIL', note: `Section "${header}" not found in output` });
      continue;
    }

    // Extract content between this header and the next (use line-anchored search for next too)
    const afterHeader = text.slice(headerIdx + header.length);
    let content: string;
    if (nextHeader) {
      const nextIdx = lineAnchoredIdx(afterHeader, nextHeader);
      content = nextIdx !== -1 ? afterHeader.slice(0, nextIdx) : afterHeader;
    } else {
      content = afterHeader;
    }

    const trimmed = content.trim();
    if (!trimmed) {
      results.push({ header, verdict: 'WARN', note: `Section "${header}" present but empty` });
    } else {
      results.push({ header, verdict: 'PASS', note: `Section "${header}" present (${trimmed.length} chars)` });
    }
  }

  return results;
}

/**
 * Check whether each fact string appears in the output text.
 * Normalizes comma-separated numbers (8,000 → 8000) for numeric facts.
 * Case-insensitive match.
 *
 * PASS: fact found
 * FAIL: fact not found
 */
export function checkCitedFacts(text: string, facts: string[]): FactCheck[] {
  const lower = text.toLowerCase().replace(/,(\d)/g, '$1'); // normalize 8,000 → 8000

  return facts.map(fact => {
    const normalized = fact.toLowerCase().replace(/,(\d)/g, '$1');
    if (lower.includes(normalized)) {
      return { fact, verdict: 'PASS', note: `"${fact}" cited in output` };
    }
    return { fact, verdict: 'FAIL', note: `"${fact}" NOT found in output` };
  });
}

/**
 * Check that none of the guard strings appear in the output text.
 * Case-insensitive match.
 *
 * passed=true: guard string absent (no hallucination)
 * passed=false: guard string found (hallucination detected)
 */
export function checkHallucinations(text: string, guards: string[]): HallucinationCheck[] {
  const lower = text.toLowerCase();

  return guards.map(guard => {
    const needle = guard.toLowerCase();
    if (lower.includes(needle)) {
      return { guard, passed: false, note: `HALLUCINATION: "${guard}" found in output` };
    }
    return { guard, passed: true, note: `Guard clean: "${guard}" absent` };
  });
}

/**
 * Detect whether text is predominantly Arabic or English.
 * Uses Unicode Arabic block range (0600-06FF) character ratio.
 *
 * Returns 'ar' if >20% of alphabetic characters are Arabic, otherwise 'en'.
 */
export function detectLanguage(text: string): 'en' | 'ar' {
  let arabicCount = 0;
  let alphaCount = 0;

  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    const isArabic = code >= 0x0600 && code <= 0x06ff;
    const isAlpha = /\p{L}/u.test(ch);

    if (isAlpha) {
      alphaCount++;
      if (isArabic) arabicCount++;
    }
  }

  if (alphaCount === 0) return 'en';
  return arabicCount / alphaCount > 0.2 ? 'ar' : 'en';
}

// ─── Main judge function ──────────────────────────────────────────────────────

export function judgeOne(r: RunResult): ScenarioVerdict {
  const notes: string[] = [];
  let passCount = 0;
  let warnCount = 0;
  let failCount = 0;

  // Error shortcircuit
  if (r.error) {
    notes.push(`ERROR: ${r.error}`);
    return {
      scenario_id: r.scenario_id,
      category: r.category,
      overall: 'FAIL',
      section_checks: [],
      fact_checks: [],
      hallucination_checks: [],
      language_check: {
        expected: r.expected.language,
        detected: 'en',
        passed: false,
        note: 'Runner error — no output to check',
      },
      notes,
      pass_count: 0,
      warn_count: 0,
      fail_count: 1,
    };
  }

  // 1. Section presence
  const sectionChecks = checkSections(r.raw_text, r.expected.sections_present);
  for (const sc of sectionChecks) {
    if (sc.verdict === 'PASS') passCount++;
    else if (sc.verdict === 'WARN') warnCount++;
    else failCount++;
    notes.push(sc.verdict === 'PASS' ? `✓ ${sc.note}` : sc.verdict === 'WARN' ? `⚠ ${sc.note}` : `✗ ${sc.note}`);
  }

  // 2. Fact citation
  const factChecks = checkCitedFacts(r.raw_text, r.expected.must_cite_facts);
  for (const fc of factChecks) {
    if (fc.verdict === 'PASS') passCount++;
    else { failCount++; notes.push(`✗ FACT MISSING: ${fc.note}`); }
  }
  if (factChecks.length > 0) {
    const cited = factChecks.filter(f => f.verdict === 'PASS').length;
    notes.push(`Facts cited: ${cited}/${factChecks.length}`);
  }

  // 3. Hallucination guard
  const hallucinationChecks = checkHallucinations(r.raw_text, r.expected.must_not_contain);
  for (const hc of hallucinationChecks) {
    if (hc.passed) passCount++;
    else {
      failCount++;
      notes.push(`✗ ${hc.note}`);
    }
  }

  // 4. Language check
  const detected = detectLanguage(r.raw_text);
  const langPassed = detected === r.expected.language;
  const languageCheck: LanguageCheck = {
    expected: r.expected.language,
    detected,
    passed: langPassed,
    note: langPassed
      ? `Language correct: ${detected}`
      : `Language mismatch: expected ${r.expected.language}, got ${detected}`,
  };
  if (langPassed) passCount++;
  else {
    failCount++;
    notes.push(`✗ ${languageCheck.note}`);
  }

  const overall: 'PASS' | 'WARN' | 'FAIL' =
    failCount > 0 ? 'FAIL' : warnCount > 0 ? 'WARN' : 'PASS';

  return {
    scenario_id: r.scenario_id,
    category: r.category,
    overall,
    section_checks: sectionChecks,
    fact_checks: factChecks,
    hallucination_checks: hallucinationChecks,
    language_check: languageCheck,
    notes,
    pass_count: passCount,
    warn_count: warnCount,
    fail_count: failCount,
  };
}

// ─── CLI entrypoint ───────────────────────────────────────────────────────────

function main() {
  const roundIdx = process.argv.indexOf('--round');
  const round = roundIdx >= 0 ? process.argv[roundIdx + 1] : 'R0';

  const resultsPath = path.join(RESULTS_DIR, `etms-explain-deal-${round}.json`);
  const results: RunResult[] = JSON.parse(readFileSync(resultsPath, 'utf-8'));

  const verdicts = results.map(judgeOne);

  // Aggregate by category
  const byCategory: Record<string, { pass: number; warn: number; fail: number; total: number }> = {};
  for (const v of verdicts) {
    if (!byCategory[v.category]) byCategory[v.category] = { pass: 0, warn: 0, fail: 0, total: 0 };
    byCategory[v.category].total++;
    byCategory[v.category].pass += v.pass_count;
    byCategory[v.category].warn += v.warn_count;
    byCategory[v.category].fail += v.fail_count;
  }

  // Build markdown report
  const lines: string[] = [];
  lines.push(`# explain-deal eval — round ${round}`);
  lines.push('');
  lines.push(`**Scenarios:** ${results.length}`);
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push('');
  lines.push('## Overall');
  lines.push('');

  const totalPass = verdicts.filter(v => v.overall === 'PASS').length;
  const totalWarn = verdicts.filter(v => v.overall === 'WARN').length;
  const totalFail = verdicts.filter(v => v.overall === 'FAIL').length;
  lines.push(`PASS: ${totalPass} | WARN: ${totalWarn} | FAIL: ${totalFail}`);
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
    lines.push(`### ${v.scenario_id} — ${v.overall}`);
    lines.push('');
    lines.push(`**Category:** ${v.category} | **Language:** ${r.language} | **Duration:** ${r.duration_ms}ms`);
    lines.push('');
    if (r.error) {
      lines.push(`**Error:** ${r.error}`);
    } else {
      lines.push(`**Checks:** ${v.pass_count}P ${v.warn_count}W ${v.fail_count}F`);
      lines.push('');
      for (const n of v.notes) lines.push(`- ${n}`);
      lines.push('');
      lines.push('**Output excerpt:**');
      lines.push('```');
      lines.push(r.raw_text.slice(0, 400) + (r.raw_text.length > 400 ? '...' : ''));
      lines.push('```');
    }
    lines.push('');
  }

  const outPath = path.join(RESULTS_DIR, `etms-explain-deal-${round}-report.md`);
  writeFileSync(outPath, lines.join('\n'));
  console.log(`Report: ${outPath}`);
  console.log('');
  console.log('Summary:');
  console.log(`  PASS: ${totalPass}  WARN: ${totalWarn}  FAIL: ${totalFail}`);
  for (const [cat, s] of Object.entries(byCategory)) {
    console.log(`  ${cat}: ${s.total} scenarios, ${s.pass}P ${s.warn}W ${s.fail}F`);
  }
}

if (require.main === module) {
  main();
}

#!/usr/bin/env -S npx tsx
/**
 * progonq judge for draft-quote endpoint.
 *
 * Reads .progonq/results/etms-draft-quote-<round>.json and produces a quality
 * report against per-scenario expected criteria.
 *
 * Checks:
 *   1. Section presence — Subject / Greeting / Terms / Closing (line-anchored)
 *   2. Fact citation — must_cite_facts strings appear in output
 *   3. Hallucination guard — must_NOT_invent strings absent from output
 *   4. Currency consistency — USD only, no EUR/GBP mixing
 *   5. Language — output language matches expected (en/ar)
 *   6. Length sanity — body 5-15 non-empty lines (WARN, not FAIL)
 *
 * Usage:
 *   npx tsx scripts/progonq/judge-draft-quote.ts [--round R0]
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const RESULTS_DIR = path.resolve(process.cwd(), '.progonq/results');

// ─── Types (exported for tests) ───────────────────────────────────────────────

export interface ExpectedCriteria {
  sections_present: string[];
  must_cite_facts: string[];
  must_NOT_invent: string[];
  language: 'en' | 'ar';
  length_lines_min?: number;
  length_lines_max?: number;
}

export interface RunResult {
  scenario_id: string;
  category: string;
  language: 'en' | 'ar';
  duration_ms: number;
  raw_text: string;
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

export interface CurrencyCheck {
  passed: boolean;
  note: string;
}

export interface LengthCheck {
  lineCount: number;
  minOk: boolean;
  maxOk: boolean;
  verdict: 'PASS' | 'WARN';
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
  currency_check: CurrencyCheck;
  length_check: LengthCheck;
  notes: string[];
  pass_count: number;
  warn_count: number;
  fail_count: number;
}

// ─── Email section patterns ───────────────────────────────────────────────────
//
// Maps semantic section names to line-anchored RegExp patterns.
// Supports both English and Arabic email conventions.
//
// CRITICAL: all patterns use (^|\n) anchor — prevents mid-sentence false positives.
// This is the lesson from explain-deal Round 1 HIGH bug.

const EMAIL_SECTION_PATTERNS: Record<string, RegExp[]> = {
  Subject: [
    /(^|\n)Subject[\s:]/i,
    /(^|\n)الموضوع[\s:]/,
  ],
  Greeting: [
    /(^|\n)Dear\s+\S/i,
    /(^|\n)(عزيز|السيد\s+|الأستاذ)/,
  ],
  Terms: [
    /(^|\n)[^\n]*(freight|rate|cargo|route|validity|per mt|lump sum|USD\s*\d|\d\s*USD|voyage)/i,
    /(^|\n)[^\n]*(شحن|سعر|بضاع|رحل|صلاحية)/,
  ],
  Closing: [
    /(^|\n)(Best regards|Kind regards|Regards,|Sincerely|Yours faithfully)/i,
    /(^|\n)(مع التحيات|مع خالص التقدير|تفضلوا بقبول)/,
  ],
};

// ─── Core judge functions (exported for tests) ────────────────────────────────

/**
 * Check whether each expected email section is detectable in the raw text.
 *
 * Semantic section names ("Subject", "Greeting", "Terms", "Closing") are mapped
 * to line-anchored patterns. Unknown names fall back to literal line-anchored match.
 *
 * PASS: section pattern found
 * FAIL: section pattern not found
 *
 * Note: WARN is not used here (unlike explain-deal section check) because email
 * sections are either detectably present or absent — no empty-content distinction.
 */
export function checkSections(text: string, sectionNames: string[]): SectionCheck[] {
  return sectionNames.map(name => {
    const patterns = EMAIL_SECTION_PATTERNS[name];

    if (!patterns) {
      // Fallback: literal line-anchored match (for non-semantic header names)
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp('(^|\\n)' + escaped, 'i');
      const found = re.test(text);
      return {
        header: name,
        verdict: found ? 'PASS' : 'FAIL',
        note: found ? `Section "${name}" detected` : `Section "${name}" not found in output`,
      };
    }

    const found = patterns.some(re => re.test(text));
    return {
      header: name,
      verdict: found ? 'PASS' : 'FAIL',
      note: found ? `Section "${name}" detected` : `Section "${name}" not found in output`,
    };
  });
}

/**
 * Check whether each fact string appears in the output text.
 * Normalizes comma-separated numbers (10,400 → 10400) for numeric facts.
 * Case-insensitive match.
 *
 * PASS: fact found
 * FAIL: fact not found
 */
export function checkCitedFacts(text: string, facts: string[]): FactCheck[] {
  const lower = text.toLowerCase().replace(/,(\d)/g, '$1');

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
 * passed=true: guard string absent (clean)
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
 * Check that the output uses USD only and does not mix in EUR or GBP amounts.
 *
 * Detects patterns like "30 EUR/MT", "€ 1200", "GBP 500", "£45".
 *
 * Only inspects lines that contain freight/rate keywords — demurrage and
 * despatch lines legitimately carry different currencies (GENCON clause) and
 * must not trigger a false positive.
 *
 * passed=true: no non-USD currency amounts found on rate lines
 * passed=false: non-USD currency amount found on a rate/freight line
 */
export function checkCurrencyConsistency(text: string): CurrencyCheck {
  // Only check lines that look like freight/rate lines; skip demurrage/despatch.
  const rateLinePattern = /\b(freight|rate|lumpsum|lump\s*sum|WS|f\.f\.|per\s*mt|per\s*ton)\b/i;
  const demurragePattern = /\b(demurrage|despatch)\b/i;
  const mixedPattern = /(EUR\s*\d|\d\s*EUR|€\s*\d|\d\s*€|GBP\s*\d|\d\s*GBP|£\s*\d|\d\s*£)/i;

  const hasMix = text.split('\n').some(line => {
    if (demurragePattern.test(line)) return false;
    if (!rateLinePattern.test(line)) return false;
    return mixedPattern.test(line);
  });

  return {
    passed: !hasMix,
    note: hasMix
      ? 'Currency mixing: non-USD currency amount found on a freight/rate line'
      : 'Currency consistent (USD only or no currency mentioned)',
  };
}

/**
 * Check that the output email body is within a reasonable length range.
 * Counts non-empty lines only.
 *
 * PASS: lineCount within [minLines, maxLines]
 * WARN: outside range (length is advisory — does not auto-fail the scenario)
 */
export function checkLengthSanity(text: string, minLines = 5, maxLines = 15): LengthCheck {
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  const count = lines.length;
  const minOk = count >= minLines;
  const maxOk = count <= maxLines;
  const ok = minOk && maxOk;
  return {
    lineCount: count,
    minOk,
    maxOk,
    verdict: ok ? 'PASS' : 'WARN',
    note: ok
      ? `Length OK: ${count} non-empty lines (${minLines}–${maxLines} expected)`
      : `Length ${count < minLines ? 'too short' : 'too long'}: ${count} lines (expected ${minLines}–${maxLines})`,
  };
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

  const minLines = r.expected.length_lines_min ?? 5;
  const maxLines = r.expected.length_lines_max ?? 15;

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
      currency_check: { passed: false, note: 'Runner error' },
      length_check: {
        lineCount: 0,
        minOk: false,
        maxOk: false,
        verdict: 'WARN',
        note: 'Runner error',
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
    notes.push(
      sc.verdict === 'PASS'
        ? `✓ ${sc.note}`
        : sc.verdict === 'WARN'
          ? `⚠ ${sc.note}`
          : `✗ ${sc.note}`,
    );
  }

  // 2. Fact citation
  const factChecks = checkCitedFacts(r.raw_text, r.expected.must_cite_facts);
  for (const fc of factChecks) {
    if (fc.verdict === 'PASS') passCount++;
    else {
      failCount++;
      notes.push(`✗ FACT MISSING: ${fc.note}`);
    }
  }
  if (factChecks.length > 0) {
    const cited = factChecks.filter(f => f.verdict === 'PASS').length;
    notes.push(`Facts cited: ${cited}/${factChecks.length}`);
  }

  // 3. Hallucination guard
  const hallucinationChecks = checkHallucinations(r.raw_text, r.expected.must_NOT_invent);
  for (const hc of hallucinationChecks) {
    if (hc.passed) passCount++;
    else {
      failCount++;
      notes.push(`✗ ${hc.note}`);
    }
  }

  // 4. Currency consistency
  const currencyCheck = checkCurrencyConsistency(r.raw_text);
  if (currencyCheck.passed) passCount++;
  else {
    failCount++;
    notes.push(`✗ CURRENCY: ${currencyCheck.note}`);
  }

  // 5. Language check
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

  // 6. Length sanity (WARN only — not auto-fail)
  const lengthCheck = checkLengthSanity(r.raw_text, minLines, maxLines);
  if (lengthCheck.verdict === 'PASS') passCount++;
  else {
    warnCount++;
    notes.push(`⚠ ${lengthCheck.note}`);
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
    currency_check: currencyCheck,
    length_check: lengthCheck,
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

  const resultsPath = path.join(RESULTS_DIR, `etms-draft-quote-${round}.json`);
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
  lines.push(`# draft-quote eval — round ${round}`);
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
    lines.push(
      `**Category:** ${v.category} | **Language:** ${r.language} | **Duration:** ${r.duration_ms}ms`,
    );
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

  const outPath = path.join(RESULTS_DIR, `etms-draft-quote-${round}-report.md`);
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

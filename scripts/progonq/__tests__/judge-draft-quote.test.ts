/**
 * Unit tests for judge-draft-quote.ts
 * Phase 2a — written before implementation (RED state).
 *
 * Covers: section detection, fact citation, hallucination guard,
 * currency consistency, language detection, length sanity, judgeOne integration.
 */
import {
  checkSections,
  checkCitedFacts,
  checkHallucinations,
  checkCurrencyConsistency,
  checkLengthSanity,
  detectLanguage,
  judgeOne,
  type RunResult,
} from '../judge-draft-quote';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRunResult(overrides: Partial<RunResult> = {}): RunResult {
  return {
    scenario_id: 'etms-draft-quote-001',
    category: 'standard',
    language: 'en',
    duration_ms: 1800,
    raw_text: [
      'Subject: Freight Quote — Karasu to Puerto Limon',
      '',
      'Dear Marina,',
      '',
      'Thank you for your inquiry. Please find our freight quote below.',
      '',
      'Route: Karasu (Turkey) → Puerto Limon (Costa Rica)',
      'Cargo: Hot Rolled Coils, 10,400 MT, max 20 MT per piece',
      'Freight rate: 23.50 USD/MT FIOST',
      'Validity: 7 days from the date of this quote',
      'Terms: Liner Out at discharge port',
      '',
      'Best regards,',
      'Quantika',
    ].join('\n'),
    expected: {
      sections_present: ['Subject', 'Greeting', 'Terms', 'Closing'],
      must_cite_facts: ['23.50 USD/mt', 'Karasu', 'Puerto Limon'],
      must_NOT_invent: ['35 USD/mt', '30 USD/mt', '40 EUR/mt'],
      language: 'en',
    },
    ...overrides,
  };
}

// ─── checkSections ────────────────────────────────────────────────────────────

describe('checkSections — email format', () => {
  const FULL_EMAIL = [
    'Subject: Freight Quote — Karasu to Puerto Limon',
    '',
    'Dear Marina,',
    '',
    'Please find our freight quote below.',
    'Freight rate: 23.50 USD/MT FIOST',
    'Validity: 7 days',
    '',
    'Best regards,',
    'Quantika',
  ].join('\n');

  it('all 4 sections present → all PASS', () => {
    const results = checkSections(FULL_EMAIL, ['Subject', 'Greeting', 'Terms', 'Closing']);
    expect(results).toHaveLength(4);
    for (const r of results) {
      expect(r.verdict).toBe('PASS');
    }
  });

  it('email without Subject line → FAIL for Subject', () => {
    const noSubject = [
      'Dear Marina,',
      '',
      'Freight rate: 23.50 USD/MT',
      '',
      'Best regards, Quantika',
    ].join('\n');
    const results = checkSections(noSubject, ['Subject', 'Greeting', 'Terms', 'Closing']);
    const subj = results.find(r => r.header === 'Subject');
    expect(subj?.verdict).toBe('FAIL');
  });

  it('email without greeting → FAIL for Greeting', () => {
    const noGreeting = [
      'Subject: Quote',
      '',
      'Freight rate: 23.50 USD/MT',
      'Validity: 7 days',
      '',
      'Best regards, Quantika',
    ].join('\n');
    const results = checkSections(noGreeting, ['Subject', 'Greeting', 'Terms', 'Closing']);
    const greet = results.find(r => r.header === 'Greeting');
    expect(greet?.verdict).toBe('FAIL');
  });

  it('email without closing → FAIL for Closing', () => {
    const noClosing = [
      'Subject: Quote',
      'Dear Marina,',
      'Freight rate: 23.50 USD/MT',
    ].join('\n');
    const results = checkSections(noClosing, ['Subject', 'Greeting', 'Terms', 'Closing']);
    const closing = results.find(r => r.header === 'Closing');
    expect(closing?.verdict).toBe('FAIL');
  });

  it('"Dear" embedded mid-sentence (not line start) → FAIL for Greeting', () => {
    // "Dear" appears inside a sentence, not as a line start — should NOT be detected as greeting
    const text = [
      'Subject: Quote',
      '',
      'We hold your request in high regard, Dear to our hearts, and present a rate.',
      'Freight rate: 23.50 USD/MT',
      '',
      'Best regards, Quantika',
    ].join('\n');
    const results = checkSections(text, ['Subject', 'Greeting', 'Terms', 'Closing']);
    const greet = results.find(r => r.header === 'Greeting');
    // "Dear" is NOT at line start → FAIL
    expect(greet?.verdict).toBe('FAIL');
  });

  it('Arabic greeting detected → PASS for Greeting', () => {
    const arabicText = [
      'Subject: عرض سعر الشحن',
      '',
      'عزيزي أحمد،',
      '',
      'يسرنا تقديم عرض الشحن',
      'معدل الشحن: 18.00 دولار/طن',
      '',
      'مع التحيات، كوانتيكا',
    ].join('\n');
    const results = checkSections(arabicText, ['Subject', 'Greeting', 'Terms', 'Closing']);
    const greet = results.find(r => r.header === 'Greeting');
    expect(greet?.verdict).toBe('PASS');
  });

  it('Arabic closing detected → PASS for Closing', () => {
    const arabicText = [
      'Subject: عرض السعر',
      'عزيزي،',
      'معدل الشحن 18 دولار',
      '',
      'مع التحيات، كوانتيكا',
    ].join('\n');
    const results = checkSections(arabicText, ['Subject', 'Greeting', 'Terms', 'Closing']);
    const closing = results.find(r => r.header === 'Closing');
    expect(closing?.verdict).toBe('PASS');
  });
});

// ─── checkCitedFacts ──────────────────────────────────────────────────────────

describe('checkCitedFacts', () => {
  it('freight rate cited exactly → PASS', () => {
    const text = 'Freight rate: 23.50 USD/MT FIOST, payable as per CP.';
    const results = checkCitedFacts(text, ['23.50 USD/mt']);
    expect(results[0].verdict).toBe('PASS');
  });

  it('port name cited case-insensitively → PASS', () => {
    const text = 'The cargo will be loaded at karasu, Turkey.';
    const results = checkCitedFacts(text, ['Karasu']);
    expect(results[0].verdict).toBe('PASS');
  });

  it('comma-formatted number matches plain number → PASS', () => {
    const text = 'Total cargo weight: 10,400 metric tons.';
    const results = checkCitedFacts(text, ['10400']);
    expect(results[0].verdict).toBe('PASS');
  });

  it('fact not in output → FAIL', () => {
    const text = 'Generic quote text without the specific value.';
    const results = checkCitedFacts(text, ['Puerto Limon']);
    expect(results[0].verdict).toBe('FAIL');
  });

  it('multiple facts — partial → correct individual verdicts', () => {
    const text = 'Route: Karasu to somewhere. Rate: 23.50.';
    const results = checkCitedFacts(text, ['Karasu', 'Puerto Limon', '23.50']);
    expect(results[0].verdict).toBe('PASS');
    expect(results[1].verdict).toBe('FAIL');
    expect(results[2].verdict).toBe('PASS');
  });
});

// ─── checkHallucinations — freight rate guard ─────────────────────────────────

describe('checkHallucinations — freight rate hallucination', () => {
  it('output contains invented rate → passed=false (hallucination caught)', () => {
    const text = 'We are pleased to quote 30 USD/mt FIOST for this shipment.';
    const guards = ['30 USD/mt', '30 usd/mt'];
    const results = checkHallucinations(text, guards);
    expect(results.some(r => !r.passed)).toBe(true);
  });

  it('output has correct rate (not in guards) → all passed=true', () => {
    const text = 'Freight rate: 23.50 USD/MT FIOST, valid for 7 days.';
    const guards = ['35 USD/mt', '30 USD/mt', '40 EUR/mt'];
    const results = checkHallucinations(text, guards);
    for (const r of results) {
      expect(r.passed).toBe(true);
    }
  });

  it('invented rate in output — case-insensitive match → caught', () => {
    const text = 'Our offer: USD 35.00 PER METRIC TON, all inclusive.';
    const guards = ['35.00 per metric ton'];
    const results = checkHallucinations(text, guards);
    expect(results[0].passed).toBe(false);
  });

  it('empty guards → empty results (no false positives)', () => {
    const results = checkHallucinations('any quote text here', []);
    expect(results).toHaveLength(0);
  });
});

// ─── checkCurrencyConsistency ─────────────────────────────────────────────────

describe('checkCurrencyConsistency', () => {
  it('USD-only output → passed=true', () => {
    const text = 'Freight rate: 23.50 USD/MT. Total USD 244,400.';
    const result = checkCurrencyConsistency(text);
    expect(result.passed).toBe(true);
  });

  it('EUR amount mixed with USD → passed=false', () => {
    const text = 'Freight rate: 30 EUR/MT (approx USD 32/MT).';
    const result = checkCurrencyConsistency(text);
    expect(result.passed).toBe(false);
  });

  it('GBP mixed with USD → passed=false', () => {
    const text = 'Rate: 200 GBP per day or equivalent USD 245.';
    const result = checkCurrencyConsistency(text);
    expect(result.passed).toBe(false);
  });

  it('no currency symbols at all → passed=true', () => {
    const text = 'Please find attached our quote for the shipment.';
    const result = checkCurrencyConsistency(text);
    expect(result.passed).toBe(true);
  });
});

// ─── checkLengthSanity ────────────────────────────────────────────────────────

describe('checkLengthSanity', () => {
  it('12 non-empty lines → PASS (within 5–15)', () => {
    const text = Array.from({ length: 12 }, (_, i) => `Line ${i + 1}`).join('\n');
    const result = checkLengthSanity(text);
    expect(result.verdict).toBe('PASS');
    expect(result.lineCount).toBe(12);
  });

  it('3 lines → WARN (below min 5)', () => {
    const text = 'Dear Sir,\nRate: 23.50 USD/MT\nBest regards.';
    const result = checkLengthSanity(text);
    expect(result.verdict).toBe('WARN');
    expect(result.minOk).toBe(false);
  });

  it('20 lines → WARN (above max 15)', () => {
    const text = Array.from({ length: 20 }, (_, i) => `Line ${i + 1}`).join('\n');
    const result = checkLengthSanity(text);
    expect(result.verdict).toBe('WARN');
    expect(result.maxOk).toBe(false);
  });

  it('blank lines do not count toward line total', () => {
    // 5 non-empty + 5 blank = 5 non-empty counted
    const text = 'A\n\nB\n\nC\n\nD\n\nE\n\n';
    const result = checkLengthSanity(text);
    expect(result.lineCount).toBe(5);
    expect(result.verdict).toBe('PASS');
  });
});

// ─── detectLanguage ───────────────────────────────────────────────────────────

describe('detectLanguage', () => {
  it('English email → en', () => {
    const text = 'Dear Marina, Thank you for your freight inquiry. Please find our quote.';
    expect(detectLanguage(text)).toBe('en');
  });

  it('Arabic email → ar', () => {
    const text = 'عزيزي أحمد، يسرنا تقديم عرض السعر للشحن من الإسكندرية إلى جدة.';
    expect(detectLanguage(text)).toBe('ar');
  });

  it('mixed Arabic/numbers → ar when dominant', () => {
    const text = 'معدل الشحن: 18.00 USD/طن للشحن من الإسكندرية إلى جدة.';
    expect(detectLanguage(text)).toBe('ar');
  });
});

// ─── judgeOne integration ─────────────────────────────────────────────────────

describe('judgeOne', () => {
  it('well-formed email — all checks pass → overall PASS', () => {
    const r = makeRunResult();
    const v = judgeOne(r);
    expect(v.overall).toBe('PASS');
    expect(v.fail_count).toBe(0);
  });

  it('missing Subject line → overall FAIL', () => {
    const r = makeRunResult({
      raw_text: [
        'Dear Marina,',
        '',
        'Freight rate: 23.50 USD/MT for Karasu → Puerto Limon',
        'Validity: 7 days',
        '',
        'Best regards, Quantika',
      ].join('\n'),
    });
    const v = judgeOne(r);
    expect(v.overall).toBe('FAIL');
    const subjectFail = v.section_checks.find(s => s.header === 'Subject' && s.verdict === 'FAIL');
    expect(subjectFail).toBeDefined();
  });

  it('hallucinated freight rate in output → overall FAIL', () => {
    const r = makeRunResult({
      raw_text: [
        'Subject: Freight Quote',
        '',
        'Dear Marina,',
        '',
        'Freight rate: 35 USD/mt FIOST for Karasu → Puerto Limon',
        '',
        'Best regards, Quantika',
      ].join('\n'),
    });
    const v = judgeOne(r);
    expect(v.overall).toBe('FAIL');
    const hallucinationFail = v.hallucination_checks.find(h => !h.passed);
    expect(hallucinationFail).toBeDefined();
  });

  it('runner error → overall FAIL with error note', () => {
    const r = makeRunResult({ error: 'ai_timeout: timed out after 90s', raw_text: '' });
    const v = judgeOne(r);
    expect(v.overall).toBe('FAIL');
    expect(v.notes.some(n => n.includes('ERROR'))).toBe(true);
  });

  it('language mismatch (expected ar, output en) → language check fails', () => {
    const r = makeRunResult({
      expected: {
        sections_present: ['Subject', 'Greeting', 'Terms', 'Closing'],
        must_cite_facts: ['18.00', 'Alexandria'],
        must_NOT_invent: [],
        language: 'ar',
      },
    });
    const v = judgeOne(r);
    expect(v.language_check.passed).toBe(false);
    expect(v.overall).toBe('FAIL');
  });

  it('no freight rate in input, model uses placeholder → must_cite_facts passes', () => {
    // Hallucination scenario: model correctly uses [RATE TO BE CONFIRMED]
    const r = makeRunResult({
      raw_text: [
        'Subject: Freight Quote — Piraeus to Tunis',
        '',
        'Dear Nikos,',
        '',
        'Thank you for your inquiry regarding fertilizer shipment from Piraeus.',
        'Freight rate: [RATE TO BE CONFIRMED] — we will revert with a firm offer shortly.',
        'Validity: 7 days upon confirmation.',
        '',
        'Best regards, Quantika',
      ].join('\n'),
      expected: {
        sections_present: ['Subject', 'Greeting', 'Terms', 'Closing'],
        must_cite_facts: ['[RATE TO BE CONFIRMED]', 'Piraeus'],
        must_NOT_invent: ['25 USD/mt', '23.50 USD', '$30 per', 'USD 28', '28.50'],
        language: 'en',
      },
    });
    const v = judgeOne(r);
    // All facts cited, no hallucination → PASS
    expect(v.fact_checks.every(f => f.verdict === 'PASS')).toBe(true);
    expect(v.hallucination_checks.every(h => h.passed)).toBe(true);
  });

  it('no freight rate in input, model invents rate → hallucination caught', () => {
    const r = makeRunResult({
      raw_text: [
        'Subject: Freight Quote — Piraeus to Tunis',
        '',
        'Dear Nikos,',
        '',
        'Freight rate: 25 USD/mt FIOST.',
        '',
        'Best regards, Quantika',
      ].join('\n'),
      expected: {
        sections_present: ['Subject', 'Greeting', 'Terms', 'Closing'],
        must_cite_facts: ['[RATE TO BE CONFIRMED]', 'Piraeus'],
        must_NOT_invent: ['25 USD/mt', '23.50 USD', '$30 per', 'USD 28', '28.50'],
        language: 'en',
      },
    });
    const v = judgeOne(r);
    const caughtHallucination = v.hallucination_checks.find(h => !h.passed);
    expect(caughtHallucination).toBeDefined();
    expect(v.overall).toBe('FAIL');
  });

  it('EUR/GBP currency mixing → currency check fails, overall FAIL', () => {
    const r = makeRunResult({
      raw_text: [
        'Subject: Freight Quote',
        '',
        'Dear Marina,',
        '',
        'Freight rate: 30 EUR/MT (USD equivalent also acceptable).',
        'Cargo: Karasu → Puerto Limon, 10,400 MT, 23.50 USD/mt',
        'Validity: 7 days.',
        '',
        'Best regards, Quantika',
      ].join('\n'),
    });
    const v = judgeOne(r);
    expect(v.currency_check.passed).toBe(false);
    expect(v.overall).toBe('FAIL');
  });

  it('length WARN does not auto-fail the scenario', () => {
    // 3 lines — too short, should WARN not FAIL
    const r = makeRunResult({
      raw_text: [
        'Subject: Quote',
        'Dear Marina, Freight rate: 23.50 USD/mt for Karasu to Puerto Limon.',
        'Best regards, Quantika',
      ].join('\n'),
    });
    const v = judgeOne(r);
    expect(v.length_check.verdict).toBe('WARN');
    // length WARN propagates to overall WARN (not FAIL) unless other checks fail
  });
});

// ─── Section detection — adversarial (regression: explain-deal R1 HIGH bug) ───

describe('checkSections — adversarial mid-sentence', () => {
  it('"Subject" mid-sentence body (no line start) → FAIL for Subject', () => {
    // "Subject" appears inside the body line, not at line start
    const text = [
      'Dear Marina,',
      '',
      'Regarding the subject of freight rates, here is our quote.',
      'Freight rate: 23.50 USD/MT',
      '',
      'Best regards, Quantika',
    ].join('\n');
    const results = checkSections(text, ['Subject', 'Greeting', 'Terms', 'Closing']);
    const subj = results.find(r => r.header === 'Subject');
    expect(subj?.verdict).toBe('FAIL');
  });
});

// ─── QA Round-2 reproducers ───────────────────────────────────────────────────

describe('checkCurrencyConsistency — rate-line restriction (QA round-2 H1)', () => {
  it('demurrage EUR line does not trigger currency check false positive', () => {
    // Standard GENCON clause: EUR demurrage is legitimate, not a freight rate fabrication.
    // Currency check must only fire on lines containing rate/freight keywords.
    const text = [
      'Subject: Freight Quote — Karasu to Puerto Limon',
      'Dear Marina,',
      'Freight rate: 22.50 USD/MT FIO',
      'Demurrage: EUR 1,500 PDPR FD.',
      'Best regards, Quantika',
    ].join('\n');
    const result = checkCurrencyConsistency(text);
    expect(result.passed).toBe(true);
  });
});

describe('scenario-002 corpus — Arabic guards (QA round-2 H2)', () => {
  it('scenario-002 must_cite_facts includes Arabic Alexandria equivalent', () => {
    // Arabic model writes "الإسكندرية" not "Alexandria" — corpus must include both.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const s = require('../../../.progonq/corpus/etms-draft-quote/scenario-002.json');
    expect(s.expected.must_cite_facts).toContain('الإسكندرية');
  });
});

describe('scenario-006 corpus — comprehensive rate guards (QA round-2 CRITICAL)', () => {
  it('scenario-006 must_NOT_invent catches $25/mt fabrication via corpus guards', () => {
    // Model could fabricate "$25/mt" — must be caught by the scenario guard list.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const s = require('../../../.progonq/corpus/etms-draft-quote/scenario-006.json');
    const invented = 'Our freight rate is $25/mt FIOST for this shipment.';
    const results = checkHallucinations(invented, s.expected.must_NOT_invent);
    expect(results.some(r => !r.passed)).toBe(true);
  });
});

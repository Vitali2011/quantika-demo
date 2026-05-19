/**
 * Unit tests for judge-explain-deal.ts
 * Phase 2a — written before implementation (RED state).
 */
import {
  checkSections,
  checkCitedFacts,
  checkHallucinations,
  detectLanguage,
  judgeOne,
  type RunResult,
} from '../judge-explain-deal';

const EN_HEADERS = ['Market Context', 'Deal Rationale', 'Key Risks', 'Recommended Next Steps'];
const AR_HEADERS = ['سياق السوق', 'مبررات الصفقة', 'المخاطر الرئيسية', 'الخطوات التالية الموصى بها'];

// Minimal syntethic RunResult for judgeOne tests
function makeRunResult(overrides: Partial<RunResult> = {}): RunResult {
  return {
    scenario_id: 'etms-explain-deal-001',
    category: 'strong-match',
    language: 'en',
    duration_ms: 1200,
    raw_text: `Market Context\nGood conditions.\n\nDeal Rationale\nDWT 10500 fits cargo 8000 MT.\n\nKey Risks\nTCE 14200 is below market 15800.\n\nRecommended Next Steps\nContact owner immediately.`,
    sections: [
      { heading: 'Market Context', content: 'Good conditions.' },
      { heading: 'Deal Rationale', content: 'DWT 10500 fits cargo 8000 MT.' },
      { heading: 'Key Risks', content: 'TCE 14200 is below market 15800.' },
      { heading: 'Recommended Next Steps', content: 'Contact owner immediately.' },
    ],
    expected: {
      sections_present: EN_HEADERS,
      must_cite_facts: ['10500', '8000'],
      must_not_contain: ['$45 per metric ton', 'P&I IG-club approved'],
      language: 'en',
    },
    ...overrides,
  };
}

// ─── checkSections ────────────────────────────────────────────────────────────

describe('checkSections', () => {
  it('all 4 sections present with content → all PASS', () => {
    const text = `Market Context\nMarket is active.\n\nDeal Rationale\nGood fit.\n\nKey Risks\nSome risks.\n\nRecommended Next Steps\nCall broker.`;
    const results = checkSections(text, EN_HEADERS);
    expect(results).toHaveLength(4);
    for (const r of results) {
      expect(r.verdict).toBe('PASS');
    }
  });

  it('missing Key Risks section → FAIL for that header', () => {
    const text = `Market Context\nMarket is active.\n\nDeal Rationale\nGood fit.\n\nRecommended Next Steps\nCall broker.`;
    const results = checkSections(text, EN_HEADERS);
    const kr = results.find(r => r.header === 'Key Risks');
    expect(kr).toBeDefined();
    expect(kr!.verdict).toBe('FAIL');
  });

  it('section present but empty content → WARN', () => {
    const text = `Market Context\n\n\nDeal Rationale\nGood fit.\n\nKey Risks\nRisks here.\n\nRecommended Next Steps\nCall broker.`;
    const results = checkSections(text, EN_HEADERS);
    const mc = results.find(r => r.header === 'Market Context');
    expect(mc).toBeDefined();
    expect(mc!.verdict).toBe('WARN');
  });

  it('Arabic headers all present → all PASS', () => {
    const text = [
      'سياق السوق',
      'ظروف السوق جيدة.',
      '',
      'مبررات الصفقة',
      'السفينة مناسبة.',
      '',
      'المخاطر الرئيسية',
      'TCE أقل من السوق.',
      '',
      'الخطوات التالية الموصى بها',
      'اتصل بالمالك.',
    ].join('\n');
    const results = checkSections(text, AR_HEADERS);
    expect(results).toHaveLength(4);
    for (const r of results) {
      expect(r.verdict).toBe('PASS');
    }
  });
});

// ─── checkCitedFacts ──────────────────────────────────────────────────────────

describe('checkCitedFacts', () => {
  it('fact present in output → PASS', () => {
    const text = 'The vessel DWT of 10500 MT fits the cargo perfectly.';
    const results = checkCitedFacts(text, ['10500']);
    expect(results[0].verdict).toBe('PASS');
  });

  it('fact with comma-formatted number → PASS', () => {
    const text = 'Cargo weight 8,000 MT within vessel capacity.';
    const results = checkCitedFacts(text, ['8000']);
    expect(results[0].verdict).toBe('PASS');
  });

  it('fact not in output → FAIL', () => {
    const text = 'Generic text without specific values.';
    const results = checkCitedFacts(text, ['Georgetown']);
    expect(results[0].verdict).toBe('FAIL');
  });

  it('port name cited case-insensitively → PASS', () => {
    const text = 'Vessel is opening in istanbul, within laycan range.';
    const results = checkCitedFacts(text, ['Istanbul']);
    expect(results[0].verdict).toBe('PASS');
  });

  it('multiple facts: partial citation → correct individual results', () => {
    const text = 'The cargo weighs 8000 MT.';
    const results = checkCitedFacts(text, ['8000', 'Georgetown']);
    expect(results[0].verdict).toBe('PASS');
    expect(results[1].verdict).toBe('FAIL');
  });
});

// ─── checkHallucinations ─────────────────────────────────────────────────────

describe('checkHallucinations', () => {
  it('text contains forbidden string → passed=false (hallucination caught)', () => {
    const text = 'The freight rate is $45 per metric ton for this voyage.';
    const guards = ['$45 per metric ton'];
    const results = checkHallucinations(text, guards);
    expect(results[0].passed).toBe(false);
  });

  it('text does not contain any forbidden string → all passed=true', () => {
    const text = 'Good market conditions. Vessel fits cargo well. Some risks noted.';
    const guards = ['$45 per metric ton', 'P&I IG-club approved', 'vetting clearance passed'];
    const results = checkHallucinations(text, guards);
    for (const r of results) {
      expect(r.passed).toBe(true);
    }
  });

  it('one guard violated, others clean → only first fails', () => {
    const text = 'The P&I IG-club approved the voyage. Cargo fits.';
    const guards = ['$45 per metric ton', 'P&I IG-club approved'];
    const results = checkHallucinations(text, guards);
    expect(results[0].passed).toBe(true);   // first guard not violated
    expect(results[1].passed).toBe(false);  // second guard violated
  });

  it('guard check is case-insensitive', () => {
    const text = 'All P&I IG-CLUB APPROVED requirements met.';
    const guards = ['P&I IG-club approved'];
    const results = checkHallucinations(text, guards);
    expect(results[0].passed).toBe(false);
  });

  it('empty guards array → empty results', () => {
    const results = checkHallucinations('any text', []);
    expect(results).toHaveLength(0);
  });
});

// ─── detectLanguage ───────────────────────────────────────────────────────────

describe('detectLanguage', () => {
  it('English text → en', () => {
    const text = 'Market Context\nGood market conditions with active demand for bulkers.';
    expect(detectLanguage(text)).toBe('en');
  });

  it('Arabic text → ar', () => {
    const text = 'سياق السوق\nظروف السوق جيدة مع طلب نشط على ناقلات الجرافة.';
    expect(detectLanguage(text)).toBe('ar');
  });

  it('predominantly Arabic text → ar', () => {
    const text = 'سياق السوق\nالسوق في حالة جيدة. TCE هو 14200 دولار وهو أقل من السوق 15800.';
    expect(detectLanguage(text)).toBe('ar');
  });
});

// ─── QA Round-2 reproducers ──────────────────────────────────────────────────

describe('checkSections — QA R2 adversarial', () => {
  it('header embedded mid-sentence (no standalone header line) → FAIL, not false PASS', () => {
    // "Market Context" appears inside Deal Rationale body, not as a section header line
    const text = `Deal Rationale\nThis is strong from a Market Context perspective.\n\nKey Risks\nSome risks.\n\nRecommended Next Steps\nCall broker.`;
    const results = checkSections(text, EN_HEADERS);
    const mc = results.find(r => r.header === 'Market Context');
    expect(mc).toBeDefined();
    expect(mc!.verdict).toBe('FAIL');
  });
});

describe('checkHallucinations — QA R2 Arabic guards', () => {
  it('Arabic output with Arabic hallucination string → caught by Arabic guard', () => {
    const arabicText =
      'سياق السوق\nالسوق نشط.\n\nمبررات الصفقة\nالحمولة 7500 طن بسعر 40$ للطن المتري.\n\nالمخاطر الرئيسية\nمخاطر.\n\nالخطوات التالية الموصى بها\nاتصل.';
    const guards = [
      '40$ للطن المتري',
      'تخليص الفحص معتمد',
      '$40 per metric ton',
      'vetting clearance approved',
    ];
    const results = checkHallucinations(arabicText, guards);
    const caught = results.find(r => !r.passed);
    expect(caught).toBeDefined();
  });
});

describe('judgeOne — QA R2 fact severity', () => {
  it('zero must_cite_facts present → overall FAIL, not WARN', () => {
    const r = makeRunResult({
      raw_text: `Market Context\nGood conditions.\n\nDeal Rationale\nGood fit.\n\nKey Risks\nSome risks.\n\nRecommended Next Steps\nCall broker.`,
      expected: {
        sections_present: EN_HEADERS,
        must_cite_facts: ['10500', '8000'], // neither appears in raw_text
        must_not_contain: [],
        language: 'en',
      },
    });
    const v = judgeOne(r);
    expect(v.overall).toBe('FAIL');
  });
});

// ─── judgeOne integration ─────────────────────────────────────────────────────

describe('judgeOne', () => {
  it('good output — all sections, facts cited, no hallucinations → PASS overall', () => {
    const r = makeRunResult();
    const v = judgeOne(r);
    expect(v.overall).toBe('PASS');
    expect(v.fail_count).toBe(0);
  });

  it('missing section → overall FAIL', () => {
    const r = makeRunResult({
      sections: [
        { heading: 'Market Context', content: 'Active market.' },
        { heading: 'Deal Rationale', content: 'DWT 10500 fits 8000 MT.' },
        { heading: 'Recommended Next Steps', content: 'Call broker.' },
        // Key Risks missing
      ],
      raw_text: `Market Context\nActive market.\n\nDeal Rationale\nDWT 10500 fits 8000 MT.\n\nRecommended Next Steps\nCall broker.`,
    });
    const v = judgeOne(r);
    expect(v.overall).toBe('FAIL');
    expect(v.fail_count).toBeGreaterThan(0);
  });

  it('hallucinated content in raw_text → overall FAIL', () => {
    const r = makeRunResult({
      raw_text: `Market Context\nGood.\n\nDeal Rationale\nDWT 10500 fits 8000 MT. Freight rate is $45 per metric ton.\n\nKey Risks\nRisks here.\n\nRecommended Next Steps\nCall broker.`,
    });
    const v = judgeOne(r);
    expect(v.overall).toBe('FAIL');
    const hallucinationFail = v.hallucination_checks.find(h => !h.passed);
    expect(hallucinationFail).toBeDefined();
  });

  it('run error → overall FAIL with error note', () => {
    const r = makeRunResult({ error: 'ai_timeout: LLM timed out after 55s', raw_text: '', sections: [] });
    const v = judgeOne(r);
    expect(v.overall).toBe('FAIL');
  });

  it('language mismatch (expected en, output ar) → FAIL on language check', () => {
    const arText = 'سياق السوق\nالسوق نشط.\n\nمبررات الصفقة\nالحمولة 8000 طن.\n\nالمخاطر الرئيسية\nمخاطر.\n\nالخطوات التالية الموصى بها\nاتصل.';
    const r = makeRunResult({
      raw_text: arText,
      sections: AR_HEADERS.map(h => ({ heading: h, content: 'محتوى.' })),
      expected: {
        sections_present: EN_HEADERS,
        must_cite_facts: [],
        must_not_contain: [],
        language: 'en',  // expected English, but got Arabic
      },
    });
    const v = judgeOne(r);
    expect(v.language_check.passed).toBe(false);
  });
});

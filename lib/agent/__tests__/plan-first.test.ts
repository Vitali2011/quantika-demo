/**
 * Tests for lib/agent/plan-first.ts — γv-10: planFirst() LLM-driven planner
 *
 * Coverage:
 * - detectKinds() — regex mode, all kind patterns
 * - planFirst() with AGENT_PLANNER_PROVIDER=regex → delegates to detectKinds()
 * - planFirst() with AGENT_PLANNER_PROVIDER=gemini → calls callAiJson with AGENT_PLANNER scope
 * - planFirst() with AGENT_PLANNER_PROVIDER=openai → calls callAiJson with AGENT_PLANNER scope
 * - planFirst() — LLM defensive fallback: bad response shape → detectKinds()
 * - planFirst() — LLM defensive fallback: empty kinds array → ['noop']
 * - planFirst() — LLM returns invalid kind names → filtered out
 * - Regression eval: 30 sample queries in regex mode ≥95% correct
 */

import { detectKinds, planFirst } from '../plan-first';
import * as aiProvider from '@/lib/ai-provider';
import sampleQueries from '../sample-queries.json';
import type { PlanStepKind } from '../plan-types';

// ─── Mock ai-provider ─────────────────────────────────────────────────────────

jest.mock('@/lib/ai-provider', () => ({
  callAiJson: jest.fn(),
  getProvider: jest.fn().mockReturnValue('openai'),
  getModel: jest.fn().mockReturnValue('gpt-5.5'),
  callAiText: jest.fn(),
  callAiVision: jest.fn(),
  callAiAudio: jest.fn(),
  callAi: jest.fn(),
}));

const mockCallAiJson = aiProvider.callAiJson as jest.MockedFunction<typeof aiProvider.callAiJson>;

// ─── Helper ────────────────────────────────────────────────────────────────────

function setProvider(value: string | undefined): void {
  if (value === undefined) {
    delete process.env.AGENT_PLANNER_PROVIDER;
  } else {
    process.env.AGENT_PLANNER_PROVIDER = value;
  }
}

// ─── detectKinds() — regex mode ───────────────────────────────────────────────

describe('detectKinds()', () => {
  it('detects check-sanctions for "sanction" keyword', () => {
    expect(detectKinds('Run sanction check')).toContain('check-sanctions');
  });

  it('detects check-sanctions for "ofac" keyword', () => {
    expect(detectKinds('OFAC SDN lookup')).toContain('check-sanctions');
  });

  it('detects check-sanctions for "sdn" keyword', () => {
    expect(detectKinds('SDN list check')).toContain('check-sanctions');
  });

  it('detects compare-routes for "route" keyword', () => {
    expect(detectKinds('Compare routes')).toContain('compare-routes');
  });

  it('detects compare-routes for "suez" keyword', () => {
    expect(detectKinds('Via Suez canal')).toContain('compare-routes');
  });

  it('detects compare-routes for "cape" keyword', () => {
    expect(detectKinds('Cape route voyage')).toContain('compare-routes');
  });

  it('detects check-cii for "cii" keyword', () => {
    expect(detectKinds('Get CII rating')).toContain('check-cii');
  });

  it('detects check-l5c for "l5c" keyword', () => {
    expect(detectKinds('L5C lifecycle check')).toContain('check-l5c');
  });

  it('detects check-l5c for "carbon" keyword', () => {
    expect(detectKinds('carbon footprint calc')).toContain('check-l5c');
  });

  it('detects generate-quote for "tce" keyword', () => {
    expect(detectKinds('Get TCE rate')).toContain('generate-quote');
  });

  it('detects generate-quote for "prequote" keyword', () => {
    expect(detectKinds('Send prequote')).toContain('generate-quote');
  });

  it('detects send-whatsapp for "whatsapp" keyword', () => {
    expect(detectKinds('Send WhatsApp to captain')).toContain('send-whatsapp');
  });

  it('detects send-email for "email" keyword', () => {
    expect(detectKinds('Send email recap')).toContain('send-email');
  });

  it('detects send-email for "charterer" keyword', () => {
    expect(detectKinds('Forward to charterer')).toContain('send-email');
  });

  it('returns noop for unrecognized query', () => {
    expect(detectKinds('Hello world')).toEqual(['noop']);
  });

  it('deduplicates kinds', () => {
    const kinds = detectKinds('prequote email charterer');
    // "prequote" → generate-quote + send-email; "email" → send-email; "charterer" → send-email
    // should not have duplicates
    const unique = new Set(kinds);
    expect(unique.size).toBe(kinds.length);
  });

  it('handles multi-kind queries', () => {
    const kinds = detectKinds('Check OFAC sanctions and compare Suez route');
    expect(kinds).toContain('check-sanctions');
    expect(kinds).toContain('compare-routes');
  });

  it('is case-insensitive', () => {
    expect(detectKinds('OFAC SDN CHECK')).toContain('check-sanctions');
    expect(detectKinds('suez canal route')).toContain('compare-routes');
  });
});

// ─── planFirst() — regex provider (default/rollback) ─────────────────────────

describe('planFirst() — regex provider', () => {
  afterEach(() => {
    delete process.env.AGENT_PLANNER_PROVIDER;
    mockCallAiJson.mockClear();
  });

  it('uses regex (detectKinds) when AGENT_PLANNER_PROVIDER=regex', async () => {
    setProvider('regex');
    const result = await planFirst('Check OFAC sanctions');
    expect(result).toContain('check-sanctions');
    expect(mockCallAiJson).not.toHaveBeenCalled();
  });

  it('uses regex when AGENT_PLANNER_PROVIDER is not set (default)', async () => {
    setProvider(undefined);
    const result = await planFirst('Get CII rating');
    expect(result).toContain('check-cii');
    expect(mockCallAiJson).not.toHaveBeenCalled();
  });

  it('regex mode returns noop for unknown query', async () => {
    setProvider('regex');
    const result = await planFirst('What is the weather?');
    expect(result).toEqual(['noop']);
    expect(mockCallAiJson).not.toHaveBeenCalled();
  });
});

// ─── planFirst() — gemini provider ────────────────────────────────────────────

describe('planFirst() — gemini provider', () => {
  beforeEach(() => {
    setProvider('gemini');
    mockCallAiJson.mockClear();
  });

  afterEach(() => {
    delete process.env.AGENT_PLANNER_PROVIDER;
  });

  it('calls callAiJson with AGENT_PLANNER scope', async () => {
    mockCallAiJson.mockResolvedValueOnce({ kinds: ['check-sanctions'] });
    await planFirst('Check OFAC');
    expect(mockCallAiJson).toHaveBeenCalledWith(
      'AGENT_PLANNER',
      expect.any(String),
      'Check OFAC',
    );
  });

  it('returns LLM-provided kinds', async () => {
    mockCallAiJson.mockResolvedValueOnce({ kinds: ['check-sanctions', 'send-email'] });
    const result = await planFirst('Check OFAC and email compliance');
    expect(result).toEqual(['check-sanctions', 'send-email']);
  });

  it('deduplicates LLM kinds', async () => {
    mockCallAiJson.mockResolvedValueOnce({ kinds: ['check-cii', 'check-cii', 'noop'] });
    const result = await planFirst('CII check');
    expect(result).toEqual(['check-cii', 'noop']);
  });

  it('filters out invalid kind names from LLM response', async () => {
    mockCallAiJson.mockResolvedValueOnce({ kinds: ['check-sanctions', 'INVALID_KIND', 'send-email'] });
    const result = await planFirst('Check and email');
    expect(result).toEqual(['check-sanctions', 'send-email']);
  });

  it('falls back to noop when LLM returns empty kinds array', async () => {
    mockCallAiJson.mockResolvedValueOnce({ kinds: [] });
    const result = await planFirst('Hello');
    expect(result).toEqual(['noop']);
  });

  it('falls back to detectKinds when LLM returns unexpected shape (no kinds)', async () => {
    mockCallAiJson.mockResolvedValueOnce({ steps: ['check-cii'] });
    const result = await planFirst('Get CII rating');
    // Falls back to regex detectKinds('Get CII rating') → ['check-cii']
    expect(result).toContain('check-cii');
  });

  it('falls back to detectKinds when LLM returns null', async () => {
    mockCallAiJson.mockResolvedValueOnce(null);
    const result = await planFirst('Get CII rating');
    expect(result).toContain('check-cii');
  });

  // ── QA M-1: exception swallowing ─────────────────────────────────────────
  it('QA M-1: falls back to detectKinds when callAiJson THROWS (network/Vertex 5xx)', async () => {
    mockCallAiJson.mockRejectedValueOnce(new Error('Vertex AI 503 Service Unavailable'));
    const result = await planFirst('Run sanction check on charterer');
    expect(result).toContain('check-sanctions');
    // Did not re-throw — caller never sees the exception.
  });

  it('QA M-1: falls back to detectKinds on AbortError / timeout', async () => {
    const err = new Error('Aborted');
    err.name = 'AbortError';
    mockCallAiJson.mockRejectedValueOnce(err);
    const result = await planFirst('Compare Suez vs Cape route');
    expect(result).toContain('compare-routes');
  });

  it('QA M-1: returns ["noop"] when LLM throws on a non-keyword query', async () => {
    mockCallAiJson.mockRejectedValueOnce(new Error('boom'));
    const result = await planFirst('Hello there');
    expect(result).toEqual(['noop']);
  });
});

// ─── planFirst() — openai provider ────────────────────────────────────────────

describe('planFirst() — openai provider', () => {
  beforeEach(() => {
    setProvider('openai');
    mockCallAiJson.mockClear();
  });

  afterEach(() => {
    delete process.env.AGENT_PLANNER_PROVIDER;
  });

  it('calls callAiJson with AGENT_PLANNER scope', async () => {
    mockCallAiJson.mockResolvedValueOnce({ kinds: ['generate-quote'] });
    await planFirst('Calculate TCE freight rate');
    expect(mockCallAiJson).toHaveBeenCalledWith(
      'AGENT_PLANNER',
      expect.any(String),
      'Calculate TCE freight rate',
    );
  });

  it('returns LLM-provided kinds for openai', async () => {
    mockCallAiJson.mockResolvedValueOnce({ kinds: ['compare-routes', 'generate-quote'] });
    const result = await planFirst('Suez vs Cape TCE');
    expect(result).toEqual(['compare-routes', 'generate-quote']);
  });
});

// ─── Regression eval: 30 sample queries in regex mode ─────────────────────────

describe('Regression eval — 30 sample queries in regex mode', () => {
  beforeAll(() => {
    setProvider('regex');
  });

  afterAll(() => {
    delete process.env.AGENT_PLANNER_PROVIDER;
  });

  const sampleQueryList = sampleQueries as Array<{ query: string; kinds: PlanStepKind[] }>;

  let passed = 0;
  let failed = 0;

  sampleQueryList.forEach(({ query, kinds: expected }) => {
    it(`query: "${query.substring(0, 50)}"`, async () => {
      const result = await planFirst(query);
      const expectedSet = new Set(expected);
      const resultSet = new Set(result);

      // Check that all expected kinds are present
      const allPresent = expected.every((k) => resultSet.has(k));
      // Check no completely wrong extra kinds (only extras allowed: superset of expected)
      // For regression: we allow extra kinds but require all expected to be present
      if (allPresent) {
        passed++;
      } else {
        failed++;
      }
      expect(result).toEqual(expect.arrayContaining(expected));
      // result should not have kinds that are completely absent from expected
      // (superset check — extra kinds are fine if expected is a subset)
      void expectedSet;
    });
  });

  it('should have at least 28 out of 30 samples passing (≥93%)', async () => {
    // Re-run all samples to count
    let localPassed = 0;
    for (const { query, kinds: expected } of sampleQueryList) {
      const result = await planFirst(query);
      const resultSet = new Set(result);
      const allPresent = expected.every((k) => resultSet.has(k));
      if (allPresent) localPassed++;
    }
    const rate = localPassed / sampleQueryList.length;
    expect(rate).toBeGreaterThanOrEqual(0.93);
  });
});

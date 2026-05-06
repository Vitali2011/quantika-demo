import { describe, it, expect, jest, beforeEach } from '@jest/globals';

import {
  validateSinglePair,
  aggregateResults,
  type CallAiTextFn,
  type CaseResult,
  type ValidatorOutput,
} from '../validate-baseline';

/**
 * Tests inject a fake `callAiText` directly — same DI pattern as judge.test.ts.
 * No module mocking.
 */
const callMock = jest.fn<CallAiTextFn>();

const fakeCallAiText: CallAiTextFn = (scope, system, user, opts) =>
  callMock(scope, system, user, opts);

const fixtureNoIssues: CaseResult = {
  case_id: 'cargo-sample-01',
  endpoint: 'classify',
  issues: [],
};

const fixtureWithIssues: CaseResult = {
  case_id: 'cargo-sample-02',
  endpoint: 'parse-cargo',
  issues: [
    { severity: 'crit', field: 'cargo_quantity', class: 'missing_required_field', what: 'Field missing' },
    { severity: 'high', field: 'pol', class: 'extraction_error', what: 'Wrong port name' },
    { severity: 'med', field: 'laycan_start', class: 'format_error', what: 'Date format wrong' },
    { severity: 'low', field: 'notes', class: 'hallucination', what: 'Notes not in email' },
  ],
};

const fixtureMixed: CaseResult = {
  case_id: 'eval-001',
  endpoint: 'parse-vessel',
  issues: [
    { severity: 'high', field: 'imo', class: 'extraction_error', what: 'IMO wrong' },
    { severity: 'crit', field: 'vessel_name', class: 'missing_required_field', what: 'Missing' },
  ],
};

const basePair = {
  caseId: 'cargo-sample-01',
  endpoint: 'classify' as const,
  parserOutput: { category: 'CARGO_INQUIRY' },
  email: 'Test email body',
  systemPrompt: 'Parse cargo emails',
};

beforeEach(() => {
  callMock.mockReset();
});

describe('validateSinglePair', () => {
  it('returns issues from a valid model response', async () => {
    callMock.mockResolvedValue(JSON.stringify(fixtureWithIssues));

    const result = await validateSinglePair(
      { ...basePair, caseId: 'cargo-sample-02', endpoint: 'parse-cargo' as const },
      fakeCallAiText,
    );

    expect(result.case_id).toBe('cargo-sample-02');
    expect(result.endpoint).toBe('parse-cargo');
    expect(result.issues).toHaveLength(4);
    expect(result.issues[0].severity).toBe('crit');
    expect(result.issues[0].class).toBe('missing_required_field');
  });

  it('handles empty issues array', async () => {
    callMock.mockResolvedValue(JSON.stringify(fixtureNoIssues));

    const result = await validateSinglePair(basePair, fakeCallAiText);

    expect(result.case_id).toBe('cargo-sample-01');
    expect(result.issues).toHaveLength(0);
  });

  it('strips ```json fences from model response', async () => {
    callMock.mockResolvedValue('```json\n' + JSON.stringify(fixtureNoIssues) + '\n```');

    const result = await validateSinglePair(basePair, fakeCallAiText);

    expect(result.issues).toHaveLength(0);
  });

  it('returns validator_error on malformed JSON response (does not crash)', async () => {
    callMock.mockResolvedValue('This is not JSON at all, just prose from the model');

    const result = await validateSinglePair(basePair, fakeCallAiText);

    expect(result.case_id).toBe('cargo-sample-01');
    expect(result.endpoint).toBe('classify');
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].class).toBe('validator_error');
    expect(result.issues[0].severity).toBe('high');
    expect(result.issues[0].what).toMatch(/Malformed JSON/i);
  });

  it('returns validator_error on non-throttle call failure', async () => {
    callMock.mockRejectedValue(new Error('Access denied'));

    const result = await validateSinglePair(basePair, fakeCallAiText);

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].class).toBe('validator_error');
    expect(result.issues[0].what).toMatch(/Access denied/);
  });

  it('passes correct scope, system prompt, and model to callAiText', async () => {
    callMock.mockResolvedValue(JSON.stringify(fixtureNoIssues));

    await validateSinglePair(basePair, fakeCallAiText);

    expect(callMock).toHaveBeenCalledTimes(1);
    const [scope, system, , opts] = callMock.mock.calls[0];
    expect(scope).toBe('wave_gamma_baseline_validator');
    expect(system).toMatch(/strict data extraction QA reviewer/);
    expect(opts?.model).toMatch(/claude-sonnet-4-6/);
    expect(opts?.maxTokens).toBe(2048);
  });

  it('includes case_id, endpoint, system_prompt, email, parser_output in user message', async () => {
    callMock.mockResolvedValue(JSON.stringify(fixtureNoIssues));

    await validateSinglePair(basePair, fakeCallAiText);

    const [, , user] = callMock.mock.calls[0];
    const parsed = JSON.parse(user);
    expect(parsed.case_id).toBe('cargo-sample-01');
    expect(parsed.endpoint).toBe('classify');
    expect(parsed.system_prompt).toBe('Parse cargo emails');
    expect(parsed.email).toBe('Test email body');
    expect(parsed.parser_output).toEqual({ category: 'CARGO_INQUIRY' });
  });
});

describe('aggregateResults', () => {
  it('counts severity buckets correctly', () => {
    const results: CaseResult[] = [fixtureWithIssues, fixtureMixed, fixtureNoIssues];
    const output = aggregateResults(results, 'us.anthropic.claude-sonnet-4-6');

    expect(output.by_severity.crit).toBe(2);
    expect(output.by_severity.high).toBe(2);
    expect(output.by_severity.med).toBe(1);
    expect(output.by_severity.low).toBe(1);
  });

  it('counts cases_with_issues correctly (excludes zero-issue cases)', () => {
    const results: CaseResult[] = [fixtureWithIssues, fixtureNoIssues, fixtureMixed];
    const output = aggregateResults(results, 'us.anthropic.claude-sonnet-4-6');

    expect(output.total_cases).toBe(3);
    expect(output.cases_with_issues).toBe(2); // fixtureNoIssues has 0 issues
  });

  it('handles all-clean results (no issues)', () => {
    const results: CaseResult[] = [fixtureNoIssues, { ...fixtureNoIssues, case_id: 'cargo-sample-03' }];
    const output = aggregateResults(results, 'us.anthropic.claude-sonnet-4-6');

    expect(output.cases_with_issues).toBe(0);
    expect(output.by_severity).toEqual({ crit: 0, high: 0, med: 0, low: 0 });
    expect(output.issues).toHaveLength(0);
  });

  it('groups by_endpoint correctly', () => {
    const results: CaseResult[] = [fixtureWithIssues, fixtureMixed, fixtureNoIssues];
    const output = aggregateResults(results, 'us.anthropic.claude-sonnet-4-6');

    // fixtureWithIssues -> parse-cargo: crit=1, high=1, med=1, low=1
    expect(output.by_endpoint['parse-cargo']).toEqual({ crit: 1, high: 1, med: 1, low: 1 });
    // fixtureMixed -> parse-vessel: crit=1, high=1, med=0, low=0
    expect(output.by_endpoint['parse-vessel']).toEqual({ crit: 1, high: 1, med: 0, low: 0 });
    // fixtureNoIssues -> classify: all zeros
    expect(output.by_endpoint['classify']).toEqual({ crit: 0, high: 0, med: 0, low: 0 });
  });

  it('flat issues list includes case_id and endpoint', () => {
    const results: CaseResult[] = [fixtureWithIssues];
    const output = aggregateResults(results, 'us.anthropic.claude-sonnet-4-6');

    expect(output.issues).toHaveLength(4);
    for (const issue of output.issues) {
      expect(issue.case_id).toBe('cargo-sample-02');
      expect(issue.endpoint).toBe('parse-cargo');
      expect(issue.severity).toBeDefined();
      expect(issue.field).toBeDefined();
      expect(issue.class).toBeDefined();
      expect(issue.what).toBeDefined();
    }
  });

  it('sets generated_at as ISO timestamp and validator_model', () => {
    const output = aggregateResults([], 'us.anthropic.claude-sonnet-4-6');

    expect(output.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(output.validator_model).toBe('us.anthropic.claude-sonnet-4-6');
    expect(output.total_cases).toBe(0);
    expect(output.cases_with_issues).toBe(0);
  });
});

describe('exported function signature', () => {
  it('validateSinglePair accepts a CallAiTextFn and returns CaseResult', async () => {
    callMock.mockResolvedValue(JSON.stringify(fixtureNoIssues));
    const result = await validateSinglePair(basePair, fakeCallAiText);

    // Verify the return shape matches CaseResult
    expect(result).toHaveProperty('case_id');
    expect(result).toHaveProperty('endpoint');
    expect(result).toHaveProperty('issues');
    expect(Array.isArray(result.issues)).toBe(true);
  });

  it('aggregateResults returns ValidatorOutput shape', () => {
    const output: ValidatorOutput = aggregateResults([], 'test-model');

    expect(output).toHaveProperty('generated_at');
    expect(output).toHaveProperty('validator_model');
    expect(output).toHaveProperty('total_cases');
    expect(output).toHaveProperty('cases_with_issues');
    expect(output).toHaveProperty('by_severity');
    expect(output).toHaveProperty('by_endpoint');
    expect(output).toHaveProperty('issues');
  });
});

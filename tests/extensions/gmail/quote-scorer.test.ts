import * as fs from 'fs';
import * as path from 'path';
import { scoreQuote } from '../../../extensions/gmail/quote-scorer';

const FIXTURES_DIR = path.join(__dirname, '..', '..', 'fixtures', 'quote-drafts');

interface Range {
  min: number;
  max: number;
}

const expectations: Record<string, Range> = JSON.parse(
  fs.readFileSync(path.join(FIXTURES_DIR, 'expectations.json'), 'utf-8'),
);

function loadDraft(id: string): string {
  return fs.readFileSync(path.join(FIXTURES_DIR, `${id}.txt`), 'utf-8');
}

// Fast mock LLM clarity scorer (~50ms): scales with text length up to 25.
const mockLlmClarity = (text: string): Promise<number> =>
  new Promise((resolve) => {
    setTimeout(() => {
      const len = text.trim().length;
      if (len === 0) return resolve(0);
      if (len < 50) return resolve(4);
      if (len < 150) return resolve(10);
      if (len < 400) return resolve(15);
      resolve(19);
    }, 50);
  });

describe('quote-scorer: sample drafts hit expected ranges', () => {
  for (const [id, range] of Object.entries(expectations)) {
    it(`${id} → total ∈ [${range.min}, ${range.max}]`, async () => {
      const draft = loadDraft(id);
      const score = await scoreQuote(draft, { clarityScorer: mockLlmClarity });
      expect(score.total).toBeGreaterThanOrEqual(range.min);
      expect(score.total).toBeLessThanOrEqual(range.max);
      expect(score.clarity).toBeGreaterThanOrEqual(0);
      expect(score.clarity).toBeLessThanOrEqual(25);
      expect(score.completeness).toBeGreaterThanOrEqual(0);
      expect(score.completeness).toBeLessThanOrEqual(25);
      expect(score.tone).toBeGreaterThanOrEqual(0);
      expect(score.tone).toBeLessThanOrEqual(25);
      expect(score.freightNumbers).toBeGreaterThanOrEqual(0);
      expect(score.freightNumbers).toBeLessThanOrEqual(25);
    });
  }
});

describe('quote-scorer: latency & resilience', () => {
  it('p95 latency < 500ms on all sample drafts (with 50ms mock LLM)', async () => {
    const ids = Object.keys(expectations);
    const elapsed: number[] = [];
    for (const id of ids) {
      const draft = loadDraft(id);
      const t0 = Date.now();
      await scoreQuote(draft, { clarityScorer: mockLlmClarity });
      elapsed.push(Date.now() - t0);
    }
    const max = Math.max(...elapsed);
    expect(max).toBeLessThan(500);
  });

  it('LLM timeout falls back to heuristic, total stays > 0 and not NaN', async () => {
    const draft = loadDraft('01-good-bulk-fixture');
    const slowLlm = (): Promise<number> =>
      new Promise((resolve) => setTimeout(() => resolve(20), 5000));
    const score = await scoreQuote(draft, {
      clarityScorer: slowLlm,
      llmTimeoutMs: 50,
    });
    expect(Number.isNaN(score.total)).toBe(false);
    expect(score.total).toBeGreaterThan(0);
    expect(score.clarity).toBeGreaterThan(0);
  });

  it('LLM rejection falls back to heuristic without throwing', async () => {
    const draft = loadDraft('02-good-tanker-recap');
    const failing = (): Promise<number> => Promise.reject(new Error('boom'));
    const score = await scoreQuote(draft, { clarityScorer: failing });
    expect(score.total).toBeGreaterThan(50);
  });

  it('returns hints for empty draft and total = 0', async () => {
    const score = await scoreQuote('');
    expect(score.total).toBe(0);
    expect(Array.isArray(score.hints)).toBe(true);
  });

  it('works without LLM injection (pure heuristic)', async () => {
    const draft = loadDraft('01-good-bulk-fixture');
    const score = await scoreQuote(draft);
    expect(score.total).toBeGreaterThan(60);
  });
});

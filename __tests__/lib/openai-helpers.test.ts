import { endpointLlmTimeout } from '@/lib/openai-helpers';

describe('endpointLlmTimeout', () => {
  it('returns 25_000 for maxDuration=30 (draft-quote, draft-reply)', () => {
    expect(endpointLlmTimeout(30)).toBe(25_000);
  });

  it('returns 55_000 for maxDuration=60 (recap, parse-vessel)', () => {
    expect(endpointLlmTimeout(60)).toBe(55_000);
  });

  it('returns 115_000 for maxDuration=120 (match, parse-recap, classify)', () => {
    expect(endpointLlmTimeout(120)).toBe(115_000);
  });

  it('clamps to 5_000 when maxDuration=0 (floor guard)', () => {
    expect(endpointLlmTimeout(0)).toBe(5_000);
  });

  it('clamps to 5_000 when maxDuration=5 (exactly at boundary)', () => {
    expect(endpointLlmTimeout(5)).toBe(5_000);
  });

  it('clamps to 5_000 when maxDuration=6 ((6-5)*1000=1000 < 5000)', () => {
    expect(endpointLlmTimeout(6)).toBe(5_000);
  });

  it('clamps to 5_000 when maxDuration=10 ((10-5)*1000=5000 == floor)', () => {
    expect(endpointLlmTimeout(10)).toBe(5_000);
  });

  it('returns 6_000 when maxDuration=11 ((11-5)*1000=6000 > floor)', () => {
    expect(endpointLlmTimeout(11)).toBe(6_000);
  });
});

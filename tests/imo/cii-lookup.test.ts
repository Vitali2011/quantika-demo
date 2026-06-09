import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { lookupCii } from '@/lib/imo/cii-lookup';
import type { CiiResult } from '@/lib/imo/cii-lookup';

// Reusable temp-dir factory — cleaned up per test
function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cii-test-'));
}

// IMO 9322180 is in the static dataset with rating D (demo scenario 12)
const DEMO_IMO = '9322180';
// IMO not in the static dataset
const UNKNOWN_IMO = '0000001';

describe('lookupCii — input contract', () => {
  it('returns rating unknown for empty string IMO', async () => {
    const cacheDir = makeTempDir();
    const result = await lookupCii('', { cacheDir, callLlm: async () => 'C' });
    expect(result.rating).toBe('unknown');
    expect(result.imo).toBe('');
  });
});

describe('lookupCii — static dataset (imo-public)', () => {
  it('returns rating from public dataset for known IMO', async () => {
    const cacheDir = makeTempDir();
    const result = await lookupCii(DEMO_IMO, { cacheDir, callLlm: async () => { throw new Error('should not call LLM'); } });
    expect(result.rating).toBe('D');
    expect(result.imo).toBe(DEMO_IMO);
    expect(result.source).toBe('imo-public');
    expect(result.year).toBe(2025);
    expect(result.fetchedAt).toBeTruthy();
  });
});

describe('lookupCii — cache', () => {
  it('returns cached result on second call without hitting source', async () => {
    const cacheDir = makeTempDir();
    let llmCalls = 0;
    const callLlm = async () => { llmCalls++; return 'B'; };

    // First call — goes to dataset
    await lookupCii(DEMO_IMO, { cacheDir, callLlm });
    // Second call — must come from cache
    const second = await lookupCii(DEMO_IMO, { cacheDir, callLlm });

    expect(second.source).toBe('imo-public'); // original source preserved; not overwritten to 'cache'
    expect(second.rating).toBe('D');
    expect(llmCalls).toBe(0); // LLM never called since dataset hit
  });

  it('re-fetches when cache is expired (>30 days)', async () => {
    const cacheDir = makeTempDir();

    // Prime cache with an expired entry manually
    const expired: CiiResult = {
      imo: DEMO_IMO,
      rating: 'C',
      year: 2025,
      source: 'imo-public',
      fetchedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString(),
    };
    fs.mkdirSync(path.join(cacheDir), { recursive: true });
    fs.writeFileSync(path.join(cacheDir, `${DEMO_IMO}.json`), JSON.stringify(expired));

    const result = await lookupCii(DEMO_IMO, { cacheDir, callLlm: async () => 'A' });
    // Should re-fetch from dataset (D) not return cached 'C'
    expect(result.source).not.toBe('cache');
    expect(result.rating).toBe('D');
  });
});

describe('lookupCii — LLM fallback', () => {
  it('calls LLM when IMO not in dataset and caches result', async () => {
    const cacheDir = makeTempDir();
    let llmCalls = 0;
    const callLlm = async (_imo: string) => { llmCalls++; return 'D'; };

    const result = await lookupCii(UNKNOWN_IMO, { cacheDir, callLlm });

    expect(result.rating).toBe('D');
    expect(result.source).toBe('llm-fallback');
    expect(llmCalls).toBe(1);

    // Second call should hit cache, not LLM — original source preserved
    const cached = await lookupCii(UNKNOWN_IMO, { cacheDir, callLlm });
    expect(cached.source).toBe('llm-fallback'); // not 'cache' — badge disclosure stays on revisit
    expect(llmCalls).toBe(1);
  });

  it('returns rating unknown when LLM returns invalid value', async () => {
    const cacheDir = makeTempDir();
    const callLlm = async () => 'X'; // not a valid A-E rating

    const result = await lookupCii(UNKNOWN_IMO, { cacheDir, callLlm });
    expect(result.rating).toBe('unknown');
    expect(result.source).toBe('llm-fallback');
  });

  it('returns rating unknown when LLM returns verbose text', async () => {
    const cacheDir = makeTempDir();
    const callLlm = async () => '{"rating": "excellent", "year": 2025}';

    const result = await lookupCii(UNKNOWN_IMO, { cacheDir, callLlm });
    expect(result.rating).toBe('unknown');
  });
});

/**
 * FIX 1 — W10.1: CII cache hit must preserve original source so CiiRatingBadge
 * keeps showing the "Estimated by AI" asterisk on every revisit.
 *
 * Root: cii-lookup.ts line 78 previously returned { ...cached, source: 'cache' },
 * overwriting the stored 'llm-fallback' → isEstimated=false → asterisk gone.
 */
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { lookupCii } from '@/lib/imo/cii-lookup';

const ABSENT_IMO = '9800001'; // not in static dataset

describe('CII cache source-preservation', () => {
  it('cache hit returns original source (llm-fallback) — badge disclosure stays on revisit', async () => {
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cii-w10-'));

    const first = await lookupCii(ABSENT_IMO, { callLlm: async () => 'D', cacheDir });
    expect(first.source).toBe('llm-fallback');
    expect(first.rating).toBe('D');

    // Second call — must serve from cache with original source intact
    const second = await lookupCii(ABSENT_IMO, { callLlm: async () => 'D', cacheDir });
    expect(second.source).toBe('llm-fallback'); // NOT 'cache'
    expect(second.rating).toBe('D');

    // Simulate CiiRatingBadge logic
    const isEstimated = second.source === 'llm-fallback';
    expect(isEstimated).toBe(true);
  });

  it('first call (no cache) returns llm-fallback for absent IMO', async () => {
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cii-w10-nc-'));
    const res = await lookupCii(ABSENT_IMO, { callLlm: async () => 'E', cacheDir });
    expect(res.source).toBe('llm-fallback');
    expect(res.rating).toBe('E');
  });

  it('imo-public source is also preserved through cache on revisit', async () => {
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cii-w10-pub-'));
    // 9322180 is in the static dataset → source: 'imo-public'
    const first = await lookupCii('9322180', { cacheDir });
    expect(first.source).toBe('imo-public');

    const second = await lookupCii('9322180', { cacheDir });
    expect(second.source).toBe('imo-public'); // must not change to 'cache' on hit
  });
});

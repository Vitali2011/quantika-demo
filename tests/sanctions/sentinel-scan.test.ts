/**
 * β-09: CLI sentinel-scan smoke test.
 * Verifies mode parsing + exit code semantics without spawning a child process.
 */

import { main } from '@/scripts/sentinel-scan';

describe('β-09 sentinel-scan CLI', () => {
  let writes: string[] = [];
  let originalWrite: typeof process.stdout.write;

  beforeEach(() => {
    writes = [];
    originalWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Uint8Array) => {
      writes.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString());
      return true;
    }) as typeof process.stdout.write;
  });

  afterEach(() => {
    process.stdout.write = originalWrite;
  });

  it('returns exit code 0 on cron mode with no deals', async () => {
    const code = await main(['node', 'sentinel-scan.ts', '--mode=cron']);
    expect(code).toBe(0);
    const records = writes.join('').trim().split('\n').map((l) => JSON.parse(l));
    expect(records.find((r) => r.event === 'sentinel.start')?.mode).toBe('cron');
    expect(records.find((r) => r.event === 'sentinel.complete')?.alertCount).toBe(0);
  });

  it('parses --mode=event --since correctly', async () => {
    const code = await main([
      'node',
      'sentinel-scan.ts',
      '--mode=event',
      '--since=2026-04-29T00:00:00Z',
    ]);
    expect(code).toBe(0);
    const records = writes.join('').trim().split('\n').map((l) => JSON.parse(l));
    const start = records.find((r) => r.event === 'sentinel.start');
    expect(start?.mode).toBe('event');
    expect(start?.since).toBe('2026-04-29T00:00:00Z');
  });
});

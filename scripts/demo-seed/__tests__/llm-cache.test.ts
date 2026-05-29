// scripts/demo-seed/__tests__/llm-cache.test.ts
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  corpusHash,
  cachePath,
  readCache,
  writeCache,
  loadLlmCacheIfAny,
  type LlmCache,
} from '../llm-cache';

function makeCorpus(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'llm-cache-test-'));
  fs.writeFileSync(path.join(dir, 'a.json'), '{"id":"a","body":"alpha"}');
  fs.writeFileSync(path.join(dir, 'b.json'), '{"id":"b","body":"beta"}');
  return dir;
}

describe('corpusHash', () => {
  it('returns a 64-char hex string', () => {
    const dir = makeCorpus();
    expect(corpusHash(dir)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic across calls', () => {
    const dir = makeCorpus();
    expect(corpusHash(dir)).toBe(corpusHash(dir));
  });

  it('changes when any file content changes', () => {
    const dir = makeCorpus();
    const h1 = corpusHash(dir);
    fs.writeFileSync(path.join(dir, 'a.json'), '{"id":"a","body":"ALPHA"}');
    expect(corpusHash(dir)).not.toBe(h1);
  });

  it('does not depend on file enumeration order', () => {
    const dir = makeCorpus();
    const h1 = corpusHash(dir);
    const a = fs.readFileSync(path.join(dir, 'a.json'));
    const b = fs.readFileSync(path.join(dir, 'b.json'));
    fs.unlinkSync(path.join(dir, 'a.json'));
    fs.unlinkSync(path.join(dir, 'b.json'));
    fs.writeFileSync(path.join(dir, 'b.json'), b);
    fs.writeFileSync(path.join(dir, 'a.json'), a);
    expect(corpusHash(dir)).toBe(h1);
  });

  it('ignores non-.json files', () => {
    const dir = makeCorpus();
    const h1 = corpusHash(dir);
    fs.writeFileSync(path.join(dir, 'README.md'), 'docs');
    expect(corpusHash(dir)).toBe(h1);
  });
});

describe('writeCache + readCache', () => {
  it('round-trips a cache payload', () => {
    const dir = makeCorpus();
    const cache: LlmCache = {
      corpusHash: 'abc',
      generatedAt: '2026-05-27T20:00:00.000Z',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      classifications: [{ emailId: 'a' } as any],
      parsedCargos: [],
      parsedVessels: [],
      parsedFixtureRecaps: [],
    };
    writeCache(dir, cache);
    const read = readCache(dir, 'abc');
    expect(read).toEqual(cache);
  });
});

describe('loadLlmCacheIfAny', () => {
  it('returns null when .llm-cache/ does not exist', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'no-cache-'));
    expect(loadLlmCacheIfAny(dir)).toBeNull();
  });

  it('returns null when cache hash does not match corpus hash', () => {
    const dir = makeCorpus();
    const cache: LlmCache = {
      corpusHash: 'stale-hash',
      generatedAt: '2026-05-27T20:00:00.000Z',
      classifications: [],
      parsedCargos: [],
      parsedVessels: [],
      parsedFixtureRecaps: [],
    };
    writeCache(dir, cache);
    expect(loadLlmCacheIfAny(dir)).toBeNull();
  });

  it('returns cache when hash matches', () => {
    const dir = makeCorpus();
    const h = corpusHash(dir);
    const cache: LlmCache = {
      corpusHash: h,
      generatedAt: '2026-05-27T20:00:00.000Z',
      classifications: [],
      parsedCargos: [],
      parsedVessels: [],
      parsedFixtureRecaps: [],
    };
    writeCache(dir, cache);
    const loaded = loadLlmCacheIfAny(dir);
    expect(loaded).not.toBeNull();
    expect(loaded!.corpusHash).toBe(h);
  });
});

describe('cachePath', () => {
  it('joins the corpus dir + .llm-cache/<hash>.json', () => {
    expect(cachePath('/x/y', 'abc')).toBe('/x/y/.llm-cache/abc.json');
  });
});

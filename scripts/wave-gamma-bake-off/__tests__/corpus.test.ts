import { loadCorpus, type CorpusCase } from '../corpus';

describe('corpus loader', () => {
  let corpus: CorpusCase[];

  beforeAll(async () => {
    corpus = await loadCorpus();
  });

  it('loads at least 20 seed messages', () => {
    expect(corpus.length).toBeGreaterThanOrEqual(20);
  });

  it('every case has id, email body, and a non-empty endpoints array', () => {
    for (const c of corpus) {
      expect(typeof c.id).toBe('string');
      expect(c.id.length).toBeGreaterThan(0);
      expect(typeof c.email).toBe('string');
      expect(c.email.length).toBeGreaterThan(10);
      expect(Array.isArray(c.endpoints)).toBe(true);
      expect(c.endpoints.length).toBeGreaterThan(0);
    }
  });

  it('endpoints are restricted to the 4 known parsing endpoints', () => {
    const known = new Set(['parse-cargo', 'parse-vessel', 'parse-recap', 'classify']);
    for (const c of corpus) {
      for (const ep of c.endpoints) {
        expect(known.has(ep)).toBe(true);
      }
    }
  });

  it('every case includes classify (every email is a classify candidate)', () => {
    for (const c of corpus) {
      expect(c.endpoints).toContain('classify');
    }
  });

  it('references field exists on every case (may be empty under Mode B)', () => {
    for (const c of corpus) {
      expect(c.references).toBeDefined();
      expect(typeof c.references).toBe('object');
    }
  });

  it('case ids are unique across the merged corpus', () => {
    const ids = corpus.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

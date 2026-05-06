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

describe('BAKE_OFF_REFERENCE switch', () => {
  const originalEnv = process.env.BAKE_OFF_REFERENCE;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.BAKE_OFF_REFERENCE;
    } else {
      process.env.BAKE_OFF_REFERENCE = originalEnv;
    }
  });

  it('defaults to pro baseline when BAKE_OFF_REFERENCE is unset', async () => {
    delete process.env.BAKE_OFF_REFERENCE;
    const corpus = await loadCorpus();
    expect(corpus.length).toBeGreaterThanOrEqual(20);
    // With pro baseline present, references should be populated (Mode A)
    for (const c of corpus) {
      expect(c.references).toBeDefined();
      expect(typeof c.references).toBe('object');
    }
  });

  it('loads pro baseline when BAKE_OFF_REFERENCE=pro', async () => {
    process.env.BAKE_OFF_REFERENCE = 'pro';
    const corpus = await loadCorpus();
    expect(corpus.length).toBeGreaterThanOrEqual(20);
    for (const c of corpus) {
      expect(c.references).toBeDefined();
    }
  });

  it('loads opus ground truth when BAKE_OFF_REFERENCE=opus', async () => {
    process.env.BAKE_OFF_REFERENCE = 'opus';
    const corpus = await loadCorpus();
    expect(corpus.length).toBeGreaterThanOrEqual(20);
    // ground-truth-opus.json exists on disk (Spec 02), so references should be populated
    const casesWithRefs = corpus.filter(
      (c) => Object.keys(c.references).length > 0,
    );
    expect(casesWithRefs.length).toBeGreaterThan(0);
  });

  it('falls back to pro (Mode B) on unknown BAKE_OFF_REFERENCE value', async () => {
    process.env.BAKE_OFF_REFERENCE = 'unknown_value';
    const corpus = await loadCorpus();
    expect(corpus.length).toBeGreaterThanOrEqual(20);
  });
});

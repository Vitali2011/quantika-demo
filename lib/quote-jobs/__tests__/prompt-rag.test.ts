/**
 * M3 follow-up (PR #928 cold QA R2): RAG-enabled path of buildQuotePrompt.
 *
 * Ported from __tests__/api/rag-imsbc-igc-draft-quote.test.ts (route-level suite,
 * describe.skip'd after the async-workshop move) down to the prompt-builder seam:
 * - D5: ragEnabled=false → no retrieve() calls at all
 * - D1: coal/bulk cargo → retrieve() with imsbc_vec/imsbc_fts
 * - D2: grain cargo → retrieve() with igc_vec/igc_fts
 * - D4: retrieve() throws → graceful degrade, system prompt without RAG context
 * - VX-D1: KNOWLEDGE_BACKEND=vertex → dispatcher routes retrieve() to Vertex backend
 *
 * Only the leaf backends are mocked; the dispatcher (retriever.ts) and flags.ts
 * run real, so VX-D1 exercises actual backend routing. Table names follow the
 * allowlist in .claude/rules/retriever.md (imsbc_vec/fts, igc_vec/fts).
 */

const mockRetrieveSqlite = jest.fn();
jest.mock('@/lib/knowledge/embeddings/retriever-sqlite', () => ({
  retrieve: (...args: unknown[]) => mockRetrieveSqlite(...args),
  searchVec0: jest.fn(),
  rrfMerge: jest.fn(),
}));

const mockRetrieveVertex = jest.fn();
jest.mock('@/lib/knowledge/embeddings/retriever-vertex', () => ({
  retrieve: (...args: unknown[]) => mockRetrieveVertex(...args),
}));

const mockDb = { name: 'mock-db' };
jest.mock('@/lib/db', () => ({ getDb: jest.fn(() => mockDb) }));

import { buildQuotePrompt } from '@/lib/quote-jobs/prompt';
import { DRAFT_QUOTE_SYSTEM_PROMPT } from '@/lib/prompts';

const coalCargo = {
  emailId: 'email-coal-1',
  cargoType: 'BULK',
  cargoDescription: { value: 'thermal coal', confidence: 'confirmed', source_text: 'thermal coal' },
};
const grainCargo = {
  emailId: 'email-grain-1',
  cargoType: 'BULK',
  cargoDescription: { value: 'grain wheat', confidence: 'confirmed', source_text: 'grain wheat' },
};
const email = {
  id: 'email-coal-1',
  from: 'John <john@bulk.com>',
  fromName: 'John',
  subject: 'Coal inquiry',
  body: '50,000 MT thermal coal Richards Bay to Rotterdam',
};

const imsbcChunk = {
  content: 'IMSBC: Coal must be monitored for methane emission. Stowage factor 0.83-0.96 m³/t.',
  metadata: { source: 'imsbc', section: 'Coal Group B' },
  distance: 0.1,
  chunkId: '1',
};
const igcChunk = {
  content: 'IGC Code: grain cargo moisture requirements, Chapter 4',
  metadata: { source: 'igc', section: 'Chapter 4' },
  distance: 0.15,
  chunkId: '2',
};

const ORIG_BACKEND = process.env.KNOWLEDGE_BACKEND;

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.KNOWLEDGE_BACKEND; // default → sqlite
  mockRetrieveSqlite.mockResolvedValue([]);
  mockRetrieveVertex.mockResolvedValue([]);
});

afterAll(() => {
  if (ORIG_BACKEND === undefined) delete process.env.KNOWLEDGE_BACKEND;
  else process.env.KNOWLEDGE_BACKEND = ORIG_BACKEND;
});

describe('buildQuotePrompt — RAG-enabled path (M3, ported D1/D2/D4/D5/VX-D1)', () => {
  it('D5: ragEnabled=false → no retrieve() on any backend, bare system prompt', async () => {
    const { system } = await buildQuotePrompt({
      parsedCargo: coalCargo as never, email: email as never, ragEnabled: false,
    });

    expect(mockRetrieveSqlite).not.toHaveBeenCalled();
    expect(mockRetrieveVertex).not.toHaveBeenCalled();
    expect(system).toBe(DRAFT_QUOTE_SYSTEM_PROMPT);
  });

  it('D1: coal cargo + RAG enabled → retrieve() with imsbc_vec/imsbc_fts, chunks injected', async () => {
    mockRetrieveSqlite.mockImplementation(async (_q: string, opts: { vectorTable: string }) =>
      opts.vectorTable === 'imsbc_vec' ? [imsbcChunk] : []);

    const { system } = await buildQuotePrompt({
      parsedCargo: coalCargo as never, email: email as never, ragEnabled: true,
    });

    const imsbcCall = mockRetrieveSqlite.mock.calls.find(([, opts]) => opts?.vectorTable === 'imsbc_vec');
    expect(imsbcCall).toBeDefined();
    expect(imsbcCall![0]).toContain('IMSBC');
    expect(imsbcCall![0]).toContain('thermal coal'); // ConfidenceField .value extracted into query
    expect(imsbcCall![1].ftsTable).toBe('imsbc_fts');
    expect(imsbcCall![1].topN).toBeGreaterThan(0);
    expect(imsbcCall![1].db).toBe(mockDb);

    expect(system).toContain('IMSBC Cargo Safety Context');
    expect(system).toContain(imsbcChunk.content);
    expect(system).toContain('[IMSBC-1]'); // chunkId fallback when metadata.id absent
  });

  it('D2: grain cargo + RAG enabled → retrieve() with igc_vec/igc_fts, chunks injected', async () => {
    mockRetrieveSqlite.mockImplementation(async (_q: string, opts: { vectorTable: string }) =>
      opts.vectorTable === 'igc_vec' ? [igcChunk] : []);

    const { system } = await buildQuotePrompt({
      parsedCargo: grainCargo as never, email: email as never, ragEnabled: true,
    });

    const igcCall = mockRetrieveSqlite.mock.calls.find(([, opts]) => opts?.vectorTable === 'igc_vec');
    expect(igcCall).toBeDefined();
    expect(igcCall![0]).toContain('IGC grain gas');
    expect(igcCall![0]).toContain('grain wheat');
    expect(igcCall![1].ftsTable).toBe('igc_fts');
    expect(igcCall![1].topN).toBeGreaterThan(0);

    expect(system).toContain('IGC Grain/Gas Cargo Context');
    expect(system).toContain(igcChunk.content);
  });

  it('D4: retrieve() throws on both sources → graceful degrade, system prompt without RAG context', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockRetrieveSqlite.mockRejectedValue(new Error('sqlite3 disk I/O error'));

    const { system, user } = await buildQuotePrompt({
      parsedCargo: coalCargo as never, email: email as never, ragEnabled: true,
    });

    expect(system).toBe(DRAFT_QUOTE_SYSTEM_PROMPT);
    expect(user).toContain('thermal coal'); // user prompt still built
    expect(warn).toHaveBeenCalledTimes(2); // both sources logged, neither rethrown
    warn.mockRestore();
  });

  it('D4b: IMSBC throws, IGC succeeds → IGC context still injected (per-source degrade)', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockRetrieveSqlite.mockImplementation(async (_q: string, opts: { vectorTable: string }) => {
      if (opts.vectorTable === 'imsbc_vec') throw new Error('vec0 corrupt');
      return [igcChunk];
    });

    const { system } = await buildQuotePrompt({
      parsedCargo: grainCargo as never, email: email as never, ragEnabled: true,
    });

    expect(system).not.toContain('IMSBC Cargo Safety Context');
    expect(system).toContain('IGC Grain/Gas Cargo Context');
    warn.mockRestore();
  });

  it('VX-D1: KNOWLEDGE_BACKEND=vertex → dispatcher routes retrieve() to Vertex backend', async () => {
    process.env.KNOWLEDGE_BACKEND = 'vertex';
    const vertexChunk = {
      content: 'IMSBC: Coal Group B — monitor for methane. Stowage factor 0.83-0.96 m³/t.',
      metadata: { source: 'imsbc', section: 'Coal Group B', id: 'imsbc-coal-b' },
      distance: 0.12,
      chunkId: 'vertex-imsbc-1',
    };
    mockRetrieveVertex.mockImplementation(async (_q: string, opts: { vectorTable: string }) =>
      opts.vectorTable === 'imsbc_vec' ? [vertexChunk] : []);

    const { system } = await buildQuotePrompt({
      parsedCargo: coalCargo as never, email: email as never, ragEnabled: true,
    });

    expect(mockRetrieveSqlite).not.toHaveBeenCalled();
    const imsbcCall = mockRetrieveVertex.mock.calls.find(([, opts]) => opts?.vectorTable === 'imsbc_vec');
    expect(imsbcCall).toBeDefined();
    expect(imsbcCall![1].ftsTable).toBe('imsbc_fts');
    expect(imsbcCall![1].topN).toBeGreaterThan(0);
    expect(system).toContain('[IMSBC-imsbc-coal-b]'); // metadata.id preferred over chunkId
  });
});

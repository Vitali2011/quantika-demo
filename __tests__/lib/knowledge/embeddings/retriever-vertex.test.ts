/**
 * Tests for Vertex AI Search retriever
 *
 * Focuses on:
 * - Input contract guards (empty query, topN=0, allow-list)
 * - Metadata mapping from Vertex response to RetrievedChunk
 * - Required fields for citations validator (source, section, id, sourceUrl, title, bulletinId)
 * - Engine mapping from vectorTable
 *
 * Phase 0 not done → tests use mocked SearchServiceClient.search()
 */

import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { SearchServiceClient } from "@google-cloud/discoveryengine";

// Ensure RAG is enabled for all tests that verify retriever behavior (not the gate test).
// TC-VX-GATE tests temporarily override this.
process.env.KNOWLEDGE_RAG_ENABLED = "true";

// Replace prototype.search with a controllable mock — jest.mock factory
// doesn't reliably apply for this package under next/jest + ts-jest stack.
let _mockSearch: jest.Mock<(...args: unknown[]) => Promise<unknown[]>> = jest.fn(async () => []);
(SearchServiceClient as any).prototype.search = async function (...args: unknown[]) {
  const results = await _mockSearch(...args);
  return (async function* () {
    if (Array.isArray(results)) {
      for (const result of results) yield result;
    }
  })();
};

// Set required env vars before import
process.env.GOOGLE_CLOUD_PROJECT      = "test-project";
process.env.VERTEX_SEARCH_LOCATION   = "global";
process.env.VERTEX_ENGINE_IMSBC      = "imsbc-engine-id";
process.env.VERTEX_ENGINE_IGC        = "igc-engine-id";
process.env.VERTEX_ENGINE_JWC        = "jwc-engine-id";
process.env.VERTEX_ENGINE_BIMCO      = "bimco-engine-id";
// Disable auth for tests
process.env.GOOGLE_APPLICATION_CREDENTIALS = "";

import { retrieve } from "@/lib/knowledge/embeddings/retriever-vertex";

describe("retriever-vertex input contract guards", () => {
  beforeEach(() => {
    _mockSearch = jest.fn();
  });

  it("TC-VX-01: empty query returns [] without API call", async () => {
    const result = await retrieve("", {
      vectorTable: "imsbc_vec",
      ftsTable: "imsbc_fts",
      topN: 5,
    });

    expect(result).toEqual([]);
    expect(_mockSearch).not.toHaveBeenCalled();
  });

  it("TC-VX-02: null query returns [] without API call", async () => {
    const result = await retrieve(null as any, {
      vectorTable: "imsbc_vec",
      ftsTable: "imsbc_fts",
      topN: 5,
    });

    expect(result).toEqual([]);
    expect(_mockSearch).not.toHaveBeenCalled();
  });

  it("TC-VX-03: undefined query returns [] without API call", async () => {
    const result = await retrieve(undefined as any, {
      vectorTable: "imsbc_vec",
      ftsTable: "imsbc_fts",
      topN: 5,
    });

    expect(result).toEqual([]);
    expect(_mockSearch).not.toHaveBeenCalled();
  });

  it("TC-VX-04: whitespace-only query returns []", async () => {
    const result = await retrieve("   ", {
      vectorTable: "imsbc_vec",
      ftsTable: "imsbc_fts",
      topN: 5,
    });

    expect(result).toEqual([]);
    expect(_mockSearch).not.toHaveBeenCalled();
  });

  it("TC-VX-05: topN=0 returns [] without API call", async () => {
    const result = await retrieve("test query", {
      vectorTable: "imsbc_vec",
      ftsTable: "imsbc_fts",
      topN: 0,
    });

    expect(result).toEqual([]);
    expect(_mockSearch).not.toHaveBeenCalled();
  });

  it("TC-VX-06: empty vectorTable throws TypeError", async () => {
    await expect(
      retrieve("test query", {
        vectorTable: "",
        ftsTable: "imsbc_fts",
        topN: 5,
      })
    ).rejects.toThrow(TypeError);
    await expect(
      retrieve("test query", {
        vectorTable: "",
        ftsTable: "imsbc_fts",
        topN: 5,
      })
    ).rejects.toThrow("vectorTable required");
  });

  it("TC-VX-07: vectorTable not in allow-list throws Error", async () => {
    await expect(
      retrieve("test query", {
        vectorTable: "evil_vec",
        ftsTable: "imsbc_fts",
        topN: 5,
      })
    ).rejects.toThrow("Invalid vectorTable");
  });

  it.skip("TC-VX-08: allowed vectorTables pass validation", async () => {
    _mockSearch.mockResolvedValue([{ results: [] }]);

    const allowedTables = ["imsbc_vec", "igc_vec", "jwc_vec", "bimco_vec"];

    for (const table of allowedTables) {
      _mockSearch.mockClear();
      await retrieve("test query", {
        vectorTable: table,
        ftsTable: `${table.replace("_vec", "_fts")}`,
        topN: 5,
      });
      expect(_mockSearch).toHaveBeenCalledTimes(1);
    }
  });
});

describe("retriever-vertex metadata mapping", () => {
  beforeEach(() => {
    _mockSearch.mockClear();
  });

  it.skip("TC-VX-09: maps IMSBC document to RetrievedChunk with required fields", async () => {
    _mockSearch.mockResolvedValue([
      {
        results: [
          {
            id: "result-1",
            relevanceScore: 0.85,
            document: {
              id: "imsbc-doc-3.1",
              name: "IMSBC Code Chapter 3",
              structData: {
                source: "imsbc",
                section: "3.1",
                id: "imsbc-3.1",
                sourceUrl: "https://example.com/imsbc/ch3",
                title: "Group A Cargoes",
                content: "Group A cargoes may liquefy...",
              },
              derivedStructData: {
                extractive_segments: [{ content: "Group A cargoes may liquefy if moisture content exceeds TML." }],
                snippets: [{ snippet: "Group A cargoes may liquefy..." }],
              },
            },
          },
        ],
      },
    ]);

    const result = await retrieve("Group A cargoes", {
      vectorTable: "imsbc_vec",
      ftsTable: "imsbc_fts",
      topN: 1,
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      content: "Group A cargoes may liquefy if moisture content exceeds TML.",
      metadata: {
        source: "imsbc",
        section: "3.1",
        id: "imsbc-3.1",
        sourceUrl: "https://example.com/imsbc/ch3",
        title: "Group A Cargoes",
      },
      chunkId: "imsbc-doc-3.1",
    });
    expect(result[0].distance).toBeGreaterThanOrEqual(0);
    expect(result[0].distance).toBeLessThanOrEqual(1);
  });

  it.skip("TC-VX-10: maps IGC document to RetrievedChunk with required fields", async () => {
    _mockSearch.mockResolvedValue([
      {
        results: [
          {
            id: "result-1",
            relevanceScore: 0.75,
            document: {
              id: "igc-doc-7.2",
              name: "IGC Code Chapter 7",
              structData: {
                source: "igc",
                section: "7.2",
                id: "igc-7.2",
                sourceUrl: "https://example.com/igc/ch7",
                title: "Fire Safety",
                content: "Fire detection systems...",
              },
              derivedStructData: {
                snippets: [{ snippet: "Fire detection systems must comply with SOLAS requirements." }],
              },
            },
          },
        ],
      },
    ]);

    const result = await retrieve("fire safety", {
      vectorTable: "igc_vec",
      ftsTable: "igc_fts",
      topN: 1,
    });

    expect(result).toHaveLength(1);
    expect(result[0].metadata).toMatchObject({
      source: "igc",
      section: "7.2",
      id: "igc-7.2",
      sourceUrl: "https://example.com/igc/ch7",
      title: "Fire Safety",
    });
  });

  it.skip("TC-VX-11: maps JWC document with bulletinId for citations", async () => {
    _mockSearch.mockResolvedValue([
      {
        results: [
          {
            id: "result-1",
            relevanceScore: 0.90,
            document: {
              id: "jwc-bulletin-123",
              name: "JWC Bulletin LMA-123",
              structData: {
                source: "jwc",
                id: "LMA-123",
                bulletinId: "LMA-123",
                sourceUrl: "https://example.com/jwc/LMA-123",
                title: "Black Sea War Risk Zone",
                content: "War risk zone includes...",
              },
              derivedStructData: {
                extractive_segments: [{ content: "War risk zone includes Ukrainian ports and territorial waters." }],
              },
            },
          },
        ],
      },
    ]);

    const result = await retrieve("Black Sea war risk", {
      vectorTable: "jwc_vec",
      ftsTable: "jwc_fts",
      topN: 1,
    });

    expect(result).toHaveLength(1);
    expect(result[0].metadata).toMatchObject({
      source: "jwc",
      id: "LMA-123",
      bulletinId: "LMA-123",
      sourceUrl: "https://example.com/jwc/LMA-123",
      title: "Black Sea War Risk Zone",
    });
  });

  it.skip("TC-VX-12: handles missing optional metadata fields gracefully", async () => {
    _mockSearch.mockResolvedValue([
      {
        results: [
          {
            id: "result-1",
            relevanceScore: 0.70,
            document: {
              id: "minimal-doc",
              name: "Minimal Document",
              structData: { source: "imsbc", content: "Minimal content." },
              derivedStructData: { snippets: [{ snippet: "Minimal content." }] },
            },
          },
        ],
      },
    ]);

    const result = await retrieve("minimal", {
      vectorTable: "imsbc_vec",
      ftsTable: "imsbc_fts",
      topN: 1,
    });

    expect(result).toHaveLength(1);
    expect(result[0].metadata).toMatchObject({
      source: "imsbc",
      id: "minimal-doc",
      title: "Minimal Document",
    });
    expect(result[0].metadata.section).toBeUndefined();
    expect(result[0].metadata.sourceUrl).toBeUndefined();
  });

  it.skip("TC-VX-13: empty results returns []", async () => {
    _mockSearch.mockResolvedValue([{ results: [] }]);

    const result = await retrieve("nonexistent query", {
      vectorTable: "imsbc_vec",
      ftsTable: "imsbc_fts",
      topN: 5,
    });

    expect(result).toEqual([]);
  });

  it.skip("TC-VX-14: no results field returns []", async () => {
    _mockSearch.mockResolvedValue([{}]);

    const result = await retrieve("another query", {
      vectorTable: "imsbc_vec",
      ftsTable: "imsbc_fts",
      topN: 5,
    });

    expect(result).toEqual([]);
  });
});

describe("retriever-vertex extractiveContentSpec opt-in (Enterprise edition)", () => {
  const ORIGINAL_FLAG = process.env.VERTEX_USE_ENTERPRISE_EXTRACTIVE;

  beforeEach(() => {
    _mockSearch = jest.fn(async () => []);
  });

  afterEach(() => {
    if (ORIGINAL_FLAG === undefined) {
      delete process.env.VERTEX_USE_ENTERPRISE_EXTRACTIVE;
    } else {
      process.env.VERTEX_USE_ENTERPRISE_EXTRACTIVE = ORIGINAL_FLAG;
    }
  });

  it("TC-VX-EXT-01: default (unset) → request omits extractiveContentSpec (Standard edition safe)", async () => {
    delete process.env.VERTEX_USE_ENTERPRISE_EXTRACTIVE;

    await retrieve("test", {
      vectorTable: "imsbc_vec",
      ftsTable: "imsbc_fts",
      topN: 1,
    });

    expect(_mockSearch).toHaveBeenCalledTimes(1);
    const callArg = _mockSearch.mock.calls[0][0] as any;
    expect(callArg.contentSearchSpec).toBeDefined();
    expect(callArg.contentSearchSpec.snippetSpec).toEqual({ returnSnippet: true });
    expect(callArg.contentSearchSpec.extractiveContentSpec).toBeUndefined();
  });

  it("TC-VX-EXT-02: flag=false → request omits extractiveContentSpec", async () => {
    process.env.VERTEX_USE_ENTERPRISE_EXTRACTIVE = "false";

    await retrieve("test", {
      vectorTable: "imsbc_vec",
      ftsTable: "imsbc_fts",
      topN: 1,
    });

    const callArg = _mockSearch.mock.calls[0][0] as any;
    expect(callArg.contentSearchSpec.extractiveContentSpec).toBeUndefined();
  });

  it("TC-VX-EXT-03: flag=true → backward compat, extractiveContentSpec present", async () => {
    process.env.VERTEX_USE_ENTERPRISE_EXTRACTIVE = "true";

    await retrieve("test", {
      vectorTable: "imsbc_vec",
      ftsTable: "imsbc_fts",
      topN: 1,
    });

    const callArg = _mockSearch.mock.calls[0][0] as any;
    expect(callArg.contentSearchSpec.extractiveContentSpec).toEqual({
      maxExtractiveSegmentCount: 1,
      maxExtractiveAnswerCount: 1,
    });
  });

  it("TC-VX-EXT-04: snippet-only response parses to valid RetrievedChunk (no extractive answers)", async () => {
    delete process.env.VERTEX_USE_ENTERPRISE_EXTRACTIVE;

    _mockSearch.mockResolvedValue([
      {
        relevanceScore: 0.8,
        document: {
          id: "imsbc-doc-1",
          name: "IMSBC Ch 3",
          structData: {
            source: "imsbc",
            section: "3.1",
            id: "imsbc-3.1",
            title: "Group A",
          },
          derivedStructData: {
            snippets: [{ snippet: "Group A cargoes may liquefy when moisture exceeds TML." }],
          },
        },
      },
    ]);

    const result = await retrieve("Group A", {
      vectorTable: "imsbc_vec",
      ftsTable: "imsbc_fts",
      topN: 1,
    });

    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("Group A cargoes may liquefy when moisture exceeds TML.");
    expect(result[0].metadata.source).toBe("imsbc");
    expect(result[0].metadata.id).toBe("imsbc-3.1");
    expect(result[0].chunkId).toBe("imsbc-doc-1");
  });
});

describe("retriever-vertex engine mapping", () => {
  beforeEach(() => {
    _mockSearch.mockClear();
  });

  it.skip("TC-VX-15: vectorTable maps to correct engine ID in servingConfig", async () => {
    _mockSearch.mockResolvedValue([{ results: [] }]);

    await retrieve("test", {
      vectorTable: "imsbc_vec",
      ftsTable: "imsbc_fts",
      topN: 1,
    });

    expect(_mockSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        servingConfig: expect.stringContaining(
          "engines/imsbc-engine-id/servingConfigs/default_search"
        ),
      })
    );
  });

  it.skip("TC-VX-16: missing engine env var throws Error", async () => {
    const originalEnv = process.env.VERTEX_ENGINE_IMSBC;
    delete process.env.VERTEX_ENGINE_IMSBC;

    await expect(
      retrieve("test", {
        vectorTable: "imsbc_vec",
        ftsTable: "imsbc_fts",
        topN: 1,
      })
    ).rejects.toThrow("No engine configured");

    process.env.VERTEX_ENGINE_IMSBC = originalEnv;
  });

  it.skip("TC-VX-17: ftsTable parameter is accepted but ignored", async () => {
    _mockSearch.mockResolvedValue([{ results: [] }]);

    await retrieve("test", {
      vectorTable: "imsbc_vec",
      ftsTable: "different_fts",
      topN: 1,
    });

    expect(_mockSearch).toHaveBeenCalledTimes(1);
  });
});

describe("retriever-vertex RAG master-switch gate (TC-VX-GATE)", () => {
  const ORIG = process.env.KNOWLEDGE_RAG_ENABLED;

  beforeEach(() => {
    _mockSearch = jest.fn();
  });

  afterEach(() => {
    if (ORIG === undefined) {
      delete process.env.KNOWLEDGE_RAG_ENABLED;
    } else {
      process.env.KNOWLEDGE_RAG_ENABLED = ORIG;
    }
  });

  it("TC-VX-GATE-01: KNOWLEDGE_RAG_ENABLED unset → retrieve() throws 'RAG is not enabled', zero Vertex calls", async () => {
    delete process.env.KNOWLEDGE_RAG_ENABLED;

    await expect(
      retrieve("bulk carrier cargo", {
        vectorTable: "imsbc_vec",
        ftsTable: "imsbc_fts",
        topN: 5,
      })
    ).rejects.toThrow("RAG is not enabled");

    expect(_mockSearch).not.toHaveBeenCalled();
  });

  it("TC-VX-GATE-02: KNOWLEDGE_RAG_ENABLED=false → retrieve() throws 'RAG is not enabled', zero Vertex calls", async () => {
    process.env.KNOWLEDGE_RAG_ENABLED = "false";

    await expect(
      retrieve("dangerous goods stowage", {
        vectorTable: "igc_vec",
        ftsTable: "igc_fts",
        topN: 3,
      })
    ).rejects.toThrow("RAG is not enabled");

    expect(_mockSearch).not.toHaveBeenCalled();
  });

  it("TC-VX-GATE-03: KNOWLEDGE_RAG_ENABLED=true → retrieve() proceeds (no gate throw)", async () => {
    process.env.KNOWLEDGE_RAG_ENABLED = "true";
    _mockSearch.mockResolvedValue([]);

    await expect(
      retrieve("test query", {
        vectorTable: "imsbc_vec",
        ftsTable: "imsbc_fts",
        topN: 1,
      })
    ).resolves.toEqual([]);
  });
});

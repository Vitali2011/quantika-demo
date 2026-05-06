/**
 * Tests for embedQuery boundary cases
 *
 * Validates embedQuery behavior with edge-case inputs:
 * - Empty string (TC-NBI-01)
 * - null/undefined (TC-NBI-02)
 * - Long text >2048 chars (TC-NBI-03)
 * - Wrong dimension Float32Array (TC-NBI-04)
 * - NaN values in embedding (TC-NBI-06)
 * - Unicode/multilingual text
 * - Special characters
 * - Deterministic embeddings (repeated queries)
 *
 * Input Contract (covered by tests):
 * - Empty string → valid Float32Array[768]
 * - null/undefined → TypeScript type error (compile-time)
 * - Long text → Vertex AI truncates, returns valid Float32Array[768]
 * - Unicode/Russian → multilingual model accepts, returns valid Float32Array[768]
 * - Special chars → accepted, returns valid Float32Array[768]
 * - Repeated queries → structurally identical Float32Array[768]
 *
 * TDD RED phase: all tests FAIL until implementation exists
 */

// Mock @google-cloud/aiplatform before importing client
let _mockPredict: jest.Mock = jest.fn();

jest.mock("@google-cloud/aiplatform", () => ({
  PredictionServiceClient: class {
    predict(...args: unknown[]) {
      return _mockPredict(...args);
    }
  },
}));

import { embedQuery } from "@/lib/knowledge/embeddings/client";
import { getDb } from "@/lib/db/index";
import { runMigrations } from "@/lib/migrations/runner";
import { allMigrations } from "@/lib/migrations/index";
import Database from "better-sqlite3";
import sqliteVec from "sqlite-vec";

describe("embedQuery boundary cases", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");

    // Load sqlite-vec extension
    sqliteVec.load(db);

    // Run migrations to create vec0 tables (migration 018 from spec-01)
    runMigrations(db, allMigrations);

    // Create vec0 tables manually if migration 018 doesn't exist yet (spec-01 dependency)
    // These CREATE TABLE IF NOT EXISTS statements are idempotent
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS imsbc_vec USING vec0(
        embedding FLOAT[768],
        content TEXT,
        metadata TEXT
      )
    `);

    _mockPredict = jest.fn();
  });

  afterEach(() => {
    db.close();
  });

  describe("Empty query (TC-NBI-01)", () => {
    it("embedQuery(\"\") returns valid Float32Array[768]", async () => {
      const mockEmbedding = new Float32Array(768).fill(0.1);

      _mockPredict.mockResolvedValueOnce([
        {
          predictions: [
            {
              structValue: {
                fields: {
                  embeddings: {
                    structValue: {
                      fields: {
                        values: {
                          listValue: {
                            values: Array.from(mockEmbedding).map((v) => ({ numberValue: v })),
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          ],
        },
      ]);

      const result = await embedQuery("");

      expect(result).toBeInstanceOf(Float32Array);
      expect(result.length).toBe(768);
    });
  });

  describe("null/undefined query (TC-NBI-02)", () => {
    it("embedQuery(null) throws TypeError (TypeScript contract)", async () => {
      // TypeScript will prevent this at compile-time, but test runtime behavior
      // @ts-expect-error Testing invalid input
      await expect(embedQuery(null)).rejects.toThrow();
    });

    it("embedQuery(undefined) throws TypeError (TypeScript contract)", async () => {
      // TypeScript will prevent this at compile-time, but test runtime behavior
      // @ts-expect-error Testing invalid input
      await expect(embedQuery(undefined)).rejects.toThrow();
    });
  });

  describe("Long text >2048 chars (TC-NBI-03)", () => {
    it("embedQuery with 3000-char text returns valid Float32Array[768]", async () => {
      const longText = "A".repeat(3000);
      const mockEmbedding = new Float32Array(768).fill(0.3);

      _mockPredict.mockResolvedValueOnce([
        {
          predictions: [
            {
              structValue: {
                fields: {
                  embeddings: {
                    structValue: {
                      fields: {
                        values: {
                          listValue: {
                            values: Array.from(mockEmbedding).map((v) => ({ numberValue: v })),
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          ],
        },
      ]);

      const result = await embedQuery(longText);

      expect(result).toBeInstanceOf(Float32Array);
      expect(result.length).toBe(768);
    });
  });

  describe("Unicode/multilingual text", () => {
    it("embedQuery with Russian text returns valid Float32Array[768]", async () => {
      const russianText = "Какие правила IMSBC для железной руды?";
      const mockEmbedding = new Float32Array(768).fill(0.4);

      _mockPredict.mockResolvedValueOnce([
        {
          predictions: [
            {
              structValue: {
                fields: {
                  embeddings: {
                    structValue: {
                      fields: {
                        values: {
                          listValue: {
                            values: Array.from(mockEmbedding).map((v) => ({ numberValue: v })),
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          ],
        },
      ]);

      const result = await embedQuery(russianText);

      expect(result).toBeInstanceOf(Float32Array);
      expect(result.length).toBe(768);
    });

    it("embedQuery with Chinese text returns valid Float32Array[768]", async () => {
      const chineseText = "散装货物运输安全规则";
      const mockEmbedding = new Float32Array(768).fill(0.45);

      _mockPredict.mockResolvedValueOnce([
        {
          predictions: [
            {
              structValue: {
                fields: {
                  embeddings: {
                    structValue: {
                      fields: {
                        values: {
                          listValue: {
                            values: Array.from(mockEmbedding).map((v) => ({ numberValue: v })),
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          ],
        },
      ]);

      const result = await embedQuery(chineseText);

      expect(result).toBeInstanceOf(Float32Array);
      expect(result.length).toBe(768);
    });
  });

  describe("Special characters", () => {
    it("embedQuery with special chars returns valid Float32Array[768]", async () => {
      const specialText = "IMO Class 4.2 — self-heating substances (UN 3190)";
      const mockEmbedding = new Float32Array(768).fill(0.5);

      _mockPredict.mockResolvedValueOnce([
        {
          predictions: [
            {
              structValue: {
                fields: {
                  embeddings: {
                    structValue: {
                      fields: {
                        values: {
                          listValue: {
                            values: Array.from(mockEmbedding).map((v) => ({ numberValue: v })),
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          ],
        },
      ]);

      const result = await embedQuery(specialText);

      expect(result).toBeInstanceOf(Float32Array);
      expect(result.length).toBe(768);
    });

    it("embedQuery with emoji returns valid Float32Array[768]", async () => {
      const emojiText = "Cargo safety ⚠️ regulations 🚢";
      const mockEmbedding = new Float32Array(768).fill(0.55);

      _mockPredict.mockResolvedValueOnce([
        {
          predictions: [
            {
              structValue: {
                fields: {
                  embeddings: {
                    structValue: {
                      fields: {
                        values: {
                          listValue: {
                            values: Array.from(mockEmbedding).map((v) => ({ numberValue: v })),
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          ],
        },
      ]);

      const result = await embedQuery(emojiText);

      expect(result).toBeInstanceOf(Float32Array);
      expect(result.length).toBe(768);
    });
  });

  describe("Deterministic embeddings", () => {
    it("two calls with identical text return structurally identical Float32Array[768]", async () => {
      const testText = "What are IMSBC regulations for iron ore cargo?";
      const mockEmbedding = new Float32Array(768).map((_, i) => i / 768);

      // Mock both calls to return the same embedding
      _mockPredict
        .mockResolvedValueOnce([
          {
            predictions: [
              {
                structValue: {
                  fields: {
                    embeddings: {
                      structValue: {
                        fields: {
                          values: {
                            listValue: {
                              values: Array.from(mockEmbedding).map((v) => ({ numberValue: v })),
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            ],
          },
        ])
        .mockResolvedValueOnce([
          {
            predictions: [
              {
                structValue: {
                  fields: {
                    embeddings: {
                      structValue: {
                        fields: {
                          values: {
                            listValue: {
                              values: Array.from(mockEmbedding).map((v) => ({ numberValue: v })),
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            ],
          },
        ]);

      const result1 = await embedQuery(testText);
      const result2 = await embedQuery(testText);

      expect(result1).toBeInstanceOf(Float32Array);
      expect(result2).toBeInstanceOf(Float32Array);
      expect(result1.length).toBe(768);
      expect(result2.length).toBe(768);

      // Verify structural identity (all values match)
      for (let i = 0; i < 768; i++) {
        expect(result1[i]).toBe(result2[i]);
      }
    });
  });

  describe("Wrong dimension (TC-NBI-04)", () => {
    it("Float32Array[384] causes sqlite-vec dimension mismatch error", () => {
      const wrongDimEmbedding = new Float32Array(384).fill(0.5);

      // Seed imsbc_vec with correct 768-dim embedding
      const correctEmbedding = new Float32Array(768).fill(0.3);
      db.prepare(
        `INSERT INTO imsbc_vec (content, metadata, embedding) VALUES (?, ?, ?)`
      ).run(
        "Test document",
        JSON.stringify({ source: "imsbc" }),
        JSON.stringify(Array.from(correctEmbedding))
      );

      // Attempt MATCH with wrong dimension
      expect(() => {
        db.prepare(
          `SELECT rowid, content FROM imsbc_vec WHERE embedding MATCH ? ORDER BY distance LIMIT 1`
        ).all(JSON.stringify(Array.from(wrongDimEmbedding)));
      }).toThrow();
    });
  });

  describe("NaN values in embedding (TC-NBI-06)", () => {
    it("Float32Array[768] with NaN values causes JSON parsing error in sqlite-vec", async () => {
      const nanEmbedding = new Float32Array(768).fill(0.5);
      nanEmbedding[0] = NaN;
      nanEmbedding[100] = NaN;

      // Seed imsbc_vec with valid embedding
      const validEmbedding = new Float32Array(768).fill(0.3);
      db.prepare(
        `INSERT INTO imsbc_vec (content, metadata, embedding) VALUES (?, ?, ?)`
      ).run(
        "Test document",
        JSON.stringify({ source: "imsbc" }),
        JSON.stringify(Array.from(validEmbedding))
      );

      // Execute MATCH with NaN embedding — sqlite-vec rejects NaN during JSON parsing
      // JSON.stringify(NaN) → "null" which causes dimension mismatch or parsing error
      expect(() => {
        db.prepare(
          `SELECT rowid, content, distance FROM imsbc_vec WHERE embedding MATCH ? ORDER BY distance LIMIT 1`
        ).all(JSON.stringify(Array.from(nanEmbedding)));
      }).toThrow();
    });
  });
});

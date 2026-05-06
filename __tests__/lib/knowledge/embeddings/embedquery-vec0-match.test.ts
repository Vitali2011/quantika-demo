/**
 * Tests for embedQuery → vec0 MATCH integration
 *
 * Validates that embedQuery() returns Float32Array[768] compatible with sqlite-vec
 * cosine k-NN search via WHERE embedding MATCH ? syntax.
 *
 * Input Contract (covered by tests):
 * - Valid query text → Float32Array[768] usable as MATCH parameter
 * - Empty vec0 table → MATCH returns 0 rows (no error)
 * - Cosine distance correctness → verify distance within ε ≤ 0.001
 * - Semantic ranking → closest match has lowest distance
 * - All 3 tables → imsbc_vec, igc_vec, jwc_vec
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

describe("embedQuery → vec0 MATCH integration", () => {
  let db: Database.Database;

  beforeEach(() => {
    // In-memory database for tests
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
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS igc_vec USING vec0(
        embedding FLOAT[768],
        content TEXT,
        metadata TEXT
      )
    `);
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS jwc_vec USING vec0(
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

  describe("Float32Array[768] format", () => {
    it("returns Float32Array instance with .length === 768", async () => {
      // Mock embedQuery to return known Float32Array[768]
      const mockEmbedding = new Float32Array(768).map((_, i) => i / 768);

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

      const result = await embedQuery("test query");

      expect(result).toBeInstanceOf(Float32Array);
      expect(result.length).toBe(768);
    });
  });

  describe("vec0 MATCH compatibility", () => {
    it("embedQuery output used as MATCH parameter returns results ordered by distance ascending", async () => {
      // Seed imsbc_vec with 3 document embeddings
      const doc1Embedding = new Float32Array(768).fill(0.1);
      const doc2Embedding = new Float32Array(768).fill(0.5);
      const doc3Embedding = new Float32Array(768).fill(0.9);

      db.prepare(
        `INSERT INTO imsbc_vec (content, metadata, embedding) VALUES (?, ?, ?)`
      ).run(
        "Document 1 about shipping",
        JSON.stringify({ source: "imsbc", section: "1.1" }),
        JSON.stringify(Array.from(doc1Embedding))
      );

      db.prepare(
        `INSERT INTO imsbc_vec (content, metadata, embedding) VALUES (?, ?, ?)`
      ).run(
        "Document 2 about cooking",
        JSON.stringify({ source: "imsbc", section: "2.2" }),
        JSON.stringify(Array.from(doc2Embedding))
      );

      db.prepare(
        `INSERT INTO imsbc_vec (content, metadata, embedding) VALUES (?, ?, ?)`
      ).run(
        "Document 3 about sports",
        JSON.stringify({ source: "imsbc", section: "3.3" }),
        JSON.stringify(Array.from(doc3Embedding))
      );

      // Mock embedQuery to return query embedding similar to doc1
      const queryEmbedding = new Float32Array(768).fill(0.15);

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
                            values: Array.from(queryEmbedding).map((v) => ({ numberValue: v })),
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

      const embedding = await embedQuery("shipping query");

      // Execute vec0 MATCH query
      const results = db
        .prepare(
          `SELECT rowid, content, metadata, distance FROM imsbc_vec WHERE embedding MATCH ? ORDER BY distance LIMIT 3`
        )
        .all(JSON.stringify(Array.from(embedding)));

      // Verify results are ordered by distance ascending
      expect(results.length).toBe(3);
      expect(results[0].distance).toBeLessThan(results[1].distance);
      expect(results[1].distance).toBeLessThan(results[2].distance);
    });
  });

  describe("Cosine similarity correctness", () => {
    it("distance from sqlite-vec matches expected cosine distance within ε ≤ 0.001", async () => {
      // Use simple normalized vectors with known cosine similarity
      // Vector A (doc): [1, 0, 0, ...] (normalized, unit vector along x-axis)
      // Vector B (query): [1, 0, 0, ...] (identical, cosine similarity = 1.0, distance = 0.0)
      const docEmbedding = new Float32Array(768).fill(0);
      docEmbedding[0] = 1.0;

      const queryEmbedding = new Float32Array(768).fill(0);
      queryEmbedding[0] = 1.0; // Identical to doc

      db.prepare(
        `INSERT INTO imsbc_vec (content, metadata, embedding) VALUES (?, ?, ?)`
      ).run(
        "Document with known vector",
        JSON.stringify({ source: "imsbc" }),
        JSON.stringify(Array.from(docEmbedding))
      );

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
                            values: Array.from(queryEmbedding).map((v) => ({ numberValue: v })),
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

      const embedding = await embedQuery("test query");

      const results = db
        .prepare(
          `SELECT rowid, content, metadata, distance FROM imsbc_vec WHERE embedding MATCH ? ORDER BY distance LIMIT 1`
        )
        .all(JSON.stringify(Array.from(embedding)));

      // Expected cosine distance for identical normalized vectors: 1 - 1.0 = 0.0
      // (or very close to 0 due to floating point precision)
      expect(results.length).toBe(1);
      expect(results[0].distance).toBeLessThanOrEqual(0.001); // Distance should be ~0
    });
  });

  describe("Semantic ranking", () => {
    it("shipping-domain query returns shipping document as closest match", async () => {
      // Seed 3 documents with distinct embeddings (simulating domain separation)
      const shippingEmbedding = new Float32Array(768).fill(0);
      shippingEmbedding[0] = 1.0; // Strong signal in dimension 0

      const cookingEmbedding = new Float32Array(768).fill(0);
      cookingEmbedding[100] = 1.0; // Strong signal in dimension 100

      const sportsEmbedding = new Float32Array(768).fill(0);
      sportsEmbedding[200] = 1.0; // Strong signal in dimension 200

      db.prepare(
        `INSERT INTO imsbc_vec (content, metadata, embedding) VALUES (?, ?, ?)`
      ).run(
        "IMSBC regulations for iron ore cargo",
        JSON.stringify({ source: "imsbc", section: "4.1" }),
        JSON.stringify(Array.from(shippingEmbedding))
      );

      db.prepare(
        `INSERT INTO imsbc_vec (content, metadata, embedding) VALUES (?, ?, ?)`
      ).run(
        "Recipe for chocolate cake",
        JSON.stringify({ source: "imsbc", section: "99.1" }),
        JSON.stringify(Array.from(cookingEmbedding))
      );

      db.prepare(
        `INSERT INTO imsbc_vec (content, metadata, embedding) VALUES (?, ?, ?)`
      ).run(
        "Football match results",
        JSON.stringify({ source: "imsbc", section: "99.2" }),
        JSON.stringify(Array.from(sportsEmbedding))
      );

      // Mock embedQuery to return shipping-domain embedding
      const shippingQueryEmbedding = new Float32Array(768).fill(0);
      shippingQueryEmbedding[0] = 0.95; // Similar to shipping doc

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
                            values: Array.from(shippingQueryEmbedding).map((v) => ({
                              numberValue: v,
                            })),
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

      const embedding = await embedQuery("What are IMSBC requirements for bulk cargo?");

      const results = db
        .prepare(
          `SELECT rowid, content, metadata, distance FROM imsbc_vec WHERE embedding MATCH ? ORDER BY distance LIMIT 3`
        )
        .all(JSON.stringify(Array.from(embedding)));

      // Verify shipping document is the closest match (lowest distance)
      expect(results.length).toBe(3);
      expect(results[0].content).toContain("IMSBC regulations for iron ore cargo");
      expect(results[0].distance).toBeLessThan(results[1].distance);
      expect(results[0].distance).toBeLessThan(results[2].distance);
    });
  });

  describe("All 3 vec0 tables", () => {
    it("query path works for imsbc_vec", async () => {
      const mockEmbedding = new Float32Array(768).fill(0.5);

      db.prepare(
        `INSERT INTO imsbc_vec (content, metadata, embedding) VALUES (?, ?, ?)`
      ).run(
        "IMSBC test content",
        JSON.stringify({ source: "imsbc" }),
        JSON.stringify(Array.from(mockEmbedding))
      );

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

      const embedding = await embedQuery("test");

      const results = db
        .prepare(
          `SELECT rowid, content FROM imsbc_vec WHERE embedding MATCH ? ORDER BY distance LIMIT 1`
        )
        .all(JSON.stringify(Array.from(embedding)));

      expect(results.length).toBe(1);
      expect(results[0].content).toBe("IMSBC test content");
    });

    it("query path works for igc_vec", async () => {
      const mockEmbedding = new Float32Array(768).fill(0.5);

      db.prepare(
        `INSERT INTO igc_vec (content, metadata, embedding) VALUES (?, ?, ?)`
      ).run(
        "IGC test content",
        JSON.stringify({ source: "igc" }),
        JSON.stringify(Array.from(mockEmbedding))
      );

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

      const embedding = await embedQuery("test");

      const results = db
        .prepare(
          `SELECT rowid, content FROM igc_vec WHERE embedding MATCH ? ORDER BY distance LIMIT 1`
        )
        .all(JSON.stringify(Array.from(embedding)));

      expect(results.length).toBe(1);
      expect(results[0].content).toBe("IGC test content");
    });

    it("query path works for jwc_vec", async () => {
      const mockEmbedding = new Float32Array(768).fill(0.5);

      db.prepare(
        `INSERT INTO jwc_vec (content, metadata, embedding) VALUES (?, ?, ?)`
      ).run(
        "JWC test content",
        JSON.stringify({ source: "jwc" }),
        JSON.stringify(Array.from(mockEmbedding))
      );

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

      const embedding = await embedQuery("test");

      const results = db
        .prepare(
          `SELECT rowid, content FROM jwc_vec WHERE embedding MATCH ? ORDER BY distance LIMIT 1`
        )
        .all(JSON.stringify(Array.from(embedding)));

      expect(results.length).toBe(1);
      expect(results[0].content).toBe("JWC test content");
    });
  });

  describe("Empty table", () => {
    it("WHERE embedding MATCH ? on empty vec0 table returns 0 rows without error", async () => {
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

      const embedding = await embedQuery("test");

      // Query empty imsbc_vec table
      const results = db
        .prepare(
          `SELECT rowid, content FROM imsbc_vec WHERE embedding MATCH ? ORDER BY distance LIMIT 5`
        )
        .all(JSON.stringify(Array.from(embedding)));

      expect(results.length).toBe(0);
    });
  });
});

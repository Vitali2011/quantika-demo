/**
 * Tests for Vertex AI embedding client
 *
 * TDD RED phase: all tests should FAIL before implementation
 */

// Mock @google-cloud/aiplatform before importing client
// jest.mock is hoisted, so use module-level variable accessed via delegate
let _mockPredict: jest.Mock = jest.fn();

jest.mock("@google-cloud/aiplatform", () => ({
  PredictionServiceClient: class {
    predict(...args: unknown[]) {
      return _mockPredict(...args);
    }
  },
}));

import { embed, embedDocuments, embedQuery } from "@/lib/knowledge/embeddings/client";

describe("Vertex AI embedding client", () => {
  beforeEach(() => {
    _mockPredict = jest.fn();
  });

  describe("embedDocuments", () => {
    it("returns Float32Array[2] with length 768 for 2 texts", async () => {
      // Mock GCP response with 2 embeddings
      const mockEmbedding1 = Array(768).fill(0).map((_, i) => i / 768);
      const mockEmbedding2 = Array(768).fill(0).map((_, i) => (i + 1) / 768);

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
                            values: mockEmbedding1.map((v) => ({ numberValue: v })),
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            {
              structValue: {
                fields: {
                  embeddings: {
                    structValue: {
                      fields: {
                        values: {
                          listValue: {
                            values: mockEmbedding2.map((v) => ({ numberValue: v })),
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

      const result = await embedDocuments(["text1", "text2"]);

      expect(result).toHaveLength(2);
      expect(result[0]).toBeInstanceOf(Float32Array);
      expect(result[0]).toHaveLength(768);
      expect(result[1]).toBeInstanceOf(Float32Array);
      expect(result[1]).toHaveLength(768);
      expect(_mockPredict).toHaveBeenCalledTimes(1);
    });

    it("returns empty array for empty texts array (no API call)", async () => {
      const result = await embedDocuments([]);

      expect(result).toEqual([]);
      expect(_mockPredict).not.toHaveBeenCalled();
    });

    it("splits batches > 250 into multiple API calls", async () => {
      // Create 260 texts (should trigger 2 batches: 250 + 10)
      const texts = Array(260).fill("test text");
      const mockEmbedding = Array(768).fill(0).map((_, i) => i / 768);

      // Mock first batch (250 items)
      _mockPredict.mockResolvedValueOnce([
        {
          predictions: Array(250).fill({
            structValue: {
              fields: {
                embeddings: {
                  structValue: {
                    fields: {
                      values: {
                        listValue: {
                          values: mockEmbedding.map((v) => ({ numberValue: v })),
                        },
                      },
                    },
                  },
                },
              },
            },
          }),
        },
      ]);

      // Mock second batch (10 items)
      _mockPredict.mockResolvedValueOnce([
        {
          predictions: Array(10).fill({
            structValue: {
              fields: {
                embeddings: {
                  structValue: {
                    fields: {
                      values: {
                        listValue: {
                          values: mockEmbedding.map((v) => ({ numberValue: v })),
                        },
                      },
                    },
                  },
                },
              },
            },
          }),
        },
      ]);

      const result = await embedDocuments(texts);

      expect(result).toHaveLength(260);
      expect(_mockPredict).toHaveBeenCalledTimes(2);

      // Verify first call had 250 instances
      const firstCallInstances = _mockPredict.mock.calls[0][0].instances;
      expect(firstCallInstances).toHaveLength(250);

      // Verify second call had 10 instances
      const secondCallInstances = _mockPredict.mock.calls[1][0].instances;
      expect(secondCallInstances).toHaveLength(10);
    });

    it("splits batches exceeding MAX_CHARS_PER_BATCH (76000 chars) into multiple calls", async () => {
      // 50 texts × 2000 chars each = 100,000 chars total > 76,000 limit
      // Expected: 2 batches (38 × 2000 = 76,000 chars, 12 × 2000 = 24,000 chars)
      const texts = Array(50).fill("x".repeat(2000));
      const mockEmbedding = Array(768).fill(0.5);

      const makeResponse = (count: number) => [{
        predictions: Array(count).fill({
          structValue: { fields: { embeddings: { structValue: { fields: { values: {
            listValue: { values: mockEmbedding.map(v => ({ numberValue: v })) },
          }}}}}}
        })
      }];

      _mockPredict.mockResolvedValueOnce(makeResponse(38));
      _mockPredict.mockResolvedValueOnce(makeResponse(12));

      const result = await embedDocuments(texts);

      expect(result).toHaveLength(50);
      expect(_mockPredict).toHaveBeenCalledTimes(2);
      expect(_mockPredict.mock.calls[0][0].instances).toHaveLength(38);
      expect(_mockPredict.mock.calls[1][0].instances).toHaveLength(12);
    });

    it("handles 501 texts with 3 batches (250+250+1)", async () => {
      const texts = Array(501).fill("test");
      const mockEmbedding = Array(768).fill(0.5);

      // Mock 3 batches
      for (let i = 0; i < 3; i++) {
        const batchSize = i === 2 ? 1 : 250;
        _mockPredict.mockResolvedValueOnce([
          {
            predictions: Array(batchSize).fill({
              structValue: {
                fields: {
                  embeddings: {
                    structValue: {
                      fields: {
                        values: {
                          listValue: {
                            values: mockEmbedding.map((v) => ({ numberValue: v })),
                          },
                        },
                      },
                    },
                  },
                },
              },
            }),
          },
        ]);
      }

      const result = await embedDocuments(texts);

      expect(result).toHaveLength(501);
      expect(_mockPredict).toHaveBeenCalledTimes(3);

      // Verify batch sizes
      expect(_mockPredict.mock.calls[0][0].instances).toHaveLength(250);
      expect(_mockPredict.mock.calls[1][0].instances).toHaveLength(250);
      expect(_mockPredict.mock.calls[2][0].instances).toHaveLength(1);
    });
  });

  describe("embedQuery", () => {
    it("returns single Float32Array for single text", async () => {
      const mockEmbedding = Array(768).fill(0).map((_, i) => i / 768);

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
                            values: mockEmbedding.map((v) => ({ numberValue: v })),
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

      const result = await embedQuery("single query");

      expect(result).toBeInstanceOf(Float32Array);
      expect(result).toHaveLength(768);
      expect(_mockPredict).toHaveBeenCalledTimes(1);

      // Verify it uses RETRIEVAL_QUERY task type
      const callArgs = _mockPredict.mock.calls[0][0];
      expect(callArgs.instances[0].structValue.fields.task_type.stringValue).toBe("RETRIEVAL_QUERY");
    });
  });

  describe("embed (generic)", () => {
    it("uses correct task_type parameter", async () => {
      const mockEmbedding = Array(768).fill(0.5);

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
                            values: mockEmbedding.map((v) => ({ numberValue: v })),
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

      await embed(["test"], "SEMANTIC_SIMILARITY");

      const callArgs = _mockPredict.mock.calls[0][0];
      expect(callArgs.instances[0].structValue.fields.task_type.stringValue).toBe("SEMANTIC_SIMILARITY");
    });

    it("uses correct endpoint path with project and model", async () => {
      const mockEmbedding = Array(768).fill(0.5);

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
                            values: mockEmbedding.map((v) => ({ numberValue: v })),
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

      await embed(["test"], "RETRIEVAL_DOCUMENT");

      const callArgs = _mockPredict.mock.calls[0][0];
      expect(callArgs.endpoint).toMatch(/^projects\/.*\/locations\/us-central1\/publishers\/google\/models\/text-multilingual-embedding-002$/);
    });

    it("sets autoTruncate to false in parameters", async () => {
      const mockEmbedding = Array(768).fill(0.5);

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
                            values: mockEmbedding.map((v) => ({ numberValue: v })),
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

      await embed(["test"], "RETRIEVAL_DOCUMENT");

      const callArgs = _mockPredict.mock.calls[0][0];
      expect(callArgs.parameters.structValue.fields.autoTruncate.boolValue).toBe(false);
    });
  });

  describe("Error handling", () => {
    it("bubbles GCP API errors (e.g., 429) to caller", async () => {
      const apiError = new Error("429 Resource exhausted");
      _mockPredict.mockRejectedValueOnce(apiError);

      await expect(embedDocuments(["test"])).rejects.toThrow("429 Resource exhausted");
    });
  });
});

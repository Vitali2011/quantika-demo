import Database from "better-sqlite3";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import migration013 from "@/lib/migrations/013-knowledge-sources";
import migration014 from "@/lib/migrations/014-sanctions-entities";
import {
  refreshEu,
  withRetry,
  HttpFetchError,
  getCachePath,
  saveCacheXml,
  loadCacheXml,
} from "@/lib/knowledge/sanctions/eu-adapter";
import type { Fetcher } from "@/lib/knowledge/sanctions/eu-adapter";
import { registerSource } from "@/lib/knowledge/governance";

/** Returns a unique temp path that does NOT exist (for cache isolation per test). */
function tmpCachePath(): string {
  return join(tmpdir(), `eu-sanctions-test-${Date.now()}-${Math.random().toString(36).slice(2)}.xml`);
}

describe("eu-adapter", () => {
  let db: Database.Database;
  let testCachePath: string;

  beforeEach(() => {
    // Isolate each test from the real on-disk cache
    testCachePath = tmpCachePath();
    process.env.EU_SANCTIONS_CACHE_PATH = testCachePath;

    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    migration013.up(db);
    migration014.up(db);

    // Register EU sanctions source for governance tracking
    registerSource(db, {
      slug: "eu-sanctions",
      name: "EU Consolidated Sanctions",
      kind: "structured_rows",
      category: "sanctions",
      source_url:
        "https://webgate.ec.europa.eu/europeaid/fsd/fsf/public/files/xmlFullSanctionsList_1_1/content?token=",
      license: "EU Public",
      refresh_command: "npm run knowledge:refresh:eu-sanctions",
      refresh_mode: "auto-daily",
      stale_threshold_days: 1,
      primary_table: "eu_sanctions_entities",
    });
  });

  afterEach(() => {
    db.close();
    delete process.env.EU_SANCTIONS_CACHE_PATH;
    try { unlinkSync(testCachePath); } catch { /* already gone */ }
  });

  describe("refreshEu", () => {
    it("calls reportSyncStarted then reportSyncSuccess with rowsChanged", async () => {
      const mockXml = `<?xml version="1.0" encoding="UTF-8"?>
<export>
  <sanctionEntity logicalId="12345">
    <subjectType code="person"/>
    <nameAlias>
      <wholeName>John Doe</wholeName>
    </nameAlias>
    <regulation>
      <programme>CFSP</programme>
      <publicationDate>2025-01-15</publicationDate>
    </regulation>
    <citizenship countryIso2="RU"/>
  </sanctionEntity>
</export>`;

      const mockFetcher: Fetcher = async () => mockXml;

      const result = await refreshEu(db, mockFetcher);

      expect(result.rowsChanged).toBe(1);
      expect(result.upstreamVersion).toMatch(/^sha256:[a-f0-9]{16}$/);

      // Verify sync log
      const syncLog = db
        .prepare(
          "SELECT * FROM knowledge_sync_log WHERE source_slug = 'eu-sanctions' ORDER BY id DESC LIMIT 1"
        )
        .get() as any;
      expect(syncLog.status).toBe("success");
      expect(syncLog.rows_changed).toBe(1);

      // Verify source status updated
      const source = db
        .prepare("SELECT * FROM knowledge_sources WHERE slug = 'eu-sanctions'")
        .get() as any;
      expect(source.status).toBe("fresh");
      expect(source.consecutive_failures).toBe(0);
    });

    it("on HTTP error calls reportSyncFailure and rethrows", async () => {
      const mockFetcher: Fetcher = async () => {
        throw new Error("ECONNREFUSED");
      };

      await expect(refreshEu(db, mockFetcher)).rejects.toThrow("ECONNREFUSED");

      // Verify sync log
      const syncLog = db
        .prepare(
          "SELECT * FROM knowledge_sync_log WHERE source_slug = 'eu-sanctions' ORDER BY id DESC LIMIT 1"
        )
        .get() as any;
      expect(syncLog.status).toBe("failure");
      expect(syncLog.error_message).toContain("ECONNREFUSED");

      // Verify source status updated
      const source = db
        .prepare("SELECT * FROM knowledge_sources WHERE slug = 'eu-sanctions'")
        .get() as any;
      expect(source.status).toBe("failed");
      expect(source.consecutive_failures).toBe(1);
    });

    it("on parser error calls reportSyncFailure with parse error", async () => {
      const mockFetcher: Fetcher = async () => "not valid xml <>";

      await expect(refreshEu(db, mockFetcher)).rejects.toThrow();

      const syncLog = db
        .prepare(
          "SELECT * FROM knowledge_sync_log WHERE source_slug = 'eu-sanctions' ORDER BY id DESC LIMIT 1"
        )
        .get() as any;
      expect(syncLog.status).toBe("failure");
      expect(syncLog.error_message).toContain("parse");
    });

    it("when entity removed from upstream, deleted from eu_sanctions_entities", async () => {
      // First insert an entity
      const xmlWithEntity = `<?xml version="1.0"?>
<export>
  <sanctionEntity logicalId="12345">
    <subjectType code="person"/>
    <nameAlias><wholeName>John Doe</wholeName></nameAlias>
    <regulation><programme>CFSP</programme></regulation>
  </sanctionEntity>
</export>`;

      const mockFetcher1: Fetcher = async () => xmlWithEntity;
      await refreshEu(db, mockFetcher1);

      const countBefore = (
        db.prepare("SELECT COUNT(*) as count FROM eu_sanctions_entities").get() as any
      ).count;
      expect(countBefore).toBe(1);

      // Now refresh with empty list
      const emptyXml = `<?xml version="1.0"?><export></export>`;

      const mockFetcher2: Fetcher = async () => emptyXml;
      const result = await refreshEu(db, mockFetcher2);

      expect(result.rowsChanged).toBe(1); // 1 removed

      const countAfter = (
        db.prepare("SELECT COUNT(*) as count FROM eu_sanctions_entities").get() as any
      ).count;
      expect(countAfter).toBe(0);
    });

    it("running twice with same XML results in 0 rowsChanged on second run", async () => {
      const mockXml = `<?xml version="1.0"?>
<export>
  <sanctionEntity logicalId="12345">
    <subjectType code="person"/>
    <nameAlias><wholeName>John Doe</wholeName></nameAlias>
    <regulation><programme>CFSP</programme></regulation>
  </sanctionEntity>
</export>`;

      const mockFetcher: Fetcher = async () => mockXml;

      const result1 = await refreshEu(db, mockFetcher);
      expect(result1.rowsChanged).toBe(1);

      const result2 = await refreshEu(db, mockFetcher);
      expect(result2.rowsChanged).toBe(0); // Idempotent
      expect(result2.upstreamVersion).toBe(result1.upstreamVersion);
    });

    it("throws error when fetcher returns 200 with empty body", async () => {
      const mockFetcher: Fetcher = async () => "";

      await expect(refreshEu(db, mockFetcher)).rejects.toThrow();

      const syncLog = db
        .prepare(
          "SELECT * FROM knowledge_sync_log WHERE source_slug = 'eu-sanctions' ORDER BY id DESC LIMIT 1"
        )
        .get() as any;
      expect(syncLog.status).toBe("failure");
    });

    it("handles all entities removed (empty sanctionEntity list)", async () => {
      // First add entities
      const xmlWithEntities = `<?xml version="1.0"?>
<export>
  <sanctionEntity logicalId="111">
    <subjectType code="person"/>
    <nameAlias><wholeName>Person1</wholeName></nameAlias>
    <regulation><programme>CFSP</programme></regulation>
  </sanctionEntity>
  <sanctionEntity logicalId="222">
    <subjectType code="person"/>
    <nameAlias><wholeName>Person2</wholeName></nameAlias>
    <regulation><programme>CFSP</programme></regulation>
  </sanctionEntity>
</export>`;

      await refreshEu(db, async () => xmlWithEntities);

      const countBefore = (
        db.prepare("SELECT COUNT(*) as count FROM eu_sanctions_entities").get() as any
      ).count;
      expect(countBefore).toBe(2);

      // Now empty list
      const emptyXml = `<?xml version="1.0"?><export></export>`;
      const result = await refreshEu(db, async () => emptyXml);

      expect(result.rowsChanged).toBe(2); // All removed
      expect(result.upstreamVersion).toMatch(/^sha256:/);

      const countAfter = (
        db.prepare("SELECT COUNT(*) as count FROM eu_sanctions_entities").get() as any
      ).count;
      expect(countAfter).toBe(0);
    });

    it("properly normalizes names and stores aliases as JSON", async () => {
      const mockXml = `<?xml version="1.0"?>
<export>
  <sanctionEntity logicalId="999">
    <subjectType code="person"/>
    <nameAlias><wholeName>José García</wholeName></nameAlias>
    <nameAlias><wholeName>Joe Garcia</wholeName></nameAlias>
    <regulation><programme>CFSP</programme></regulation>
  </sanctionEntity>
</export>`;

      await refreshEu(db, async () => mockXml);

      const entity = db
        .prepare("SELECT * FROM eu_sanctions_entities WHERE uid = '999'")
        .get() as any;

      expect(entity.name).toBe("José García");
      expect(entity.name_normalized).toBe("jose garcia");
      expect(JSON.parse(entity.aliases)).toEqual(["Joe Garcia"]);
      expect(JSON.parse(entity.programs)).toEqual(["CFSP"]);
    });

    it("handles updates to existing entities", async () => {
      const xml1 = `<?xml version="1.0"?>
<export>
  <sanctionEntity logicalId="777">
    <subjectType code="person"/>
    <nameAlias><wholeName>Smith</wholeName></nameAlias>
    <regulation><programme>CFSP</programme></regulation>
  </sanctionEntity>
</export>`;

      await refreshEu(db, async () => xml1);

      // Update with different data
      const xml2 = `<?xml version="1.0"?>
<export>
  <sanctionEntity logicalId="777">
    <subjectType code="enterprise"/>
    <nameAlias><wholeName>Smith Corp</wholeName></nameAlias>
    <regulation><programme>EU-RUSSIA</programme></regulation>
  </sanctionEntity>
</export>`;

      const result = await refreshEu(db, async () => xml2);

      expect(result.rowsChanged).toBe(1); // 1 updated

      const entity = db
        .prepare("SELECT * FROM eu_sanctions_entities WHERE uid = '777'")
        .get() as any;
      expect(entity.type).toBe("enterprise");
      expect(entity.name).toBe("Smith Corp");
      expect(JSON.parse(entity.programs)).toEqual(["EU-RUSSIA"]);
    });

    it("stores country and address from citizenship and address nodes", async () => {
      const mockXml = `<?xml version="1.0"?>
<export>
  <sanctionEntity logicalId="555">
    <subjectType code="person"/>
    <nameAlias><wholeName>TestPerson</wholeName></nameAlias>
    <citizenship countryIso2="RU"/>
    <address>
      <city>Moscow</city>
      <street>Red Square 1</street>
    </address>
    <regulation><programme>EU-UKRAINE</programme></regulation>
  </sanctionEntity>
</export>`;

      await refreshEu(db, async () => mockXml);

      const entity = db
        .prepare("SELECT * FROM eu_sanctions_entities WHERE uid = '555'")
        .get() as any;
      expect(entity.country).toBe("RU");
      expect(JSON.parse(entity.address)).toMatchObject({
        city: "Moscow",
        street: "Red Square 1",
      });
    });

    it("handles EU URL token expired (401) with helpful error message", async () => {
      const mockFetcher: Fetcher = async () => {
        const error = new Error("EU fetch failed: 401");
        throw error;
      };

      await expect(refreshEu(db, mockFetcher)).rejects.toThrow("EU fetch failed: 401");

      const syncLog = db
        .prepare(
          "SELECT * FROM knowledge_sync_log WHERE source_slug = 'eu-sanctions' ORDER BY id DESC LIMIT 1"
        )
        .get() as any;
      expect(syncLog.status).toBe("failure");
      expect(syncLog.error_message).toContain("401");
    });

    it("handles 0 rows in EU response (regulatory pause)", async () => {
      const emptyXml = `<?xml version="1.0"?><export></export>`;
      const mockFetcher: Fetcher = async () => emptyXml;

      const result = await refreshEu(db, mockFetcher);

      expect(result.rowsChanged).toBe(0);
      expect(result.upstreamVersion).toMatch(/^sha256:/);

      // Should still mark as fresh
      const source = db
        .prepare("SELECT * FROM knowledge_sources WHERE slug = 'eu-sanctions'")
        .get() as any;
      expect(source.status).toBe("fresh");
    });

    it("saves last-known-good cache after successful live fetch", async () => {
      const mockXml = `<?xml version="1.0"?>
<export>
  <sanctionEntity logicalId="12345">
    <subjectType code="person"/>
    <nameAlias><wholeName>Test Person</wholeName></nameAlias>
    <regulation><programme>CFSP</programme></regulation>
  </sanctionEntity>
</export>`;

      await refreshEu(db, async () => mockXml);

      expect(existsSync(testCachePath)).toBe(true);
      expect(readFileSync(testCachePath, "utf-8")).toBe(mockXml);
    });

    it("falls back to last-known-good cache when fetch fails", async () => {
      const cachedXml = `<?xml version="1.0"?>
<export>
  <sanctionEntity logicalId="99999">
    <subjectType code="person"/>
    <nameAlias><wholeName>Cached Person</wholeName></nameAlias>
    <regulation><programme>CFSP</programme></regulation>
  </sanctionEntity>
</export>`;
      writeFileSync(testCachePath, cachedXml, "utf-8");

      const failingFetcher: Fetcher = async () => {
        throw new HttpFetchError(500, "EU fetch failed: 500");
      };

      const result = await refreshEu(db, failingFetcher);

      // Successfully served from cache
      expect(result.rowsChanged).toBe(1);
      expect(result.upstreamVersion).toMatch(/^cache:/);

      const source = db
        .prepare("SELECT * FROM knowledge_sources WHERE slug = 'eu-sanctions'")
        .get() as any;
      expect(source.status).toBe("fresh");
      expect(source.upstream_version).toMatch(/^cache:/);

      const entity = db
        .prepare("SELECT * FROM eu_sanctions_entities WHERE uid = '99999'")
        .get() as any;
      expect(entity.name).toBe("Cached Person");
    });

    it("throws when fetch fails and no cache is available", async () => {
      // testCachePath does not exist (never written)
      const failingFetcher: Fetcher = async () => {
        throw new HttpFetchError(500, "EU fetch failed: 500");
      };

      await expect(refreshEu(db, failingFetcher)).rejects.toThrow("EU fetch failed: 500");

      const syncLog = db
        .prepare(
          "SELECT * FROM knowledge_sync_log WHERE source_slug = 'eu-sanctions' ORDER BY id DESC LIMIT 1"
        )
        .get() as any;
      expect(syncLog.status).toBe("failure");
    });

    it("does not overwrite cache when serving from cache (stale cache preserved)", async () => {
      const cachedXml = `<?xml version="1.0"?>
<export>
  <sanctionEntity logicalId="77777">
    <subjectType code="enterprise"/>
    <nameAlias><wholeName>Cached Corp</wholeName></nameAlias>
    <regulation><programme>EU-RUSSIA</programme></regulation>
  </sanctionEntity>
</export>`;
      writeFileSync(testCachePath, cachedXml, "utf-8");

      const failingFetcher: Fetcher = async () => {
        throw new Error("ECONNREFUSED");
      };

      await refreshEu(db, failingFetcher);

      // Cache must not have been modified
      expect(readFileSync(testCachePath, "utf-8")).toBe(cachedXml);
    });

    // FINDING-01 regression: cache fallback must not silence monitoring
    it("FINDING-01: cache fallback increments consecutive_failures (does not reset to 0)", async () => {
      const cachedXml = `<?xml version="1.0"?>
<export>
  <sanctionEntity logicalId="55555">
    <subjectType code="person"/>
    <nameAlias><wholeName>Cache Fallback Person</wholeName></nameAlias>
    <regulation><programme>CFSP</programme></regulation>
  </sanctionEntity>
</export>`;
      writeFileSync(testCachePath, cachedXml, "utf-8");

      await refreshEu(db, async () => { throw new HttpFetchError(403, "token rejected"); });

      const source = db
        .prepare("SELECT consecutive_failures FROM knowledge_sources WHERE slug = 'eu-sanctions'")
        .get() as any;
      expect(source.consecutive_failures).toBeGreaterThan(0);
    });

    it("FINDING-01: consecutive_failures accumulates across repeated cache fallbacks (alert threshold reachable)", async () => {
      const cachedXml = `<?xml version="1.0"?>
<export>
  <sanctionEntity logicalId="44444">
    <subjectType code="person"/>
    <nameAlias><wholeName>Cache Person</wholeName></nameAlias>
    <regulation><programme>CFSP</programme></regulation>
  </sanctionEntity>
</export>`;
      writeFileSync(testCachePath, cachedXml, "utf-8");

      const failingFetcher: Fetcher = async () => { throw new HttpFetchError(403, "token rejected"); };
      await refreshEu(db, failingFetcher);
      await refreshEu(db, failingFetcher);

      const source = db
        .prepare("SELECT consecutive_failures FROM knowledge_sources WHERE slug = 'eu-sanctions'")
        .get() as any;
      expect(source.consecutive_failures).toBeGreaterThanOrEqual(2);
    });

    it("FINDING-01: live fetch success resets consecutive_failures to 0 after cache fallbacks", async () => {
      const cachedXml = `<?xml version="1.0"?>
<export>
  <sanctionEntity logicalId="33333">
    <subjectType code="person"/>
    <nameAlias><wholeName>Cache Person</wholeName></nameAlias>
    <regulation><programme>CFSP</programme></regulation>
  </sanctionEntity>
</export>`;
      writeFileSync(testCachePath, cachedXml, "utf-8");

      await refreshEu(db, async () => { throw new HttpFetchError(403, "token rejected"); });

      const liveXml = `<?xml version="1.0"?>
<export>
  <sanctionEntity logicalId="33334">
    <subjectType code="person"/>
    <nameAlias><wholeName>Live Person</wholeName></nameAlias>
    <regulation><programme>CFSP</programme></regulation>
  </sanctionEntity>
</export>`;
      await refreshEu(db, async () => liveXml);

      const source = db
        .prepare("SELECT consecutive_failures FROM knowledge_sources WHERE slug = 'eu-sanctions'")
        .get() as any;
      expect(source.consecutive_failures).toBe(0);
    });

    it("403 auth error with cache falls back to cache (covers auth-failure degradation path)", async () => {
      const cachedXml = `<?xml version="1.0"?>
<export>
  <sanctionEntity logicalId="66666">
    <subjectType code="person"/>
    <nameAlias><wholeName>Auth Error Person</wholeName></nameAlias>
    <regulation><programme>CFSP</programme></regulation>
  </sanctionEntity>
</export>`;
      writeFileSync(testCachePath, cachedXml, "utf-8");

      const result = await refreshEu(db, async () => {
        throw new HttpFetchError(403, "EU fetch failed: 403 (token rejected)");
      });

      expect(result.upstreamVersion).toMatch(/^cache:/);
      const entity = db
        .prepare("SELECT name FROM eu_sanctions_entities WHERE uid = '66666'")
        .get() as any;
      expect(entity?.name).toBe("Auth Error Person");
    });
  });

  describe("cache helpers", () => {
    it("getCachePath returns EU_SANCTIONS_CACHE_PATH env var when set", () => {
      expect(getCachePath()).toBe(testCachePath);
    });

    it("saveCacheXml writes file and loadCacheXml reads it back", () => {
      const xml = "<export><test/></export>";
      saveCacheXml(xml);
      expect(loadCacheXml()).toBe(xml);
    });

    it("loadCacheXml returns null when cache file does not exist", () => {
      expect(loadCacheXml()).toBeNull();
    });

    it("saveCacheXml creates parent directory if it does not exist", () => {
      const deepPath = join(tmpdir(), `eu-test-${Date.now()}`, "sub", "eu.xml");
      process.env.EU_SANCTIONS_CACHE_PATH = deepPath;
      saveCacheXml("<export/>");
      expect(existsSync(deepPath)).toBe(true);
      // cleanup
      unlinkSync(deepPath);
      process.env.EU_SANCTIONS_CACHE_PATH = testCachePath;
    });

    // FINDING-02 regression: atomic write leaves no .tmp artifact
    it("FINDING-02: saveCacheXml leaves no .tmp artifact after successful write (atomic write regression)", () => {
      const xml = "<export><entity id='1'/></export>";
      saveCacheXml(xml);
      expect(existsSync(testCachePath + ".tmp")).toBe(false);
      expect(readFileSync(testCachePath, "utf-8")).toBe(xml);
    });
  });

  describe("withRetry", () => {
    const noSleep = async () => {};

    it("returns value on first attempt when fn succeeds", async () => {
      let calls = 0;
      const result = await withRetry(async () => {
        calls++;
        return "ok";
      }, { sleep: noSleep });
      expect(result).toBe("ok");
      expect(calls).toBe(1);
    });

    it("retries on HTTP 500 and succeeds on 2nd attempt", async () => {
      let calls = 0;
      const result = await withRetry(async () => {
        calls++;
        if (calls === 1) throw new HttpFetchError(500, "upstream");
        return "ok";
      }, { sleep: noSleep });
      expect(result).toBe("ok");
      expect(calls).toBe(2);
    });

    it("retries on HTTP 429 (rate limit)", async () => {
      let calls = 0;
      const result = await withRetry(async () => {
        calls++;
        if (calls < 3) throw new HttpFetchError(429, "rate limited");
        return "ok";
      }, { sleep: noSleep });
      expect(result).toBe("ok");
      expect(calls).toBe(3);
    });

    it("retries on network error (no status)", async () => {
      let calls = 0;
      const result = await withRetry(async () => {
        calls++;
        if (calls === 1) throw new Error("ECONNRESET");
        return "ok";
      }, { sleep: noSleep });
      expect(result).toBe("ok");
      expect(calls).toBe(2);
    });

    it("does NOT retry on HTTP 401 (auth)", async () => {
      let calls = 0;
      await expect(
        withRetry(async () => {
          calls++;
          throw new HttpFetchError(401, "unauthorized");
        }, { sleep: noSleep })
      ).rejects.toThrow("unauthorized");
      expect(calls).toBe(1);
    });

    it("does NOT retry on HTTP 403 (forbidden — token issue)", async () => {
      let calls = 0;
      await expect(
        withRetry(async () => {
          calls++;
          throw new HttpFetchError(403, "forbidden");
        }, { sleep: noSleep })
      ).rejects.toThrow("forbidden");
      expect(calls).toBe(1);
    });

    it("does NOT retry on HTTP 404 (client error)", async () => {
      let calls = 0;
      await expect(
        withRetry(async () => {
          calls++;
          throw new HttpFetchError(404, "not found");
        }, { sleep: noSleep })
      ).rejects.toThrow("not found");
      expect(calls).toBe(1);
    });

    it("gives up after maxAttempts and throws last error", async () => {
      let calls = 0;
      await expect(
        withRetry(async () => {
          calls++;
          throw new HttpFetchError(503, `attempt ${calls}`);
        }, { sleep: noSleep, maxAttempts: 3 })
      ).rejects.toThrow("attempt 3");
      expect(calls).toBe(3);
    });

    it("uses exponential backoff between attempts", async () => {
      const delays: number[] = [];
      let calls = 0;
      await withRetry(async () => {
        calls++;
        if (calls < 3) throw new HttpFetchError(500, "x");
        return "ok";
      }, {
        sleep: async (ms) => { delays.push(ms); },
        baseDelayMs: 100,
        maxAttempts: 3,
      });
      expect(delays).toEqual([100, 200]);
    });

    it("invokes onRetry callback for each retry", async () => {
      const events: Array<{ attempt: number; status?: number }> = [];
      let calls = 0;
      await withRetry(async () => {
        calls++;
        if (calls < 3) throw new HttpFetchError(500, "boom");
        return "ok";
      }, {
        sleep: noSleep,
        onRetry: (attempt, err) => {
          events.push({
            attempt,
            status: err instanceof HttpFetchError ? err.status : undefined,
          });
        },
      });
      expect(events).toEqual([
        { attempt: 1, status: 500 },
        { attempt: 2, status: 500 },
      ]);
    });
  });
});

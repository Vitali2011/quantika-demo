import Database from "better-sqlite3";
import migration013 from "@/lib/migrations/013-knowledge-sources";
import migration014 from "@/lib/migrations/014-sanctions-entities";
import { refreshEu } from "@/lib/knowledge/sanctions/eu-adapter";
import type { Fetcher } from "@/lib/knowledge/sanctions/eu-adapter";
import { registerSource } from "@/lib/knowledge/governance";

describe("eu-adapter", () => {
  let db: Database.Database;

  beforeEach(() => {
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
  });
});

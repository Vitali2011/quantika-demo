import Database from "better-sqlite3";
import migration013 from "@/lib/migrations/013-knowledge-sources";
import migration014 from "@/lib/migrations/014-sanctions-entities";
import { refreshOfac } from "@/lib/knowledge/sanctions/ofac-adapter";
import type { Fetcher } from "@/lib/knowledge/sanctions/ofac-adapter";
import { registerSource } from "@/lib/knowledge/governance";

describe("ofac-adapter", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    migration013.up(db);
    migration014.up(db);

    // Register OFAC source for governance tracking
    registerSource(db, {
      slug: "ofac",
      name: "OFAC SDN List",
      kind: "structured_rows",
      category: "sanctions",
      source_url: "https://www.treasury.gov/ofac/downloads/sdn.xml",
      license: "Public Domain",
      refresh_command: "npm run knowledge:refresh:ofac",
      refresh_mode: "auto-daily",
      stale_threshold_days: 1,
      primary_table: "ofac_entities",
    });
  });

  afterEach(() => {
    db.close();
  });

  describe("refreshOfac", () => {
    it("calls reportSyncStarted then reportSyncSuccess with rowsChanged", async () => {
      const mockXml = `<?xml version="1.0"?>
<sdnList>
  <sdnEntry>
    <uid>12345</uid>
    <sdnType>Individual</sdnType>
    <firstName>John</firstName>
    <lastName>Doe</lastName>
    <programList>
      <program>SDGT</program>
    </programList>
  </sdnEntry>
</sdnList>`;

      const mockFetcher: Fetcher = async () => mockXml;

      const result = await refreshOfac(db, mockFetcher);

      expect(result.rowsChanged).toBe(1);
      expect(result.upstreamVersion).toMatch(/^sha256:[a-f0-9]{16}$/);

      // Verify sync log
      const syncLog = db
        .prepare(
          "SELECT * FROM knowledge_sync_log WHERE source_slug = 'ofac' ORDER BY id DESC LIMIT 1"
        )
        .get() as any;
      expect(syncLog.status).toBe("success");
      expect(syncLog.rows_changed).toBe(1);

      // Verify source status updated
      const source = db
        .prepare("SELECT * FROM knowledge_sources WHERE slug = 'ofac'")
        .get() as any;
      expect(source.status).toBe("fresh");
      expect(source.consecutive_failures).toBe(0);
    });

    it("on HTTP error calls reportSyncFailure and rethrows", async () => {
      const mockFetcher: Fetcher = async () => {
        throw new Error("ECONNREFUSED");
      };

      await expect(refreshOfac(db, mockFetcher)).rejects.toThrow(
        "ECONNREFUSED"
      );

      // Verify sync log
      const syncLog = db
        .prepare(
          "SELECT * FROM knowledge_sync_log WHERE source_slug = 'ofac' ORDER BY id DESC LIMIT 1"
        )
        .get() as any;
      expect(syncLog.status).toBe("failure");
      expect(syncLog.error_message).toContain("ECONNREFUSED");

      // Verify source status updated
      const source = db
        .prepare("SELECT * FROM knowledge_sources WHERE slug = 'ofac'")
        .get() as any;
      expect(source.status).toBe("failed");
      expect(source.consecutive_failures).toBe(1);
    });

    it("on parser error calls reportSyncFailure with parse error", async () => {
      const mockFetcher: Fetcher = async () => "not valid xml <>";

      await expect(refreshOfac(db, mockFetcher)).rejects.toThrow();

      const syncLog = db
        .prepare(
          "SELECT * FROM knowledge_sync_log WHERE source_slug = 'ofac' ORDER BY id DESC LIMIT 1"
        )
        .get() as any;
      expect(syncLog.status).toBe("failure");
      expect(syncLog.error_message).toContain("parse");
    });

    it("when entity removed from upstream, deleted from ofac_entities", async () => {
      // First insert an entity
      const xmlWithEntity = `<?xml version="1.0"?>
<sdnList>
  <sdnEntry>
    <uid>12345</uid>
    <sdnType>Individual</sdnType>
    <firstName>John</firstName>
    <lastName>Doe</lastName>
    <programList>
      <program>SDGT</program>
    </programList>
  </sdnEntry>
</sdnList>`;

      const mockFetcher1: Fetcher = async () => xmlWithEntity;
      await refreshOfac(db, mockFetcher1);

      const countBefore = (
        db.prepare("SELECT COUNT(*) as count FROM ofac_entities").get() as any
      ).count;
      expect(countBefore).toBe(1);

      // Now refresh with empty list
      const emptyXml = `<?xml version="1.0"?>
<sdnList>
</sdnList>`;

      const mockFetcher2: Fetcher = async () => emptyXml;
      const result = await refreshOfac(db, mockFetcher2);

      expect(result.rowsChanged).toBe(1); // 1 removed

      const countAfter = (
        db.prepare("SELECT COUNT(*) as count FROM ofac_entities").get() as any
      ).count;
      expect(countAfter).toBe(0);
    });

    it("running twice with same XML results in 0 rowsChanged on second run", async () => {
      const mockXml = `<?xml version="1.0"?>
<sdnList>
  <sdnEntry>
    <uid>12345</uid>
    <sdnType>Individual</sdnType>
    <firstName>John</firstName>
    <lastName>Doe</lastName>
    <programList>
      <program>SDGT</program>
    </programList>
  </sdnEntry>
</sdnList>`;

      const mockFetcher: Fetcher = async () => mockXml;

      const result1 = await refreshOfac(db, mockFetcher);
      expect(result1.rowsChanged).toBe(1);

      const result2 = await refreshOfac(db, mockFetcher);
      expect(result2.rowsChanged).toBe(0); // Idempotent
      expect(result2.upstreamVersion).toBe(result1.upstreamVersion);
    });

    it("throws error when fetcher returns 200 with empty body", async () => {
      const mockFetcher: Fetcher = async () => "";

      await expect(refreshOfac(db, mockFetcher)).rejects.toThrow();

      const syncLog = db
        .prepare(
          "SELECT * FROM knowledge_sync_log WHERE source_slug = 'ofac' ORDER BY id DESC LIMIT 1"
        )
        .get() as any;
      expect(syncLog.status).toBe("failure");
    });

    it("handles all entities removed (empty sdnList)", async () => {
      // First add entities
      const xmlWithEntities = `<?xml version="1.0"?>
<sdnList>
  <sdnEntry>
    <uid>111</uid>
    <sdnType>Individual</sdnType>
    <lastName>Person1</lastName>
    <programList><program>SDGT</program></programList>
  </sdnEntry>
  <sdnEntry>
    <uid>222</uid>
    <sdnType>Individual</sdnType>
    <lastName>Person2</lastName>
    <programList><program>SDGT</program></programList>
  </sdnEntry>
</sdnList>`;

      await refreshOfac(db, async () => xmlWithEntities);

      const countBefore = (
        db.prepare("SELECT COUNT(*) as count FROM ofac_entities").get() as any
      ).count;
      expect(countBefore).toBe(2);

      // Now empty list
      const emptyXml = `<?xml version="1.0"?><sdnList></sdnList>`;
      const result = await refreshOfac(db, async () => emptyXml);

      expect(result.rowsChanged).toBe(2); // All removed
      expect(result.upstreamVersion).toMatch(/^sha256:/);

      const countAfter = (
        db.prepare("SELECT COUNT(*) as count FROM ofac_entities").get() as any
      ).count;
      expect(countAfter).toBe(0);
    });

    it("properly normalizes names and stores aliases as JSON", async () => {
      const mockXml = `<?xml version="1.0"?>
<sdnList>
  <sdnEntry>
    <uid>999</uid>
    <sdnType>Individual</sdnType>
    <firstName>José</firstName>
    <lastName>García</lastName>
    <akaList>
      <aka>
        <firstName>Joe</firstName>
        <lastName>Garcia</lastName>
      </aka>
    </akaList>
    <programList>
      <program>SDGT</program>
    </programList>
  </sdnEntry>
</sdnList>`;

      await refreshOfac(db, async () => mockXml);

      const entity = db
        .prepare("SELECT * FROM ofac_entities WHERE uid = '999'")
        .get() as any;

      expect(entity.name).toBe("José García");
      expect(entity.name_normalized).toBe("jose garcia");
      expect(JSON.parse(entity.aliases)).toEqual(["Joe Garcia"]);
      expect(JSON.parse(entity.programs)).toEqual(["SDGT"]);
    });

    it("handles updates to existing entities", async () => {
      const xml1 = `<?xml version="1.0"?>
<sdnList>
  <sdnEntry>
    <uid>777</uid>
    <sdnType>Individual</sdnType>
    <lastName>Smith</lastName>
    <programList><program>SDGT</program></programList>
  </sdnEntry>
</sdnList>`;

      await refreshOfac(db, async () => xml1);

      // Update with different data
      const xml2 = `<?xml version="1.0"?>
<sdnList>
  <sdnEntry>
    <uid>777</uid>
    <sdnType>Entity</sdnType>
    <lastName>Smith Corp</lastName>
    <programList><program>NDAA</program></programList>
  </sdnEntry>
</sdnList>`;

      const result = await refreshOfac(db, async () => xml2);

      expect(result.rowsChanged).toBe(1); // 1 updated

      const entity = db
        .prepare("SELECT * FROM ofac_entities WHERE uid = '777'")
        .get() as any;
      expect(entity.type).toBe("Entity");
      expect(entity.name).toBe("Smith Corp");
      expect(JSON.parse(entity.programs)).toEqual(["NDAA"]);
    });

    it("stores country and address from addressList", async () => {
      const mockXml = `<?xml version="1.0"?>
<sdnList>
  <sdnEntry>
    <uid>555</uid>
    <sdnType>Individual</sdnType>
    <lastName>TestPerson</lastName>
    <addressList>
      <address>
        <country>Russia</country>
        <city>Moscow</city>
      </address>
    </addressList>
    <programList><program>UKRAINE-EO13662</program></programList>
  </sdnEntry>
</sdnList>`;

      await refreshOfac(db, async () => mockXml);

      const entity = db
        .prepare("SELECT * FROM ofac_entities WHERE uid = '555'")
        .get() as any;
      expect(entity.country).toBe("Russia");
      expect(JSON.parse(entity.address)).toMatchObject({ country: "Russia", city: "Moscow" });
    });
  });
});

import { parseEuXml } from "../../../../lib/knowledge/sanctions/eu-parser";
import { normalizeName } from "../../../../lib/knowledge/sanctions/normalize";
import { readFileSync } from "fs";
import { join } from "path";

describe("EU Consolidated Sanctions XML Parser", () => {
  const sampleXml = readFileSync(
    join(__dirname, "../../../fixtures/eu/sample-eu.xml"),
    "utf-8"
  );

  describe("parseEuXml", () => {
    it("parses 3-entry fixture (1 person + 1 entity + 1 vessel) with uid/type/name/aliases/programs", () => {
      const result = parseEuXml(sampleXml);

      expect(result).toHaveLength(3);

      // Person entry
      const person = result.find((e) => e.uid === "12345");
      expect(person).toBeDefined();
      expect(person?.type).toBe("person");
      expect(person?.name).toBe("María Fernández");
      expect(person?.aliases).toEqual(
        expect.arrayContaining([
          "Maria Fernandez",
          "M.F. Fernandez-Lopez",
        ])
      );
      expect(person?.programs).toEqual(
        expect.arrayContaining(["SYRIA", "BELARUS"])
      );
      expect(person?.country).toBe("ES");

      // Enterprise entry
      const entity = result.find((e) => e.uid === "67890");
      expect(entity).toBeDefined();
      expect(entity?.type).toBe("enterprise");
      expect(entity?.name).toBe("Acme Industries S.A.");
      expect(entity?.aliases).toEqual(
        expect.arrayContaining(["ACME IND"])
      );
      expect(entity?.programs).toEqual(["UKRAINE-TERRITORIAL-INTEGRITY"]);
      expect(entity?.country).toBe("RU");

      // Vessel entry (other type)
      const vessel = result.find((e) => e.uid === "11111");
      expect(vessel).toBeDefined();
      expect(vessel?.type).toBe("other");
      expect(vessel?.name).toBe("MV SANCTIONED TANKER");
      expect(vessel?.aliases).toEqual(
        expect.arrayContaining([
          "SANCTIONED TANKER",
          "Санкционированный Танкер",
        ])
      );
      expect(vessel?.programs).toEqual(["IRAN"]);
    });

    it("returns empty array for empty XML", () => {
      const emptyXml = `<?xml version="1.0" encoding="UTF-8"?>
<export xmlns="http://eu.europa.ec/fpi/fsd/export">
</export>`;

      const result = parseEuXml(emptyXml);
      expect(result).toEqual([]);
    });

    it("throws ParseError for malformed XML (truncated mid-tag)", () => {
      const malformedXml = `<?xml version="1.0" encoding="UTF-8"?>
<export xmlns="http://eu.europa.ec/fpi/fsd/export">
  <sanctionEntity logicalId="12345">
    <nameAlias>
      <wholeName>María Fernández`;

      expect(() => parseEuXml(malformedXml)).toThrow();
    });

    it("throws helpful error for entry with missing <logicalId>", () => {
      const noLogicalIdXml = `<?xml version="1.0" encoding="UTF-8"?>
<export xmlns="http://eu.europa.ec/fpi/fsd/export">
  <sanctionEntity publicationUrl="https://eu.europa.eu/sanctions/test">
    <nameAlias>
      <wholeName>Test Entity</wholeName>
    </nameAlias>
    <subjectType code="person">Person</subjectType>
  </sanctionEntity>
</export>`;

      expect(() => parseEuXml(noLogicalIdXml)).toThrow(/logicalId.*required/i);
    });

    it("handles entry without nameAlias (falls back to empty)", () => {
      const noAliasXml = `<?xml version="1.0" encoding="UTF-8"?>
<export xmlns="http://eu.europa.ec/fpi/fsd/export">
  <sanctionEntity logicalId="99999">
    <subjectType code="person">Person</subjectType>
  </sanctionEntity>
</export>`;

      const result = parseEuXml(noAliasXml);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("");
      expect(result[0].aliases).toEqual([]);
    });

    it("parses all aliases when 50+ nameAlias entries exist (no truncation)", () => {
      const manyAliases = Array.from(
        { length: 60 },
        (_, i) => `    <nameAlias>
      <wholeName>Alias ${i + 1}</wholeName>
    </nameAlias>`
      ).join("\n");

      const largeAliasXml = `<?xml version="1.0" encoding="UTF-8"?>
<export xmlns="http://eu.europa.ec/fpi/fsd/export">
  <sanctionEntity logicalId="88888">
${manyAliases}
    <subjectType code="person">Person</subjectType>
  </sanctionEntity>
</export>`;

      const result = parseEuXml(largeAliasXml);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Alias 1");
      // First is primary name, rest are aliases (60 total nameAlias → 1 primary + 59 aliases)
      expect(result[0].aliases).toHaveLength(59);
      expect(result[0].aliases).toContain("Alias 60");
    });

    it("handles non-Latin script names (Cyrillic, Arabic) without crashing", () => {
      const nonLatinXml = `<?xml version="1.0" encoding="UTF-8"?>
<export xmlns="http://eu.europa.ec/fpi/fsd/export">
  <sanctionEntity logicalId="77777">
    <nameAlias>
      <wholeName>Владимир Петров</wholeName>
    </nameAlias>
    <nameAlias>
      <wholeName>محمد العربي</wholeName>
    </nameAlias>
    <subjectType code="person">Person</subjectType>
  </sanctionEntity>
</export>`;

      const result = parseEuXml(nonLatinXml);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Владимир Петров");
      expect(result[0].aliases).toContain("محمد العربي");
    });

    it("handles XML with namespace prefix variation (ns:sanctionEntity)", () => {
      const nsXml = `<?xml version="1.0" encoding="UTF-8"?>
<ns:export xmlns:ns="http://eu.europa.ec/fpi/fsd/export">
  <ns:sanctionEntity logicalId="66666">
    <ns:nameAlias>
      <ns:wholeName>Test Name</ns:wholeName>
    </ns:nameAlias>
    <ns:subjectType code="person">Person</ns:subjectType>
  </ns:sanctionEntity>
</ns:export>`;

      const result = parseEuXml(nsXml);
      expect(result).toHaveLength(1);
      expect(result[0].uid).toBe("66666");
      expect(result[0].name).toBe("Test Name");
    });

    it("handles empty <regulation> (programs = [])", () => {
      const noRegulationXml = `<?xml version="1.0" encoding="UTF-8"?>
<export xmlns="http://eu.europa.ec/fpi/fsd/export">
  <sanctionEntity logicalId="55555">
    <nameAlias>
      <wholeName>No Program Entity</wholeName>
    </nameAlias>
    <subjectType code="person">Person</subjectType>
  </sanctionEntity>
</export>`;

      const result = parseEuXml(noRegulationXml);
      expect(result).toHaveLength(1);
      expect(result[0].programs).toEqual([]);
    });

    it("throws TypeError for null xml parameter", () => {
      expect(() => parseEuXml(null as any)).toThrow(TypeError);
    });

    it("throws TypeError for undefined xml parameter", () => {
      expect(() => parseEuXml(undefined as any)).toThrow(TypeError);
    });

    it("completes parsing 10000-entry XML in under 5 seconds", () => {
      const largeXml = generateLargeEuXml(10000);

      const startTime = Date.now();
      const result = parseEuXml(largeXml);
      const elapsed = Date.now() - startTime;

      expect(result).toHaveLength(10000);
      expect(elapsed).toBeLessThan(5000);
    });
  });

  describe("normalizeName integration", () => {
    it("normalizes EU entity name 'María Fernández' to 'maria fernandez'", () => {
      expect(normalizeName("María Fernández")).toBe("maria fernandez");
    });

    it("strips Cyrillic to spaces (normalizeName is Latin-only for matching)", () => {
      // Cyrillic chars are replaced with spaces per normalizeName contract
      expect(normalizeName("Владимир Петров")).toBe("");
    });
  });
});

// Helper function to generate large EU XML for performance testing
function generateLargeEuXml(count: number): string {
  const entries = Array.from({ length: count }, (_, i) => {
    return `  <sanctionEntity logicalId="${100000 + i}">
    <nameAlias>
      <wholeName>Test Person ${i}</wholeName>
    </nameAlias>
    <nameAlias>
      <wholeName>T Person ${i}</wholeName>
    </nameAlias>
    <subjectType code="person">Person</subjectType>
    <regulation>
      <regulationType>CFSP</regulationType>
      <programme>TEST-PROGRAM</programme>
    </regulation>
  </sanctionEntity>`;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<export xmlns="http://eu.europa.ec/fpi/fsd/export">
${entries}
</export>`;
}

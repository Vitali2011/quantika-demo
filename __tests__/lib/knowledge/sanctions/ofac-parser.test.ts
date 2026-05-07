import { parseOfacXml } from "../../../../lib/knowledge/sanctions/ofac-parser";
import { normalizeName } from "../../../../lib/knowledge/sanctions/normalize";
import { readFileSync } from "fs";
import { join } from "path";

describe("OFAC SDN XML Parser", () => {
  const sampleXml = readFileSync(
    join(__dirname, "../../../fixtures/ofac/sample-sdn.xml"),
    "utf-8"
  );

  describe("parseOfacXml", () => {
    it("parses 3-entry fixture (1 individual + 1 entity + 1 vessel) with uid/type/name/aliases/programs", () => {
      // Real OFAC SDN entries (public domain, US Treasury, fetched 2026-05-06):
      //   uid=48987: Aleksey Viktorovich BUDNEV (individual, DPRK3 + RUSSIA-EO14024)
      //   uid=37066: LIMITED LIABILITY COMPANY MARINE TRANS SHIPPING (entity, RUSSIA-EO14024)
      //   uid=54343: KONGM (vessel/crude oil tanker, IRAN-EO13846)
      const result = parseOfacXml(sampleXml);

      expect(result).toHaveLength(3);

      // Individual entry — Aleksey Viktorovich BUDNEV (OFAC uid 48987)
      const individual = result.find((e) => e.uid === "48987");
      expect(individual).toBeDefined();
      expect(individual?.type).toBe("Individual");
      expect(individual?.name).toBe("Aleksey Viktorovich BUDNEV");
      expect(individual?.aliases).toEqual(
        expect.arrayContaining([
          expect.stringContaining("Aleksei Viktorovich"),
          expect.stringContaining("Alexey Viktorovich"),
        ])
      );
      expect(individual?.programs).toEqual(
        expect.arrayContaining(["DPRK3", "RUSSIA-EO14024"])
      );

      // Entity entry — LIMITED LIABILITY COMPANY MARINE TRANS SHIPPING (OFAC uid 37066)
      const entity = result.find((e) => e.uid === "37066");
      expect(entity).toBeDefined();
      expect(entity?.type).toBe("Entity");
      expect(entity?.name).toBe("LIMITED LIABILITY COMPANY MARINE TRANS SHIPPING");
      expect(entity?.aliases).toEqual(
        expect.arrayContaining([expect.stringContaining("Marine Trans Shipping LLC")])
      );
      expect(entity?.programs).toEqual(["RUSSIA-EO14024"]);

      // Vessel entry — KONGM crude oil tanker (OFAC uid 54343)
      const vessel = result.find((e) => e.uid === "54343");
      expect(vessel).toBeDefined();
      expect(vessel?.type).toBe("Vessel");
      expect(vessel?.name).toBe("KONGM");
      expect(vessel?.aliases).toEqual(
        expect.arrayContaining([
          expect.stringContaining("CLS"),
          expect.stringContaining("C. Champion"),
        ])
      );
      expect(vessel?.programs).toEqual(["IRAN-EO13846"]);
    });

    it("returns empty array for empty XML", () => {
      const emptyXml = `<?xml version="1.0" encoding="UTF-8"?>
<sdnList xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns="http://www.un.org/sanctions/1.0">
  <publshInformation>
    <Publish_Date>05/05/2026</Publish_Date>
  </publshInformation>
</sdnList>`;

      const result = parseOfacXml(emptyXml);
      expect(result).toEqual([]);
    });

    it("throws ParseError for malformed XML (truncated mid-tag)", () => {
      const malformedXml = `<?xml version="1.0" encoding="UTF-8"?>
<sdnList xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <sdnEntry>
    <uid>12345</uid>
    <sdnType>Individual</sdnType>
    <firstName>José`;

      expect(() => parseOfacXml(malformedXml)).toThrow();
    });

    it("throws helpful error for entry with missing <uid>", () => {
      const noUidXml = `<?xml version="1.0" encoding="UTF-8"?>
<sdnList xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <sdnEntry>
    <sdnType>Individual</sdnType>
    <firstName>José</firstName>
    <lastName>García</lastName>
  </sdnEntry>
</sdnList>`;

      expect(() => parseOfacXml(noUidXml)).toThrow(/uid.*required/i);
    });

    it("completes parsing 10000-entry XML in under 5 seconds", () => {
      // Generate large XML with 10000 entries
      // Threshold is a regression guard, not a micro-benchmark —
      // fast-xml-parser throughput varies by ~2× across CI runners
      const largeXml = generateLargeOfacXml(10000);

      const startTime = Date.now();
      const result = parseOfacXml(largeXml);
      const elapsed = Date.now() - startTime;

      expect(result).toHaveLength(10000);
      expect(elapsed).toBeLessThan(5000);
    });
  });

  describe("normalizeName", () => {
    it("normalizes 'José M. García' to 'jose m garcia'", () => {
      expect(normalizeName("José M. García")).toBe("jose m garcia");
    });

    it("strips diacritics and converts to lowercase", () => {
      expect(normalizeName("Café")).toBe("cafe");
      expect(normalizeName("Zürich")).toBe("zurich");
      expect(normalizeName("Łódź")).toBe("lodz");
    });

    it("normalizes name with only diacritics ('á') to base char ('a')", () => {
      expect(normalizeName("á")).toBe("a");
      expect(normalizeName("é")).toBe("e");
      expect(normalizeName("ñ")).toBe("n");
    });

    it("handles empty string", () => {
      expect(normalizeName("")).toBe("");
    });

    it("replaces null bytes with space", () => {
      expect(normalizeName("José\x00García")).toBe("jose garcia");
    });

    it("collapses multiple spaces", () => {
      expect(normalizeName("José    García")).toBe("jose garcia");
    });

    it("removes non-alphanumeric characters except spaces", () => {
      expect(normalizeName("José-M.García@corp")).toBe("jose m garcia corp");
    });

    it("trims leading and trailing spaces", () => {
      expect(normalizeName("  José García  ")).toBe("jose garcia");
    });
  });
});

// Helper function to generate large XML for performance testing
function generateLargeOfacXml(count: number): string {
  const entries = Array.from({ length: count }, (_, i) => {
    return `  <sdnEntry>
    <uid>${10000 + i}</uid>
    <sdnType>Individual</sdnType>
    <programList>
      <program>SDGT</program>
    </programList>
    <firstName>Test${i}</firstName>
    <lastName>Person${i}</lastName>
    <akaList>
      <aka>
        <uid>${10000 + i}-1</uid>
        <type>a.k.a.</type>
        <category>strong</category>
        <firstName>T${i}</firstName>
        <lastName>P${i}</lastName>
      </aka>
    </akaList>
  </sdnEntry>`;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<sdnList xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns="http://www.un.org/sanctions/1.0">
  <publshInformation>
    <Publish_Date>05/05/2026</Publish_Date>
  </publshInformation>
${entries}
</sdnList>`;
}

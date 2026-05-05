import { XMLParser, XMLValidator } from "fast-xml-parser";

/**
 * Parsed EU sanctions entity structure (matches OFAC ParsedEntity interface).
 */
export interface ParsedEntity {
  uid: string;
  type: string;
  name: string;
  aliases: string[];
  programs: string[];
  country?: string;
  address?: any;
  publishDate?: string;
  raw?: any;
}

// Tag names that should always parse as arrays for consistent access
const arrayTags = new Set(["sanctionEntity", "nameAlias", "regulation", "address", "citizenship"]);

// Reuse parser instance for performance
const parser = new XMLParser({
  ignoreAttributes: false, // We need logicalId attribute
  attributeNamePrefix: "@_",
  parseTagValue: false,
  trimValues: true,
  ignoreDeclaration: true,
  ignorePiTags: true,
  processEntities: false,
  removeNSPrefix: true, // Handle both <ns:sanctionEntity> and <sanctionEntity>
  isArray: (name) => arrayTags.has(name),
});

/**
 * Parses EU Consolidated Sanctions XML format.
 *
 * Input contract:
 * - Empty string with valid XML structure: returns []
 * - null/undefined: throws TypeError
 * - Malformed XML: throws parse error
 * - Missing <logicalId>: throws Error with helpful message
 * - Entry without nameAlias: name="", aliases=[]
 * - Large XML (10000+ entries): must complete in <5s
 * - Unknown type values: accepted (forward compatibility)
 * - Non-Latin scripts: passed through (normalizeName handles)
 * - Namespace prefix variation: both <ns:sanctionEntity> and <sanctionEntity> parse
 * - Empty regulation: programs=[]
 *
 * @param xml EU Consolidated Sanctions XML string
 * @returns Array of parsed entities
 */
export function parseEuXml(xml: string): ParsedEntity[] {
  if (xml === null || xml === undefined) {
    throw new TypeError("xml parameter is required");
  }

  let parsed: any;
  try {
    // Validate XML first (only on smaller strings to avoid perf penalty)
    if (xml.length < 100000) {
      const validationResult = XMLValidator.validate(xml);
      if (validationResult !== true) {
        throw new Error(
          `Failed to parse EU XML: ${validationResult.err.msg} at line ${validationResult.err.line}`
        );
      }
    }
    parsed = parser.parse(xml);
  } catch (err) {
    throw new Error(`Failed to parse EU XML: ${(err as Error).message}`);
  }

  // Handle empty or missing sanctionEntity
  if (!parsed.export || !parsed.export.sanctionEntity) {
    return [];
  }

  // isArray config ensures sanctionEntity is always an array
  const entities = parsed.export.sanctionEntity;

  return entities.map((entity: any) => {
    // Validate required logicalId attribute
    if (!entity["@_logicalId"]) {
      throw new Error(
        "EU sanctions entry: <logicalId> attribute is required (data integrity violation)"
      );
    }

    // Extract primary name and aliases from nameAlias array
    let name = "";
    const aliases: string[] = [];

    if (entity.nameAlias && entity.nameAlias.length > 0) {
      // First nameAlias is primary name
      name = entity.nameAlias[0].wholeName || "";
      // Rest are aliases
      for (let i = 1; i < entity.nameAlias.length; i++) {
        const aliasName = entity.nameAlias[i].wholeName;
        if (aliasName) {
          aliases.push(aliasName);
        }
      }
    }

    // Extract type from subjectType code attribute
    let type = "unknown";
    if (entity.subjectType && entity.subjectType["@_code"]) {
      type = entity.subjectType["@_code"];
    }

    // Extract programs from regulation nodes
    let programs: string[] = [];
    if (entity.regulation && entity.regulation.length > 0) {
      programs = entity.regulation
        .map((reg: any) => reg.programme)
        .filter((p: any) => p);
    }

    // Extract country from citizenship countryIso2 attribute
    let country: string | undefined;
    if (entity.citizenship && entity.citizenship.length > 0) {
      country = entity.citizenship[0]["@_countryIso2"];
    }

    // Extract address
    let address: any;
    if (entity.address && entity.address.length > 0) {
      address = entity.address[0];
    }

    // Extract publish date from first regulation
    let publishDate: string | undefined;
    if (entity.regulation && entity.regulation.length > 0 && entity.regulation[0].publicationDate) {
      publishDate = entity.regulation[0].publicationDate;
    }

    return {
      uid: entity["@_logicalId"],
      type,
      name: name.trim(),
      aliases,
      programs,
      country,
      address,
      publishDate,
      raw: undefined, // Store only essential raw fields to reduce memory
    };
  });
}

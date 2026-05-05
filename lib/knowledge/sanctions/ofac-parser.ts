import { XMLParser, XMLValidator } from "fast-xml-parser";

/**
 * Parsed OFAC SDN entity structure.
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
const arrayTags = new Set(["sdnEntry", "aka", "program", "address"]);

// Reuse parser instance for performance
const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  trimValues: true,
  ignoreDeclaration: true,
  ignorePiTags: true,
  processEntities: false,
  removeNSPrefix: true,
  isArray: (name) => arrayTags.has(name),
});

// Helper to extract full name from entry
function extractName(obj: any): string {
  if (obj.firstName && obj.lastName) {
    return `${obj.firstName} ${obj.lastName}`;
  }
  return obj.lastName || obj.firstName || "";
}

/**
 * Parses OFAC SDN XML format.
 *
 * Input contract:
 * - Empty string with valid XML structure: returns []
 * - null/undefined: throws TypeError
 * - Malformed XML: throws parse error
 * - Missing <uid>: throws Error with helpful message
 * - Large XML (10000+ entries): must complete in <5s
 * - Unknown type values: accepted (forward compatibility)
 *
 * @param xml OFAC SDN XML string
 * @returns Array of parsed entities
 */
export function parseOfacXml(xml: string): ParsedEntity[] {
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
          `Failed to parse OFAC XML: ${validationResult.err.msg} at line ${validationResult.err.line}`
        );
      }
    }
    parsed = parser.parse(xml);
  } catch (err) {
    throw new Error(`Failed to parse OFAC XML: ${(err as Error).message}`);
  }

  // Handle empty or missing sdnEntry
  if (!parsed.sdnList || !parsed.sdnList.sdnEntry) {
    return [];
  }

  // isArray config ensures sdnEntry is always an array
  const entries = parsed.sdnList.sdnEntry;

  return entries.map((entry: any) => {
    // Validate required uid field
    if (!entry.uid) {
      throw new Error(
        "OFAC SDN entry: <uid> field is required (data integrity violation)"
      );
    }

    // Extract name (can be firstName+lastName or just lastName)
    const name = extractName(entry);

    // Extract aliases from akaList (isArray config ensures aka is always array)
    const aliases: string[] = [];
    if (entry.akaList && entry.akaList.aka) {
      for (const aka of entry.akaList.aka) {
        const akaName = extractName(aka);
        if (akaName) {
          aliases.push(akaName);
        }
      }
    }

    // Extract programs from programList (isArray config ensures program is always array)
    let programs: string[] = [];
    if (entry.programList && entry.programList.program) {
      programs = entry.programList.program;
    }

    // Extract country from addressList (isArray config ensures address is always array)
    let country: string | undefined;
    let address: any;
    if (entry.addressList && entry.addressList.address) {
      if (entry.addressList.address.length > 0) {
        country = entry.addressList.address[0].country;
        address = entry.addressList.address[0];
      }
    }

    return {
      uid: entry.uid,
      type: entry.sdnType || "Unknown",
      name: name.trim(),
      aliases,
      programs,
      country,
      address,
      // Store only essential raw fields to reduce memory/serialization overhead
      raw: undefined,
    };
  });
}

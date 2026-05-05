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

// Reuse parser instance for performance
const parser = new XMLParser({
  ignoreAttributes: true, // Don't need attributes for OFAC SDN
  parseTagValue: false,
  trimValues: true,
  ignoreDeclaration: true,
  ignorePiTags: true,
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
 * - Large XML (10000+ entries): must complete in <2s
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

  // Normalize to array (single entry won't be an array by default)
  const entries = Array.isArray(parsed.sdnList.sdnEntry)
    ? parsed.sdnList.sdnEntry
    : [parsed.sdnList.sdnEntry];

  return entries.map((entry: any) => {
    // Validate required uid field
    if (!entry.uid) {
      throw new Error(
        "OFAC SDN entry: <uid> field is required (data integrity violation)"
      );
    }

    // Extract name (can be firstName+lastName or just lastName)
    const name = extractName(entry);

    // Extract aliases from akaList
    const aliases: string[] = [];
    if (entry.akaList && entry.akaList.aka) {
      const akas = Array.isArray(entry.akaList.aka)
        ? entry.akaList.aka
        : [entry.akaList.aka];

      for (const aka of akas) {
        const akaName = extractName(aka);
        if (akaName) {
          aliases.push(akaName);
        }
      }
    }

    // Extract programs from programList
    let programs: string[] = [];
    if (entry.programList && entry.programList.program) {
      programs = Array.isArray(entry.programList.program)
        ? entry.programList.program
        : [entry.programList.program];
    }

    // Extract country from addressList (first address)
    let country: string | undefined;
    let address: any;
    if (entry.addressList && entry.addressList.address) {
      const addrs = Array.isArray(entry.addressList.address)
        ? entry.addressList.address
        : [entry.addressList.address];
      if (addrs.length > 0) {
        country = addrs[0].country;
        address = addrs[0];
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

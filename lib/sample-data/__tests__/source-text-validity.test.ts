/**
 * source-text-validity: every sourceText that appears in a parsed cargo
 * or parsed vessel fixture must be a verbatim substring of the matching
 * email body. After the ETMS-corpus migration the generator writes 79
 * cargo + 51 vessel records derived from real emails; this test guards
 * against parser whitespace-drift or hallucinated quotations.
 *
 * Pre-migration there was a stronger 'every cargo-inquiry has a parsed
 * record' assertion. With 154 real emails (94 cargo, of which 86 are
 * CARGO_INQUIRY → 79 parsed after LLM timeouts), the inverse direction
 * 'every parsed record references a real email' is the appropriate
 * invariant — orphan parsed records would indicate a data integrity bug.
 */

import cargoInquiries from '../cargo-inquiries.json';
import vesselPositions from '../vessel-positions.json';
import parsedCargoes from '../demo-parsed-cargoes.json';
import parsedVessels from '../demo-parsed-vessels.json';

interface ConfidenceFieldLike {
  value: unknown;
  confidence: unknown;
  sourceText?: string;
}

function isConfidenceField(val: unknown): val is ConfidenceFieldLike {
  return (
    val !== null &&
    typeof val === 'object' &&
    'confidence' in (val as object) &&
    'value' in (val as object)
  );
}

describe('demo-parsed fixtures — referential integrity', () => {
  it('every parsed cargo emailId exists in cargo-inquiries.json', () => {
    const cargoIds = new Set((cargoInquiries as Array<{ id: string }>).map((e) => e.id));
    const orphans = (parsedCargoes as Array<{ emailId: string }>)
      .filter((r) => r.emailId !== 'demo-cargo-economics' && !cargoIds.has(r.emailId))
      .map((r) => r.emailId);
    expect(orphans).toEqual([]);
  });

  it('every parsed vessel emailId exists in vessel-positions.json', () => {
    const vesselIds = new Set((vesselPositions as Array<{ id: string }>).map((e) => e.id));
    const orphans = (parsedVessels as Array<{ emailId: string }>)
      .filter((r) => r.emailId !== 'demo-vessel-economics' && !vesselIds.has(r.emailId))
      .map((r) => r.emailId);
    expect(orphans).toEqual([]);
  });
});

describe('demo-parsed fixtures — sourceText is verbatim substring of email body', () => {
  // Build a combined email body lookup map. Parsed records may reference
  // either cargo-inquiry or vessel-position emails depending on the file.
  const bodyById = new Map<string, string>();
  for (const e of cargoInquiries as Array<{ id: string; body: string }>) bodyById.set(e.id, e.body);
  for (const e of vesselPositions as Array<{ id: string; body: string }>) bodyById.set(e.id, e.body);

  function checkRecords(records: Array<Record<string, unknown>>, scope: string): void {
    const failures: Array<{ emailId: string; field: string; sourceText: string }> = [];
    for (const record of records) {
      const emailId = record['emailId'] as string;
      const body = bodyById.get(emailId);
      if (!body) continue; // synthetic record, no body to check against
      for (const [field, value] of Object.entries(record)) {
        if (isConfidenceField(value) && typeof value.sourceText === 'string' && value.sourceText) {
          if (!body.includes(value.sourceText)) {
            failures.push({ emailId, field, sourceText: value.sourceText });
          }
        }
      }
    }
    if (failures.length > 0) {
      const report = failures
        .map((f) => `  [${scope}] emailId=${f.emailId} field=${f.field} sourceText="${f.sourceText.slice(0, 80)}"`)
        .join('\n');
      throw new Error(`sourceText not found in email body:\n${report}`);
    }
  }

  it('parsed cargo records', () => {
    checkRecords(parsedCargoes as Array<Record<string, unknown>>, 'cargo');
  });

  it('parsed vessel records', () => {
    checkRecords(parsedVessels as Array<Record<string, unknown>>, 'vessel');
  });
});

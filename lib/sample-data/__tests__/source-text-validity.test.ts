import cargoInquiries from '../cargo-inquiries.json';
import parsedCargoes from '../demo-parsed-cargoes.json';

interface ConfidenceFieldLike {
  value: unknown;
  confidence: number;
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

describe('demo-parsed-cargoes fixture', () => {
  const emailMap = new Map(
    (cargoInquiries as Array<{ id: string; body: string }>).map((e) => [e.id, e.body])
  );

  test('every cargo-inquiry id has a matching parsed record', () => {
    const parsedIds = new Set(
      (parsedCargoes as Array<{ emailId: string }>).map((r) => r.emailId)
    );
    const missing: string[] = [];
    for (const email of cargoInquiries as Array<{ id: string }>) {
      if (!parsedIds.has(email.id)) {
        missing.push(email.id);
      }
    }
    expect(missing).toEqual([]);
  });

  test('every sourceText is a verbatim substring of the matching email body', () => {
    const failures: Array<{ emailId: string; fieldKey: string; sourceText: string }> = [];

    for (const record of parsedCargoes as Array<Record<string, unknown>>) {
      const emailId = record['emailId'] as string;
      const body = emailMap.get(emailId);
      if (!body) continue;

      for (const [fieldKey, fieldVal] of Object.entries(record)) {
        if (isConfidenceField(fieldVal) && typeof fieldVal.sourceText === 'string' && fieldVal.sourceText) {
          if (!body.includes(fieldVal.sourceText)) {
            failures.push({ emailId, fieldKey, sourceText: fieldVal.sourceText });
          }
        }
      }
    }

    if (failures.length > 0) {
      const report = failures
        .map((f) => `  emailId=${f.emailId} field=${f.fieldKey} sourceText="${f.sourceText}"`)
        .join('\n');
      throw new Error(`sourceText not found in email body:\n${report}`);
    }
  });
});

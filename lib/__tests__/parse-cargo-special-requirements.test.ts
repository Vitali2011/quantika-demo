import { parseCargoAIResponse } from '@/lib/parsing/parse-cargo-ai';

describe('parseCargoAIResponse — specialRequirements ConfidenceField array serialization', () => {
  const emailId = 'test-email-001';

  it('serializes a single ConfidenceField to its .value string', () => {
    const raw = JSON.stringify({
      special_requirements: { value: 'MAX 25 years', confidence: 'interpreted', source_text: 'max 25 yrs' },
    });
    const [result] = parseCargoAIResponse(raw, emailId);
    expect(result.specialRequirements).toBe('MAX 25 years');
    expect(result.specialRequirements).not.toContain('[object Object]');
  });

  it('serializes an array of ConfidenceField objects to joined text, not [object Object]', () => {
    const raw = JSON.stringify({
      special_requirements: [
        { value: 'Vessel must be geared', confidence: 'confirmed', source_text: 'geared required' },
        { value: 'Charterers agents bends', confidence: 'confirmed', source_text: 'chts agents b/e' },
      ],
    });
    const [result] = parseCargoAIResponse(raw, emailId);
    expect(result.specialRequirements).toBe('Vessel must be geared; Charterers agents bends');
    expect(result.specialRequirements).not.toContain('[object Object]');
  });

  it('serializes a plain string passthrough', () => {
    const raw = JSON.stringify({ special_requirements: 'two consecutive voyages' });
    const [result] = parseCargoAIResponse(raw, emailId);
    expect(result.specialRequirements).toBe('two consecutive voyages');
  });

  it('returns null for null special_requirements', () => {
    const raw = JSON.stringify({ special_requirements: null });
    const [result] = parseCargoAIResponse(raw, emailId);
    expect(result.specialRequirements).toBeNull();
  });

  it('no output equals "[object Object]" for any serialization path', () => {
    const cases = [
      { value: 'a' },
      [{ value: 'a' }, { value: 'b' }],
      'plain string',
      null,
    ];
    for (const sr of cases) {
      const raw = JSON.stringify({ special_requirements: sr });
      const [result] = parseCargoAIResponse(raw, emailId);
      if (result.specialRequirements !== null) {
        expect(result.specialRequirements).not.toContain('[object Object]');
      }
    }
  });
});

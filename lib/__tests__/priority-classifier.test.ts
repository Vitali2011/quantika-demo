import { classifyPriority, PriorityLevel } from '../sailing/priority-classifier';
import type { MatchConfidence } from '../confidence';

// ── classifyPriority ─────────────────────────────────────────────────────────

describe('classifyPriority', () => {
  const confidenceOk: MatchConfidence = {
    level: 'verified',
    blockSend: false,
    blockedFields: [],
    fieldConfidences: [],
  };

  const confidenceInferred: MatchConfidence = {
    level: 'inferred',
    blockSend: false,
    blockedFields: [],
    fieldConfidences: [],
  };

  const confidenceBlocked: MatchConfidence = {
    level: 'uncertain',
    blockSend: true,
    blockedFields: ['cargo.portLoad'],
    fieldConfidences: [],
  };

  it('returns urgent when confidence.blockSend is true', () => {
    const result = classifyPriority({ confidence: confidenceBlocked });
    expect(result).toBe<PriorityLevel>('urgent');
  });

  it('returns urgent when readinessGap < 24h (e.g. 12)', () => {
    const result = classifyPriority({ confidence: confidenceOk, readinessGap: 12 });
    expect(result).toBe<PriorityLevel>('urgent');
  });

  it('returns urgent when readinessGap is 0', () => {
    const result = classifyPriority({ confidence: confidenceOk, readinessGap: 0 });
    expect(result).toBe<PriorityLevel>('urgent');
  });

  it('returns urgent when readinessGap is negative (laycan expired)', () => {
    const result = classifyPriority({ confidence: confidenceOk, readinessGap: -5 });
    expect(result).toBe<PriorityLevel>('urgent');
  });

  it('returns attention when confidence.level is inferred and gap > 72h', () => {
    const result = classifyPriority({ confidence: confidenceInferred, readinessGap: 96 });
    expect(result).toBe<PriorityLevel>('attention');
  });

  it('returns attention when readinessGap is between 24 and 72', () => {
    const result = classifyPriority({ confidence: confidenceOk, readinessGap: 48 });
    expect(result).toBe<PriorityLevel>('attention');
  });

  it('returns attention at boundary: readinessGap === 24', () => {
    const result = classifyPriority({ confidence: confidenceOk, readinessGap: 24 });
    expect(result).toBe<PriorityLevel>('attention');
  });

  it('returns ok when confidence is verified and no readiness concern', () => {
    const result = classifyPriority({ confidence: confidenceOk });
    expect(result).toBe<PriorityLevel>('ok');
  });

  it('returns ok when confidence is verified and gap > 72', () => {
    const result = classifyPriority({ confidence: confidenceOk, readinessGap: 100 });
    expect(result).toBe<PriorityLevel>('ok');
  });

  it('returns attention when no confidence provided but readinessGap is 36', () => {
    const result = classifyPriority({ readinessGap: 36 });
    expect(result).toBe<PriorityLevel>('attention');
  });

  it('returns ok when no confidence and no readinessGap provided', () => {
    const result = classifyPriority({});
    expect(result).toBe<PriorityLevel>('ok');
  });
});

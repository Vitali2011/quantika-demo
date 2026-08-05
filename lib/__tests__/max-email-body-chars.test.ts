/**
 * FM-03: classify body-preview ceiling. Real import of the source constant
 * (not a mock) + classify-prompt truncation-awareness wiring.
 */
import { MAX_EMAIL_BODY_CHARS } from '@/lib/constants';
import { CLASSIFICATION_SYSTEM_PROMPT } from '@/lib/prompts/classify';

describe('FM-03 — MAX_EMAIL_BODY_CHARS classify ceiling', () => {
  it('is raised to at least 8000 chars', () => {
    expect(MAX_EMAIL_BODY_CHARS).toBeGreaterThanOrEqual(8000);
  });

  it('classify prompt has a truncation-awareness block', () => {
    expect(CLASSIFICATION_SYSTEM_PROMPT).toMatch(/<truncation_awareness>/);
    expect(CLASSIFICATION_SYSTEM_PROMPT).toMatch(/\[truncated\]/);
  });

  it('truncation block tells the model not to default to OTHER', () => {
    expect(CLASSIFICATION_SYSTEM_PROMPT).toMatch(/do not default to OTHER/i);
  });
});

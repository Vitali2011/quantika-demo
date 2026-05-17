/**
 * Tests for EMAIL_PARSE_R4_ENABLED flag normalization (medlow-cleanup M1).
 * Verifies that truthy-but-non-"true" values fall back to baseline with a warning.
 */

import { getClassifyPrompt, CLASSIFICATION_SYSTEM_PROMPT_R4 } from '@/lib/prompts/classify';

const ORIGINAL_ENV = process.env.EMAIL_PARSE_R4_ENABLED;

afterEach(() => {
  if (ORIGINAL_ENV === undefined) {
    delete process.env.EMAIL_PARSE_R4_ENABLED;
  } else {
    process.env.EMAIL_PARSE_R4_ENABLED = ORIGINAL_ENV;
  }
  jest.restoreAllMocks();
});

describe('getClassifyPrompt — EMAIL_PARSE_R4_ENABLED flag normalization', () => {
  it('returns R4 prompt when flag is "true"', () => {
    process.env.EMAIL_PARSE_R4_ENABLED = 'true';
    expect(getClassifyPrompt()).toBe(CLASSIFICATION_SYSTEM_PROMPT_R4);
  });

  it('returns baseline when flag is unset', () => {
    delete process.env.EMAIL_PARSE_R4_ENABLED;
    const prompt = getClassifyPrompt();
    expect(prompt).not.toBe(CLASSIFICATION_SYSTEM_PROMPT_R4);
  });

  it('returns baseline for "1" and emits a warning', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.EMAIL_PARSE_R4_ENABLED = '1';
    const prompt = getClassifyPrompt();
    expect(prompt).not.toBe(CLASSIFICATION_SYSTEM_PROMPT_R4);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('EMAIL_PARSE_R4_ENABLED'));
  });

  it('returns R4 for "TRUE" (case-insensitive normalization) without warning', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.EMAIL_PARSE_R4_ENABLED = 'TRUE';
    expect(getClassifyPrompt()).toBe(CLASSIFICATION_SYSTEM_PROMPT_R4);
    expect(warn).not.toHaveBeenCalled();
  });

  it('returns R4 for " true " (leading/trailing spaces) without warning', () => {
    process.env.EMAIL_PARSE_R4_ENABLED = ' true ';
    expect(getClassifyPrompt()).toBe(CLASSIFICATION_SYSTEM_PROMPT_R4);
  });
});

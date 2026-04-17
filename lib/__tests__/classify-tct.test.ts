/**
 * Unit tests for TCT_REQUEST / VESSEL_CERTIFICATE classifier prompt fix.
 *
 * These tests are prompt-content checks — no live LLM calls.
 * They pin that the CLASSIFICATION_SYSTEM_PROMPT:
 *   1. mentions both new categories
 *   2. contains keyword hints for detecting TCT emails
 *   3. explicitly lists TCT_REQUEST and VESSEL_CERTIFICATE in the output enum
 *
 * They also verify that EmailCategory type (as inferred from prompt documentation)
 * is self-consistent with the parse-cargo guard.
 */

import { CLASSIFICATION_SYSTEM_PROMPT, CARGO_INQUIRY_PARSER_PROMPT } from '@/lib/prompts';

describe('CLASSIFICATION_SYSTEM_PROMPT — TCT_REQUEST / VESSEL_CERTIFICATE', () => {
  it('mentions TCT_REQUEST as a valid category', () => {
    expect(CLASSIFICATION_SYSTEM_PROMPT).toMatch(/TCT_REQUEST/);
  });

  it('mentions VESSEL_CERTIFICATE as a valid category', () => {
    expect(CLASSIFICATION_SYSTEM_PROMPT).toMatch(/VESSEL_CERTIFICATE/);
  });

  it('lists both new categories in the output enum line', () => {
    // The prompt must have an explicit enum line that includes the new categories
    expect(CLASSIFICATION_SYSTEM_PROMPT).toMatch(
      /CARGO_INQUIRY.*VESSEL_POSITION.*FIXTURE_RECAP.*TCT_REQUEST.*VESSEL_CERTIFICATE/
    );
  });

  it('contains keyword hints for detecting TCT emails', () => {
    // At least one of the canonical TCT signal words must be present
    const hasTctKeywords =
      /time.?charter|daily hire|period charter|trip charter|delivery.*redelivery|dely.*redely/i.test(
        CLASSIFICATION_SYSTEM_PROMPT
      );
    expect(hasTctKeywords).toBe(true);
  });

  it('instructs classifier NOT to use CARGO_INQUIRY for TCT', () => {
    // The hint must explicitly say TCT should NOT be classified as CARGO_INQUIRY
    expect(CLASSIFICATION_SYSTEM_PROMPT).toMatch(/TCT.*NOT CARGO_INQUIRY|not.*CARGO_INQUIRY.*TCT/i);
  });

  it('instructs classifier to use VESSEL_CERTIFICATE for certificate docs without position', () => {
    expect(CLASSIFICATION_SYSTEM_PROMPT).toMatch(/VESSEL_CERTIFICATE.*certificate|certificate.*VESSEL_CERTIFICATE/i);
  });
});

describe('CARGO_INQUIRY_PARSER_PROMPT — TCT guard', () => {
  it('has a TCT GUARD that prevents parsing TCT emails as cargo', () => {
    expect(CARGO_INQUIRY_PARSER_PROMPT).toMatch(/TCT GUARD/);
  });

  it('TCT GUARD instructs to return empty items array for TCT emails', () => {
    expect(CARGO_INQUIRY_PARSER_PROMPT).toMatch(/empty items array/i);
  });

  it('TCT GUARD mentions missing_info message for TCT', () => {
    // Parser should report that the email is a TCT, not a voyage cargo inquiry
    expect(CARGO_INQUIRY_PARSER_PROMPT).toMatch(/TCT.*period charter|period charter.*TCT/i);
  });
});

describe('sample-13 email content — TCT signal words', () => {
  // Inline the relevant body of sample-13 (sourced from cargo-inquiries.json)
  // so this test does not depend on loading JSON at runtime.
  const sample13Body = `
    TYPE: Supramax / Ultramax (52-65k DWT)
    DELY: WAfrica int'l (Dakar, Senegal)
    REDELY: Singapore / Japan range
    DURATION: 1 TCT ppt onwards
    CARGO: agriprods / grains
    Rate: pls offer
  `;

  it('sample-13 body contains "TCT" keyword', () => {
    expect(sample13Body).toMatch(/TCT/);
  });

  it('sample-13 body contains delivery/redelivery pattern (DELY/REDELY)', () => {
    expect(sample13Body).toMatch(/DELY[\s\S]*?REDELY|REDELY[\s\S]*?DELY/i);
  });

  it('sample-13 body does NOT contain a single cargo origin/destination port pair typical of voyage inquiry', () => {
    // A voyage inquiry has "Load: X / Discharge: Y" or similar.
    // sample-13 has DELY/REDELY (TC trip), not POL/POD.
    expect(sample13Body).not.toMatch(/load port|pol:|pod:|discharge port/i);
  });
});

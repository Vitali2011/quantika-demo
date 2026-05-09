/**
 * Adversarial regression — RAG citation validator
 * Cold-start QA wave 2026-05-07 (Q4 + Q5 from .test-review-2026-05-07/attack_plan.md)
 *
 * Surface under test: lib/knowledge/citations/validator.ts
 *
 * Findings sought:
 * ── Q4 (MEDIUM) substring section-ref false-positive ─────────────────────
 * Line 39-41 of validator.ts:
 *     return section.includes(sectionRef) || sectionRef.includes(section);
 * For a hallucinated `[Source: IMSBC §1]` (sectionRef === "1"), any chunk whose
 * section metadata CONTAINS the substring "1" passes — e.g. section "21.5",
 * "12.3", "11", "1.1", "1.2.3.4". The validator promises to strip hallucinated
 * citations; in practice it accepts a much broader set than what the LLM
 * actually had access to. A broker reading the response sees an authoritative
 * citation that points to material the model never grounded against.
 *
 * ── Q5 (LOW-MED) lowercase tag bypass ────────────────────────────────────
 * Regex literal `(IMSBC|IGC)` is case-sensitive. LLM hallucinations using
 * lowercase (`[Source: imsbc §1.1]`) slip past the regex entirely → never
 * subject to validation → preserved verbatim in the response.
 */

import { describe, it, expect } from '@jest/globals';
import { validateCitations } from '@/lib/knowledge/citations/validator';
import type { RetrievedChunk } from '@/lib/knowledge/embeddings/chunks';

function chunk(section: string, source: 'imsbc' | 'igc' | 'jwc' = 'imsbc'): RetrievedChunk {
  return {
    content: `Chunk content for section ${section}`,
    metadata: { source, section } as RetrievedChunk['metadata'],
    distance: 0.1,
    chunkId: `c-${section}`,
  };
}

describe('Q4 — citation validator substring false-positive', () => {
  it('Q4-a: hallucinated [Source: IMSBC §1] must NOT validate against unrelated section "21.5"', () => {
    // Retrieved chunks contain ONLY section 21.5 — nothing about §1.
    const retrieved = [chunk('21.5')];
    const llmResponse = 'Per the regulation, see [Source: IMSBC §1] for details.';

    const result = validateCitations(llmResponse, retrieved);

    // STRICT contract: a citation referencing §1 must be stripped because no
    // chunk genuinely covers §1. The current substring matcher
    // (`'21.5'.includes('1')` → true) lets it pass — this assertion currently
    // fails and pins the substring-match defect.
    expect(result).not.toContain('[Source: IMSBC §1]');
  });

  it('Q4-b: [Source: IMSBC §2] must NOT validate against unrelated section "12.3"', () => {
    const retrieved = [chunk('12.3')];
    const llmResponse = '[Source: IMSBC §2] is the relevant rule.';
    const result = validateCitations(llmResponse, retrieved);
    expect(result).not.toContain('[Source: IMSBC §2]');
  });

  it('Q4-c: legitimate exact-match citation [Source: IMSBC §3.4] DOES validate against section "3.4"', () => {
    // Sanity check: the FIX (whatever shape it takes — exact match, prefix
    // match with "." boundary, etc.) must still allow legitimate citations.
    const retrieved = [chunk('3.4')];
    const llmResponse = 'See [Source: IMSBC §3.4] for the test method.';
    const result = validateCitations(llmResponse, retrieved);
    expect(result).toContain('[Source: IMSBC §3.4]');
  });

  it('Q4-d: legitimate prefix citation [Source: IMSBC §3] DOES validate against section "3.4" only if the fix uses dot-boundary', () => {
    // This case is intentionally ambiguous — documenting two reasonable fix
    // shapes:
    //   (a) "exact equality" → §3 fails to match section "3.4" (strict).
    //   (b) "dot-prefix"     → §3 matches "3", "3.4", "3.4.1" but NOT "31".
    // Both (a) and (b) reject §1 against section "21.5" (Q4-a passes either way).
    // We test the WEAKER property: the existing symmetric-`.includes` is wrong
    // because it lets §1 match "21.5". Whatever fix lands, Q4-a is the
    // authoritative regression. This test is documentation only.
    const retrieved = [chunk('3.4')];
    const llmResponse = 'See [Source: IMSBC §3] for the test method.';
    const result = validateCitations(llmResponse, retrieved);
    // Document the call shape; do not pin the post-fix behavior here.
    expect(typeof result).toBe('string');
  });

  it('Q4-e: numeric-substring trick — §1 must NOT pass against section "11"', () => {
    const retrieved = [chunk('11')];
    const llmResponse = '[Source: IMSBC §1] applies.';
    const result = validateCitations(llmResponse, retrieved);
    expect(result).not.toContain('[Source: IMSBC §1]');
  });

  it('Q4-f: numeric-substring trick — §2 must NOT pass against section "1.2"', () => {
    // Symmetric direction: sectionRef "2" appears as substring inside section "1.2".
    // Current code triggers via `section.includes(sectionRef)` → '1.2'.includes('2') → true.
    const retrieved = [chunk('1.2')];
    const llmResponse = '[Source: IMSBC §2] applies.';
    const result = validateCitations(llmResponse, retrieved);
    expect(result).not.toContain('[Source: IMSBC §2]');
  });
});

describe('Q5 — citation validator case-sensitive bypass', () => {
  it('Q5-a: lowercase [Source: imsbc §1.1] must be normalized away when no chunk grounds it', () => {
    // No chunks at all — nothing to validate against.
    const retrieved: RetrievedChunk[] = [];
    const llmResponse = 'Per [Source: imsbc §1.1] the rule applies.';
    const result = validateCitations(llmResponse, retrieved);

    // Hallucinated lowercase citation must be stripped. Currently the regex
    // literal `(IMSBC|IGC)` is case-SENSITIVE, so the lowercase variant slips
    // through entirely and is preserved verbatim — a broker sees an
    // unverifiable "imsbc" citation in the response.
    expect(result).not.toContain('[Source: imsbc §1.1]');
  });

  it('Q5-b: mixed-case [Source: Imsbc §2.0] must be normalized away when no chunk grounds it', () => {
    const retrieved: RetrievedChunk[] = [];
    const llmResponse = '[Source: Imsbc §2.0] explains the requirement.';
    const result = validateCitations(llmResponse, retrieved);
    expect(result).not.toContain('[Source: Imsbc §2.0]');
  });

  it('Q5-c: lowercase [Source: igc 5.6] must be normalized away when no chunk grounds it', () => {
    const retrieved: RetrievedChunk[] = [];
    const llmResponse = 'See [Source: igc 5.6].';
    const result = validateCitations(llmResponse, retrieved);
    expect(result).not.toContain('[Source: igc 5.6]');
  });
});

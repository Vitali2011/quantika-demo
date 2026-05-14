/**
 * @file flags.test.ts
 * @description Unit tests for RAG feature flags module.
 * Spec: spec-03-all-6-virtual-tables-exist-after-migration
 * Test IDs: TC-NBI-01 to TC-NBI-05 (Input Contract)
 */

import {
  isRagEnabled,
  knowledgeBackend,
  ftsTableForSource,
  vecTableForSource,
} from '@/lib/knowledge/flags';

describe('lib/knowledge/flags', () => {
  describe('isRagEnabled()', () => {
    const originalEnv = process.env.KNOWLEDGE_RAG_ENABLED;

    afterEach(() => {
      // Restore original env value
      if (originalEnv === undefined) {
        delete process.env.KNOWLEDGE_RAG_ENABLED;
      } else {
        process.env.KNOWLEDGE_RAG_ENABLED = originalEnv;
      }
    });

    // TC-NBI-02: null/unset → false (safe default)
    it('returns false when KNOWLEDGE_RAG_ENABLED is unset', () => {
      delete process.env.KNOWLEDGE_RAG_ENABLED;
      expect(isRagEnabled()).toBe(false);
    });

    // TC-NBI-01: empty string → false
    it('returns false when KNOWLEDGE_RAG_ENABLED is empty string', () => {
      process.env.KNOWLEDGE_RAG_ENABLED = '';
      expect(isRagEnabled()).toBe(false);
    });

    // Spec requirement: returns false when "false"
    it('returns false when KNOWLEDGE_RAG_ENABLED is "false"', () => {
      process.env.KNOWLEDGE_RAG_ENABLED = 'false';
      expect(isRagEnabled()).toBe(false);
    });

    // Spec requirement: returns true when "true"
    it('returns true when KNOWLEDGE_RAG_ENABLED is "true"', () => {
      process.env.KNOWLEDGE_RAG_ENABLED = 'true';
      expect(isRagEnabled()).toBe(true);
    });

    // TC-NBI-03: non-"true" strings → false (strict lowercase "true" only)
    it('returns false when KNOWLEDGE_RAG_ENABLED is "1"', () => {
      process.env.KNOWLEDGE_RAG_ENABLED = '1';
      expect(isRagEnabled()).toBe(false);
    });

    it('returns false when KNOWLEDGE_RAG_ENABLED is "yes"', () => {
      process.env.KNOWLEDGE_RAG_ENABLED = 'yes';
      expect(isRagEnabled()).toBe(false);
    });

    it('returns false when KNOWLEDGE_RAG_ENABLED is "TRUE" (uppercase)', () => {
      process.env.KNOWLEDGE_RAG_ENABLED = 'TRUE';
      expect(isRagEnabled()).toBe(false);
    });
  });

  describe('ftsTableForSource()', () => {
    // Spec requirement: 'imsbc' → 'imsbc_fts'
    it('returns correct FTS table name for imsbc', () => {
      expect(ftsTableForSource('imsbc')).toBe('imsbc_fts');
    });

    it('returns correct FTS table name for igc', () => {
      expect(ftsTableForSource('igc')).toBe('igc_fts');
    });

    it('returns correct FTS table name for jwc', () => {
      expect(ftsTableForSource('jwc')).toBe('jwc_fts');
    });

    // TC-NBI-04: empty string → "_fts" (caller's responsibility to pass valid slug)
    it('returns "_fts" for empty string (no validation at this layer)', () => {
      expect(ftsTableForSource('')).toBe('_fts');
    });
  });

  describe('vecTableForSource()', () => {
    // Spec requirement: 'jwc' → 'jwc_vec'
    it('returns correct vec table name for jwc', () => {
      expect(vecTableForSource('jwc')).toBe('jwc_vec');
    });

    it('returns correct vec table name for imsbc', () => {
      expect(vecTableForSource('imsbc')).toBe('imsbc_vec');
    });

    it('returns correct vec table name for igc', () => {
      expect(vecTableForSource('igc')).toBe('igc_vec');
    });

    // TC-NBI-05: unknown slug → "unknown_source_vec" (no validation, retriever handles)
    it('returns suffixed table name for unknown source (no validation at this layer)', () => {
      expect(vecTableForSource('unknown_source')).toBe('unknown_source_vec');
    });
  });

  describe('knowledgeBackend()', () => {
    const originalEnv = process.env.KNOWLEDGE_BACKEND;

    afterEach(() => {
      // Restore original env value
      if (originalEnv === undefined) {
        delete process.env.KNOWLEDGE_BACKEND;
      } else {
        process.env.KNOWLEDGE_BACKEND = originalEnv;
      }
    });

    it('returns "sqlite" when KNOWLEDGE_BACKEND is unset (default)', () => {
      delete process.env.KNOWLEDGE_BACKEND;
      expect(knowledgeBackend()).toBe('sqlite');
    });

    it('returns "sqlite" when KNOWLEDGE_BACKEND is empty string', () => {
      process.env.KNOWLEDGE_BACKEND = '';
      expect(knowledgeBackend()).toBe('sqlite');
    });

    it('returns "vertex" when KNOWLEDGE_BACKEND is "vertex"', () => {
      process.env.KNOWLEDGE_BACKEND = 'vertex';
      expect(knowledgeBackend()).toBe('vertex');
    });

    it('returns "sqlite" when KNOWLEDGE_BACKEND is "sqlite"', () => {
      process.env.KNOWLEDGE_BACKEND = 'sqlite';
      expect(knowledgeBackend()).toBe('sqlite');
    });

    it('returns "sqlite" for any other value (default fallback)', () => {
      process.env.KNOWLEDGE_BACKEND = 'unknown';
      expect(knowledgeBackend()).toBe('sqlite');
    });
  });
});

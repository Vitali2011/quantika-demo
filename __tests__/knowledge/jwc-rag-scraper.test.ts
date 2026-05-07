/**
 * Unit tests for JWC bulletin scraper (lib/knowledge/sources/jwc/scraper.ts)
 * Phase 2 RAG expansion — Block D (JWC RAG), item D1
 */

import { scrapeJwc } from '@/lib/knowledge/sources/jwc/scraper';
import type { JwcBulletin } from '@/lib/knowledge/sources/jwc/types';

describe('scrapeJwc', () => {
  describe('Input Contract: boundary validation (TC-NBI-01 to TC-NBI-03)', () => {
    it('TC-NBI-01: should throw Error when baseUrl is empty string', async () => {
      await expect(scrapeJwc('')).rejects.toThrow('baseUrl cannot be empty');
    });

    it('TC-NBI-02: should throw Error when baseUrl is null', async () => {
      await expect(scrapeJwc(null as any)).rejects.toThrow('baseUrl cannot be empty');
    });

    it('TC-NBI-03: should throw Error when baseUrl is whitespace only', async () => {
      await expect(scrapeJwc('   ')).rejects.toThrow('baseUrl cannot be empty');
      await expect(scrapeJwc('\t\n')).rejects.toThrow('baseUrl cannot be empty');
    });
  });
});

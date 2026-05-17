/**
 * Regression test for D8: bimco_vec + bimco_fts in retriever-sqlite allowlist.
 * Verifies searchVec0('bimco_vec') does not throw "Invalid table name".
 */

import { jest, describe, it, expect } from '@jest/globals';

jest.mock('@/lib/knowledge/flags', () => ({
  isRagEnabled: jest.fn(() => true),
}));

jest.mock('@/lib/db', () => ({
  getDb: jest.fn(() => ({
    prepare: jest.fn(() => ({
      all: jest.fn(() => []),
    })),
  })),
}));

const { searchVec0 } = require('@/lib/knowledge/embeddings/retriever-sqlite') as typeof import('@/lib/knowledge/embeddings/retriever-sqlite');

describe('retriever-sqlite BIMCO allowlist (D8)', () => {
  const embedding = new Float32Array(768).fill(0);

  it('searchVec0 with bimco_vec does not throw Invalid table name', () => {
    expect(() => searchVec0(embedding, 'bimco_vec', 5)).not.toThrow();
  });

  it('searchVec0 with bimco_vec returns an array', () => {
    const results = searchVec0(embedding, 'bimco_vec', 5);
    expect(Array.isArray(results)).toBe(true);
  });

  it('searchVec0 with unknown table still throws Invalid table name', () => {
    expect(() => searchVec0(embedding, 'unknown_vec', 5)).toThrow('Invalid table name');
  });
});

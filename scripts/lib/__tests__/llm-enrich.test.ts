import { enrichPortsBatch } from '../llm-enrich';
import type { SkeletonPort } from '../match-targets';

// Mock at the module paths used in llm-enrich.ts
jest.mock('../../../lib/openai', () => ({
  callAiJson: jest.fn(),
}));
jest.mock('../../../lib/constants', () => ({
  AI_MODEL_LIGHT: 'gpt-test-mini',
}));

// We import after mocking so the mock is in place
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { callAiJson } = require('../../../lib/openai') as { callAiJson: jest.Mock };

const SKELETON_ROTTERDAM: SkeletonPort = {
  unlocode: 'NLRTM',
  name: 'Rotterdam',
  country: 'NL',
  lat: 51.95,
  lon: 4.14,
};

const SKELETON_NO_COORDS: SkeletonPort = {
  unlocode: 'GBFXT',
  name: 'Felixstowe',
  country: 'GB',
  lat: null,
  lon: null,
};

const LLM_RESPONSE_ROTTERDAM = {
  unlocode: 'NLRTM',
  maxDraftM: 24.0,
  hasShoreCranes: true,
  berthType: 'deep-sea' as const,
  maxLOA: 400,
  cargoBerthTypes: ['container', 'bulk', 'general', 'RORO', 'tanker'],
  tidal: true,
  icePort: false,
  dataConfidence: 'high' as const,
  sourceNote: 'Port of Rotterdam Authority 2024',
};

const LLM_RESPONSE_FELIXSTOWE = {
  unlocode: 'GBFXT',
  maxDraftM: 16.0,
  hasShoreCranes: true,
  berthType: 'deep-sea' as const,
  maxLOA: 366,
  cargoBerthTypes: ['container'],
  tidal: false,
  icePort: false,
  dataConfidence: 'high' as const,
  sourceNote: 'ABP Felixstowe 2024',
  lat: 51.96,
  lon: 1.35,
};

describe('enrichPortsBatch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns enriched ports in same order as input', async () => {
    callAiJson.mockResolvedValue([LLM_RESPONSE_ROTTERDAM]);
    const out = await enrichPortsBatch([SKELETON_ROTTERDAM]);
    expect(out).toHaveLength(1);
    expect(out[0].unlocode).toBe('NLRTM');
    expect(out[0].maxDraftM).toBe(24.0);
    expect(out[0].hasShoreCranes).toBe(true);
    expect(out[0].berthType).toBe('deep-sea');
    expect(out[0].cargoBerthTypes).toContain('container');
    expect(out[0].dataConfidence).toBe('high');
    expect(out[0].sourceNote).toBe('Port of Rotterdam Authority 2024');
  });

  it('preserves lat/lon from skeleton when LLM response omits them', async () => {
    callAiJson.mockResolvedValue([LLM_RESPONSE_ROTTERDAM]);
    const out = await enrichPortsBatch([SKELETON_ROTTERDAM]);
    expect(out[0].lat).toBe(51.95);
    expect(out[0].lon).toBe(4.14);
  });

  it('accepts LLM-provided lat/lon for ports with null coords', async () => {
    callAiJson.mockResolvedValue([LLM_RESPONSE_FELIXSTOWE]);
    const out = await enrichPortsBatch([SKELETON_NO_COORDS]);
    expect(out[0].lat).toBe(51.96);
    expect(out[0].lon).toBe(1.35);
  });

  it('falls back to low-confidence stub when LLM returns null', async () => {
    callAiJson.mockResolvedValue(null);
    const out = await enrichPortsBatch([SKELETON_ROTTERDAM]);
    expect(out).toHaveLength(1);
    expect(out[0].unlocode).toBe('NLRTM');
    expect(out[0].dataConfidence).toBe('low');
    expect(out[0].maxDraftM).toBe(10);
    expect(out[0].hasShoreCranes).toBe(false);
    expect(out[0].lat).toBe(51.95);  // skeleton coords preserved
  });

  it('falls back per-port when LLM returns partial array (less items)', async () => {
    callAiJson.mockResolvedValue([LLM_RESPONSE_ROTTERDAM]);  // only 1, input has 2
    const out = await enrichPortsBatch([SKELETON_ROTTERDAM, SKELETON_NO_COORDS]);
    expect(out).toHaveLength(2);
    expect(out[0].dataConfidence).toBe('high');   // got LLM result
    expect(out[1].dataConfidence).toBe('low');    // fell back
  });

  it('falls back per-port when LLM returns wrong unlocode order', async () => {
    // LLM returned them in wrong order — match by unlocode
    callAiJson.mockResolvedValue([LLM_RESPONSE_FELIXSTOWE, LLM_RESPONSE_ROTTERDAM]);
    const out = await enrichPortsBatch([SKELETON_ROTTERDAM, SKELETON_NO_COORDS]);
    expect(out[0].unlocode).toBe('NLRTM');
    expect(out[0].maxDraftM).toBe(24.0);
    expect(out[1].unlocode).toBe('GBFXT');
    expect(out[1].maxDraftM).toBe(16.0);
  });

  it('batches ports per LLM call (BATCH_SIZE=10)', async () => {
    const bigInput: SkeletonPort[] = Array.from({ length: 25 }, (_, i) => ({
      unlocode: `XX${String(i).padStart(3, '0')}`,
      name: `Port${i}`,
      country: 'XX',
      lat: i * 1.0,
      lon: i * 1.0,
    }));
    callAiJson.mockResolvedValue([]);  // empty = all fall back, but we just count calls
    await enrichPortsBatch(bigInput);
    // 25 ports → 3 batches: 10 + 10 + 5
    expect(callAiJson).toHaveBeenCalledTimes(3);
  });

  it('uses AI_MODEL_LIGHT (not heavy)', async () => {
    callAiJson.mockResolvedValue([LLM_RESPONSE_ROTTERDAM]);
    await enrichPortsBatch([SKELETON_ROTTERDAM]);
    expect(callAiJson).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      'gpt-test-mini',
      null,   // fallback
      2000,   // maxTokens (capped to avoid reasoning-token burn)
    );
  });

  it('all required PortMaster fields present in output', async () => {
    callAiJson.mockResolvedValue([LLM_RESPONSE_ROTTERDAM]);
    const out = await enrichPortsBatch([SKELETON_ROTTERDAM]);
    const p = out[0];
    expect(typeof p.unlocode).toBe('string');
    expect(typeof p.name).toBe('string');
    expect(typeof p.country).toBe('string');
    expect(typeof p.lat).toBe('number');
    expect(typeof p.lon).toBe('number');
    expect(typeof p.maxDraftM).toBe('number');
    expect(typeof p.hasShoreCranes).toBe('boolean');
    expect(['river', 'deep-sea', 'bay', 'terminal']).toContain(p.berthType);
  });
});

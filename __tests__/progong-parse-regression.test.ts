/**
 * Progong regression tests — /progong R16 exit snapshot (2026-05-28)
 *
 * Tests for code-level post-processing fallbacks (B1–B8) in
 * lib/parsing/geared-fallback.ts, generated after the progong loop reached
 * 2× consecutive PASS on rounds 15–16 (11/11 cases each round).
 *
 * These tests protect against regressions in the code-level fixes that
 * compensate for known Gemini provider artefacts (A1–A9 in .progong/gemini-quirks.md).
 * They run without any LLM API calls.
 */

import { applyGearedFallback } from '@/lib/parsing/geared-fallback';
import type { ParsedVessel } from '@/lib/types';

// ── helpers ──────────────────────────────────────────────────────────────────

function vessel(overrides: Partial<ParsedVessel> = {}): ParsedVessel {
  return {
    emailId: 'test',
    itemIndex: 0,
    vesselName: { value: 'TEST VESSEL', confidence: 'confirmed', sourceText: 'TEST VESSEL' },
    imo: null,
    flag: null,
    built: null,
    classSociety: null,
    pandi: null,
    dwtSummer: null,
    dwcc: null,
    draftMax: null,
    loa: null,
    beam: null,
    grt: null,
    nrt: null,
    holdsCount: null,
    hatchesCount: null,
    grainCapacity: null,
    grainCapacityUnit: null,
    baleCapacity: null,
    holdDimensions: null,
    hatchDimensions: null,
    tankTopStrength: null,
    geared: null,
    craneCapacity: null,
    hatchType: null,
    vesselType: null,
    openPosition: null,
    openDate: null,
    direction: null,
    restrictions: [],
    lastCargoes: null,
    speedLaden: null,
    speedBallast: null,
    consumption: null,
    deckCapacity: null,
    specialFeatures: [],
    ...overrides,
  };
}

// ── B1: Geared correction ────────────────────────────────────────────────────

describe('B1 — geared=true overridden to false when "Gearless" in email fragment', () => {
  it('corrects geared=true to false when vessel spec block contains "Gearless"', () => {
    const v = vessel({ geared: true });
    // "Gearless" spelled out — B1 guard. Note: "GLESS" abbreviation is handled
    // by the LLM itself (it sets geared=false directly); B1 only fires on the
    // full "gearless" / "Gearless" word (e.g. pipe-compact multi-vessel emails).
    const body =
      'HC EVA-MARIE\ntwn, 2x80/160mt, 3700 sqm\nGearless vessel type\n11,000 DWT\n';
    const [result] = applyGearedFallback([v], body);
    expect(result.geared).toBe(false);
  });

  it('does NOT override geared=true when "Gearless" is absent', () => {
    const v = vessel({ geared: true });
    const body = 'PANTHERA J\ntwn, 2x150/300mt, 2900sqm\n7,000 DWT\nIMO 1, 9600cbm\n';
    const [result] = applyGearedFallback([v], body);
    expect(result.geared).toBe(true);
  });

  it('corrects geared=true even when "Gearless" is far from vessel name (1000-char window)', () => {
    const longPrefix = 'some text '.repeat(40); // 400 chars
    const body = `TEST VESSEL\n${longPrefix}Gearless vessel spec\n`;
    const v = vessel({ geared: true });
    const [result] = applyGearedFallback([v], body);
    expect(result.geared).toBe(false);
  });

  it('does not change geared=false', () => {
    const v = vessel({ geared: false });
    const body = 'MV STAD\nAPP B FITTED, GLESS\n';
    const [result] = applyGearedFallback([v], body);
    expect(result.geared).toBe(false);
  });
});

// ── B2: grainCapacityUnit normalization ──────────────────────────────────────

describe('B2 — grainCapacityUnit lowercased', () => {
  it('converts "CBM" to "cbm"', () => {
    const v = vessel({ grainCapacityUnit: 'CBM' as 'cbm' });
    const [result] = applyGearedFallback([v], '');
    expect(result.grainCapacityUnit).toBe('cbm');
  });

  it('converts "CBFT" to "cbft"', () => {
    const v = vessel({ grainCapacityUnit: 'CBFT' as 'cbft' });
    const [result] = applyGearedFallback([v], '');
    expect(result.grainCapacityUnit).toBe('cbft');
  });

  it('leaves "cbm" unchanged', () => {
    const v = vessel({ grainCapacityUnit: 'cbm' });
    const [result] = applyGearedFallback([v], '');
    expect(result.grainCapacityUnit).toBe('cbm');
  });
});

// ── B3: openDate spot detection ──────────────────────────────────────────────

describe('B3 — openDate set to "spot" when sourceText contains spot/prompt', () => {
  it('sets openDate.value to "spot" when sourceText contains "spot"', () => {
    const v = vessel({
      openDate: {
        value: '2025-08-05',
        confidence: 'confirmed',
        sourceText: 'spot marmara',
      } as ParsedVessel['openDate'],
    });
    const [result] = applyGearedFallback([v], '');
    expect(result.openDate?.value).toBe('spot');
    expect(result.openDate?.confidence).toBe('interpreted');
  });

  it('sets openDate.value to "spot" when vessel fragment contains "prompt"', () => {
    const v = vessel({
      openDate: {
        value: '2025-09-10',
        confidence: 'confirmed',
        sourceText: '',
      } as ParsedVessel['openDate'],
    });
    const body = 'TEST VESSEL\nPPT Onwards\nDely WAfr intn Dakar\nprompt\n';
    const [result] = applyGearedFallback([v], body);
    expect(result.openDate?.value).toBe('spot');
  });

  it('does not modify openDate when already "spot"', () => {
    const v = vessel({
      openDate: {
        value: 'spot',
        confidence: 'interpreted',
        sourceText: 'spot marmara',
      } as ParsedVessel['openDate'],
    });
    const [result] = applyGearedFallback([v], '');
    expect(result.openDate?.value).toBe('spot');
  });

  it('truncates sourceText to 120 chars', () => {
    const longSource = 'spot '.repeat(50); // 250 chars
    const v = vessel({
      openDate: {
        value: '2025-06-01',
        confidence: 'confirmed',
        sourceText: longSource,
      } as ParsedVessel['openDate'],
    });
    const [result] = applyGearedFallback([v], '');
    expect(result.openDate!.sourceText!.length).toBeLessThanOrEqual(120);
  });
});

// ── B4: IMDG/App B annotation ────────────────────────────────────────────────

describe('B4 — IMDG Class annotation added from email body', () => {
  it('adds "IMDG Class 1.1 certified" when "imo 1.1" in body', () => {
    const v = vessel();
    const body = 'mv haskal\nSuitable for imo 1.1 cargoes\ndwt 2570 mts\n';
    const [result] = applyGearedFallback([v], body);
    expect(result.specialFeatures).toContain('IMDG Class 1.1 certified');
  });

  it('adds "IMDG Class 1 certified" when integer "imo 1" in body (no decimal)', () => {
    const v = vessel();
    const body = 'PANTHERA J\nIMO 1, 9600cbm, 13 knts\n';
    const [result] = applyGearedFallback([v], body);
    expect(result.specialFeatures).toContain('IMDG Class 1 certified');
  });

  it('adds "Appendix B fitted" when "App B" in body', () => {
    const v = vessel();
    const body = 'MV STAD\nAPP B FITTED, GLESS\n';
    const [result] = applyGearedFallback([v], body);
    expect(result.specialFeatures).toContain('Appendix B fitted');
  });

  it('does not duplicate existing annotation', () => {
    const v = vessel({ specialFeatures: ['IMDG Class 1.1 certified'] });
    const body = 'mv haskal\nSuitable for imo 1.1 cargoes\n';
    const [result] = applyGearedFallback([v], body);
    expect(result.specialFeatures.filter(f => f === 'IMDG Class 1.1 certified')).toHaveLength(1);
  });

  it('adds both IMDG 1.1 and App B when both present', () => {
    const v = vessel();
    const body = 'MV NORTHSTAR GLORY\nIMO 1.1 & App B Fitted\n';
    const [result] = applyGearedFallback([v], body);
    expect(result.specialFeatures).toContain('IMDG Class 1.1 certified');
    expect(result.specialFeatures).toContain('Appendix B fitted');
  });
});

// ── B5: BOX/SID hold geometry annotation ─────────────────────────────────────

describe('B5 — BOX/SID hold geometry annotation', () => {
  it('adds "SID box-shaped hold" when "SID" and "BOX" both present', () => {
    const v = vessel();
    const body = 'MV STAD\nSID, BOX, 1989 BLT\n1 HO/HA BOX\n';
    const [result] = applyGearedFallback([v], body);
    expect(result.specialFeatures).toContain('SID box-shaped hold');
  });

  it('adds "box-shaped single hold" when "box shaped 1 single hold" in body', () => {
    const v = vessel();
    const body = 'mv haskal\nbox shaped 1 single hold\ngrt/ nrt 1597 / 700\n';
    const [result] = applyGearedFallback([v], body);
    expect(result.specialFeatures).toContain('box-shaped single hold');
  });

  it('adds "box-shaped hold" for plain "box shaped" without "single"', () => {
    const v = vessel();
    const body = 'MV EXAMPLE\nbox shaped hold, double skin\n';
    const [result] = applyGearedFallback([v], body);
    expect(result.specialFeatures).toContain('box-shaped hold');
  });

  it('does not duplicate existing annotation', () => {
    const v = vessel({ specialFeatures: ['SID box-shaped hold'] });
    const body = 'MV STAD\nSID, BOX, 1989 BLT\n';
    const [result] = applyGearedFallback([v], body);
    expect(result.specialFeatures.filter(f => f === 'SID box-shaped hold')).toHaveLength(1);
  });
});

// ── B6: grain_capacity from combined grain/bale notation ─────────────────────

describe('B6 — grainCapacity copied from baleCapacity when "grain/bale" combined notation', () => {
  it('copies baleCapacity to grainCapacity when combined "grain/bale" notation in body', () => {
    const v = vessel({ grainCapacity: null, baleCapacity: 2851 });
    const body = 'mv haskal\nhold cap. grain/bale abt 100682 cbft\n';
    const [result] = applyGearedFallback([v], body);
    expect(result.grainCapacity).toBe(2851);
    expect(result.baleCapacity).toBe(2851);
  });

  it('does not overwrite existing grainCapacity', () => {
    const v = vessel({ grainCapacity: 3000, baleCapacity: 2950 });
    const body = 'mv example\ngrain/bale 3000/2950 CBM\n';
    const [result] = applyGearedFallback([v], body);
    expect(result.grainCapacity).toBe(3000);
  });

  it('does not copy when grain/bale notation absent', () => {
    const v = vessel({ grainCapacity: null, baleCapacity: 2851 });
    const body = 'mv haskal\nhold capacity 100682 cbft\n';
    const [result] = applyGearedFallback([v], body);
    expect(result.grainCapacity).toBeNull();
  });
});

// ── B7: Great Lakes/Seaway fitted annotation ─────────────────────────────────

describe('B7 — "Lakes" token → "Great Lakes/Seaway fitted" annotation', () => {
  it('adds annotation when "Lakes" in vessel spec block', () => {
    const v = vessel({
      vesselName: { value: 'O7 GAJA', confidence: 'confirmed', sourceText: 'O7 GAJA' },
    });
    const body =
      'O7 GAJA\ntwn, 2x240/480mt, 5000 sqm\nARA\n04 JUN\n12,215 DWT\nIMO 1, 18700 cbm, Lakes\nPC DIR BRAZIL\n';
    const [result] = applyGearedFallback([v], body);
    expect(result.specialFeatures).toContain('Great Lakes/Seaway fitted');
  });

  it('does not add annotation when "Lakes" is absent', () => {
    const v = vessel({
      vesselName: { value: 'PANTHERA J', confidence: 'confirmed', sourceText: 'PANTHERA J' },
    });
    const body =
      'PANTHERA J\ntwn, 2x150/300mt, 2900sqm\nCONTINENT\n01 JUN\n7,000 DWT\nIMO 1, 9600cbm, 13 knts\n';
    const [result] = applyGearedFallback([v], body);
    expect(result.specialFeatures).not.toContain('Great Lakes/Seaway fitted');
  });

  it('does not duplicate when annotation already present', () => {
    const v = vessel({
      vesselName: { value: 'O7 GAJA', confidence: 'confirmed', sourceText: 'O7 GAJA' },
      specialFeatures: ['Great Lakes/Seaway fitted'],
    });
    const body = 'O7 GAJA\nIMO 1, 18700 cbm, Lakes\n';
    const [result] = applyGearedFallback([v], body);
    expect(result.specialFeatures.filter(f => f === 'Great Lakes/Seaway fitted')).toHaveLength(1);
  });

  it('skips B7 when vesselName is null (harness snake_case objects)', () => {
    const v = vessel({ vesselName: null });
    const body = 'some vessel\nLakes\n';
    const [result] = applyGearedFallback([v], body);
    expect(result.specialFeatures).not.toContain('Great Lakes/Seaway fitted');
  });
});

// ── B8: BOX/SID bale_capacity = grain_capacity ───────────────────────────────

describe('B8 — baleCapacity = grainCapacity for BOX/SID holds (flat floor)', () => {
  it('sets baleCapacity=grainCapacity when BOX hold and baleCapacity is null', () => {
    const v = vessel({ grainCapacity: 3963, baleCapacity: null });
    const body = 'MV STAD\nSID, BOX, 1989 BLT\n1 HO/HA BOX\n';
    const [result] = applyGearedFallback([v], body);
    expect(result.baleCapacity).toBe(3963);
    expect(result.grainCapacity).toBe(3963);
  });

  it('sets baleCapacity=grainCapacity when "box shaped" hold and baleCapacity is null', () => {
    const v = vessel({ grainCapacity: 2851, baleCapacity: null });
    const body = 'mv haskal\nbox shaped 1 single hold\n';
    const [result] = applyGearedFallback([v], body);
    expect(result.baleCapacity).toBe(2851);
  });

  it('does not overwrite existing baleCapacity', () => {
    const v = vessel({ grainCapacity: 3000, baleCapacity: 2950 });
    const body = 'MV EXAMPLE\nSID, BOX, hold\n';
    const [result] = applyGearedFallback([v], body);
    expect(result.baleCapacity).toBe(2950);
  });

  it('does not set baleCapacity when grainCapacity is null', () => {
    const v = vessel({ grainCapacity: null, baleCapacity: null });
    const body = 'MV STAD\nSID, BOX\n';
    const [result] = applyGearedFallback([v], body);
    expect(result.baleCapacity).toBeNull();
  });
});

// ── Combined: MV STAD corpus case (EDGE_CASES/19d5df35aa2df825) ──────────────

describe('Corpus regression: MV STAD (SID BOX, GLESS, DM draft, App B)', () => {
  const STAD_EMAIL_FRAGMENT = `MV STAD
SID, BOX, 1989 BLT
DOUBLE SKINNED, STEEL FLOORED
DWT/DWCC 3222/3050 MT
VANUATU FLAG
LOA/BEAM/DRAFT/DM 89,21/12,5M/4,70/6,35M
1 HO/HA BOX, 1 BULKHEAD ,OPENHATCH
HO 63,00 X 10,05 X 6,17MTRS
GRAIN 140,000CBFT
GRT/NRT 1984/1056
IR CLASS, P & I LODESTAR
APP B FITTED, GLESS
BOWTHRUST YES`;

  it('geared=false is preserved (GLESS abbreviation — LLM sets this directly, B1 not needed)', () => {
    // The LLM parses "GLESS" as Gearless directly; B1 only guards the "Gearless"
    // full keyword in pipe-compact emails. geared=false input should pass through.
    const v = vessel({ geared: false });
    const [result] = applyGearedFallback([v], STAD_EMAIL_FRAGMENT);
    expect(result.geared).toBe(false);
  });

  it('adds Appendix B fitted', () => {
    const v = vessel();
    const [result] = applyGearedFallback([v], STAD_EMAIL_FRAGMENT);
    expect(result.specialFeatures).toContain('Appendix B fitted');
  });

  it('adds SID box-shaped hold', () => {
    const v = vessel();
    const [result] = applyGearedFallback([v], STAD_EMAIL_FRAGMENT);
    expect(result.specialFeatures).toContain('SID box-shaped hold');
  });

  it('sets baleCapacity=grainCapacity when grainCapacity populated and baleCapacity null (B8)', () => {
    const v = vessel({ grainCapacity: 3963, baleCapacity: null });
    const [result] = applyGearedFallback([v], STAD_EMAIL_FRAGMENT);
    expect(result.baleCapacity).toBe(3963);
  });
});

// ── Combined: MV HASKAL corpus case (VESSEL_POSITION/19d5e7406f50cc13) ───────

describe('Corpus regression: MV HASKAL (grain/bale combined, IMDG 1.1, box-shaped single hold)', () => {
  const HASKAL_EMAIL = `mv haskal imo:8605480
dwcc 2000 mts at 4.5 draft
dwt 2570 mts
built 1986
box shaped 1 single hold
grt/ nrt 1597 / 700
loa/b/ depth 82.45 m /11.3 m/5.40 m
hold hatc h dimms . 49,80m x 9,00m x 6,78m
hold cap. grain/bale abt 100682 cbft
Suitable for imo 1.1 cargoes`;

  it('adds IMDG Class 1.1 certified', () => {
    const v = vessel({ vesselName: { value: 'HASKAL', confidence: 'confirmed', sourceText: 'mv haskal' } });
    const [result] = applyGearedFallback([v], HASKAL_EMAIL);
    expect(result.specialFeatures).toContain('IMDG Class 1.1 certified');
  });

  it('adds box-shaped single hold', () => {
    const v = vessel({ vesselName: { value: 'HASKAL', confidence: 'confirmed', sourceText: 'mv haskal' } });
    const [result] = applyGearedFallback([v], HASKAL_EMAIL);
    expect(result.specialFeatures).toContain('box-shaped single hold');
  });

  it('copies baleCapacity to grainCapacity via B6 (grain/bale combined)', () => {
    const v = vessel({
      vesselName: { value: 'HASKAL', confidence: 'confirmed', sourceText: 'mv haskal' },
      grainCapacity: null,
      baleCapacity: 2851,
    });
    const [result] = applyGearedFallback([v], HASKAL_EMAIL);
    expect(result.grainCapacity).toBe(2851);
  });

  it('sets baleCapacity=grainCapacity via B8 (box-shaped hold)', () => {
    const v = vessel({
      vesselName: { value: 'HASKAL', confidence: 'confirmed', sourceText: 'mv haskal' },
      grainCapacity: 2851,
      baleCapacity: null,
    });
    const [result] = applyGearedFallback([v], HASKAL_EMAIL);
    expect(result.baleCapacity).toBe(2851);
  });
});

// ── Combined: O7 GAJA (Ocean7, Lakes annotation + IMDG 1) ────────────────────

describe('Corpus regression: O7 GAJA (IMDG Class 1, Great Lakes/Seaway fitted)', () => {
  const OCEAN7_EMAIL = `O7 GAJA
twn, 2x240/480mt, 5000 sqm

ARA
04 JUN

12,215 DWT
IMO 1, 18700 cbm, Lakes

PC DIR BRAZIL`;

  it('adds IMDG Class 1 certified (integer "IMO 1")', () => {
    const v = vessel({ vesselName: { value: 'O7 GAJA', confidence: 'confirmed', sourceText: 'O7 GAJA' } });
    const [result] = applyGearedFallback([v], OCEAN7_EMAIL);
    expect(result.specialFeatures).toContain('IMDG Class 1 certified');
  });

  it('adds Great Lakes/Seaway fitted (Lakes token)', () => {
    const v = vessel({ vesselName: { value: 'O7 GAJA', confidence: 'confirmed', sourceText: 'O7 GAJA' } });
    const [result] = applyGearedFallback([v], OCEAN7_EMAIL);
    expect(result.specialFeatures).toContain('Great Lakes/Seaway fitted');
  });

  it('does NOT add Great Lakes for adjacent non-Lakes vessel (PANTHERA J)', () => {
    const PANTHERA_BLOCK = `PANTHERA J
twn, 2x150/300mt, 2900sqm

CONTINENT
01 JUN

7,000 DWT
IMO 1, 9600cbm, 13 knts

ANY DIR WW`;
    const v = vessel({ vesselName: { value: 'PANTHERA J', confidence: 'confirmed', sourceText: 'PANTHERA J' } });
    const [result] = applyGearedFallback([v], PANTHERA_BLOCK);
    expect(result.specialFeatures).not.toContain('Great Lakes/Seaway fitted');
    expect(result.specialFeatures).toContain('IMDG Class 1 certified');
  });
});

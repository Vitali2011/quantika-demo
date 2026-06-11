/**
 * Behavioral tests for estimateLadenDraft.
 * Anchored cases derived by hand from the empirical formula:
 *   fullLoad = 0.4991 × DWT^0.2991
 *   laden    = fullLoad × (cargo/DWT)^0.3, ratio clamped to 1
 *   result   = Math.ceil(laden × 10) / 10   (conservative round-up)
 */
import { estimateLadenDraft, CLASS_TPC } from '../laden-draft';

describe('estimateLadenDraft — null guards', () => {
  it('null DWT → null', () => {
    expect(estimateLadenDraft(null, 50000)).toBeNull();
  });
  it('null cargo → null', () => {
    expect(estimateLadenDraft(58000, null)).toBeNull();
  });
  it('zero DWT → null', () => {
    expect(estimateLadenDraft(0, 50000)).toBeNull();
  });
  it('negative cargo → null', () => {
    expect(estimateLadenDraft(58000, -1000)).toBeNull();
  });
  it('non-finite DWT (Infinity) → null', () => {
    expect(estimateLadenDraft(Infinity, 50000)).toBeNull();
  });
});

describe('estimateLadenDraft — empirical formula anchors', () => {
  it('58k DWT + 52k t cargo → >= 12.5m (trips a 12.5m port limit)', () => {
    // Hand: fullLoad = 0.4991 × 58000^0.2991 ≈ 13.27m
    //       laden    = 13.27 × (52000/58000)^0.3 ≈ 12.84m → ceil → 12.9m
    // Vessel classified as supramax (58k ∈ [50k, 65k])
    const result = estimateLadenDraft(58000, 52000);
    expect(result).not.toBeNull();
    expect(result!.ladenDraftM).toBeGreaterThanOrEqual(12.5);
    expect(result!.ladenDraftM).toBeLessThanOrEqual(13.5);
    expect(result!.method).toBe('empirical');
    expect(result!.approximate).toBe(true);
    expect(result!.vesselClass).toBe('supramax');
  });

  it('75k DWT full load → 13–14.5m (Panamax, research §2 class table)', () => {
    // Hand: fullLoad = 0.4991 × 75000^0.2991 ≈ 14.33m → ceil → 14.4m
    const result = estimateLadenDraft(75000, 75000);
    expect(result).not.toBeNull();
    expect(result!.ladenDraftM).toBeGreaterThanOrEqual(13.0);
    expect(result!.ladenDraftM).toBeLessThanOrEqual(14.5);
    expect(result!.vesselClass).toBe('panamax');
  });

  it('30k DWT + 10k t (light partial load) → well below full-load draft', () => {
    // Hand: fullLoad ≈ 0.4991 × 30000^0.2991 ≈ 10.90m
    //       laden   ≈ 10.90 × (10000/30000)^0.3 ≈ 7.84m → ceil → 7.9m
    const full = estimateLadenDraft(30000, 30000)!;
    const partial = estimateLadenDraft(30000, 10000)!;
    expect(partial.ladenDraftM).toBeLessThan(full.ladenDraftM);
    expect(partial.ladenDraftM).toBeGreaterThan(0);
  });

  it('cargo > DWT → ratio clamped to 1 (same as full-load draft)', () => {
    const fullLoad = estimateLadenDraft(58000, 58000)!;
    const overLoad = estimateLadenDraft(58000, 70000)!;
    expect(overLoad.ladenDraftM).toBe(fullLoad.ladenDraftM);
  });

  it('approximate is always true', () => {
    const r = estimateLadenDraft(58000, 52000)!;
    expect(r.approximate).toBe(true as const);
  });
});

describe('estimateLadenDraft — TPC branch', () => {
  it('tpc supplied → method is "tpc", result is finite and positive', () => {
    const r = estimateLadenDraft(58000, 52000, 52);
    expect(r).not.toBeNull();
    expect(r!.method).toBe('tpc');
    expect(Number.isFinite(r!.ladenDraftM)).toBe(true);
    expect(r!.ladenDraftM).toBeGreaterThan(0);
  });

  it('null tpc falls back to empirical', () => {
    const r = estimateLadenDraft(58000, 52000, null);
    expect(r!.method).toBe('empirical');
  });
});

describe('estimateLadenDraft — class-TPC cross-check', () => {
  it('58k supramax empirical estimate within ±2m of class-TPC cross-check', () => {
    // Cross-check: supramax TPC ≈ 52 t/cm. Draft reduction from full-load = (DWT-cargo)/(TPC×100)
    // tpcEst = fullLoad - (58000-52000)/(52×100) ≈ 13.27 - 1.15 ≈ 12.12m
    // Empirical gives ~12.9m. Methods agree within maritime estimation tolerance.
    const empirical = estimateLadenDraft(58000, 52000)!;
    const classTpc = CLASS_TPC['supramax']; // 52 t/cm
    const fullLoadM = 0.4991 * Math.pow(58000, 0.2991);
    const tpcCrossCheck = fullLoadM - (58000 - 52000) / (classTpc * 100);
    expect(Math.abs(empirical.ladenDraftM - tpcCrossCheck)).toBeLessThan(2);
  });
});

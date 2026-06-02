import { estimateBunkerLift } from '@/lib/economics/bunker-lift';

describe('estimateBunkerLift', () => {
  describe('voyage days × consumption + reserve', () => {
    it('caboteur — small handysize, 1-day voyage, capacity not binding', () => {
      const r = estimateBunkerLift({
        dwt: 5000,
        dailyConsMtPerDay: 12,
        voyageDays: 1,
      });
      // (1 + 5 reserve) * 12 = 72 mt; cap = 5000*0.07 = 350 mt → not capped
      expect(r.liftTonnes).toBe(72);
      expect(r.capacityMt).toBe(350);
      expect(r.capped).toBe(false);
    });

    it('medium voyage — handysize 30000 DWT, 7 days, capacity not binding', () => {
      const r = estimateBunkerLift({
        dwt: 30000,
        dailyConsMtPerDay: 25,
        voyageDays: 7,
      });
      // (7 + 5) * 25 = 300 mt; cap = 2100 mt → not capped
      expect(r.liftTonnes).toBe(300);
      expect(r.capacityMt).toBe(2100);
      expect(r.capped).toBe(false);
    });
  });

  describe('DWT capacity cap (Bug 2)', () => {
    it('clamps lift to DWT × 0.07 when raw demand exceeds tank capacity', () => {
      const r = estimateBunkerLift({
        dwt: 10000,
        dailyConsMtPerDay: 30,
        voyageDays: 50, // unreal long voyage: (50+5)*30 = 1650 mt; cap = 700 mt
      });
      expect(r.liftTonnes).toBe(700);
      expect(r.capacityMt).toBe(700);
      expect(r.capped).toBe(true);
    });

    it('Bug 2 regression — 2720 mt cargo on handysize must not become bunker lift', () => {
      // Reproduces the founder's bug: 10000 DWT vessel carrying 2720 mt cargo
      // should NOT have lift > capacity (~700 mt).
      const r = estimateBunkerLift({
        dwt: 10000,
        dailyConsMtPerDay: 14,
        voyageDays: 5,
      });
      // raw = (5+5)*14 = 140 mt; cap = 700 mt → 140 mt, never 2720
      expect(r.liftTonnes).toBe(140);
      expect(r.liftTonnes).toBeLessThan(2720);
    });
  });

  describe('configurable reserve and cap ratio', () => {
    it('respects custom reserveDays', () => {
      const r = estimateBunkerLift({
        dwt: 5000,
        dailyConsMtPerDay: 10,
        voyageDays: 3,
        reserveDays: 2,
      });
      // (3 + 2) * 10 = 50 mt
      expect(r.liftTonnes).toBe(50);
    });

    it('respects custom capRatio', () => {
      const r = estimateBunkerLift({
        dwt: 10000,
        dailyConsMtPerDay: 100,
        voyageDays: 10,
        capRatio: 0.05,
      });
      // raw = (10+5)*100 = 1500 mt; cap = 10000*0.05 = 500 mt → capped
      expect(r.liftTonnes).toBe(500);
      expect(r.capacityMt).toBe(500);
      expect(r.capped).toBe(true);
    });
  });

  describe('missing/invalid inputs — conservative fallback', () => {
    it('returns conservative default when consumption is zero', () => {
      const r = estimateBunkerLift({
        dwt: 10000,
        dailyConsMtPerDay: 0,
        voyageDays: 5,
      });
      expect(r.liftTonnes).toBe(100);
      expect(r.capped).toBe(false);
    });

    it('returns conservative default when voyage days is zero', () => {
      const r = estimateBunkerLift({
        dwt: 10000,
        dailyConsMtPerDay: 12,
        voyageDays: 0,
      });
      expect(r.liftTonnes).toBe(100);
      expect(r.capped).toBe(false);
    });

    it('returns conservative default when both vessel and voyage data missing', () => {
      const r = estimateBunkerLift({
        dwt: 0,
        dailyConsMtPerDay: 0,
        voyageDays: 0,
      });
      expect(r.liftTonnes).toBe(100);
      expect(r.capacityMt).toBe(0);
    });

    it('handles unknown DWT (0) with no capacity cap', () => {
      const r = estimateBunkerLift({
        dwt: 0,
        dailyConsMtPerDay: 20,
        voyageDays: 4,
      });
      // (4+5)*20 = 180; no cap because dwt unknown
      expect(r.liftTonnes).toBe(180);
      expect(r.capacityMt).toBe(0);
      expect(r.capped).toBe(false);
    });

    it('rejects negative inputs as missing', () => {
      const r = estimateBunkerLift({
        dwt: -5000,
        dailyConsMtPerDay: -10,
        voyageDays: -1,
      });
      expect(r.liftTonnes).toBe(100);
    });
  });

  describe('rounding', () => {
    it('rounds liftTonnes up (ceil) to whole tonnes', () => {
      const r = estimateBunkerLift({
        dwt: 8000,
        dailyConsMtPerDay: 11.3,
        voyageDays: 2.5,
      });
      // (2.5+5)*11.3 = 84.75 → ceil → 85
      expect(r.liftTonnes).toBe(85);
    });

    it('rounds capacityMt down (floor) to whole tonnes', () => {
      const r = estimateBunkerLift({
        dwt: 4321,
        dailyConsMtPerDay: 10,
        voyageDays: 1,
      });
      // capacity = 4321*0.07 = 302.47 → floor → 302
      expect(r.capacityMt).toBe(302);
    });
  });
});

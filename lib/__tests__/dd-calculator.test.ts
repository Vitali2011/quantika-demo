import { calculateDemurrageDespatch } from '../laytime/dd-calculator';
import type { LaytimeResult, DemurrageDespatchInput } from '../types';

// Test fixtures
const DEMURRAGE_RESULT: LaytimeResult = {
  allowedLaytimeHours: 120,
  usedLaytimeHours: 144,
  demurrageOrDespatch: 'demurrage',
  netHours: 24,
  breakdown: [],
};

const DESPATCH_RESULT: LaytimeResult = {
  allowedLaytimeHours: 120,
  usedLaytimeHours: 96,
  demurrageOrDespatch: 'despatch',
  netHours: -24,
  breakdown: [],
};

const BALANCED_RESULT: LaytimeResult = {
  allowedLaytimeHours: 120,
  usedLaytimeHours: 120,
  demurrageOrDespatch: 'balanced',
  netHours: 0,
  breakdown: [],
};

describe('calculateDemurrageDespatch', () => {
  describe('basic demurrage/despatch calculation', () => {
    it('24h demurrage at $8000/day = $8000', () => {
      const result = calculateDemurrageDespatch({
        laytimeResult: DEMURRAGE_RESULT,
        demurrageRateUsdPerDay: 8000,
      });

      expect(result.status).toBe('demurrage');
      expect(result.netHours).toBe(24);
      expect(result.demurrageAmount).toBe(8000);
      expect(result.despatchAmount).toBe(0);
      expect(result.netAmount).toBe(8000);
      expect(result.breakdown.demurrageRate).toBe(8000);
      expect(result.breakdown.despatchRate).toBe(4000); // default = half
      expect(result.breakdown.demurrageHours).toBe(24);
      expect(result.breakdown.despatchHours).toBe(0);
    });

    it('24h despatch at $4000/day = $4000 earned', () => {
      const result = calculateDemurrageDespatch({
        laytimeResult: DESPATCH_RESULT,
        demurrageRateUsdPerDay: 8000,
        despatchRateUsdPerDay: 4000,
      });

      expect(result.status).toBe('despatch');
      expect(result.netHours).toBe(-24);
      expect(result.demurrageAmount).toBe(0);
      expect(result.despatchAmount).toBe(4000);
      expect(result.netAmount).toBe(-4000); // negative = you earn
      expect(result.breakdown.demurrageRate).toBe(8000);
      expect(result.breakdown.despatchRate).toBe(4000);
      expect(result.breakdown.demurrageHours).toBe(0);
      expect(result.breakdown.despatchHours).toBe(24);
    });

    it('balanced (netHours=0) → both amounts = 0', () => {
      const result = calculateDemurrageDespatch({
        laytimeResult: BALANCED_RESULT,
        demurrageRateUsdPerDay: 8000,
      });

      expect(result.status).toBe('balanced');
      expect(result.netHours).toBe(0);
      expect(result.demurrageAmount).toBe(0);
      expect(result.despatchAmount).toBe(0);
      expect(result.netAmount).toBe(0);
    });

    it('custom despatchRate overrides default', () => {
      const result = calculateDemurrageDespatch({
        laytimeResult: DESPATCH_RESULT,
        demurrageRateUsdPerDay: 10000,
        despatchRateUsdPerDay: 7000,
      });

      expect(result.breakdown.despatchRate).toBe(7000);
      expect(result.despatchAmount).toBe(7000); // 24h at $7000/day
    });

    it('default despatchRate = demurrageRate / 2', () => {
      const result = calculateDemurrageDespatch({
        laytimeResult: DESPATCH_RESULT,
        demurrageRateUsdPerDay: 10000,
      });

      expect(result.breakdown.despatchRate).toBe(5000);
      expect(result.despatchAmount).toBe(5000); // 24h at $5000/day
    });
  });

  describe('boundary tests - Input Contract coverage', () => {
    // Row 1: Empty/falsy laytimeResult
    it('throws on null laytimeResult', () => {
      expect(() =>
        calculateDemurrageDespatch({
          laytimeResult: null as any,
          demurrageRateUsdPerDay: 8000,
        })
      ).toThrow();
    });

    it('throws on undefined laytimeResult', () => {
      expect(() =>
        calculateDemurrageDespatch({
          laytimeResult: undefined as any,
          demurrageRateUsdPerDay: 8000,
        })
      ).toThrow();
    });

    // Row 2: Special floats (demurrageRate)
    it('throws RangeError on NaN demurrageRateUsdPerDay', () => {
      expect(() =>
        calculateDemurrageDespatch({
          laytimeResult: DEMURRAGE_RESULT,
          demurrageRateUsdPerDay: NaN,
        })
      ).toThrow(RangeError);
    });

    it('throws RangeError on +Infinity demurrageRateUsdPerDay', () => {
      expect(() =>
        calculateDemurrageDespatch({
          laytimeResult: DEMURRAGE_RESULT,
          demurrageRateUsdPerDay: Infinity,
        })
      ).toThrow(RangeError);
    });

    it('throws RangeError on -Infinity demurrageRateUsdPerDay', () => {
      expect(() =>
        calculateDemurrageDespatch({
          laytimeResult: DEMURRAGE_RESULT,
          demurrageRateUsdPerDay: -Infinity,
        })
      ).toThrow(RangeError);
    });

    // Row 3: Special floats (despatchRate)
    it('throws RangeError on NaN despatchRateUsdPerDay', () => {
      expect(() =>
        calculateDemurrageDespatch({
          laytimeResult: DESPATCH_RESULT,
          demurrageRateUsdPerDay: 8000,
          despatchRateUsdPerDay: NaN,
        })
      ).toThrow(RangeError);
    });

    it('throws RangeError on +Infinity despatchRateUsdPerDay', () => {
      expect(() =>
        calculateDemurrageDespatch({
          laytimeResult: DESPATCH_RESULT,
          demurrageRateUsdPerDay: 8000,
          despatchRateUsdPerDay: Infinity,
        })
      ).toThrow(RangeError);
    });

    // Row 4: Negative rates (edge case - accept, return negative amounts)
    it('accepts negative demurrageRateUsdPerDay and returns negative amounts', () => {
      const result = calculateDemurrageDespatch({
        laytimeResult: DEMURRAGE_RESULT,
        demurrageRateUsdPerDay: -100,
      });

      expect(result.demurrageAmount).toBe(-100);
      expect(result.netAmount).toBe(-100);
    });

    // Row 5: Negative despatchRate (edge case)
    it('accepts negative despatchRateUsdPerDay and returns negative amounts', () => {
      const result = calculateDemurrageDespatch({
        laytimeResult: DESPATCH_RESULT,
        demurrageRateUsdPerDay: 8000,
        despatchRateUsdPerDay: -50,
      });

      expect(result.despatchAmount).toBe(-50);
      expect(result.netAmount).toBe(50); // negative despatch = positive net
    });

    // Row 6: Zero rates
    it('demurrageRateUsdPerDay=0 → amounts = 0', () => {
      const result = calculateDemurrageDespatch({
        laytimeResult: DEMURRAGE_RESULT,
        demurrageRateUsdPerDay: 0,
      });

      expect(result.demurrageAmount).toBe(0);
      expect(result.despatchAmount).toBe(0);
      expect(result.netAmount).toBe(0);
    });

    // Row 7: despatchRateUsdPerDay=0
    it('despatchRateUsdPerDay=0: despatch amount = 0 even if hours saved', () => {
      const result = calculateDemurrageDespatch({
        laytimeResult: DESPATCH_RESULT,
        demurrageRateUsdPerDay: 8000,
        despatchRateUsdPerDay: 0,
      });

      expect(result.despatchAmount).toBe(0);
      expect(result.netAmount).toBe(0);
    });

    // Row 8: Very large netHours
    it('very large netHours: no overflow in USD calculation', () => {
      const largeHoursResult: LaytimeResult = {
        ...DEMURRAGE_RESULT,
        netHours: 1e10,
      };

      const result = calculateDemurrageDespatch({
        laytimeResult: largeHoursResult,
        demurrageRateUsdPerDay: 8000,
      });

      expect(result.demurrageAmount).toBeGreaterThan(0);
      expect(Number.isFinite(result.demurrageAmount)).toBe(true);
      expect(result.demurrageAmount).toBeCloseTo((1e10 / 24) * 8000);
    });

    // Row 9: netHours special floats
    it('throws Error on NaN netHours in laytimeResult', () => {
      const invalidResult: LaytimeResult = {
        ...DEMURRAGE_RESULT,
        netHours: NaN,
      };

      expect(() =>
        calculateDemurrageDespatch({
          laytimeResult: invalidResult,
          demurrageRateUsdPerDay: 8000,
        })
      ).toThrow(Error);
    });

    it('throws Error on Infinity netHours in laytimeResult', () => {
      const invalidResult: LaytimeResult = {
        ...DEMURRAGE_RESULT,
        netHours: Infinity,
      };

      expect(() =>
        calculateDemurrageDespatch({
          laytimeResult: invalidResult,
          demurrageRateUsdPerDay: 8000,
        })
      ).toThrow(Error);
    });
  });

  describe('magnitude assertions', () => {
    it('demurrageAmount is always >= 0 for positive rates and positive netHours', () => {
      const result = calculateDemurrageDespatch({
        laytimeResult: DEMURRAGE_RESULT,
        demurrageRateUsdPerDay: 8000,
      });

      expect(result.demurrageAmount).toBeGreaterThanOrEqual(0);
    });

    it('despatchAmount is always >= 0 for positive rates and negative netHours', () => {
      const result = calculateDemurrageDespatch({
        laytimeResult: DESPATCH_RESULT,
        demurrageRateUsdPerDay: 8000,
      });

      expect(result.despatchAmount).toBeGreaterThanOrEqual(0);
    });

    it('netAmount is positive when demurrage is payable', () => {
      const result = calculateDemurrageDespatch({
        laytimeResult: DEMURRAGE_RESULT,
        demurrageRateUsdPerDay: 8000,
      });

      expect(result.netAmount).toBeGreaterThan(0);
    });

    it('netAmount is negative when despatch is earned', () => {
      const result = calculateDemurrageDespatch({
        laytimeResult: DESPATCH_RESULT,
        demurrageRateUsdPerDay: 8000,
      });

      expect(result.netAmount).toBeLessThan(0);
    });
  });
});

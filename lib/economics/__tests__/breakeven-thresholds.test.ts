import { breakevenTceByDwt } from '../breakeven-thresholds';

describe('breakevenTceByDwt', () => {
  describe('≤15000 DWT class', () => {
    test('dwt=5000 returns 1500', () => {
      expect(breakevenTceByDwt(5000)).toBe(1500);
    });

    test('dwt=15000 (boundary) returns 1500', () => {
      expect(breakevenTceByDwt(15000)).toBe(1500);
    });
  });

  describe('≤40000 DWT class', () => {
    test('dwt=15001 (just above boundary) returns 3000', () => {
      expect(breakevenTceByDwt(15001)).toBe(3000);
    });

    test('dwt=30000 returns 3000', () => {
      expect(breakevenTceByDwt(30000)).toBe(3000);
    });

    test('dwt=40000 (boundary) returns 3000', () => {
      expect(breakevenTceByDwt(40000)).toBe(3000);
    });
  });

  describe('≤65000 DWT class', () => {
    test('dwt=40001 (just above boundary) returns 5500', () => {
      expect(breakevenTceByDwt(40001)).toBe(5500);
    });

    test('dwt=55000 returns 5500', () => {
      expect(breakevenTceByDwt(55000)).toBe(5500);
    });

    test('dwt=65000 (boundary) returns 5500', () => {
      expect(breakevenTceByDwt(65000)).toBe(5500);
    });
  });

  describe('>65000 DWT class', () => {
    test('dwt=65001 (just above boundary) returns 7500', () => {
      expect(breakevenTceByDwt(65001)).toBe(7500);
    });

    test('dwt=75000 returns 7500', () => {
      expect(breakevenTceByDwt(75000)).toBe(7500);
    });
  });
});

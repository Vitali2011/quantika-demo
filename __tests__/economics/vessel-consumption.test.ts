import { consFromDwt, resolveConsMtPerDay } from '@/lib/economics/vessel-consumption';

describe('consFromDwt', () => {
  it('0 DWT → 28 (Supramax fallback)', () => expect(consFromDwt(0)).toBe(28));
  it('3200 DWT → 6 (coaster)', () => expect(consFromDwt(3_200)).toBe(6));
  it('5000 DWT → 6 (coaster upper edge)', () => expect(consFromDwt(5_000)).toBe(6));
  it('7500 DWT → 10 (small general)', () => expect(consFromDwt(7_500)).toBe(10));
  it('35000 DWT → 18 (handysize upper)', () => expect(consFromDwt(35_000)).toBe(18));
  it('50000 DWT → 28 (supramax mid)', () => expect(consFromDwt(50_000)).toBe(28));
  it('85000 DWT → 33 (panamax upper)', () => expect(consFromDwt(85_000)).toBe(33));
  it('100000 DWT → 40 (capesize)', () => expect(consFromDwt(100_000)).toBe(40));
  it('negative DWT → 28 (treated as unknown)', () => expect(consFromDwt(-100)).toBe(28));
});

describe('resolveConsMtPerDay', () => {
  it('stored=0, dwt=3200 → 6 (missing data → DWT curve)', () => {
    expect(resolveConsMtPerDay(0, 3_200)).toBe(6);
  });

  it('stored=-1, dwt=3200 → 6 (negative treated as missing)', () => {
    expect(resolveConsMtPerDay(-1, 3_200)).toBe(6);
  });

  it('SEAGULL 78: stored=22, dwt=3200 → 6 (22 > 6×1.8=10.8, clamped)', () => {
    expect(resolveConsMtPerDay(22, 3_200)).toBe(6);
  });

  it('stored=11, dwt=3200 → 6 (11 > 10.8, clamped)', () => {
    expect(resolveConsMtPerDay(11, 3_200)).toBe(6);
  });

  it('stored=10.8, dwt=3200 → 10.8 (exactly at threshold, not clamped)', () => {
    expect(resolveConsMtPerDay(10.8, 3_200)).toBe(10.8);
  });

  it('stored=10, dwt=3200 → 10 (plausible, not clamped)', () => {
    expect(resolveConsMtPerDay(10, 3_200)).toBe(10);
  });

  it('stored=6, dwt=3200 → 6 (exactly class estimate, not clamped)', () => {
    expect(resolveConsMtPerDay(6, 3_200)).toBe(6);
  });

  it('stored=30, dwt=52000 → 30 (supramax, plausible, not clamped)', () => {
    expect(resolveConsMtPerDay(30, 52_000)).toBe(30);
  });

  it('stored=55, dwt=52000 → 28 (55 > 28×1.8=50.4, clamped)', () => {
    expect(resolveConsMtPerDay(55, 52_000)).toBe(28);
  });

  it('stored=0, dwt=0 → 28 (both unknown → Supramax fallback)', () => {
    expect(resolveConsMtPerDay(0, 0)).toBe(28);
  });

  it('stored=26, dwt=56000 → 26 (normal supramax, not clamped)', () => {
    expect(resolveConsMtPerDay(26, 56_000)).toBe(26);
  });
});

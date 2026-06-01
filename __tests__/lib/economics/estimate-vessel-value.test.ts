import { estimateVesselValueUsd } from '@/lib/economics/vessel-value';

describe('estimateVesselValueUsd', () => {
  test('returns fallback 22M for zero DWT', () => {
    expect(estimateVesselValueUsd(0)).toBe(22_000_000);
  });

  test('Handysize 28 000 DWT → 280 $/dwt', () => {
    expect(estimateVesselValueUsd(28_000)).toBe(28_000 * 280);
  });

  test('Supramax 56 000 DWT → 260 $/dwt', () => {
    expect(estimateVesselValueUsd(56_000)).toBe(56_000 * 260);
  });

  test('Panamax 76 000 DWT → 220 $/dwt', () => {
    expect(estimateVesselValueUsd(76_000)).toBe(76_000 * 220);
  });

  test('Capesize 180 000 DWT → 180 $/dwt', () => {
    expect(estimateVesselValueUsd(180_000)).toBe(180_000 * 180);
  });

  test('boundary: exactly 40 000 DWT is Supramax tier (260 $/dwt)', () => {
    expect(estimateVesselValueUsd(40_000)).toBe(40_000 * 260);
  });

  test('boundary: exactly 65 000 DWT is Panamax tier (220 $/dwt)', () => {
    expect(estimateVesselValueUsd(65_000)).toBe(65_000 * 220);
  });

  test('returns a whole number (no fractional USD)', () => {
    expect(Number.isInteger(estimateVesselValueUsd(37_500))).toBe(true);
  });
});

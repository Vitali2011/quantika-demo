import { haversineDistanceNm } from '../haversine';

describe('haversineDistanceNm', () => {
  it('Rotterdam → Hamburg great-circle ~230 NM', () => {
    // Real sea distance is ~310 NM (around Denmark); great-circle (straight)
    // is shorter because it cuts across land.
    const nm = haversineDistanceNm(51.95, 4.14, 53.55, 9.95);
    expect(nm).toBeGreaterThan(200);
    expect(nm).toBeLessThan(260);
  });

  it('Istanbul → Karasu great-circle ~80 NM', () => {
    // Hardcoded sea distance is 95 NM (routed via Bosphorus). Great-circle
    // across Black Sea is shorter.
    const nm = haversineDistanceNm(41.02, 28.97, 41.11, 30.68);
    expect(nm).toBeGreaterThan(70);
    expect(nm).toBeLessThan(95);
  });

  it('Singapore → Rotterdam (long-haul, very approximate) ~5800-6300 NM straight', () => {
    // Real sea distance around Africa or via Suez is 8000-11000 NM.
    // Great-circle through land is much shorter — useful as a sanity check.
    const nm = haversineDistanceNm(1.29, 103.85, 51.95, 4.14);
    expect(nm).toBeGreaterThan(5500);
    expect(nm).toBeLessThan(6500);
  });

  it('same point → 0', () => {
    expect(haversineDistanceNm(51.95, 4.14, 51.95, 4.14)).toBe(0);
  });

  it('returns integer NM (rounded)', () => {
    const nm = haversineDistanceNm(0, 0, 1, 1);
    expect(Number.isInteger(nm)).toBe(true);
  });

  it('handles antipodal pair without NaN (~half earth circumference)', () => {
    const nm = haversineDistanceNm(0, 0, 0, 180);
    // Earth circumference at equator ~21600 NM, half = ~10800 NM.
    expect(nm).toBeGreaterThan(10500);
    expect(nm).toBeLessThan(11000);
  });

  it('symmetric (a→b == b→a)', () => {
    const ab = haversineDistanceNm(51.95, 4.14, 30.0, 32.0);
    const ba = haversineDistanceNm(30.0, 32.0, 51.95, 4.14);
    expect(ab).toBe(ba);
  });

  it('cross-equator (Mumbai → Cape Town) ~4400 NM straight', () => {
    const nm = haversineDistanceNm(18.94, 72.84, -33.92, 18.42);
    expect(nm).toBeGreaterThan(4200);
    expect(nm).toBeLessThan(4700);
  });

  it('cross-meridian (Anchorage → Vladivostok across the date line) ~2900 NM', () => {
    const nm = haversineDistanceNm(61.22, -149.9, 43.12, 131.9);
    expect(nm).toBeGreaterThan(2700);
    expect(nm).toBeLessThan(3200);
  });
});

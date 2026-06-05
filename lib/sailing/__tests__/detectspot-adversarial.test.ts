import { detectSpot } from '../readiness-gap';

describe('detectSpot adversarial probes', () => {
  // Regression: spec shapes
  it('spec: spot alone → true', () => expect(detectSpot('spot')).toBe(true));
  it('spec: prompt alone → true', () => expect(detectSpot('prompt')).toBe(true));
  it('spec: promt alone → true', () => expect(detectSpot('promt')).toBe(true));
  it('spec: ISO date alone → false', () => expect(detectSpot('2026-06-03')).toBe(false));
  it('spec: spot+ISO → false', () => expect(detectSpot('spot 2026-06-03')).toBe(false));
  it('spec: ISO+prompt → false', () => expect(detectSpot('2026-07-04 prompt')).toBe(false));
  it('spec: null → false', () => expect(detectSpot(null)).toBe(false));
  it('spec: empty → false', () => expect(detectSpot('')).toBe(false));

  // Adversarial: case variants
  it('UPPER: SPOT 2026-06-03 → false', () => expect(detectSpot('SPOT 2026-06-03')).toBe(false));
  it('mixed: Spot 2026-06-03 → false', () => expect(detectSpot('Spot 2026-06-03')).toBe(false));
  it('PROMT+ISO → false', () => expect(detectSpot('PROMT 2026-06-03')).toBe(false));

  // Adversarial: keyword + various date formats
  it('spot + day+month → false', () => expect(detectSpot('spot 5 Sep')).toBe(false));
  it('spot + DD.MM.YY → false', () => expect(detectSpot('spot 05.06.26')).toBe(false));
  it('spot + DD-MM-YYYY → false', () => expect(detectSpot('spot 05-06-2026')).toBe(false));
  it('prompt + beg+month → false', () => expect(detectSpot('prompt beg July')).toBe(false));
  it('spot today → false (today is parseable)', () => expect(detectSpot('spot today')).toBe(false));
  it('newline: spot\\n2026-06-03 → false', () => expect(detectSpot('spot\n2026-06-03')).toBe(false));
  it('spot + prompt + ISO → false', () => expect(detectSpot('spot prompt 2026-06-03')).toBe(false));

  // Adversarial: keyword present but no parseable date → still spot
  it('spot + port name only → true', () => expect(detectSpot('spot karasu')).toBe(true));
  it('spot + year only → true', () => expect(detectSpot('spot 2026')).toBe(true));
  it('spot! → true', () => expect(detectSpot('spot!')).toBe(true));
  it('spot + duplicate spot → true', () => expect(detectSpot('spot spot')).toBe(true));
  it('Open: Karasu, SPOT → true', () => expect(detectSpot('Open: Karasu, SPOT')).toBe(true));
  it('SPOT Constanta → true (port, no date)', () => expect(detectSpot('SPOT Constanta')).toBe(true));
  it('whitespace only after strip → true', () => expect(detectSpot('  spot   ')).toBe(true));
});

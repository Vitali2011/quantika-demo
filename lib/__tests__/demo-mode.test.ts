import { isDemoMode } from '../demo-mode';

describe('isDemoMode', () => {
  const ORIGINAL = process.env.DEMO_MODE;
  afterEach(() => { process.env.DEMO_MODE = ORIGINAL; });

  it('returns true when DEMO_MODE=true', () => {
    process.env.DEMO_MODE = 'true';
    expect(isDemoMode()).toBe(true);
  });

  it('returns false when DEMO_MODE=false', () => {
    process.env.DEMO_MODE = 'false';
    expect(isDemoMode()).toBe(false);
  });

  it('returns false when DEMO_MODE is unset', () => {
    delete process.env.DEMO_MODE;
    expect(isDemoMode()).toBe(false);
  });

  it('returns false for any non-"true" value (case-sensitive)', () => {
    process.env.DEMO_MODE = 'True';
    expect(isDemoMode()).toBe(false);
    process.env.DEMO_MODE = '1';
    expect(isDemoMode()).toBe(false);
  });
});

import { now, today } from '../clock';

// Module-level mock — avoids "Cannot redefine property" on ESM-compiled exports
jest.mock('../demo-mode', () => ({
  isDemoMode: jest.fn(),
  getDemoFrozenDate: jest.fn(),
  _resetDemoFrozenDateCache: jest.fn(),
}));

import { isDemoMode, getDemoFrozenDate } from '../demo-mode';

describe('clock', () => {
  afterEach(() => jest.clearAllMocks());

  describe('when DEMO_MODE=false', () => {
    beforeEach(() => {
      (isDemoMode as jest.Mock).mockReturnValue(false);
    });

    it('now() returns current real Date', () => {
      const before = Date.now();
      const t = now().getTime();
      const after = Date.now();
      expect(t).toBeGreaterThanOrEqual(before);
      expect(t).toBeLessThanOrEqual(after);
    });

    it('today() returns YYYY-MM-DD of current real date', () => {
      const real = new Date().toISOString().slice(0, 10);
      expect(today()).toBe(real);
    });
  });

  describe('when DEMO_MODE=true', () => {
    beforeEach(() => {
      (isDemoMode as jest.Mock).mockReturnValue(true);
      (getDemoFrozenDate as jest.Mock).mockReturnValue('2026-05-20');
    });

    it('now() returns frozen date at 00:00 UTC', () => {
      expect(now().toISOString()).toBe('2026-05-20T00:00:00.000Z');
    });

    it('today() returns frozen date string', () => {
      expect(today()).toBe('2026-05-20');
    });
  });
});

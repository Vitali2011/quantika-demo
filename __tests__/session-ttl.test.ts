import { SESSION_TTL_MS } from '@/lib/constants';

describe('SESSION_TTL_MS', () => {
  it('equals 8 hours', () => {
    expect(SESSION_TTL_MS).toBe(8 * 60 * 60 * 1000);
  });

  it('cookie maxAge (seconds) equals 28800', () => {
    expect(SESSION_TTL_MS / 1000).toBe(28800);
  });
});

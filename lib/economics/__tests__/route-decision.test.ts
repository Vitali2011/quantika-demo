/**
 * β-06 fix — signed savings_days + extra_days_winner exposure.
 *
 * Tests the pure {@link decideRoute} helper. Existing async {@link compareRoutes}
 * integration tests live in `tests/economics/route-decision.test.ts` and remain
 * unchanged (they assert non-negative deltas only for Singapore→Rotterdam where
 * Suez wins both axes).
 */

import { decideRoute } from '../route-decision';

describe('decideRoute — signed savings_days + extra_days_winner', () => {
  it('Cape wins by daily TCE but is slower: extra_days_winner positive, savings_days SIGNED negative', () => {
    const r = decideRoute({
      suez: { durationDays: 24.7, dailyTceUsd: 25_363, totalUsd: 826_000 },
      cape: { durationDays: 35.1, dailyTceUsd: 27_526, totalUsd: 1_017_000 },
    });
    expect(r.route).toBe('cape');
    // Winner is slower → extra_days_winner positive.
    expect(r.extra_days_winner).toBeCloseTo(10.4, 1);
    // savings_days signed: negative когда winner slower.
    expect(r.savings_days).toBeLessThan(0);
    expect(r.savings_days).toBeCloseTo(-10.4, 1);
  });

  it('Suez wins by TCE AND faster: extra_days_winner = 0, savings_days positive', () => {
    const r = decideRoute({
      suez: { durationDays: 24.7, dailyTceUsd: 30_000, totalUsd: 740_000 },
      cape: { durationDays: 35.1, dailyTceUsd: 22_000, totalUsd: 770_000 },
    });
    expect(r.route).toBe('suez');
    expect(r.savings_days).toBeGreaterThanOrEqual(10);
    expect(r.extra_days_winner).toBe(0);
  });

  it('exposes savings_usd_per_day on the same axis as winner decision (daily TCE)', () => {
    const r = decideRoute({
      suez: { durationDays: 24.7, dailyTceUsd: 25_363, totalUsd: 826_000 },
      cape: { durationDays: 35.1, dailyTceUsd: 27_526, totalUsd: 1_017_000 },
    });
    expect(r).toHaveProperty('savings_usd_per_day');
    // Cape wins by ~$2163/day × 35.1d ≈ $75921 daily-TCE-axis savings.
    expect(r.savings_usd_per_day).toBeGreaterThan(0);
    expect(r.savings_usd_per_day).toBeCloseTo(
      Math.round((27526 - 25363) * 35.1),
      -1,
    );
  });

  it('savings_usd is SIGNED — negative когда winner-by-tce is more expensive total', () => {
    const r = decideRoute({
      suez: { durationDays: 24.7, dailyTceUsd: 25_363, totalUsd: 826_000 },
      cape: { durationDays: 35.1, dailyTceUsd: 27_526, totalUsd: 1_017_000 },
    });
    // Cape выигрывает по daily_tce но total дороже → savings_usd negative.
    expect(r.savings_usd).toBeLessThan(0);
    expect(r.savings_usd).toBeCloseTo(826_000 - 1_017_000, -2);
  });

  it('tie on daily TCE → suez wins (deterministic)', () => {
    const r = decideRoute({
      suez: { durationDays: 25, dailyTceUsd: 25_000, totalUsd: 800_000 },
      cape: { durationDays: 35, dailyTceUsd: 25_000, totalUsd: 900_000 },
    });
    expect(r.route).toBe('suez');
    expect(r.extra_days_winner).toBe(0);
    expect(r.savings_days).toBeCloseTo(10, 1);
  });
});

# spec-betafix-06-savings-days-exposure

**Plan:** beta-fixes | **Batch:** 1 | **Severity:** HIGH (escalated from MED — broker decision-critical)
**Source bugs:** BUG-06 (smoke), BUG-β-06-WinnerSavingsMismatch (adversarial)
**Read first:** `.specs/SHARED_CONTEXT-beta-fixes.md`

## Bug

`compare-routes`: Suez 24.7d vs Cape 35.1d, Cape выигрывает по daily TCE → recommendation `route:"cape", savings_days:0`. Cape на 10.4 дня **дольше** Suez, но `Math.max(0, ...)` в `lib/economics/route-decision.ts:173` clamp'ит negative → broker НЕ видит time penalty. Брокеры квотят на laycan — это deal-breaker.

Plus adversarial finding: winner picked by `daily_tce`, savings_usd from `total_usd` — axis mismatch.

## Files in scope

- `lib/economics/route-decision.ts:120-180` (templateReason + recommendation block)
- `lib/economics/__tests__/route-decision.test.ts`

## Files FORBIDDEN

- `lib/economics/voyage-calculator.ts`, `lib/economics/war-risk.ts` (другие специ)

## TDD RED

```ts
import { decideRoute } from '../route-decision';

describe('route-decision: time penalty exposure', () => {
  it('Cape wins by TCE but slower: extra_days_winner positive, savings_days SIGNED', () => {
    const r = decideRoute({
      suez: { durationDays: 24.7, dailyTceUsd: 25_363, totalUsd: 826_000 },
      cape: { durationDays: 35.1, dailyTceUsd: 27_526, totalUsd: 1_017_000 },
    });
    expect(r.route).toBe('cape');
    expect(r.extra_days_winner).toBeCloseTo(10.4, 1);   // positive — winner is slower
    // OR signed savings_days:
    expect(r.savings_days).toBeLessThan(0);              // negative — winner is slower
  });

  it('Suez wins by TCE AND faster: extra_days_winner = 0 (or negative), savings_days positive', () => {
    const r = decideRoute({
      suez: { durationDays: 24.7, dailyTceUsd: 30_000, totalUsd: 740_000 },
      cape: { durationDays: 35.1, dailyTceUsd: 22_000, totalUsd: 770_000 },
    });
    expect(r.route).toBe('suez');
    expect(r.savings_days ?? 0).toBeGreaterThanOrEqual(10);  // saves 10+ days
    expect(r.extra_days_winner ?? 0).toBeLessThanOrEqual(0);
  });

  it('savings_usd is on the SAME axis as winner decision', () => {
    // если winner picked by daily_tce, savings_usd_per_day exposed
    const r = decideRoute({ /* … */ });
    expect(r).toHaveProperty('savings_usd_per_day');  // OR savings_total_usd if winner picked by total
  });
});
```

## Fix sketch

```ts
// lib/economics/route-decision.ts
type Recommendation = {
  route: 'suez' | 'cape';
  reason: string;
  // OLD: savings_usd, savings_days (clamped, lossy)
  // NEW:
  savings_usd: number;          // signed: positive когда winner cheaper по тому axis по которому picked
  savings_days: number;         // signed: positive если winner faster, negative если slower
  extra_days_winner: number;    // = max(0, -savings_days) — convenience field; >0 если winner slower
  savings_usd_per_day: number;  // (winnerDailyTce - loserDailyTce) × winnerDuration — additional exposure
};

const winSavingsDays = winner.durationDays < loser.durationDays
  ? loser.durationDays - winner.durationDays      // positive — winner faster
  : -(winner.durationDays - loser.durationDays);  // negative — winner slower
```

Update `templateReason()` чтобы текст содержал "**N дней дольше**" когда winner slower (broker важно видеть прямо).

## Acceptance criteria

- [ ] `extra_days_winner > 0` когда winner slower.
- [ ] `savings_days` signed (positive=faster, negative=slower).
- [ ] `templateReason` упоминает delta дней (positive или negative).
- [ ] TS типы в `Recommendation` обновлены, нет breaking changes для UI кроме новых полей (старые `savings_usd`/`savings_days` остаются — не удалять, только семантика signed).
- [ ] Existing tests адаптированы под signed convention ИЛИ новый test file.

## Commit

`fix(βf-06-savings-days-exposure): expose signed savings_days + extra_days_winner для broker time penalty`

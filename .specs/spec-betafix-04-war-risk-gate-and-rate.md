# spec-betafix-04-war-risk-gate-and-rate

**Plan:** beta-fixes | **Batch:** 1 | **Severity:** HIGH
**Source bugs:** BUG-03, BUG-07 (smoke report)
**Read first:** `.specs/SHARED_CONTEXT-beta-fixes.md`

## Bug

1. **BUG-03** Lagos (HRA) с `daysInHra:5` → `war_risk_usd:0, applicable.war_risk:false` — gate hardcoded false.
2. **BUG-07** Suez transit, $10M vessel → `war_risk_usd:$82` (0.00082%). Реальная JWC 2024-26 ставка 0.05-0.10% per transit → ожидаем $5k-$10k hull premium minimum.

Root cause: `lib/economics/war-risk.ts:11-30` — `premiumPercent: 0.05` интерпретируется как **annual %** и делится на 365 в формуле "Annual % → daily rate × days in HRA". User decision: model — **per-voyage % vessel value**.

## Files in scope

- `lib/economics/war-risk.ts` (rate constants + formula)
- `lib/economics/__tests__/war-risk.test.ts` (≤30 expects)
- `lib/economics/voyage-calculator.ts` (только применение `applicable.war_risk` gate; не остальная логика — BUG-βf-03 трогает другие части)

## Files FORBIDDEN

- `lib/port-da/*` (BUG-βf-03 scope)
- `lib/economics/route-decision.ts` (BUG-βf-06)

## Industry rates (JWC 2024-26)

| Zone | Premium % per transit | Notes |
|---|---|---|
| Gulf of Guinea HRA | 0.05% | Lagos, Lome, Tema, Cotonou, Pointe Noire |
| Red Sea / Bab al-Mandeb | 0.075% | Suez transit, Jeddah, Aden |
| Indian Ocean / Somali | 0.04% | Mombasa, Dar, Mogadishu route |
| Black Sea Russia/Ukraine | 0.10% | Odesa, Constanta restricted |

Plus crew war bonus ~$500/person/voyage × 20 crew = $10k. Plus P&I surcharge ~$5k/voyage. Минимум total для $10M vessel в Red Sea: hull $7,500 + crew $10k + P&I $5k = $22,500. **Для упрощения этого spec'a:** считаем только hull premium (premium% × vessel_value); crew + P&I — отметить TODO в коде, defer to wave-γ.

## TDD RED

```ts
import { calculateWarRisk } from '../war-risk';

describe('war_risk per-voyage rate', () => {
  it('Gulf of Guinea HRA: $8M vessel → ~$4,000 (0.05%)', () => {
    const r = calculateWarRisk({ vesselValueUsd: 8_000_000, hraZoneId: 'gog', daysInHra: 5 });
    expect(r.applicable).toBe(true);
    expect(r.totalUsd).toBeGreaterThanOrEqual(3_500);
    expect(r.totalUsd).toBeLessThanOrEqual(5_000);
  });

  it('Red Sea/Bab al-Mandeb: $10M vessel → ~$7,500 (0.075%)', () => {
    const r = calculateWarRisk({ vesselValueUsd: 10_000_000, hraZoneId: 'red_sea', daysInHra: 1 });
    expect(r.applicable).toBe(true);
    expect(r.totalUsd).toBeGreaterThanOrEqual(7_000);
    expect(r.totalUsd).toBeLessThanOrEqual(9_000);
  });

  it('No HRA (Atlantic ballast) → applicable:false, totalUsd:0', () => {
    const r = calculateWarRisk({ vesselValueUsd: 8_000_000, hraZoneId: null, daysInHra: 0 });
    expect(r.applicable).toBe(false);
    expect(r.totalUsd).toBe(0);
  });

  it('daysInHra=0 но zone задана → still applicable (transit), not zero', () => {
    // если порт HRA даже на 0 дней transit — premium per voyage всё равно начисляется
    const r = calculateWarRisk({ vesselValueUsd: 8_000_000, hraZoneId: 'gog', daysInHra: 0 });
    expect(r.applicable).toBe(true);
    expect(r.totalUsd).toBeGreaterThan(0);
  });

  it('vesselValueUsd missing → graceful fallback (apply default $8M), not NaN', () => {
    // optional defensive
  });
});

// Integration через voyage-calculator
it('Antwerp→Lagos с daysInHra:5 → applicable.war_risk:true, war_risk_usd >= $4k', async () => {
  const result = await calculateTCE({ /* fixture с Lagos*/ });
  expect(result.applicable.war_risk).toBe(true);
  expect(result.war_risk_usd).toBeGreaterThanOrEqual(4000);
});
```

## Fix sketch

```ts
// lib/economics/war-risk.ts
export const JWC_HRA_ZONES = [
  { id: 'gog', name: 'Gulf of Guinea HRA', premiumPercentPerTransit: 0.0005, ports: [...] },
  { id: 'red_sea', name: 'Red Sea / Bab al-Mandeb', premiumPercentPerTransit: 0.00075, ports: [...] },
  { id: 'somali', name: 'Indian Ocean / Somali', premiumPercentPerTransit: 0.0004, ports: [...] },
  { id: 'black_sea', name: 'Black Sea Russia/Ukraine', premiumPercentPerTransit: 0.001, ports: [...] },
];

export function calculateWarRisk({ vesselValueUsd, hraZoneId, daysInHra }: Args): Result {
  const zone = JWC_HRA_ZONES.find(z => z.id === hraZoneId);
  if (!zone) return { applicable: false, totalUsd: 0, breakdown: {} };
  const value = Number.isFinite(vesselValueUsd) && vesselValueUsd > 0 ? vesselValueUsd : 8_000_000;
  const hullPremium = value * zone.premiumPercentPerTransit;
  // TODO(wave-γ): add crew bonus ($500/person × 20 crew) + P&I surcharge (~$5k flat).
  return {
    applicable: true,
    totalUsd: Math.round(hullPremium),
    breakdown: { hull_premium_usd: Math.round(hullPremium), crew_bonus_usd: 0, pi_surcharge_usd: 0 },
    zone_id: zone.id,
    zone_name: zone.name,
  };
}
```

В `voyage-calculator.ts:applicable.war_risk` — set to `true` когда `calculateWarRisk` возвращает applicable.

## Acceptance criteria

- [ ] Gulf of Guinea: $8M vessel × 5d → $3.5k-$5k (per-transit, не per-day).
- [ ] Red Sea/Suez: $10M × 1d transit → $7k-$9k.
- [ ] Atlantic ballast (no HRA) → applicable:false, totalUsd:0.
- [ ] daysInHra=0 но zone задан → applicable:true, не 0.
- [ ] `applicable.war_risk:true` propagated в TCE response для HRA route.
- [ ] Existing war-risk tests могут сломаться — это **ожидаемо** т.к. меняем rate model. **User explicitly разрешил адаптировать** existing `lib/economics/__tests__/war-risk.test.ts` под новую per-voyage formula. RESULT block ОБЯЗАН явно перечислить: какие assertions изменены и почему (старое значение → новое). Это исключение из правила "не трогать Wave β тесты" специально для этой спеки.

## Commit

`fix(βf-04-war-risk-gate-and-rate): per-voyage % JWC 2024-26 rates + applicable.war_risk gate`

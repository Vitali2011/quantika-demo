# Plan: Economics #3 — voyage P&L chart via engine (2026-06-01)

## Goal
Economics-вкладка (/match/[id]) сейчас зовёт PATCH /api/matches (одно число TCE). Подключить готовый движок POST /api/voyage/tce (calculateTCE→TCEBreakdown) + отрендерить готовый <VoyageBreakdownChart> (стопка Бункер/Канал/Порт/War-risk/ETS + Daily TCE). Сейчас компонент нигде не импортирован.

## Probe (origin/main c396093b — после #736)
- EconomicsTab.tsx: уже есть routeDistanceNm, currentRate/storedFreightRate, estimateVesselValueUsd (добавлен #736). Сейчас рендерит одно TCE через PATCH.
- POST /api/voyage/tce → TCEBreakdown {bunker_usd,canal_usd,da_usd,war_risk_usd,ets_usd,total_costs_usd,net_voyage_usd,daily_tce_usd}. lib/economics/voyage-calculator.ts calculateTCE + VoyageInput type.
- components/economics/VoyageBreakdownChart.tsx — готов, не импортирован (проверь его Props: breakdown=TCEBreakdown).

## Changes (components/match/EconomicsTab.tsx)
1. Собрать VoyageInput из матча: vessel{dwt, valueUsd=estimateVesselValueUsd(dwt,type), speedKts=parseLeadingNumber(vessel.speedLaden), consumptionMtPerDay=parseLeadingNumber(vessel.consumption)}, route{originPort, destinationPort, distanceNm=routeDistanceNm, viaSuez/viaCanal опц}, cargo{quantityMt, freightRateUsdPerMt=currentRate (РЕАЛЬНАЯ)}, bunkerPort/grade или manual, durationDays.
2. POST /api/voyage/tce → TCEBreakdown.
3. Отрендерить <VoyageBreakdownChart breakdown={result}/> в вкладке. Пересчёт по Recalculate / смене инпутов (useEffect/useMemo).
4. valueUsd: переиспользовать estimateVesselValueUsd (#736) с документированным допущением.
5. Нет speed/consumption/distance → показать чего не хватает (как disabled-reason у Compare), не пустоту/краш.

## Tests (TDD) + /test-skill (risk-override economics)
- VoyageInput собирается корректно из матча (valueUsd из estimateVesselValueUsd, rate=currentRate, distance=routeDistanceNm).
- POST /api/voyage/tce замокан → VoyageBreakdownChart рендерит стопку с полями TCEBreakdown.
- Нет speed/consumption → сообщение «чего не хватает», не краш.
- ИНВАРИАНТ: формулы движка НЕ изменены (только вызов + рендер); RouteCompareModal не тронут.
- tsc + jest зелёное.

## Out-of-scope
- НЕ менять формулы движка (calculateTCE/ets/voyage math); route-aware бункер = Econ №1 (после); FuelEU/Suez-Cape = №2 (merged); НЕ трогать RouteCompareModal, Fit Score, MatchWorksheet, war-risk.

## Verify
- PR в main: "feat(economics): full voyage P&L chart via /api/voyage/tce (VoyageBreakdownChart)". /test-skill обязателен. Gate3/Gate5 — оркестратор/founder.

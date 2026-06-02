# Economics tab declutter + bunker-control route-aware (2026-06-02, founder-requested)

## Контекст
Founder провёл аудит вкладки Economics матча (`components/match/EconomicsTab.tsx`, 755 строк). Решения:
- **УБРАТЬ:** FuelEU Maritime Compliance (tile + dropdown топлива) и Display currency (селектор валют) — шум для демо.
- **ОСТАВИТЬ:** Compare Suez vs Cape (founder планирует и deep-sea маршруты) + всё остальное (Freight Rate Override, Commission, Bunker price control, таблица сравнения, EUA tile, JWC War Risk, Voyage P&L).
- **ПОЧИНИТЬ:** ручной контрол «Bunker price + порт/грейд» устарел — список портов = старые 5 мировых хабов (Rotterdam/Singapore/Fujairah/Houston/Gibraltar), дефолт Singapore (бессмыслица для Med), и НЕ может показать рекомендованный таблицей порт (Ceuta) → рассинхрон с таблицей сравнения.

## Задача 1 — убрать FuelEU Maritime Compliance
- Удалить блок под `fuelEuEnabled` (tile ~572-648) + связанный state (`fuelType`), import (`calculateFuelEu`), useMemo (`fuelEuResult`, `fuelEuVoyageDays`), использование флага `NEXT_PUBLIC_FUELEU_ENABLED` в этом компоненте.
- `lib/economics/fueleu.ts` НЕ трогать (если не импортируется больше нигде — не гоняться за cross-module удалением; просто убрать из EconomicsTab).
- Убрать соответствующие assert'ы FuelEU в тесте EconomicsTab.

## Задача 2 — убрать Display currency
- Удалить блок `MULTI_CURRENCY_V2_ENABLED` (Display currency ~526-548) + `DISPLAY_CURRENCIES`, `DISPLAY_RATES`, state `displayCurrency`. Убрать связанные тесты.

## Задача 3 — бункер порт/грейд route-aware (вопрос founder «как должно работать»)
- Сейчас: `BUNKER_PORTS` = старые 5; дефолт `bunkerPort='SGSIN'`; авто-синк (~153-155) ставит bunkerPort только если рекомендованный порт ∈ BUNKER_PORTS → новые региональные победители (Ceuta и т.п.) НИКОГДА не показываются.
- Должно: dropdown портов строится из `bunkerCandidates[]` (компонент их УЖЕ получает из API), DEFAULT = рекомендованный (`candidates[0].port`, самый дешёвый по eff). Грейд-селектор (VLSFO/MGO) и ручной ввод цены — оставить. Подсказка «Leave empty to use latest spot price for {port} {grade}» тогда покажет порт маршрута, не Singapore.
- Реализация: опции портов из `bunkerCandidates` (dedup по порту, label из port-name map; fallback на старый список только если candidates пуст). Default-select рекомендованный порт, если пользователь не выбрал вручную (`bunkerPortManual`). Ручная цена по-прежнему течёт в P&L (`voyageInputData`) + RouteCompareModal — не сломать.

## НЕ трогать
Compare Suez vs Cape, Freight Rate Override, Commission, BunkerComparisonTable, EUA tile, JWC War Risk, Voyage P&L.

## Acceptance
- На вкладке Economics НЕТ секций FuelEU и Display currency.
- Кнопка Suez vs Cape на месте.
- Dropdown бункер-порта показывает порты маршрута и по умолчанию = рекомендованный (Ceuta для матча Seagull 78), НЕ Singapore; ручной ввод цены работает и кормит P&L.
- Hydration/SSR не ломается; тесты компонента обновлены/зелёные; tsc чист; CI green.

## Gates
Tier M. UI меняется → preview/founder-visual (Gate 3). НЕ parser/financial-math → /test-skill не обязателен, но добротные component-тесты нужны. Branch-first. prod-БД не трогать.

## Файлы
- `components/match/EconomicsTab.tsx` (главный)
- тест EconomicsTab (`components/match/__tests__/EconomicsTab*.test.tsx`) — обновить
- (возможно) import port-name map для лейблов портов

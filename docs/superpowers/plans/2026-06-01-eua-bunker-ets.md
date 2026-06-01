# Plan: EUA + Bunker scrapers + CO₂→EUA formula fix (2026-06-01)

## Goal
Оживить EUA + бункер реальными источниками (как Baltic) + сверить/починить формулу CO₂→EUA в движке. risk-override (2 HTML-парсера + финансовая формула) → /test-skill ОБЯЗАТЕЛЕН.

## Probe-факты (origin/main)
- lib/economics/ets.ts: `const CO2_FACTOR = 3.114` (ЭТО HFO; для VLSFO д.б. 3.151). `calculateEuEts({distanceNm,euLegPercent,vlsfoBurnMt,euaPrice})` → `amount = vlsfoBurnMt * CO2_FACTOR * euLegPercent * euaPrice`. geo%(euLegPercent) ПРИМЕНЯЕТСЯ ✓. phaseIn ОТСУТСТВУЕТ ✗. `fetchEuaPrice()` бьёт eex.com (НЕ TE).
- lib/market/eua-repository.ts: `upsertEuaPrice(db,{price_date,price_eur_per_tco2,contract_type,source,fetched_at})` ON CONFLICT(price_date,contract_type); getLatestEuaPrice.
- lib/market/bunker-repository.ts: `upsertBunkerPrice(db,{port_unlocode,fuel_grade,price_usd_per_mt,price_date,source,fetched_at})` ON CONFLICT(port_unlocode,fuel_grade,price_date); getLatestBunkerPrice(db,port,grade).
- ops/systemd: НЕТ eua/bunker timer (есть quantika-fx-rates-refresh.timer как паттерн) → создать дневные таймеры (mirror fx).

## ЧАСТЬ 1 — EUA (scripts/knowledge/cron/refresh-eua.ts)
- fetch https://tradingeconomics.com/commodity/carbon → распарсить цену EUR + дата + дневное %. (Можно заменить fetchEuaPrice EEX→TE или сделать отдельный парс в refresh-eua.)
- Валидация: EUR в диапазоне 20–200; вне/NaN → НЕ перезаписывать (getLatestEuaPrice), warn.
- upsertEuaPrice(real price_date, source='tradingeconomics', contract_type='spot'). Идемпотентно. Дневной timer (mirror quantika-fx-rates-refresh.timer → quantika-eua-refresh.timer + .service).

## ЧАСТЬ 2 — Bunker (scripts/knowledge/cron/refresh-bunker.ts)
- fetch https://www.bunkerindex.com/ → VLSFO+MGO для Rotterdam(NLRTM)/Singapore(SGSIN)/Fujairah(AEFJR). Houston(USHOU)/Gibraltar(GIGIB) — НЕ трогать (нет free-источника, оставить засеянными).
- Валидация: VLSFO 300–1500, MGO 400–2000 USD/mt; вне → НЕ перезаписывать, warn.
- upsertBunkerPrice(port,grade,price,real price_date,source='bunkerindex'). Дневной timer (quantika-bunker-refresh.timer + .service).

## ЧАСТЬ 3 — формула CO₂→EUA (lib/economics/ets.ts + voyage-calculator.ts)
ЭТАЛОН: EUA_cost(EUR) = Σ_fuel(fuel_t × Cf_fuel) × geo% × phaseIn(year) × EUA_price.
- (а) Cf по типу топлива (НЕ один 3.114): HFO/HSFO 3.114 · VLSFO/LFO 3.151 · MGO/MDO 3.206 · LNG 2.750. Сделать таблицу CF_BY_FUEL + хелпер cfForFuel(grade). calculateEuEts принять fuelType (дефолт 'VLSFO'→3.151) ИЛИ маппить из входа. НЕ ломать сигнатуру существующих вызовов (доп. параметр опционален, дефолт сохраняет поведение НО с правильным Cf — осторожно: смена 3.114→3.151 для VLSFO изменит числа; это НАМЕРЕННО, зафиксировать в тесте).
- (б) geo% (euLegPercent) — уже применяется, подтвердить.
- (в) phaseIn(year) — ДОБАВИТЬ: 2024=0.40, 2025=0.70, 2026+=1.00. Параметр year (дефолт текущий/2026). amount = burn × Cf × euLegPercent × phaseIn × euaPrice. Проверить voyage-calculator передаёт год/EU-плечо.

## Tests (TDD) + /test-skill ОБЯЗАТЕЛЕН
- Мок HTML TE carbon → парс EUR; out-of-range (5 или 999) → не перезаписывает.
- Мок HTML bunkerindex → VLSFO/MGO 3 порта; Houston/Gibraltar не трогаются; out-of-range → не перезаписывает.
- ФОРМУЛА: 1000т VLSFO, intra-EU (euLegPercent=1.0), 2026 (phaseIn=1.0) → CO₂=1000×3.151=3151т → ×1.0×1.0×euaPrice = ожидаемые EUR (зафиксировать число). Доп: MGO Cf=3.206; 2024 phaseIn=0.4; one-leg geo 0.5.
- НЕ ломать существующие economics-тесты (если 3.114→3.151 меняет ожидания — обновить осознанно с комментом).
- tsc clean.

## Out-of-scope
- Houston/Gibraltar bunker (нет источника). НЕ трогать demo-seed/Economics-UI/match/Baltic/другие refresh. НЕ менять TCE-структуру кроме Cf/phaseIn в ets.
- Легальная оговорка в коде: interim-scrape для демо; прод → лицензия/официальный API.

## Verify
- npx jest + tsc. PR в main: "feat(market): live EUA + bunker scrapers + fuel-aware CO₂/phaseIn in ETS". Backend → preview не нужен. Post-merge (оркестратор/timer): прогон refresh на проде → /market EUA+bunker не stale.

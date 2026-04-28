# ROADMAP-features.md — Wave B: Feature Fixes (plan_id: features)

7 сломанных фич для pilot-клиента. ~2–3 недели.
B-1..B-3 = P0 (эта неделя). B-4..B-7 = P1.

## B-1. TZ-016 Multi-Currency fix (P0)

`/api/commission` хардкодит валюту USD, игнорируя поле `currency` из recap'а.
NORTHSTAR GLORY показывает `USD 139,500` вместо `EUR 139,500`.

Acceptance criteria:
- `app/api/commission/` читает `currency` из поля recap, не хардкодит
- Если `currency` отсутствует в recap — fallback USD с предупреждением в логе
- Тест-фикстура: recap с `currency: "EUR"` → commission render показывает `EUR`
- Тест-фикстура: recap NORTHSTAR GLORY → `EUR 139,500`
- Все существующие USD-тесты остаются зелёными

Files in scope: `app/api/commission/route.ts` (или соответствующий файл),
`__tests__/commission.test.ts` (добавить EUR fixtures).

## B-2. TZ-014 Rate Intelligence (P0)

Поле rate в recap'ах содержит `[RATE TO BE CONFIRMED]` вместо реального значения.
Нужен поиск исторической ставки по маршруту из прошлых recap'ов.

Acceptance criteria:
- In-memory индекс загруженных recap'ов индексируется по маршруту
  (порт отхода + порт назначения, нормализованные в uppercase)
- Route-similarity поиск: сначала точное совпадение, затем partial match
  (один из портов совпадает)
- При нахождении — заменяет `[RATE TO BE CONFIRMED]` на значение с источником:
  формат `$X,XXX (from recap <id>, <date>)`
- При отсутствии — оставляет оригинальный placeholder без изменений
- Тесты: exact match, partial match, no match, multiple results (берём последний)

Files in scope: `lib/rate-intelligence.ts` (новый),
`app/api/rate/route.ts` или интеграция в существующий recap-parser,
`__tests__/rate-intelligence.test.ts` (новый).

## B-3. TZ-015 Voyage Calculator + TCE (P0)

Страниц `/voyage` и `/tce` не существует. Нужны калькуляторы для
freight-форвардеров с TCE-формулой.

Acceptance criteria:
- Страница `/voyage`: поля distance (nm), speed (kn), bunker consumption (MT/day),
  bunker price ($/MT) → outputs: voyage duration (days), total bunker cost ($)
- Страница `/tce` (Time Charter Equivalent): поля hire rate ($/day), port costs ($),
  voyage duration (days), freight revenue ($) → TCE $/day
  Формула: TCE = (Freight Revenue − Port Costs − Bunker Costs) / Voyage Duration
- Оба калькулятора работают на клиенте (без API-запросов), мгновенный результат
- Unit-тесты на формулы (5+ кейсов включая edge: нулевые поля, отрицательные TCE)

Files in scope: `app/(dashboard)/voyage/page.tsx` (новый),
`app/(dashboard)/tce/page.tsx` (новый), `lib/voyage-calc.ts` (новый),
`__tests__/voyage-calc.test.ts` (новый).

## B-4. TZ-009 Laytime Calculator (P1)

Страницы `/laytime` не существует. Нужен расчёт demurrage/dispatch.

Acceptance criteria:
- Страница `/laytime` с полями: loading rate (MT/day), discharge rate (MT/day),
  cargo quantity (MT), allowed laytime (hours), actual time used (hours),
  despatch rate (50% of demurrage rate по умолчанию)
- Outputs: allowed laytime (hours), time saved/exceeded (hours),
  demurrage ($) или dispatch ($)
- Калькулятор работает на клиенте без API-запросов
- Unit-тесты: demurrage case, dispatch case, exact laytime case

Files in scope: `app/(dashboard)/laytime/page.tsx` (новый),
`lib/laytime-calc.ts` (новый), `__tests__/laytime-calc.test.ts` (новый).

## B-5. TZ-010 FCL/LCL support (P1)

Страницы `/fcl`, `/lcl`, `/containers` не существуют. Cargo с TEU-номенклатурой
не классифицируется корректно.

Acceptance criteria:
- `lib/container-classifier.ts`: функция `classifyCargoMode(cargo: string)`
  → `"FCL" | "LCL" | "BULK" | "UNKNOWN"`. FCL-триггеры: TEU, FEU, container(s),
  box(es). LCL-триггеры: groupage, LCL, part-load.
- Страница `/fcl`: информационная страница + форма ввода для FCL расчёта
- Страница `/lcl`: аналогично для LCL
- Страница `/containers`: список контейнерных recap'ов из сессии
- Классификатор интегрирован в intake-парсер (добавляет `cargo_mode` к recap)
- Тесты на классификатор: 10+ кейсов

Files in scope: `lib/container-classifier.ts` (новый),
`app/(dashboard)/fcl/page.tsx` (новый), `app/(dashboard)/lcl/page.tsx` (новый),
`app/(dashboard)/containers/page.tsx` (новый),
`__tests__/container-classifier.test.ts` (новый).

## B-6. TZ-011 Time Charter parsing (P1)

sample-13 классифицируется как общий recap вместо TC. UI для TC trips отсутствует.

Acceptance criteria:
- `lib/recap-parser.ts` (или аналог): TC-классификация по маркерам DELY, REDELY,
  TCT, `time charter`, `hire rate` в тексте recap'а (case-insensitive)
- Поле `recap_type: "TC" | "VOYAGE" | "UNKNOWN"` добавляется к parsed recap
- Страница `/tc`: список TC recap'ов с полями hire rate ($/day), PDPR,
  delivery port, redelivery port
- sample-13 корректно классифицируется как TC в тестах
- Тесты: TC detection (3+ fixture), VOYAGE detection (2+ fixture)

Files in scope: `lib/recap-parser.ts` (модификация),
`app/(dashboard)/tc/page.tsx` (новый),
`__tests__/recap-parser-tc.test.ts` (новый).

## B-7. TZ-008 Subs timer (P1)

Plain text «subs on stem confirmation within 2 banking days» не даёт пользователю
визуальную индикацию срочности.

Acceptance criteria:
- Компонент `SubsTimer`: принимает `deadline: Date`, показывает countdown
  в формате `Xd Yh Zm`. Цвет: зелёный (>24h), жёлтый (1–24h), красный (<1h или истёк)
- Интеграция в recap-карточки: парсить «within N banking days» из текста recap,
  считать deadline от даты recap'а (пропускать выходные)
- Dashboard block «Subs due this week»: количество recap'ов с активными subs-таймерами
- Тесты: парсинг «2 banking days», countdown цвета (3 threshold-кейса)

Files in scope: `components/SubsTimer.tsx` (новый),
`lib/subs-parser.ts` (новый), `app/(dashboard)/page.tsx` (dashboard block),
`__tests__/subs-parser.test.ts` (новый).

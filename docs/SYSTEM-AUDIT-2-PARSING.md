# Аудит системы — Часть 2/5: ПАРСИНГ

> 2026-06-05. 5 read-only Sonnet-разведчиков, каждый трассировал один узел A→Z + реальные данные БД (parsed_results, ai_audit).
> Ветка: `feat/bunker-oilmonster-med-blacksea`. Fill-rate взяты из ОДНОЙ живой сессии (LIVE-парсинг корпуса) — frozen demo-seed может быть докручен вручную.

---

## ГЛАВНЫЙ ВЫВОД (6 тем)

1. **Экономика стоит на ОТСУТСТВУЮЩИХ данных судна.** В живой выборке: `speedLaden` пуст у **78%** судов, `consumption` у **86%**, `ciiRating` у **100%**. → TCE для ~80% судов считается на ДЕФОЛТАХ (12 узлов / 25 т/день). «$/день» — ядро ценности — по большинству судов фабрикуется из дефолтов, а не из распарсенного. Это поверх бага #819 (даже когда list==detail починят, входы = дефолты).
2. **«Данные есть» ≠ «данные верны».** Поля заполнены отлично (груз: вес 99%, laycan/порты/тип 100%), НО: диапазон веса схлопывается в верхнюю границу (57.5% диапазонных грузов → завышает экономику); соль/цемент в биг-бэгах → BREAK_BULK (LLM нарушает свой же промпт). Тот же урок, что seed-shape баг.
3. **«Верификация» — бутафория.** Equasis (проверка судна по IMO-реестру) — это СТАБ: 8 записей в словаре, без живого HTTP. Брокер видит «проверено», а проверки нет.
4. **Orphan-категории.** TCT_REQUEST + VESSEL_CERTIFICATE классифицируются и показываются бейджем, но НЕТ парсера → данные молча теряются (~4% писем).
5. **Живой LLM был сломан на dev-VPS.** `ai_audit`: все 8 CLASSIFY = ok=0 (нет GOOGLE_APPLICATION_CREDENTIALS, 2026-05-27); 398 judge ok=0 (invalid model). Demo-режим это маскирует (в демо LLM не зовётся). Нужна проверка прода.
6. **Shape-контракт всё ещё хрупкий.** `normalizeLaycan` живёт ТОЛЬКО в одном seed-скрипте (не в общей либе) → баг «0 матчей» может вернуться. И прямо сейчас: форма openDate (объект) тихо ломает detectSpot → спот-суда уезжают из main в review.

---

## ПОСТАДИЙНЫЙ ВЕРДИКТ

| Узел                            | Вход | Выход            | Целостно?   | Главная боль                                                            |
| ------------------------------- | ---- | ---------------- | ----------- | ----------------------------------------------------------------------- |
| **1. Классификация**            | ✅   | ✅ 6/8 категорий | ⚠️          | TCT/CERT классиф. но без парсера; 1 ошибка батча → весь 500             |
| **2. Parse-cargo**              | ✅   | ✅ fill 99%      | ⚠️ точность | диапазон веса → верхняя граница (завышает $); соль→BREAK_BULK           |
| **3. Parse-vessel**             | ✅   | ⚠️ fill дыры     | ⚠️          | speed 78% null, consumption 86% null → TCE на дефолтах; Equasis = стаб  |
| **4. LLM-движок** (ai-provider) | ✅   | ✅               | ✅ чисто    | vision/audio без таймаута; на VPS GCP-creds сломаны (ai_audit)          |
| **5. Recap + нормализация**     | ✅   | ✅ live safe     | ⚠️          | normalizeLaycan не в общей либе; detectSpot ломается на объект-openDate |

---

## 1. КЛАССИФИКАЦИЯ

**Вход:** `app/api/ai/classify/route.ts` — session.emails → EmailInput (body обрезается до 3000 симв.) → батчи по 20 → `callAiJson('CLASSIFY', responseSchema)` параллельно.
**8 категорий:** CARGO_INQUIRY / VESSEL_POSITION / FIXTURE_RECAP / CLIENT_REPLY / DOCUMENT / TCT_REQUEST / VESSEL_CERTIFICATE / OTHER.
**Выход:** `session.classifications` → `.filter()` в parse-cargo/vessel/recap.
**Реальное распределение (4 сессии):** CARGO 56% · VESSEL 36% · TCT 4% · RECAP 2% · OTHER 1% · REPLY 1% · DOCUMENT/CERT 0%.

**Проблемы:**
| Проблема | Статус | Файл | Impact |
|---|---|---|---|
| TCT_REQUEST + VESSEL_CERTIFICATE — нет парсера (orphan) | confirmed | route filter отсутствует | ~4% писем: данные не извлекаются, только бейдж |
| Параллельные батчи fail-fast: 1 non-timeout error (429) → весь classify 500 | confirmed | `classify/route.ts:74` | все письма остаются unclassified при сбое одного батча |
| LLM считает is_unanswered/days_without_reply → они ОТБРАСЫВАЮТСЯ (берутся из Gmail-меток) | confirmed | `classification-service.ts:130` | холостые LLM-токены |
| Нет идемпотентности: реклассификация на каждый POST | confirmed | `classify/route.ts` | дублирует AI-стоимость при retry |
| urgency default 'low' противоречит промпту (CARGO должен ≥medium) | confirmed | `classification-service.ts:140` | заниженная срочность если Gemini не вернул urgency |
| Multi-intent письмо → одна категория | by design | `schemas/classify.ts:38` | редкие смешанные письма теряют второй аспект |

## 2. PARSE-CARGO

**Вход:** classifications[CARGO_INQUIRY] ∩ emails → кэш-проверка (hash промпта+rag) → RAG IMSBC-контекст (топ-3, fail-open) → prompt (body до 12000) → `callAiJson(PARSE_CARGO_SCHEMA)`.
**Выход:** ParsedCargo[] → calibrateAll (понижает confidence при «abt/circa») → fallbacks → parsed_results + updateSession → computeAndPersistMatches.
**Реальный fill (80 items):** weightMt 99% · laycan 100% (строка ✅) · порты 100% · cargoType 100%. Мульти-итем (itemIndex) корректен.

**Проблемы:**
| Проблема | Статус | Файл | Impact |
|---|---|---|---|
| RANGE RULE нарушен: weightMt НЕ null при диапазоне (57.5% грузов) — LLM кладёт верхнюю границу | confirmed | `parse-cargo-ai.ts:103` | matching берёт верх диапазона как факт → завышает TCE+fit |
| соль/цемент в биг-бэгах → BREAK_BULK (LLM игнорит ALWAYS-BULK); фолбэк ловит только "loose" | confirmed (4+ записи) | `cargo-rate-fallback.ts:136` | неверный cargoType → не те фильтры/сортировка |
| commission_percent: схема Type.NUMBER vs промпт «ConfidenceField» | confirmed | `schemas/parse-cargo.ts:59` | теряется confidence/source_text по комиссии |
| itemIndex нестабилен между перепарсингами (зависит от порядка LLM) | suspected | `parse-cargo-ai.ts:94` | перепарсинг → сдвиг index → ломает привязку worksheet/match |
| Пустые письма не кэшируются (retry на timeout) | confirmed | `email-cache.ts:61` | риск повторных дорогих timeout-вызовов |

## 3. PARSE-VESSEL

**Вход:** classifications[VESSEL_POSITION] ∩ emails → кэш → prompt (сырой email + subject) → `callAiText(PARSE_VESSEL_SCHEMA)`.
**Выход:** ParsedVessel[] → preNormalize-гарды → calibrate → applyGearedFallback (B1-B8) → Equasis verify → parsed_results + updateSession.
**Реальный fill (52 судна) — ДЫРЫ:** speedLaden **78% null** · consumption **86% null** · ciiRating **100% null** · dwcc 53% · built 25% · geared 21% · dwtSummer 17% · openDate 2%.

**Проблемы:**
| Проблема | Статус | Файл | Impact |
|---|---|---|---|
| speed 78% / consumption 86% null → TCE на дефолтах 12kts/25mt | confirmed | `tce-calculator.ts:27` | «$/день» ~80% судов = дефолты, ненадёжно для переговоров |
| Equasis — СТАБ (8-записей словарь, без живого HTTP) | confirmed | `equasis-client.ts:124` | «верификация» фиктивна; IMO вне словаря → ложное «not found» |
| openDate тип `ConfidenceField<string>`, а value = объект {open,close,display} | confirmed | `types.ts:248` | тип лжёт; ломает detectSpot (см. узел 5) |
| 3/52 судна vesselName=null (LLM вернул items=[] → fallback [result]) | confirmed | `parse-vessel-helpers.ts:230` | судно без имени → проблемы матча/дисплея |
| openDate без года + refYear=текущий → старые письма в будущее | suspected | `date-parsing.ts:99` | устаревшее судно помечается «свежим» |

## 4. LLM-ДВИЖОК (ai-provider.ts)

**Чисто:** provider-chain `<SCOPE>_PROVIDER→AI_PROVIDER→openai`; audit в `finally` (не роняет); Bedrock extractJson сохранён; Gemini responseSchema-путь верен. **Все 3 задокументированных anti-pattern закрыты.**
**Реальный ai_audit (живые строки):** 8 CLASSIFY ok=0 — нет `GOOGLE_APPLICATION_CREDENTIALS` на VPS (2026-05-27); 398 judge ok=0 «invalid model»; PARSE_CARGO «fetch failed»; 1 успех (gemini-2.5-pro, $0.023, 48s). cost_usd NULL для openai.

**Проблемы:**
| Проблема | Статус | Файл | Impact |
|---|---|---|---|
| Vision/audio пути БЕЗ таймаута/abort (callBedrockAudio, callGeminiVision, inline) | confirmed | `ai-provider.ts:795,671,1017,1131` | могут зависнуть навсегда; нарушают invariant rules-doc |
| OpenAI callAiJson тихий fallback → undefined на non-timeout error | confirmed | `openai.ts:122` | тихая порча данных |
| classify не кэшируется по emails → реклассификация всех каждый цикл | confirmed | `classify/route.ts` | N×стоимость при большом inbox |
| parsed_results: stale-строки не чистятся при смене версии промпта | confirmed | `email-cache.ts:52` | бесконечный рост таблицы |
| GCP creds сломаны на dev-VPS → live classify/parse падал | confirmed (ai_audit) | env | нужна проверка прода (demo-режим маскирует) |

## 5. RECAP + НОРМАЛИЗАЦИЯ + СДАЧА В ДВИЖОК

**3 recap-маршрута:** `/api/ai/parse-recap` (FIXTURE_RECAP → `parsedFixtureRecaps`, display-only, НЕ кормит движок); `/api/ai/recap` + `/api/recap/generate` (переговоры → `session.recaps`).
**Date-parsing** (`date-parsing.ts`): parseLaycan (11 паттернов: ISO-range, dd-dd Mon, «first half of», «onwards» +14д, single-day), parseVesselOpenDate (string|объект|spot), detectSpot.
**Shape-контракт:** канон = laycan СТРОКА, openDate ConfidenceField. **LIVE-парсинг безопасен** (cargo→string, vessel→CF). Баг «0 матчей» был в seed/build.ts (laycan-объект + openDate-голая-строка → cfValue=null → unknown verdict) — починен в regenerate-matches через in-script normalizeLaycan/wrapOpenDate.

**Проблемы:**
| Проблема | Статус | Файл | Impact |
|---|---|---|---|
| normalizeLaycan/wrapOpenDate НЕ в общей либе (только в regenerate-matches) | confirmed | `regenerate-matches.ts:227` | новый seed-скрипт может воспроизвести баг «0 матчей» |
| detectSpot тихо падает на объект-openDate (cfValue→объект, detectSpot ждёт строку) | confirmed | `pair-analyzer.ts:96` | спот-суда → 'idle' вместо 'ideal' → демоут из main в review |
| rebuildWorksheets нормализует в памяти, но не пишет в parsed_results | confirmed | `regenerate-matches.ts:91` | дивергенция если запущен только этот путь |
| laycan хранится epoch-ms; UI ms-vs-s (qa #665) | suspected | `compute-matches.ts:115` | риск мисрендера дат (UI-сторона) |

---

## РЕАЛЬНЫЕ БАГИ vs ПО-ДИЗАЙНУ

**По дизайну (НЕ баг):** demo-bypass LLM; laycan epoch-ms; дефолты для отсутствующих speed/consumption (это fallback-механизм — но 78/86% null превращает его в проблему ДАННЫХ, не кода).

**Реальные баги (приоритет для матчинга/экономики):**

1. **Диапазон веса → верхняя граница** (57.5% грузов) → завышает TCE+fit. Фикс: применить RANGE RULE постфактум (weightMt=null при min≠max).
2. **detectSpot ломается на объект-openDate** → спот-суда демоутятся из main. Фикс: нормализовать openDate в строку до detectSpot.
3. **Данные судна (speed/consumption) 78/86% пустые** → TCE на дефолтах. Фикс: усилить промпт/фолбэки извлечения скорости/расхода ИЛИ показывать честный «est.» флаг.
4. **соль/цемент → BREAK_BULK** → не те гейты. Фикс: расширить ALWAYS-BULK фолбэк.
5. **Orphan-категории** (TCT/CERT бейдж без парсера) — парсить или убрать обещание.
6. **classify fail-fast** (1 батч → весь 500). Фикс: per-batch устойчивость.
7. **Equasis-стаб как «верификация»** — реализовать или честно пометить «не проверено».
8. **normalizeLaycan не в общей либе** → риск рецидива «0 матчей». Фикс: вынести в shared.
9. **vision/audio без таймаута** — риск зависания (если пути используются).

**Самый важный для founder:** даже когда #819 (list==detail) починят — входы TCE для ~80% судов = дефолты 12kts/25mt, т.к. скорость/расход не извлекаются. Качество экономики упирается в качество извлечения данных судна, не в формулу.

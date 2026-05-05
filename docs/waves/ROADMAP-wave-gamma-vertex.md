# Wave γ — Vertex AI / Gemini migration (ROADMAP-input для wave-pipeline)

> **Назначение этого файла:** input для `pipeline decompose --plan-id wave-gamma-vertex`.
> Phase D декомпозирует каждый item ниже в отдельную spec в `.specs/wave-gamma-vertex/`.
> Полный план волны (бюджет, rollout, DoD) — в [`wave-gamma-vertex-migration.md`](./wave-gamma-vertex-migration.md).
>
> **Хард-требование волны:** все 13 спек должны позволять rollback на gpt-5.5 одним env var
> (`AI_PROVIDER=openai` или `<SCOPE>_PROVIDER=openai`). Никто не зашивает имена моделей в код,
> никто не убирает существующий OpenAI-путь через ClipProxy. Спека γv-00 (foundation shim)
> обязательно мержится первой — это блокер всех остальных.
>
> **GCP context (готово, не входит в специи):**
>
> - Project: `quantika-demo-2026`, location `us-central1`
> - Service account key: `~/.config/gcp/quantika-vertex-ai.json` (chmod 600, на Mac разработчика)
> - SDK: `@google/genai` (не deprecated `@google-cloud/vertexai`)
> - Бюджет покрывается GenAI App Builder credit ($900 до 15 апреля 2027)

---

## Item 1: ai-provider-shim (foundation, γv-00)

**Цель:** создать `lib/ai-provider.ts` — единый shim для всех AI-вызовов с поддержкой двух провайдеров (OpenAI через ClipProxy, Gemini через Vertex AI). Не трогать существующие endpoint'ы — только инфраструктура.

**Что должно быть в спеке:**

- Новый файл `lib/ai-provider.ts` с функциями `getProvider(scope)`, `getModel(scope)`, `callAi(scope, prompt, opts)`, `callAiJson<T>`, `callAiText`, `callAiVision`, `callAiAudio`.
- Routing logic: per-scope override (`<SCOPE>_PROVIDER` env) → global (`AI_PROVIDER` env) → default `openai`.
- Подключить `@google/genai` SDK (npm install).
- Env vars: `AI_PROVIDER`, `GOOGLE_APPLICATION_CREDENTIALS`, `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`.
- Создать `.env.gpt-fallback.example` — emergency rollback пресет (все `*_PROVIDER=openai`).
- Обновить `.env.local.example` с полным набором новых env'ов и дефолтом `openai`.
- SQLite таблица `ai_audit` для логирования вызовов (request, response, usage, provider, model, latency).
- Unit test `lib/__tests__/ai-provider.test.ts` — мок обоих провайдеров, проверка routing.
- Documentation: README секция "AI Provider Switching" с инструкцией emergency rollback.

**Что не входит:** миграция endpoint'ов. Они продолжают использовать текущий `lib/openai.ts` через ClipProxy.

**Acceptance:**

- При `AI_PROVIDER=openai` shim вызывает текущий ClipProxy путь.
- При `AI_PROVIDER=gemini` shim вызывает Vertex AI с service account credentials.
- При `<SCOPE>_PROVIDER=gemini`, `AI_PROVIDER=openai` — конкретный scope идёт в Gemini, остальные в OpenAI.
- `.env.gpt-fallback.example` коммитится (без секретов).
- `npm run lint && npx tsc --noEmit && npm test` зелёный.

**Files:** `lib/ai-provider.ts` [NEW], `lib/__tests__/ai-provider.test.ts` [NEW], `.env.gpt-fallback.example` [NEW], `.env.local.example` [MIGRATE], `package.json` [REWRITE], README updates.

---

## Item 2: Migrate recap endpoint to Gemini Pro 1M context (γv-07)

**Цель:** убрать `slice(0, 2000)` ограничение в recap endpoint — Gemini Pro имеет 1M context, можем подавать полные тела писем.

**Что должно быть в спеке:**

- Endpoint `app/api/ai/recap/route.ts` использует `callAi('RECAP', ...)` через ai-provider shim (вместо прямого `callAiText`).
- Удалить `e.body.slice(0, 2000)` на строке 63 (и подобные ограничения в этом файле).
- Default model: `gemini-2.5-pro` (через `RECAP_GEMINI_MODEL` env) когда `RECAP_PROVIDER=gemini`.
- При `RECAP_PROVIDER=openai` — fallback на `gpt-5.5` через ClipProxy с прежним `slice(0, 2000)` (т.к. у gpt-5.5 контекст ограничен).
- Conditional slice: если provider=openai → slice 2000; если provider=gemini → no slice.
- Regression test на длинном email-треде (10 писем по 5K символов) — проверка что весь контент попал в prompt.

**Acceptance:**

- При `RECAP_PROVIDER=gemini` — recap получает полные письма, summary заметно качественнее на длинных тредах.
- При `RECAP_PROVIDER=openai` — старое поведение (slice 2000) сохранено.
- Existing tests green, +1 новый regression test.

**Files:** `app/api/ai/recap/route.ts` [REWRITE], `app/api/ai/__tests__/recap.test.ts` [REWRITE].

**Dep:** Item 1 (γv-00) merged.

---

## Item 3: Migrate draft-quote and draft-reply to Gemini Flash (γv-05)

**Цель:** перевести генерацию текстов писем (quote и follow-up) на Gemini 2.5 Flash через shim. Снижение стоимости 94%.

**Что должно быть в спеке:**

- `app/api/ai/draft-quote/route.ts` использует `callAi('DRAFT_QUOTE', ...)`.
- `app/api/ai/draft-reply/route.ts` использует `callAi('DRAFT_REPLY', ...)`.
- Default Gemini model: `gemini-2.5-flash`.
- Rollback: `DRAFT_QUOTE_PROVIDER=openai` / `DRAFT_REPLY_PROVIDER=openai`.
- A/B regression: 20 sample inquiries, sравнить outputs OpenAI vs Gemini по качеству (manual review критериям: тон, структура, упомянуты ли все ключевые поля).

**Acceptance:** Both providers работают, regression баги не появились, тесты зелёные.

**Files:** `app/api/ai/draft-quote/route.ts` [REWRITE], `app/api/ai/draft-reply/route.ts` [REWRITE], тесты.

**Dep:** Item 1.

---

## Item 4: Migrate parse-vessel to Gemini Flash (γv-03)

**Цель:** перевести vessel-position parsing (DWT, DWCC, draft, gearing, open_date) на Gemini Flash. Простая JSON-extraction задача — низкий риск.

**Что должно быть в спеке:**

- `app/api/ai/parse-vessel/route.ts` использует `callAi('PARSE_VESSEL', ...)`.
- Default Gemini model: `gemini-2.5-flash`.
- Rollback flag: `PARSE_VESSEL_PROVIDER=openai`.
- Использовать структурированный JSON output mode Gemini (responseSchema) для надёжного парсинга.
- Regression eval через `scripts/eval/run-parser.ts` на existing vessel corpus, threshold f1 ≥ 0.95.

**Acceptance:** parsed fields идентичны OpenAI на ≥95% sample, тесты зелёные.

**Files:** `app/api/ai/parse-vessel/route.ts` [REWRITE], `scripts/eval/run-parser.ts` [MIGRATE если нужно], тесты.

**Dep:** Item 1.

---

## Item 5: Migrate parse-cargo to Gemini Flash (γv-02)

**Цель:** перевести cargo-inquiry parsing (порт загрузки/выгрузки, тоннаж с ranges, MOLOO, laycan, ставки) на Gemini Flash. Самый дорогой endpoint в системе.

**Что должно быть в спеке:**

- `app/api/ai/parse-cargo/route.ts` использует `callAi('PARSE_CARGO', ...)`.
- Default Gemini model: `gemini-2.5-flash`.
- Rollback flag: `PARSE_CARGO_PROVIDER=openai`.
- **Особое внимание** к MOLOO RULE, RANGE RULE, source_text verbatim copy — Gemini может ошибаться на паттернах "подставь точную цитату". Промпт-инжиниринг + строгая JSON schema.
- Eval через `scripts/eval/run-parser.ts` на cargo corpus, threshold f1 ≥ 0.95 для парных полей (port_loading, port_discharge, weight, weight_range, laycan_start, laycan_end), source_text exact-match ≥ 0.90.

**Acceptance:** eval thresholds met, тесты зелёные. Если confidence levels работают по-другому в Gemini — задокументировать в spec'е.

**Files:** `app/api/ai/parse-cargo/route.ts` [REWRITE], тесты.

**Dep:** Item 1.

---

## Item 6: Migrate classify endpoint to Gemini Flash (γv-01)

**Цель:** перевести email classification (8 категорий + urgency + confidence + forwarded sender) на Gemini Flash. Самый частый AI-вызов.

**Что должно быть в спеке:**

- `app/api/ai/classify/route.ts` использует `callAi('CLASSIFY', ...)`.
- Default Gemini model: `gemini-2.5-flash`.
- Batch size: тот же (20 писем). Проверить что Gemini корректно обрабатывает batch с structured output array.
- Rollback flag: `CLASSIFY_PROVIDER=openai`.
- Regression eval: 100 real emails, точность category ≥ 0.95, urgency ≥ 0.90, forwarded sender detection ≥ 0.90.

**Acceptance:** eval met, тесты зелёные. Особенно проверить русскоязычные аббревиатуры в арабских тредах (TCT, MOLOO).

**Files:** `app/api/ai/classify/route.ts` [REWRITE], тесты.

**Dep:** Item 1.

---

## Item 7: Migrate parse-recap to Gemini Pro (γv-04)

**Цель:** перевести fixture recap parsing (юридически значимый документ — laycan, freight rate, commission, charter party clauses) на Gemini 2.5 Pro (не Flash, нужно reasoning).

**Что должно быть в спеке:**

- `app/api/ai/parse-recap/route.ts` использует `callAi('PARSE_RECAP', ...)`.
- Default Gemini model: `gemini-2.5-pro` (heavy task).
- Rollback flag: `PARSE_RECAP_PROVIDER=openai`.
- Regression eval на 30 real fixture recaps, точность ключевых полей (laycan, freight_rate, commission, demurrage, despatch) ≥ 0.95.

**Acceptance:** eval met, тесты зелёные.

**Files:** `app/api/ai/parse-recap/route.ts` [REWRITE], тесты.

**Dep:** Item 1.

---

## Item 8: WhatsApp image OCR — replace fake LLM-text-call with Gemini Vision (γv-09)

**Цель:** починить скрытый баг — `lib/whatsapp/image-ocr.ts` сейчас отправляет URL картинки текстом в LLM (callAiText), что не работает с моделями без vision. Заменить на нативный Gemini Vision вызов с inlineData (base64 image) или fileData (URL).

**Что должно быть в спеке:**

- `lib/whatsapp/image-ocr.ts` использует `callAiVision('WHATSAPP_OCR', images, prompt)` через shim.
- Поддержка multi-image: до 3 изображений в одном вызове (например, 3 страницы B/L).
- Default Gemini model: `gemini-2.5-flash` (хорошо справляется с OCR).
- Rollback flag: `WHATSAPP_OCR_PROVIDER=openai` — но в этом случае возвращается текущее (нерабочее) поведение или fallback на простой "image not available" message.
- Integration test с realистичными test-fixtures (sample B/L PDF screenshot, invoice screenshot).

**Acceptance:** При получении картинки в WhatsApp realистичный текст из неё извлекается. Когда `OPENAI_PROVIDER` — старое поведение сохранено.

**Files:** `lib/whatsapp/image-ocr.ts` [REWRITE], `app/api/whatsapp/ingest/route.ts` [MIGRATE], тесты.

**Dep:** Item 1.

---

## Item 9: WhatsApp voice transcription — Gemini 2.0 Flash audio (γv-08)

**Цель:** перевести голосовую транскрипцию с OpenAI Whisper на Gemini 2.0 Flash audio (нативный multimodal). Главный benefit — Arabic+English code-switching для MENA-брокеров.

**Что должно быть в спеке:**

- `lib/whatsapp/voice-transcribe.ts` и `lib/voice/whisper-transcribe.ts` используют `callAiAudio('WHATSAPP_VOICE', audioFile)` через shim.
- Default Gemini model: `gemini-2.0-flash` (audio input).
- Rollback flag: `WHATSAPP_VOICE_PROVIDER=openai` — возвращает Whisper API.
- Tests с mock audio fixtures (Arabic, English, mixed Arabic-English).
- Documentation: notes про latency и поддерживаемые формaты (OGG, M4A).

**Acceptance:** transcription качество на mixed Arabic-English лучше чем у Whisper. Обратная совместимость через rollback flag.

**Files:** `lib/whatsapp/voice-transcribe.ts` [REWRITE], `lib/voice/whisper-transcribe.ts` [REWRITE], тесты.

**Dep:** Item 1.

---

## Item 10: LLM-driven agent planner (γv-10)

**Цель:** заменить regex-based `detectKinds()` в `lib/agent/plan-first.ts` на LLM-вызов к Gemini Flash. Брокер сможет писать на естественном языке вместо ключевых слов.

**Что должно быть в спеке:**

- Новая функция `llmDetectKinds(goal: string): Promise<string[]>` через `callAiJson('AGENT_PLANNER', ...)`.
- Возвращает JSON: `{steps: ["check-sanctions", "check-cii", "compare-routes"]}`.
- Existing `detectKinds()` (regex) переименовать в `regexDetectKinds()`, сохранить как fallback.
- Rollback flag: `AGENT_PLANNER_PROVIDER=regex` (специальный mode "use rule-based") или `=openai` или `=gemini`.
- Default Gemini model: `gemini-2.5-flash`.
- Tests на 20 разных формулировок целей: чистые ("проверь санкции"), синонимичные ("compliance check"), смешанные ("посмотри риски и санкции"), edge cases.

**Acceptance:** На корпусе 20 целей LLM planner выбирает корректные шаги ≥90% случаев. Regex остаётся работающим fallback'ом.

**Files:** `lib/agent/plan-first.ts` [REWRITE], `lib/agent/__tests__/plan-first.test.ts` [REWRITE].

**Dep:** Item 1.

---

## Item 11: Migrate match endpoint to Gemini Pro (γv-06)

**Цель:** перевести cargo↔vessel matching на Gemini 2.5 Pro. **Самый сложный prompt в системе** (387 строк с hard score caps, MANDATORY ISSUES SURFACING, FINAL AUDIT). Делается последним.

**Что должно быть в спеке:**

- `app/api/ai/match/route.ts` использует `callAi('MATCH', ...)`.
- Default Gemini model: `gemini-2.5-pro` (heavy reasoning task).
- Rollback flag: `MATCH_PROVIDER=openai` — этот flag критичен, в случае регрессии немедленный откат.
- Extensive regression eval: 50 real match scenarios, проверка score deviation ≤ ±5 points между OpenAI и Gemini, проверка что MANDATORY ISSUES surfaced, проверка readiness/score caps respected.
- Mandatory adversarial QA через `/test-skill` после implementation.

**Acceptance:** На corpus 50 scenarios median score deviation ≤ 5 pts, все critical issues surfaced. Если деградация — rollback flag включён в production.

**Files:** `app/api/ai/match/route.ts` [REWRITE], `lib/prompts/match.ts` [MIGRATE если нужны Gemini-specific tweaks], тесты.

**Dep:** Items 1, 2-7 (foundation + parse endpoints должны быть готовы для регрессии).

---

## Item 12: "Explain this deal" feature (γv-11)

**Цель:** новая wow-фича для Дубая — кнопка "Explain" на match странице, генерирующая 3-4 параграфа на English/Arabic с разбором сделки (margin breakdown, risks, market context, recommended next steps).

**Что должно быть в спеке:**

- Новый endpoint `app/api/ai/explain-deal/route.ts` с `callAi('EXPLAIN_DEAL', ...)`.
- Default Gemini model: `gemini-2.5-pro`.
- Input: full match payload (match score, cargo, vessel, economics result with TCE/ETS/bunker breakdown).
- Output: structured 4-section narrative (Market Context → Deal Rationale → Key Risks → Recommended Next Steps).
- Language detection: Arabic для Arabic-speaking брокеров (через language hint в request body).
- UI: кнопка "Explain this deal" на `app/match/[id]/page.tsx`, modal с loading state и result.
- Feature flag: `EXPLAIN_DEAL_ENABLED=true|false` (default false до finalize'а UX).
- Rollback flag: `EXPLAIN_DEAL_PROVIDER=openai` для использования gpt-5.5 если нужно (но Gemini Pro лучше для длинного reasoning).

**Acceptance:** Кнопка работает, генерирует осмысленный narrative за ≤10 секунд, Arabic версия читается носителями. Feature flag корректно скрывает кнопку.

**Files:** `app/api/ai/explain-deal/route.ts` [NEW], `app/match/[id]/page.tsx` [REWRITE], `components/match/ExplainDealModal.tsx` [NEW], тесты.

**Dep:** Items 1, 11 (match endpoint мигрирован, чтобы payload консистентный).

---

## Item 13: Imagen 4 — route map for demo (γv-12)

**Цель:** новая wow-фича — кнопка "Generate route visual" на match странице, генерирующая инфографику маршрута через Imagen 4 ($0.04/img).

**Что должно быть в спеке:**

- Новый endpoint `app/api/ai/generate-route-map/route.ts`.
- Imagen 4 SDK integration (через `@google/genai`).
- Input: cargo origin port, vessel current position, discharge port, ETA.
- Prompt template: "Maritime route map: vessel at {origin}, loading at {loading_port}, discharging at {discharge_port}. Modern infographic style, blue ocean, ship icons, port markers, clean typography."
- Output: PNG URL (хранение в Cloud Storage с signed URL, 7-day expiry).
- UI: кнопка "Generate route visual" на match странице, modal с image preview и download.
- Feature flag: `ROUTE_MAP_ENABLED=true|false` (default false).
- Rate limit: 1 generation per match per hour (защита от accidental cost overruns).

**Acceptance:** Кнопка работает, изображение генерируется за ≤15 секунд, выглядит presentable для клиентского demo. Feature flag скрывает кнопку.

**Files:** `app/api/ai/generate-route-map/route.ts` [NEW], `app/match/[id]/page.tsx` [REWRITE — добавление кнопки], `components/match/RouteMapModal.tsx` [NEW], тесты, Cloud Storage bucket setup notes в README.

**Dep:** Item 1.

---

## Wave structure (для wave-pipeline)

Phase D должен сгруппировать в waves следующим образом (можно подсказать через decomp комментарии):

- **Wave 0 (sequential, 1 spec):** Item 1 (γv-00 foundation)
- **Wave 1 (parallel, 6 specs, dep: Wave 0):** Items 2-7 (γv-07, γv-05, γv-03, γv-02, γv-01, γv-04) — все парные миграции через shim, разные файлы
- **Wave 2 (parallel, 3 specs, dep: Wave 1):** Items 8, 9, 10 (γv-09, γv-08, γv-10) — multimodal + agent planner
- **Wave 3 (sequential, 1 spec, dep: Wave 2):** Item 11 (γv-06 match) — последним из миграций, наиболее сложный
- **Wave 4 (parallel, 2 specs, dep: Wave 3):** Items 12, 13 (γv-11 Explain, γv-12 Imagen) — новые wow-фичи

Phase QA Two-Agent Model — **обязательно enabled** (`qa.enabled=true`, `qa.soft_block=false`) для всех специй. Persona — `broker` (`prompts/personas/broker.md`).

---

## Out of scope для этой волны

- **VPS deploy ключа** — отдельная ops-задача после волны (`γv-deploy-keys`)
- **Stretch features:** match с историей сделок (γv-13), semantic sanctions (γv-14), Vertex AI Search (γv-15) — после оценки бюджета токенов
- **Allegro Lister migration** — другой проект, другая волна

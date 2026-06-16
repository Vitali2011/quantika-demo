# ADR-0002: Claude как канонический парсер cargo-инквайри

## Status

Proposed (2026-06-16)

Связано: план `docs/superpowers/plans/2026-06-16-plan-B-cargo-data-truth.md`
(Group B — cargo-data truth, issues #1021 #1022 #1023).

## Context

Провенанс-аудит топ-матчей (qa-walker, 2026-06-16) показал: парсер cargo
**теряет данные, которые ЕСТЬ в письме**, а потом UI рисует «not stated /
scored conservatively»:

- `Qty: about 12,000 net CBM / 13,500 gross CBM` → `volume_cbm = null`
  (нет правила «net/gross → бери net»);
- `5.000/5.500mts bgd Cement` → `weight = null` (нет правила «европейская
  точка = разделитель тысяч»; `5.000` читается как 5.0 MT → неправдоподобно →
  модель отдаёт null);
- `any 12,000-14,000 dwt vsl` → требование к размеру судна оседает в свободном
  тексте `special_requirements`, структурного поля `min/max_vessel_dwt_mt` нет.

Текущий дефолтный провайдер парсинга — Gemini (`PARSE_CARGO` scope →
`AI_PROVIDER`). В dev-окружении **биллинг Gemini мёртв** — гонять реальный
ре-парс демо-корпуса через Gemini нельзя. Ручной бэкфилл JSON
(`lib/sample-data/demo-parsed-cargoes.json`) отвергнут: он лечит симптом на
конкретных примерах, но парсер остаётся сломанным для новых писем и расходится
с тем, что увидит прод.

Доступна **подписка Claude/Anthropic**. Уже есть offline-паттерн
(quote-workshop / `seed:*`): скрипты вне Next гоняют LLM через
`AI_PROVIDER=claude-cli` (`callClaudeCliRaw`, `spawnSync` на `claude --print`).
Но `claude-cli` **запрещён внутри Next.js request-handlers** — гард
`NEXT_RUNTIME` в `lib/ai-provider.ts:421` (spawnSync блокирует event loop до
85 c). Значит claude-cli годится для офлайн-регенерации демо-данных, но НЕ для
live-парсинга новых писем в запросе.

Варианты:

1. **Ручной бэкфилл JSON** — быстро, но симптоматично, парсер не чинится,
   list≠prod. Отвергнут.
2. **Чинить только промпт под Gemini** — биллинг Gemini в dev мёртв, реальный
   ре-парс невозможен; и Gemini структурно слабее на этих кейсах. Отвергнут как
   единственное решение.
3. **Claude каноническим парсером** — офлайн (claude-cli, подписка) для
   регенерации демо + live через **Anthropic-API провайдер** в цепочке. Выбран.

## Decision

Делаем **Claude каноническим парсером cargo-инквайри** по двум путям:

**(a) Офлайн — регенерация демо-данных (сейчас).**
Реальный ре-парс демо-корпуса через подписку: `AI_PROVIDER=claude-cli npx tsx
scripts/build-sample-data.ts` перегенерирует `demo-parsed-cargoes.json`, затем
`npm run seed:all` пересобирает demo-seed.db + worksheets. Никакого ручного
редактирования значений в JSON (иначе это не «реальный ре-парс» и нарушает
PI3). Промпт `lib/prompts/parse-cargo.ts` дополняется тремя правилами:
EUROPEAN-DOTS (точка = тысячи), NET/GROSS CBM (бери net), min/max vessel DWT
(структурные числовые поля требования к размеру судна).

**(b) Live — новый Anthropic-API провайдер (canonical going forward).**
В `lib/ai-provider.ts` добавляется провайдер `'anthropic'` (прямой Anthropic
API, НЕ claude-cli, НЕ Bedrock) в цепочку выбора
`PARSE_CARGO_PROVIDER → AI_PROVIDER → "openai"`. Включается через
`PARSE_CARGO_PROVIDER=anthropic` + `ANTHROPIC_API_KEY`. Это позволяет live
in-request парсингу новых писем использовать Claude, не нарушая гард
`NEXT_RUNTIME` (claude-cli там по-прежнему запрещён).

Провайдер обязан соблюдать инварианты `.claude/rules/ai-provider.md`:

- регистрация через `getProvider()`/`getModel()` switch; неизвестное значение
  по-прежнему → fallback `"openai"`;
- пробрасывает `signal` + `timeoutMs` (дефолт 85_000 мс) через
  `buildAbortController(opts)`;
- `writeAuditRecord` в `finally` (наследуется из общего try/finally в
  `callAiJson`); ошибка аудита не роняет основной вызов;
- структурный JSON: `extractJson()` перед `JSON.parse` (Claude может добавить
  преамбулу), `responseSchema` передаётся как и для Gemini;
- SDK тянется lazy (`await import('@anthropic-ai/sdk')`), как Bedrock/Vertex.

Модель по умолчанию для провайдера: `ANTHROPIC_MODEL_ID ?? 'claude-opus-4-8'`.

## Consequences

**Плюсы:**

- Демо-данные становятся *правдой*: CBM, dot-thousands MT, требование к DWT
  восстанавливаются реальным ре-парсом, а не вручную.
- Парсер чинится для НОВЫХ писем тоже (live Anthropic-провайдер) — list==prod,
  не расходится.
- Не зависим от мёртвого Gemini-биллинга в dev (офлайн — подписка claude-cli).
- Решение обратимо: провайдер выбирается env'ом; снять
  `PARSE_CARGO_PROVIDER=anthropic` → откат на прежний дефолт. claude-cli и
  Anthropic-API — два разных пути, чётко разведённые гардом `NEXT_RUNTIME`.

**Минусы / trade-offs:**

- Ре-парс — недетерминированный вывод LLM: значения в `demo-parsed-cargoes.json`
  могут чуть плавать между прогонами. Тесты-фикстуры проверяют восстановленные
  значения; при промахе — править ПРОМПТ и перегонять, не хардкодить JSON.
- **Два write-path** демо-данных (`build-sample-data.ts` пишет JSON;
  `seed:*`/`regenerate-matches.ts` пишут worksheets в demo-seed.db) — оба
  обязаны нести новые поля, иначе list≠detail. Держать синхронно.
- Прямой Anthropic API в live = реальная стоимость за вызов на проде (в отличие
  от dev-подписки). Скоуп-провайдер `PARSE_CARGO_PROVIDER` ограничивает только
  парсинг cargo, не весь трафик.
- Новый внешний SDK-зависимость (`@anthropic-ai/sdk`) в bundle (lazy import
  держит её вне sqlite/прочих путей).
- claude-cli НЕЛЬЗЯ использовать live (event-loop block) — это навсегда офлайн
  инструмент; live всегда через Anthropic-API провайдера.

> Доменные термины (TCE, RAG scope, match bucket и т.д.) — в `CONTEXT.md`.
> Инварианты провайдера — `.claude/rules/ai-provider.md`.

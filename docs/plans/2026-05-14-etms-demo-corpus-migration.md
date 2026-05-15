# ETMS Demo-Corpus Migration — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: this plan is executed via `task-okestor-deep`
> (strict-mode decomposition + execution). Не используй стандартный
> `executing-plans` — проект имеет историю recurring-bug-чейнов, нужен
> systematic-debugging в BLOCK_AND_FIX loop и 9-class boundary QA.

**Goal:** Заменить curated V2-демокорпус (12 писем) на полный реальный
ETMS-корпус (154 письма) — письма, классификация, распарсенный вывод и тесты,
всё согласованно в одном такте.

**Architecture:** Новый офлайн-скрипт `scripts/build-sample-data.ts` —
single source of truth: читает `.private/etms-corpus.json`, прогоняет 154
письма через те же lib-функции, что и API-маршруты (`classify`, `parse-cargo`,
`parse-vessel`), и атомарно перезаписывает 8 файлов в `lib/sample-data/`.
Фикстуры никогда не правятся руками — только перегенерируются скриптом. Тесты
переписываются так, чтобы выводить ожидания из закоммиченных фикстур, а не
хардкодить `sample-NN`.

**Tech Stack:** TypeScript, Next.js 16, Jest, `tsx` для скриптов, `p-limit`
для concurrency. LLM через `lib/ai-provider.ts` (`callAiJson` / `callAiText`),
Gemini Flash (через Vertex AI) для парсинга.

**Design doc:** `docs/plans/2026-05-14-etms-demo-corpus-migration-design.md`

---

## Контекст для исполнителя (zero-context brief)

Демо-режим quantika-demo (`POST /api/sample`) сидит в сессию заранее
заготовленные письма из `lib/sample-data/*.json` и их распарсенный вывод.
Файлы связаны по email ID. Сейчас там 12 curated «V2»-писем с ID `sample-01`
..`sample-12` + ещё категории (vessel/recap/client-reply) → всего ~32 письма.

Коммит `a321e82` две недели назад попытался заменить их на 154 реальных
письма, но заменил только email-файлы (новые hex-ID), не тронув распарсенный
вывод и тесты (там остались `sample-NN`). 23 теста упали → откат в PR #141.

**Источник нового корпуса:** `.private/etms-corpus.json` — массив из 154
объектов `Email` (поля: `id`, `threadId`, `from`, `fromName`, `fromEmail`,
`to`, `subject`, `date`, `body`, `snippet`, `labelIds`). ID — это Gmail
message-id, hex-строка (`19d5de87705baf9b`). **Поля классификации в корпусе
НЕТ** — её надо проставить через LLM. `.private/` в gitignore — source не
коммитим, коммитим только производные `lib/sample-data/` файлы.

**Ключевые архитектурные решения (из дизайн-дока, уже одобрены):**

- Приватность: производные файлы коммитим как есть.
- Даты: сдвигаем только envelope-дату через `_meta.emailDateOffsetDays`; тела
  писем НЕ трогаем (иначе ломается `source-text-validity` тест).
- Реестр судов: парсер `/api/vessel/[imo]` НЕ трогаем, реестр просто меньше.
- Генерация: офлайн-скрипт, не HTTP-endpoints.

**Где что лежит (точные пути):**

- AI-провайдер: `lib/ai-provider.ts` — `callAiJson<T>(scope, system, user, opts)`
  :624, `callAiText(scope, system, user, opts)` :685. Провайдер/модель
  выбираются по env (`AI_PROVIDER`, `<SCOPE>_PROVIDER`, `<SCOPE>_MODEL`).
- Классификация: `lib/prompts/classify.ts` → `CLASSIFICATION_SYSTEM_PROMPT`;
  `lib/schemas/classify.ts` → `CLASSIFY_SCHEMA`; пост-обработка
  `classifyEmails(emails, aiClassifications)` из `lib/classification-service.ts:120`.
- Cargo-парсинг: `lib/prompts/parse-cargo.ts` → `CARGO_INQUIRY_PARSER_PROMPT`;
  `lib/schemas/parse-cargo.ts` → `PARSE_CARGO_SCHEMA`; пост-обработка
  `parseCargoAIResponse(raw, emailId)` сейчас в
  `app/api/ai/parse-cargo/route.ts:99-173` (Task 1 вынесет в lib); промпт-билдер
  `buildCargoPrompts(emails)` там же :75-80; fallback'ы `applyCargoRateFallback`,
  `applyCargoTypeFallback`.
- Vessel-парсинг: `lib/parsing/parse-vessel-helpers.ts` → `buildVesselPrompt(email)`
  :71, `parseVesselAIResponse(raw, emailId, subject)` :101, `applyGearedFallback`;
  `lib/prompts/parse-vessel.ts` → `VESSEL_POSITION_PARSER_PROMPT`;
  `lib/schemas/parse-vessel.ts` → `PARSE_VESSEL_SCHEMA`.
- Concurrency/retry: `lib/parse-cargo-helpers.ts` → `PARSE_CARGO_CONCURRENCY`,
  `withRetry429(fn)`; `p-limit`.
- Sample-data plumbing: `lib/sample-data/types.ts` (`SampleEmailRaw`,
  `SampleEmailMeta`), `lib/sample-data/rebase.ts` (`rebaseDates`),
  `lib/sample-data/demo-parsed-cargoes.ts` (`resolveDemoParsedCargoes`,
  `resolveDemoParsedVessels`, `resolveDemoClassifications`).
- Потребитель: `app/api/sample/route.ts` собирает `SAMPLE_EMAILS_RAW` из 6 json,
  вызывает `rebaseDates` + `resolve*`.
- Реестр судов: `lib/vessel/registry.ts` (`buildRegistry`, `parseVesselBlock`,
  `lookupVesselByImo`), читает `vessel-positions.json:75`.
- Типы: `lib/types.ts` — `Email`, `ParsedCargo` :152, `ParsedVessel` :187,
  `EmailCategory` :103, `ConfidenceField` :24.

**Env для LLM (должны быть в `.env.local`, проверить перед запуском генератора):**
скрипты на `tsx` автоподхватывают `.env.local`. Нужны переменные провайдера
(`AI_PROVIDER` + Gemini/Vertex креды: `GOOGLE_APPLICATION_CREDENTIALS`,
`GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`). Сверься с актуальным
`.env.local` — там уже настроен рабочий провайдер для demo.

---

## Файлы, затронутые планом

**Создаются:**

- `lib/parsing/parse-cargo-ai.ts` — вынесенные `parseCargoAIResponse` +
  `buildCargoPrompts` (Task 1)
- `scripts/build-sample-data.ts` — генератор (Task 3)
- `scripts/__tests__/build-sample-data.test.ts` — юнит-тесты чистых хелперов
  генератора (Task 2-3)
- `lib/sample-data/synthetic-economics.ts` — 2 синтетические economics-записи
  (Task 5)

**Перезаписываются генератором (Task 4, коммитятся в git):**

- `lib/sample-data/cargo-inquiries.json`
- `lib/sample-data/vessel-positions.json`
- `lib/sample-data/fixture-recaps.json`
- `lib/sample-data/client-replies.json`
- `lib/sample-data/documents.json`
- `lib/sample-data/vessel-certs.json`
- `lib/sample-data/demo-parsed-cargoes.json`
- `lib/sample-data/demo-parsed-vessels.json`
- `lib/sample-data/demo-classifications.json`

**Модифицируются (правки логики):**

- `app/api/ai/parse-cargo/route.ts` — реэкспорт из нового lib-модуля (Task 1)
- `lib/sample-data/demo-parsed-cargoes.ts` — passthrough вместо relative-резолва
  (Task 5)
- `package.json` — добавить `build:sample-data` скрипт (Task 3)
- 6 тестовых файлов (Tasks 7-12)

---

## ФАЗА 0 — Подготовка

### Task 0: Создать рабочую ветку и зафиксировать baseline

Ветка `feat/etms-demo-corpus-migration` уже создана (на ней лежит design doc
и этот план). Baseline зелёный — `main` после PR #141.

**Step 1:** Убедиться, что весь тест-сьют зелёный ДО изменений.

Run: `cd ~/work/quantika-demo && npm test 2>&1 | tail -20`
Expected: все сьюты PASS (это baseline; если что-то красное — STOP, разобраться
до начала миграции).

**Step 2:** Зафиксировать список из 6 затронутых тестовых файлов и прогнать
именно их — записать текущее число тестов в каждом (понадобится для PI3).

Run:

```bash
npx jest app/api/sample/__tests__/sample.test.ts \
  __tests__/sample-data/demo-parsed-cargoes.test.ts \
  app/api/vessel/[imo]/__tests__/route.test.ts \
  lib/sample-data/__tests__/source-text-validity.test.ts \
  tests/auto-prequote/cron-demo.test.ts \
  __tests__/api/parse-cargo-demo-cache.test.ts 2>&1 | tail -15
```

Expected: PASS. Запиши число тестов — это reference для PI3 enforcement.

---

## ФАЗА 1 — Рефакторинг: вынести cargo-парсер в lib (behavior-preserving)

Зачем: `parseCargoAIResponse` и `buildCargoPrompts` сейчас живут внутри
route-файла `app/api/ai/parse-cargo/route.ts`, который импортирует
`next/server`. Офлайн-скрипту нужно их импортировать без затаскивания Next-рантайма.
Vessel-парсер уже в `lib/parsing/parse-vessel-helpers.ts` — приводим cargo к
тому же паттерну. Это чистое перемещение, поведение не меняется, защищено
существующими тестами parse-cargo.

### Task 1: Вынести `parseCargoAIResponse` + `buildCargoPrompts` в `lib/parsing/parse-cargo-ai.ts`

**Files:**

- Create: `lib/parsing/parse-cargo-ai.ts`
- Modify: `app/api/ai/parse-cargo/route.ts` (удалить определения, импортировать
  из нового модуля, сохранить реэкспорт если на него кто-то завязан)
- Test: существующие parse-cargo тесты (`app/api/ai/__tests__/parse-cargo*.test.ts`,
  `__tests__/api/parse-cargo-demo-cache.test.ts`) — используются как guard

**Step 1:** Прочитать `app/api/ai/parse-cargo/route.ts` целиком. Идентифицировать
точные границы: `buildCargoPrompts` (~:75-80), `parseCargoAIResponse` (~:99-173),
все helper-функции, которые они используют (`toConfidence`, `extractNum`,
`extractStr`, `calibrateAll`, `truncateBody` и т.п.) и их импорты.

**Step 2:** Создать `lib/parsing/parse-cargo-ai.ts`: перенести туда
`buildCargoPrompts`, `parseCargoAIResponse` и все приватные хелперы, от которых
они зависят и которые НЕ используются больше нигде в route. Хелперы, которые
шарятся с остальным route — импортировать, не дублировать (DRY). Экспортировать
`buildCargoPrompts` и `parseCargoAIResponse`.

**Step 3:** В `app/api/ai/parse-cargo/route.ts` заменить определения на
`import { buildCargoPrompts, parseCargoAIResponse } from '@/lib/parsing/parse-cargo-ai'`.
Если на эти символы был внешний реэкспорт — сохранить `export { ... }`.

**Step 4:** Прогнать parse-cargo тесты.

Run: `npx jest app/api/ai/__tests__/parse-cargo __tests__/api/parse-cargo-demo-cache.test.ts 2>&1 | tail -15`
Expected: PASS, число тестов НЕ изменилось (PI3: это рефакторинг, expectations
не трогаем).

**Step 5:** Прогнать `tsc` и lint.

Run: `npx tsc --noEmit 2>&1 | tail -5 && npm run lint 2>&1 | tail -5`
Expected: 0 ошибок.

**Step 6:** Commit.

```bash
git add lib/parsing/parse-cargo-ai.ts app/api/ai/parse-cargo/route.ts
git commit -m "refactor(parse-cargo): extract AI helpers to lib/parsing/parse-cargo-ai"
```

---

## ФАЗА 2 — Генератор: чистые хелперы (TDD)

Прежде чем писать LLM-оркестрацию (которую нельзя дёшево юнит-тестить), строим
и TDD-покрываем чистые функции генератора.

### Task 2: Хелпер `computeDateOffsets` — вычисление `_meta.emailDateOffsetDays`

**Files:**

- Create: `scripts/build-sample-data.ts` (пока только этот хелпер + экспорт)
- Test: `scripts/__tests__/build-sample-data.test.ts`

**Step 1: Написать падающий тест.**

```typescript
import { computeDateOffsets } from "../build-sample-data";
import type { Email } from "../../lib/types";

function mkEmail(id: string, date: string): Email {
  return {
    id,
    threadId: id,
    from: "x",
    fromName: null,
    fromEmail: null,
    to: "y",
    subject: "s",
    date,
    body: "b",
    snippet: "sn",
    labelIds: [],
  };
}

describe("computeDateOffsets", () => {
  it("самое свежее письмо получает офсет 0, остальные — отрицательные", () => {
    const emails = [
      mkEmail("a", "2026-04-01T00:00:00.000Z"),
      mkEmail("b", "2026-04-05T00:00:00.000Z"), // самое свежее
      mkEmail("c", "2026-04-03T00:00:00.000Z"),
    ];
    const result = computeDateOffsets(emails);
    expect(result.get("b")).toBe(0);
    expect(result.get("c")).toBe(-2);
    expect(result.get("a")).toBe(-4);
  });

  it("одинаковые даты дают одинаковый офсет", () => {
    const emails = [
      mkEmail("a", "2026-04-05T10:00:00.000Z"),
      mkEmail("b", "2026-04-05T23:00:00.000Z"),
    ];
    const result = computeDateOffsets(emails);
    expect(result.get("a")).toBe(0);
    expect(result.get("b")).toBe(0);
  });
});
```

**Step 2: Запустить — убедиться, что падает.**
Run: `npx jest scripts/__tests__/build-sample-data.test.ts -t computeDateOffsets`
Expected: FAIL ("computeDateOffsets is not a function" / module not found).

**Step 3: Минимальная реализация в `scripts/build-sample-data.ts`.**

```typescript
import type { Email } from "../lib/types";

/** Офсет в целых днях от самого свежего письма корпуса. Самое свежее = 0. */
export function computeDateOffsets(emails: Email[]): Map<string, number> {
  const MS_PER_DAY = 86_400_000;
  const dayIndex = (iso: string): number => Math.floor(new Date(iso).getTime() / MS_PER_DAY);
  const maxDay = Math.max(...emails.map((e) => dayIndex(e.date)));
  const out = new Map<string, number>();
  for (const e of emails) out.set(e.id, dayIndex(e.date) - maxDay);
  return out;
}
```

**Step 4: Запустить — убедиться, что зелёный.**
Run: `npx jest scripts/__tests__/build-sample-data.test.ts -t computeDateOffsets`
Expected: PASS.

**Step 5: Commit.**

```bash
git add scripts/build-sample-data.ts scripts/__tests__/build-sample-data.test.ts
git commit -m "feat(build-sample-data): computeDateOffsets helper (TDD)"
```

### Task 3: Хелпер `splitByCategory` — раскладка писем по 6 файлам + `package.json` скрипт

**Files:**

- Modify: `scripts/build-sample-data.ts`
- Modify: `scripts/__tests__/build-sample-data.test.ts`
- Modify: `package.json`

**Step 1: Написать падающий тест.**

```typescript
import { splitByCategory } from "../build-sample-data";
import type { Classification } from "../../lib/types";

describe("splitByCategory", () => {
  const cls = (emailId: string, category: string): Classification =>
    ({ emailId, category }) as Classification;

  it("раскладывает email ID по категориям в правильные бакеты", () => {
    const classifications = [
      cls("e1", "CARGO_INQUIRY"),
      cls("e2", "TCT_REQUEST"),
      cls("e3", "OTHER"),
      cls("e4", "VESSEL_POSITION"),
      cls("e5", "FIXTURE_RECAP"),
      cls("e6", "CLIENT_REPLY"),
      cls("e7", "DOCUMENT"),
      cls("e8", "VESSEL_CERTIFICATE"),
    ];
    const buckets = splitByCategory(classifications);
    expect(buckets.cargoInquiries).toEqual(["e1", "e2", "e3"]);
    expect(buckets.vesselPositions).toEqual(["e4"]);
    expect(buckets.fixtureRecaps).toEqual(["e5"]);
    expect(buckets.clientReplies).toEqual(["e6"]);
    expect(buckets.documents).toEqual(["e7"]);
    expect(buckets.vesselCerts).toEqual(["e8"]);
  });

  it("неизвестная категория падает с ошибкой, а не молча теряется", () => {
    expect(() => splitByCategory([cls("e1", "NONSENSE")])).toThrow(/NONSENSE/);
  });
});
```

**Step 2: Запустить — FAIL.**
Run: `npx jest scripts/__tests__/build-sample-data.test.ts -t splitByCategory`
Expected: FAIL.

**Step 3: Реализация.**

```typescript
import type { Classification } from "../lib/types";

export interface CategoryBuckets {
  cargoInquiries: string[];
  vesselPositions: string[];
  fixtureRecaps: string[];
  clientReplies: string[];
  documents: string[];
  vesselCerts: string[];
}

const CATEGORY_TO_BUCKET: Record<string, keyof CategoryBuckets> = {
  CARGO_INQUIRY: "cargoInquiries",
  TCT_REQUEST: "cargoInquiries",
  OTHER: "cargoInquiries",
  VESSEL_POSITION: "vesselPositions",
  FIXTURE_RECAP: "fixtureRecaps",
  CLIENT_REPLY: "clientReplies",
  DOCUMENT: "documents",
  VESSEL_CERTIFICATE: "vesselCerts",
};

export function splitByCategory(classifications: Classification[]): CategoryBuckets {
  const buckets: CategoryBuckets = {
    cargoInquiries: [],
    vesselPositions: [],
    fixtureRecaps: [],
    clientReplies: [],
    documents: [],
    vesselCerts: [],
  };
  for (const c of classifications) {
    const bucket = CATEGORY_TO_BUCKET[c.category];
    if (!bucket) throw new Error(`Unknown category: ${c.category} (email ${c.emailId})`);
    buckets[bucket].push(c.emailId);
  }
  return buckets;
}
```

**Step 4: Запустить — PASS.**
Run: `npx jest scripts/__tests__/build-sample-data.test.ts -t splitByCategory`
Expected: PASS.

**Step 5: Добавить скрипт в `package.json`.**
В секцию `scripts`: `"build:sample-data": "tsx scripts/build-sample-data.ts"`.

**Step 6: Commit.**

```bash
git add scripts/build-sample-data.ts scripts/__tests__/build-sample-data.test.ts package.json
git commit -m "feat(build-sample-data): splitByCategory helper + npm script (TDD)"
```

---

## ФАЗА 3 — Генератор: LLM-оркестрация

### Task 4: Дописать `scripts/build-sample-data.ts` — полный пайплайн

LLM-оркестрацию юнит-тестить дорого/бессмысленно — её валидирует фактический
прогон (Task 6). Здесь пишем код, проверяем `tsc`/lint, прогон — отдельной
задачей.

**Files:**

- Modify: `scripts/build-sample-data.ts`

**Step 1:** Изучить точные сигнатуры по blueprint'у (раздел «Где что лежит»):
`callAiJson`, `callAiText`, `CLASSIFICATION_SYSTEM_PROMPT`, `CLASSIFY_SCHEMA`,
`classifyEmails`, `CARGO_INQUIRY_PARSER_PROMPT`, `PARSE_CARGO_SCHEMA`,
`buildCargoPrompts`, `parseCargoAIResponse`, `applyCargoRateFallback`,
`applyCargoTypeFallback`, `buildVesselPrompt`, `VESSEL_POSITION_PARSER_PROMPT`,
`PARSE_VESSEL_SCHEMA`, `parseVesselAIResponse`, `applyGearedFallback`,
`withRetry429`, `PARSE_CARGO_CONCURRENCY`. Прочитать соответствующие
route-файлы (`app/api/ai/classify/route.ts`, `parse-cargo/route.ts`,
`parse-vessel/route.ts`), чтобы реплицировать ИХ внутреннюю
последовательность вызовов один-в-один (та же модель, schema, temperature,
seed, fallback'ы).

**Step 2:** Реализовать `main()` со следующими шагами:

1. **Load** — `JSON.parse(fs.readFileSync('.private/etms-corpus.json'))` →
   `Email[]` (ожидаем 154). Если файла нет — внятная ошибка + `exit(1)`.
2. **Classify** — батчами по 20 писем: `callAiJson` с
   `CLASSIFICATION_SYSTEM_PROMPT` + `CLASSIFY_SCHEMA` (как в
   `classify/route.ts`), собрать `AiClassification[]`, прогнать через
   `classifyEmails(emails, aiClassifications)` → `Classification[]`.
3. **Split** — `splitByCategory(classifications)` → 6 бакетов email-ID.
4. **Date `_meta`** — `computeDateOffsets(emails)`; для каждого письма собрать
   `SampleEmailRaw = { ...email, _meta: { emailDateOffsetDays } }`.
5. **Write email files** — разложить `SampleEmailRaw[]` по 6 json согласно
   бакетам, `fs.writeFileSync(..., JSON.stringify(arr, null, 2))`. Файлы могут
   быть пустыми массивами (`documents.json`, `vessel-certs.json` — в
   ETMS-корпусе таких писем, скорее всего, нет — это нормально).
6. **Parse cargo** — для писем из бакета `cargoInquiries` с категорией
   `CARGO_INQUIRY` или `TCT_REQUEST` (НЕ `OTHER`): `buildCargoPrompts` +
   `callAiJsonShim`/`callAiJson` под `pLimit(PARSE_CARGO_CONCURRENCY)` +
   `withRetry429`, затем `parseCargoAIResponse(raw, emailId)` +
   `applyCargoRateFallback` + `applyCargoTypeFallback`. Собрать `ParsedCargo[]`,
   записать в `demo-parsed-cargoes.json`.
7. **Parse vessel** — для писем из бакета `vesselPositions`: `buildVesselPrompt`
   - `callAiText` под `pLimit(3)`, `parseVesselAIResponse(raw, id, subject)` +
     `applyGearedFallback`. Собрать `ParsedVessel[]`, записать в
     `demo-parsed-vessels.json`.
8. **Write classifications** — `demo-classifications.json` = `Classification[]`
   из шага 2.
9. **Console summary** — вывести: всего писем, распределение по 6 бакетам,
   сколько cargo/vessel записей распарсено, оценочную стоимость LLM.
   `process.exit(0)`.

**Примечание про parse-recap:** демо-сессия (`/api/sample`) НЕ сидит
`parsedRecaps` — ни один потребитель не читает распарсенные рекапы. Поэтому
parse-recap в генераторе НЕ запускаем (YAGNI); `fixture-recaps.json` несёт
только тела писем. Если позже понадобится — отдельная задача.

**Примечание про синтетические economics-записи:** генератор пишет ТОЛЬКО
корпус-производные записи. 2 синтетические записи (`demo-cargo-economics`,
`demo-vessel-economics`) добавляются на этапе резолва (Task 5), не в json.

**Step 3:** Обработка ошибок: если LLM-вызов для конкретного письма падает
после ретраев — логировать `emailId` + ошибку, продолжать (не валить весь
прогон), в конце вывести список упавших. Если упало > 10% — `exit(1)` с
внятным сообщением.

**Step 4:** `tsc` + lint.
Run: `npx tsc --noEmit 2>&1 | tail -5 && npm run lint 2>&1 | tail -5`
Expected: 0 ошибок.

**Step 5: Commit.**

```bash
git add scripts/build-sample-data.ts
git commit -m "feat(build-sample-data): full classify+parse pipeline orchestration"
```

---

## ФАЗА 4 — Прогон генератора + ревью данных

### Task 5: Упростить `resolveDemoParsedCargoes`/`resolveDemoParsedVessels` + вынести синтетические economics-записи

Делается ДО прогона, чтобы потребитель был готов к новому формату json
(абсолютные даты вместо `+Nd`).

**Files:**

- Create: `lib/sample-data/synthetic-economics.ts`
- Modify: `lib/sample-data/demo-parsed-cargoes.ts`
- Test: `__tests__/sample-data/demo-parsed-cargoes.test.ts` (правится в Task 8;
  здесь — прогон как guard после правки логики)

**Step 1:** Прочитать текущий `lib/sample-data/demo-parsed-cargoes.ts` целиком и
текущие `demo-parsed-cargoes.json` / `demo-parsed-vessels.json` — найти 2
синтетические записи `demo-cargo-economics` и `demo-vessel-economics` (их
вставляет либо json, либо резолвер). Зафиксировать их точное содержимое.

**Step 2:** Создать `lib/sample-data/synthetic-economics.ts` — экспортировать
`SYNTHETIC_CARGO: ParsedCargo` и `SYNTHETIC_VESSEL: ParsedVessel` (2 записи,
перенесённые из текущих фикстур). Если им нужна «свежая» дата (laycan/openDate
в ближайшем будущем для валидного матча) — экспортировать функции
`resolveSyntheticCargo(now: Date)` / `resolveSyntheticVessel(now: Date)`,
которые резолвят относительные офсеты этих ДВУХ записей. Корпус-производные
записи относительных полей НЕ имеют.

**Step 3:** Переписать `resolveDemoParsedCargoes(now)`:

```typescript
import corpusCargoes from "./demo-parsed-cargoes.json";
import { resolveSyntheticCargo } from "./synthetic-economics";

export function resolveDemoParsedCargoes(now: Date): ParsedCargo[] {
  // Корпус-производные записи — абсолютные значения, passthrough.
  const corpus = corpusCargoes as unknown as ParsedCargo[];
  // Синтетическая economics-запись — резолвится относительно now.
  return [...corpus, resolveSyntheticCargo(now)];
}
```

Аналогично `resolveDemoParsedVessels(now)` с `resolveSyntheticVessel`.
`resolveDemoClassifications()` — без изменений (классификации абсолютны).

**Step 4:** `tsc` + lint.
Run: `npx tsc --noEmit 2>&1 | tail -5 && npm run lint 2>&1 | tail -5`
Expected: 0 ошибок. (Тесты пока могут быть красными — json ещё старый; это
нормально, чиним в Task 6+.)

**Step 5: Commit.**

```bash
git add lib/sample-data/synthetic-economics.ts lib/sample-data/demo-parsed-cargoes.ts
git commit -m "refactor(sample-data): passthrough resolvers + extract synthetic economics fixtures"
```

### Task 6: Прогнать генератор, заменить 9 фикстур, отревьюить данные

**Files:**

- Перезаписываются: 9 json-файлов в `lib/sample-data/` (см. список выше)

**Step 1:** Проверить env. Убедиться, что `.env.local` содержит рабочую
конфигурацию LLM-провайдера (тот же, что использует demo на проде — Gemini
Flash через Vertex). Сделать пробный прогон на 2-3 письмах, если генератор
поддерживает `--limit` флаг (если нет — не добавлять, YAGNI; просто запустить
полностью).

**Step 2:** Запустить генератор.
Run: `cd ~/work/quantika-demo && npm run build:sample-data 2>&1 | tee /tmp/build-sample-data.log`
Expected: `exit 0`, в summary — 154 письма, разумное распределение
(ориентир: ~97 cargo / ~53 vessel / ~3 recap / ~1 client-reply, точные числа
могут отличаться), 0 или единичные упавшие письма.

**Step 3: РУЧНОЕ РЕВЬЮ (обязательный gate).** Проверить:

- `git diff --stat lib/sample-data/` — изменились ровно ожидаемые 9 файлов.
- Распределение по категориям из summary — адекватное (нет перекоса в `OTHER`,
  vessel-positions не пустой и т.п.). Открыть глазами по 2-3 письма из каждого
  бакета — классификация осмысленная.
- `demo-parsed-cargoes.json` — выборочно 3-5 записей: `originPort`,
  `cargoDescription`, `weightMt` непустые и осмысленные; `sourceText` —
  фрагменты реального тела письма.
- `demo-parsed-vessels.json` — выборочно: `vesselName`, `imo`, `dwtSummer`
  осмысленные. Найти и выписать 1 судно с непустым `imo` (7 цифр) + `vesselName`
  - `dwtSummer` + `flag` + `built` — это reference для Task 9.
- Каждый email в json-файлах имеет `_meta.emailDateOffsetDays` (число, ≤ 0).
- ID писем — hex Gmail-id, не `sample-NN`.

Если ревью выявило системную проблему (классификатор массово ошибается,
парсер выдаёт мусор) — STOP, это не «поправить тест», а баг в промпте/пайплайне;
разобраться через systematic-debugging до продолжения.

**Step 4:** Записать в коммит-сообщение фактические числа (сколько писем в
каждом бакете, сколько распарсено, выписанное reference-судно).

**Step 5: Commit.**

```bash
git add lib/sample-data/*.json
git commit -m "$(cat <<'EOF'
feat(sample-data): regenerate demo fixtures from 154-email ETMS corpus

Replaces curated V2 corpus (12 emails) with full real ETMS corpus.
Generated via scripts/build-sample-data.ts: classify + parse-cargo +
parse-vessel through the app's own lib functions.

Distribution: <фактические числа из summary>
Reference vessel for tests: <IMO> <NAME>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## ФАЗА 5 — Переписать 6 тестовых файлов

Принцип для всех: тест **выводит ожидания из закоммиченных фикстур**, а не
хардкодит `sample-NN`/конкретные числа. Изменения expectation'ов здесь
оправданы — данные легитимно поменялись (это разрешённое исключение из PI3,
но ТОЛЬКО потому, что миграция действительно полная и консистентная).

### Task 7: `app/api/sample/__tests__/sample.test.ts`

**Files:**

- Modify: `app/api/sample/__tests__/sample.test.ts`

**Step 1:** Прочитать текущий файл. Он хардкодит «32 письма» и паттерн
`sample-\d{2}`.

**Step 2:** Переписать на структурные инварианты:

- Все 6 json-файлов загружаются без ошибок.
- Объединённый массив непустой; число писем = сумме длин 6 файлов (взять из
  факта, не хардкодить «154» — корпус может обновиться).
- У каждого письма есть непустые `id`, `body`, `subject`, `date`.
- Все `id` уникальны по всему объединённому набору.
- У каждого письма есть `_meta` с числовым `emailDateOffsetDays`.
- Ровно одно письмо имеет `_meta.emailDateOffsetDays === 0` (самое свежее).

**Step 3:** Запустить.
Run: `npx jest app/api/sample/__tests__/sample.test.ts`
Expected: PASS.

**Step 4: Commit.**

```bash
git add app/api/sample/__tests__/sample.test.ts
git commit -m "test(sample): assert structural invariants instead of hardcoded sample-NN"
```

### Task 8: `__tests__/sample-data/demo-parsed-cargoes.test.ts`

**Files:**

- Modify: `__tests__/sample-data/demo-parsed-cargoes.test.ts`

**Step 1:** Прочитать текущий файл — он хардкодит whitelist `sample-01..12`,
`demo-cargo-economics`, числа записей, `sample-13 → VESSEL_POSITION` и т.п.

**Step 2:** Переписать на итерацию по фикстурам:

- `resolveDemoParsedCargoes(now)` — каждая запись валидна по схеме `ParsedCargo`;
  каждый `emailId` (кроме `demo-cargo-economics`) существует среди ID писем
  `cargo-inquiries.json`.
- Результат содержит синтетическую запись `demo-cargo-economics` (резолв
  добавляет её).
- `resolveDemoParsedVessels(now)` — аналогично против `vessel-positions.json` +
  синтетическая `demo-vessel-economics`.
- `resolveDemoClassifications()` — длина = числу писем во всех 6 файлах; каждый
  `emailId` существует; каждая `category` ∈ `EmailCategory`; `emailId`
  уникальны.
- Резолв дат: laycan корпус-записей — валидная строка `YYYY-MM-DD..` (или null),
  не содержит `+Nd`; синтетическая запись резолвится относительно `now`.

**Step 3:** Запустить.
Run: `npx jest __tests__/sample-data/demo-parsed-cargoes.test.ts`
Expected: PASS.

**Step 4: Commit.**

```bash
git add __tests__/sample-data/demo-parsed-cargoes.test.ts
git commit -m "test(demo-parsed-cargoes): derive expectations from fixtures, drop sample-NN whitelist"
```

### Task 9: `app/api/vessel/[imo]/__tests__/route.test.ts`

**Files:**

- Modify: `app/api/vessel/[imo]/__tests__/route.test.ts`

**Step 1:** Прочитать текущий файл — хардкодит `IMO 9456783`, «CARBON LADY»,
конкретные dwt/flag/built.

**Step 2:** Переписать:

- IMO-формат тесты (7 цифр, отклонение 6/8 цифр, 400 на мусор) — оставить как
  есть, они data-agnostic.
- CII rating логика (D/E → reject, A/B/C → allow) — оставить, если завязана на
  `cii.json`, а не на vessel-positions.
- Реальное судно: заменить `9456783`/«CARBON LADY» на reference-судно,
  выписанное в Task 6 Step 3 (реальный IMO+имя+dwt+flag+built из нового
  корпуса). Тест читает ожидаемые значения из `vessel-positions.json` динамически
  ИЛИ хардкодит выписанное судно с комментарием, что значение взято из
  сгенерированной фикстуры.
- 404 на неизвестный IMO — оставить.

**Step 3:** Запустить.
Run: `npx jest "app/api/vessel/\[imo\]/__tests__/route.test.ts"`
Expected: PASS.

**Step 4: Commit.**

```bash
git add "app/api/vessel/[imo]/__tests__/route.test.ts"
git commit -m "test(vessel-route): pin real vessel from ETMS corpus instead of curated CARBON LADY"
```

### Task 10: `lib/sample-data/__tests__/source-text-validity.test.ts`

**Files:**

- Modify (возможно): `lib/sample-data/__tests__/source-text-validity.test.ts`

**Step 1:** Прочитать файл. Он уже итеративный (для каждого parsed cargo
проверяет, что `sourceText` — дословная подстрока тела письма). Возможно,
заработает без правок.

**Step 2:** Запустить как есть.
Run: `npx jest lib/sample-data/__tests__/source-text-validity.test.ts`
Expected: PASS. **Если FAIL** — разобраться через systematic-debugging: либо
тест завязан на старые ID, либо парсер выдал `sourceText`, которого нет в теле
(это РЕАЛЬНЫЙ БАГ в генераторе/парсере — НЕ ослаблять тест, чинить источник).
Если тест просто завязан на старый формат итерации — поправить итерацию,
сохранив суть проверки (verbatim substring).

**Step 3:** Если правил — commit.

```bash
git add lib/sample-data/__tests__/source-text-validity.test.ts
git commit -m "test(source-text-validity): adapt iteration to ETMS corpus fixtures"
```

### Task 11: `tests/auto-prequote/cron-demo.test.ts`

**Files:**

- Modify: `tests/auto-prequote/cron-demo.test.ts`

**Step 1:** Прочитать файл — хардкодит `sample-01` для теста изоляции ошибок.

**Step 2:** Переписать: брать первый cargo-email ID динамически из
`cargo-inquiries.json` (`cargoInquiries[0].id`) вместо литерала `sample-01`.
Остальную логику (`runAutoPrequoteCron({ demo: true })`, `processedEmails > 0`,
изоляция ошибок) сохранить.

**Step 3:** Запустить.
Run: `npx jest tests/auto-prequote/cron-demo.test.ts`
Expected: PASS.

**Step 4: Commit.**

```bash
git add tests/auto-prequote/cron-demo.test.ts
git commit -m "test(cron-demo): derive cargo email id from fixture instead of sample-01"
```

### Task 12: `__tests__/api/parse-cargo-demo-cache.test.ts`

**Files:**

- Modify: `__tests__/api/parse-cargo-demo-cache.test.ts`

**Step 1:** Прочитать файл — хардкодит «13 ParsedCargo записей»,
`sample-01`, `demo-cargo-economics`.

**Step 2:** Переписать: `count` ожидать = `resolveDemoParsedCargoes(now).length`
(из фикстуры), а не литерал. ID в проверках — динамически из фикстур.
`demo-cargo-economics` остаётся валидным (синтетическая запись). Логику
demo-guard (early-return `cached: true` при `isSampleData`) сохранить —
она data-agnostic.

**Step 3:** Запустить.
Run: `npx jest __tests__/api/parse-cargo-demo-cache.test.ts`
Expected: PASS.

**Step 4: Commit.**

```bash
git add __tests__/api/parse-cargo-demo-cache.test.ts
git commit -m "test(parse-cargo-demo-cache): derive count from fixture instead of hardcoded 13"
```

---

## ФАЗА 6 — Полная верификация

### Task 13: Полный тест-сьют + tsc + lint

**Step 1:** Полный прогон.
Run: `cd ~/work/quantika-demo && npm test 2>&1 | tail -25`
Expected: ВСЕ сьюты PASS. Сравнить с baseline из Task 0 — упавших быть не
должно. Если что-то красное вне 6 запланированных файлов — это регрессия от
смены данных; разобраться через systematic-debugging (НЕ ослаблять тест без
понимания root cause).

**Step 2:** `tsc` + lint.
Run: `npx tsc --noEmit 2>&1 | tail -5 && npm run lint 2>&1 | tail -5`
Expected: 0 ошибок.

**Step 3:** Smoke-проверка demo-флоу (если есть playwright smoke / можно
поднять dev): `POST /api/sample` отрабатывает, `/processing` не падает,
письма и распарсенные карточки отображаются. Если поднять UI нельзя — явно
это указать в финальном отчёте, не заявлять успех вслепую.

**Step 4: PI3-аудит.** Пройтись по diff'ам 6 тестовых файлов: каждое
изменение expectation объясняется сменой данных (новый корпус), НЕ подгонкой
под баг имплементации. Если где-то тест ослаблен ради зелёного — откатить и
чинить источник.

**Step 5:** Финальный отчёт: что поменялось (на человеческом языке + технические
детали), числа (писем/записей/тестов), reference-судно, оценочная стоимость
LLM-прогона, открытые follow-up'ы (например, parse-recap не реализован).

---

## ФАЗА 7 — Adversarial QA (отдельная сессия)

После Task 13 — запустить `/test-skill` в ОТДЕЛЬНОЙ Claude Code сессии
(cold-start, zero context). Цель: независимый ревьюер ищет рассинхрон, который
автор пропустил. Особое внимание:

- ID-консистентность между email-файлами и parsed-файлами (главная грабля
  a321e82).
- `sourceText` — реально verbatim-подстроки.
- Пустые/edge-case письма из messy forwarded-цепочек.
- `_meta.emailDateOffsetDays` корректен на всех письмах.
- Реестр судов: `/api/vessel/[imo]` отдаёт записи для всех судов с IMO в корпусе.

Severity gate: PASS = 0 CRITICAL + 0 HIGH.

---

## Риски и митигации

- **LLM-парсинг недетерминирован** — генератор запускается один раз, вывод
  коммитится и дальше неизменен; тесты валидируют структуру, не точные значения.
- **Классификация ошибается на forwarded-цепочках** — ручной gate в Task 6
  Step 3.
- **`source-text-validity` падает после регена** — это сигнал реального бага
  парсера (`sourceText` не из тела), а не повод ослабить тест — Task 10 Step 2.
- **Регрессии вне 6 запланированных тестов** — baseline зафиксирован в Task 0,
  сравнение в Task 13 Step 1.

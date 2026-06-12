# Wave A — Phantom Features + Matches Column Sorting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close audit section A (phantom features): wire charterer-tier for real (A.1), make PSC vetting honest + seeded (A.2), wire FuelEU into voyage economics (A.5), delete the deadlines no-op (A.6) — plus add column-header sorting to /matches.

**Architecture:** Each phantom feature already has its consumer wired (scoring, UI); the work is supplying the missing producer (parser field, data seed, cost line) and making "no data" honest instead of fake-zero. Sorting extends the existing client-side `sortBy` state with a direction + per-column keys driven by clickable `<th>` headers.

**Tech Stack:** Next.js 16 + React 19, TypeScript, better-sqlite3, Jest. Branch: `feat/wave-a-phantom-features` from main `40966379`.

**Founder decisions (2026-06-12):** A.1 подключить полностью; A.2 честный лейбл + точечный сид; A.5 подключить; A.6 закрыть как no-op. A.3 equasis-стаб остаётся, A.4 jwc_vec/bimco → волна D/парк, A.7 getVesselPassport → волна D, MULTI_CURRENCY_V2 → волна D. **Не трогать в этой волне.**

---

## Verified ground truth (file:line, проверено 2026-06-12 на main 40966379)

- `lib/matching/charterer-tier.ts:19` — `resolveChartererTier()` всегда `null`; TODO говорит: при появлении `cargo.chartererName` резолвить через `listCharterers(db)` name-lookup. Скоринг-потребитель полностью подключён.
- `lib/matching/pair-analyzer.ts:736-747` — вызывает `resolveChartererTier(db, cargo)` БЕЗ флага; `detentionCount = db && imo ? getDetentionCount(db, imo, since) : undefined`. То есть пустая таблица PSC → `0`, а не `undefined` → фальшивые «0 detentions».
- `lib/sailing/fit-breakdown.ts:66-73` — `CHARTERER_TIER_PENALTY = { 'blue-chip': 0, second: 0, weak: 4 }`; `:640` `fit = rawSum - sanctionsPenalty - chartererPenalty`; `:486` `bracketData: detentionCount != null ? `${detentionCount} detentions` : undefined`; `scoreVetting` при unknown-факторах даёт «Vetting data unavailable — scored neutral.»
- `lib/market/charterers-repository.ts` — `ChartererRow {id, name(UNIQUE), tier: 'blue-chip'|'second'|'weak', payment_history, require_lc, notes}`, есть `getCharterer`, `listCharterers`, `upsertCharterer`. Миграция 026.
- `lib/market/psc-repository.ts` — `getDetentionCount(db, imo, sinceDate)` (только detained=1), `upsertInspection`. Миграция 028: `psc_detention_history(id, imo, inspection_date, port, authority, deficiencies, detained, source_url, fetched_at)`.
- `scripts/knowledge/seeds/seed-psc-history.ts` — ГОТОВЫЙ идемпотентный сидер (DELETE+INSERT) из `lib/knowledge/sources/psc/fixture.ts` (PSC_FIXTURE, ~5 demo IMOs).
- `lib/types.ts:205-246` — `ParsedCargo` без chartererName; plain-поля типа `originCountry: string | null` — образец типизации.
- `lib/prompts/parse-cargo.ts` — промпт парсера груза; `RawCargoItem` (snake_case вход нормализатора) и `parseCargoAIResponse` маппинг — в `lib/parsing/` (cargo-парсер).
- `parsed_results` таблица: `gmail_message_id, parse_type ('cargo'|'vessel'), result_json` — где живут распарсенные items в demo-seed.db; raw-текст письма — `emails.body` (join по gmail_message_id). `scripts/demo-seed/regenerate-matches.ts:548-552` уже показывает паттерн UPDATE result_json.
- `scripts/demo-seed/regenerate-matches.ts:119-120` — лог уже считает `charterers` и `psc_detention_history` counts.
- `lib/economics/compute-tce.ts` — `TceInputs` имеет `consumptionMtPerDay`, `originEu?`, `destEu?`, `euLegPercent?`; duration считается внутри; стоимости собираются блоками (bunker → canal → da → war risk → EU ETS → aggregation `totalCosts = bunkerUsd + canalUsd + daUsd + warRiskUsd + etsUsd`). `EUR_TO_USD` константа уже есть в файле (используется для ETS).
- `lib/economics/fueleu.ts:72` — `calculateFuelEu({fuelType, consumptionMtPerDay, voyageDays, year?})` → `{penaltyUsd, penaltyEur, isCompliant, complianceGapPct, ...}`. Покрыт `lib/__tests__/fueleu.test.ts`. vlsfo 91.27 vs target-2025 91.16 → малый, но ненулевой штраф (реалистично).
- `app/api/voyage/tce/route.ts:357-359` — `originEu/destEu` уже вычисляются через `isEuCountry(resolved.country)`; передаются в `calculateTCE` только при `data.includeEuETS`.
- `components/match/EconomicsTab.tsx:609-655` — паттерн cost-tile (war-risk): conditional render по данным breakdown, БЕЗ env-чтений в компоненте.
- `app/matches/MatchesClient.tsx:45` — `type SortBy = 'fit'|'score'|'freshness'|'tce'`; `:114` `useState<SortBy>(() => isOwner ? 'tce' : 'fit')`; `:308-314` компаратор; `:974-987` `<thead>` — массив строк-лейблов `['FIT %','Cargo','Route','DWT','TCE / day','Vessel','Laycan','']` (mode-swapped); `:481-490` dropdown с data-testid sort-score/sort-freshness/sort-tce; футер `:1101` «ranked by {SORT_LABELS[sortBy]}».
- `__tests__/matches-sort.test.tsx` — source-regex тесты (#350/#528), ЗЕЛЁНЫЕ на текущем коде; пинят наличие dropdown-testid'ов и `.sort(` в filtered-блоке. Дропдаун УДАЛЯТЬ НЕЛЬЗЯ.
- `scripts/check-deadlines.ts` — no-op (`loadActiveDeadlines` возвращает `[]`, issue #180); cron нигде не запланирован (нет в ops/, .github/workflows/, package.json).
- Флаги `.env.local.example:136-202`: CHARTERER*CREDIT_ENABLED + NEXT_PUBLIC*… (:142-143), PSC*DETENTION_ENABLED/PSC_API_BASE_URL (:178-180), FUELEU_ENABLED + NEXT_PUBLIC*… (:161-162). Конвенция чтения: inline `process.env.X === 'true'`.
- `NEXT_PUBLIC_CHARTERER_CREDIT_ENABLED` потребляется ТОЛЬКО страницами `app/charterers/*`; скоринг-путь флагом не гейтится — оживает сам при ненулевом chartererName.
- Тестовые конвенции: ЧЕТЫРЕ каталога — `lib/**/__tests__/`, `__tests__/`, `tests/regression/` (jest-ignored, гонять с `--testPathIgnorePatterns "/node_modules/"`), `app/**/__tests__/`. Полный `npm test` локально ЗАПРЕЩЁН (убивает воркера) — полнота за CI.

## Sanctioned spec changes (ТОЛЬКО эти изменения поведения могут перепинывать тесты; каждый rewrite — с комментарием `audit A.x`)

1. **A.2**: суда без строк в psc_detention_history больше НЕ получают «0 detentions» — фактор vetting становится neutral/unavailable (`detentionCount: undefined`). Тесты, пинящие `0 detentions`/нулевой счёт при пустой таблице (`lib/matching/__tests__/vetting-wiring.test.ts` и подобные) — санкционировано переписать на новую семантику.
2. **A.1**: `resolveChartererTier` перестаёт возвращать всегда-null. Тесты, пинящие вечный null — переписать на lookup-семантику.
3. **A.5**: `TCEBreakdown` получает новые поля `fueleu_usd` + `applicable.fueleu`; при `FUELEU_ENABLED !== 'true'` (дефолт всех существующих тестов) поведение БИТ-ИДЕНТИЧНО старому — существующие снапшоты ломаться не должны. Любой их слом = баг имплементации, не повод править снапшот.
4. **A.6**: удаление scripts/check-deadlines.ts + lib/deadlines/ + их тестов целиком.
5. **Sorting**: `SortBy` расширяется новыми ключами; `SORT_LABELS` расширяется; появляется `sortDir`. Существующие 4 опции dropdown и их data-testid сохраняются.
6. Любой ДРУГОЙ падающий тест = BLOCKED, эскалация контроллеру. Менять test expectations под имплементацию запрещено.

---

### Task 1: A.6 — удалить deadlines no-op

**Files:**

- Delete: `scripts/check-deadlines.ts`, `scripts/__tests__/check-deadlines-demo.test.ts`, `tests/regression/test_check_deadlines_auto_exec.test.ts` (если существует), `lib/deadlines/` (вся директория), `__tests__/deadlines/` (вся директория)
- Modify: `lib/db/queries/dispatches.ts` — удалить ТОЛЬКО если нет других импортёров (проверить grep'ом; если есть — оставить)
- Keep: `lib/migrations/011-notified-dispatches.ts` И его регистрацию в `lib/migrations/index.ts` (таблица живая на проде; миграции не удаляем задним числом)

- [ ] **Step 1: размер blast-radius фактом**

```bash
rtk grep -rln "lib/deadlines\|subs-guardian\|check-deadlines" --include="*.ts" --include="*.tsx" lib/ app/ components/ scripts/ __tests__/ tests/ docs/ package.json
rtk grep -rln "queries/dispatches" --include="*.ts" lib/ app/ scripts/ __tests__/
```

Ожидание: потребители только внутри удаляемого множества (+docs). Если найдётся живой потребитель вне множества — НЕ удалять его зависимость, доложить DONE_WITH_CONCERNS.

- [ ] **Step 2: удалить файлы**

```bash
git rm -r scripts/check-deadlines.ts lib/deadlines __tests__/deadlines
git rm scripts/__tests__/check-deadlines-demo.test.ts
git rm tests/regression/test_check_deadlines_auto_exec.test.ts 2>/dev/null || true
# dispatches.ts — только если Step 1 показал 0 внешних импортёров:
git rm lib/db/queries/dispatches.ts
```

- [ ] **Step 3: вычистить упоминания**

`docs/wave-beta/CRON.md` — удалить/пометить секцию check-deadlines строкой `> Removed 2026-06-12 (audit A.6, issue #180 closed as won't-build).` Проверить `package.json` scripts (удалить script-строку, если есть).

- [ ] **Step 4: компиляция + смежные тесты**

```bash
NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit
rtk npx jest scripts __tests__/api --silent
```

Expected: PASS, ноль ссылок на удалённое.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "chore(deadlines): remove no-op subs-deadline guardian (audit A.6, closes #180 as won't-build)"
```

---

### Task 2: A.1 — парсер извлекает chartererName

**Files:**

- Modify: `lib/types.ts` (ParsedCargo), `lib/prompts/parse-cargo.ts`, файл с `RawCargoItem` + `parseCargoAIResponse` (найти: `rtk grep -rn "RawCargoItem" lib/parsing/ lib/`)
- Test: рядом с существующими тестами нормализатора груза (найти: `rtk grep -rln "parseCargoAIResponse" lib __tests__`)

- [ ] **Step 1: failing test нормализатора**

В существующий тест-файл нормализатора добавить:

```ts
it("maps charterer_name → chartererName (audit A.1)", () => {
  const out = parseCargoAIResponse(
    JSON.stringify({
      items: [
        {
          origin_port: "Odesa",
          destination_port: "Alexandria",
          cargo_description: "wheat",
          weight_mt: 30000,
          charterer_name: "Huaya Maritime",
        },
      ],
    }),
    "em-1"
  );
  expect(out[0].chartererName).toBe("Huaya Maritime");
});

it("chartererName defaults to null when absent", () => {
  const out = parseCargoAIResponse(JSON.stringify({ items: [{ origin_port: "Odesa" }] }), "em-1");
  expect(out[0].chartererName).toBeNull();
});
```

(Сигнатуру вызова взять из соседних тестов файла — если parseCargoAIResponse принимает объект, а не строку, повторить их форму.)

- [ ] **Step 2: убедиться что падает** — `rtk npx jest <файл> --silent` → FAIL (нет поля).

- [ ] **Step 3: имплементация**

`lib/types.ts` ParsedCargo (рядом с `commissionTerms`):

```ts
  /** Charterer/account name as written in the email (audit A.1). Plain string — feeds resolveChartererTier. */
  chartererName?: string | null;
```

`RawCargoItem`: `charterer_name?: string | null;`
Нормализатор (рядом с маппингом commission_terms, тем же helper-стилем):

```ts
    chartererName: typeof item.charterer_name === 'string' && item.charterer_name.trim() !== ''
      ? item.charterer_name.trim()
      : null,
```

`lib/prompts/parse-cargo.ts`: в перечень полей JSON-ответа добавить `charterer_name` с правилом:

```
- charterer_name: name of the charterer/account if stated (phrases like "Acct: X",
  "Account X", "Chtrs: X", "Charterers: X", "for charterer X", "c/o X"). The literal
  company name only, trimmed. null when the email does not name the charterer.
  Do NOT guess from the sender signature.
```

Если в промпте есть JSON-пример ответа — добавить поле и туда. Если ответ валидируется zod/JSON-схемой — добавить optional-поле в схему.

- [ ] **Step 4: тесты зелёные** — `rtk npx jest <файл> --silent` → PASS.

- [ ] **Step 5: проверка промпт-снапшотов** — `rtk npx jest lib/prompts --silent` (если есть снапшоты промпта — их обновление санкционировано пунктом 2 sanctioned-секции, с комментом `audit A.1`).

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/prompts/parse-cargo.ts <normalizer> <tests>
git commit -m "feat(parser): extract charterer_name into ParsedCargo.chartererName (audit A.1)"
```

---

### Task 3: A.1 — живой resolveChartererTier + сид рейтингов + бэкфилл

**Files:**

- Modify: `lib/matching/charterer-tier.ts`
- Create: `scripts/demo-seed/seed-charterers.ts`, `scripts/demo-seed/backfill-charterer.ts`
- Test: `lib/matching/__tests__/charterer-tier.test.ts` (новый), тесты пинящие старый null (rewrite санкционирован)

- [ ] **Step 1: failing tests резолвера**

```ts
import Database from "better-sqlite3";
import { resolveChartererTier } from "@/lib/matching/charterer-tier";
import { upsertCharterer } from "@/lib/market/charterers-repository";
import migration026 from "@/lib/migrations/026-charterers";
import type { ParsedCargo } from "@/lib/types";

const cargo = (name: string | null): ParsedCargo =>
  ({ chartererName: name }) as unknown as ParsedCargo;

describe("resolveChartererTier (audit A.1)", () => {
  let db: Database.Database;
  beforeEach(() => {
    db = new Database(":memory:");
    migration026.up(db);
    upsertCharterer(db, {
      id: "huaya-maritime",
      name: "Huaya Maritime",
      tier: "weak",
      payment_history: "[]",
      require_lc: 1,
      notes: null,
    });
  });
  afterEach(() => db.close());

  it("resolves exact name", () =>
    expect(resolveChartererTier(db, cargo("Huaya Maritime"))).toBe("weak"));
  it("resolves case/space/punctuation-insensitively", () => {
    expect(resolveChartererTier(db, cargo("  huaya  MARITIME. "))).toBe("weak");
  });
  it("null when cargo has no chartererName", () =>
    expect(resolveChartererTier(db, cargo(null))).toBeNull());
  it("null when name unknown", () =>
    expect(resolveChartererTier(db, cargo("Unknown Trader"))).toBeNull());
});
```

(Точную форму default-экспорта миграции взять из `lib/migrations/026-charterers.ts`; если экспорт `{up}` — импортировать так.)

- [ ] **Step 2: FAIL подтверждён** — `rtk npx jest lib/matching/__tests__/charterer-tier.test.ts --silent`.

- [ ] **Step 3: имплементация резолвера**

`lib/matching/charterer-tier.ts` — заменить тело (TODO-комментарий удалить, JSDoc-GAP заменить на актуальный):

```ts
function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function resolveChartererTier(
  db: Database.Database,
  cargo: ParsedCargo
): ChartererTier | null {
  const raw = cargo.chartererName;
  if (!raw || typeof raw !== "string") return null;
  const needle = normalizeName(raw);
  if (!needle) return null;
  for (const row of listCharterers(db)) {
    if (normalizeName(row.name) === needle) return row.tier;
  }
  return null;
}
```

(`getCharterer` импорт убрать, если не используется.)

- [ ] **Step 4: PASS** + перепроверить потребителя: `rtk npx jest lib/matching lib/sailing --silent`. Падения, пинящие вечный-null → rewrite с комментом `audit A.1`; ЛЮБОЕ другое падение → BLOCKED.

- [ ] **Step 5: сид рейтингов**

`scripts/demo-seed/seed-charterers.ts` — зеркало паттерна `scripts/knowledge/seeds/seed-psc-history.ts` (идемпотентно DELETE+INSERT, `--dry-run`, БД через `SESSIONS_DB_PATH` либо `--db <path>` аргумент как у соседних demo-seed скриптов — посмотреть `scripts/demo-seed/patch-fit.ts` для конвенции):

1. Сначала ФАКТ: извлечь реальные имена из корпуса — `sqlite3 data/demo-seed.db "SELECT body FROM emails"` + regex `/(?:acct|account|chtrs|charterers?)\s*[:\-]?\s*([A-Za-z][A-Za-z0-9 .&'-]{2,40})/gi` — список уникальных имён вывести в консоль шага (для ревью).
2. Фикстура `CHARTERER_FIXTURE: Array<Omit<ChartererRow,'created_at'>>` — все найденные имена; tier: 1-2 имени `weak` (чтобы штраф жил на доске), известные мейджоры (если встретятся Cargill/Bunge/Glencore и т.п.) `blue-chip`, остальные `second`; `id` = normalizeName с дефисами; `notes: 'demo-universe rating (audit A.1)'`.
3. Запись через `upsertCharterer`.

- [ ] **Step 6: бэкфилл chartererName в parsed_results**

`scripts/demo-seed/backfill-charterer.ts` (паттерн UPDATE result_json — см. `regenerate-matches.ts:548-552`):

- для каждой строки `parsed_results WHERE parse_type='cargo'`: join `emails.body` по gmail_message_id; тем же regex'ом из Step 5 извлечь имя; для каждого item в result_json, у которого `chartererName` отсутствует/null — проставить; `--dry` (дефолт) печатает таблицу `email → name → items touched`, `--apply` пишет.
- идемпотентен (повторный прогон — 0 изменений).

- [ ] **Step 7: smoke сид+бэкфилл локально**

```bash
npx tsx scripts/demo-seed/seed-charterers.ts --dry-run
npx tsx scripts/demo-seed/backfill-charterer.ts            # dry по дефолту
npx tsx scripts/demo-seed/seed-charterers.ts && npx tsx scripts/demo-seed/backfill-charterer.ts --apply   # ЛОКАЛЬНАЯ data/demo-seed.db
sqlite3 data/demo-seed.db "SELECT COUNT(*) FROM charterers; SELECT COUNT(*) FROM parsed_results WHERE parse_type='cargo' AND result_json LIKE '%chartererName%'"
```

Expected: counts > 0. Локальная БД — рабочая копия, прод не трогаем.

- [ ] **Step 8: Commit**

```bash
git add lib/matching/charterer-tier.ts scripts/demo-seed/seed-charterers.ts scripts/demo-seed/backfill-charterer.ts lib/matching/__tests__/charterer-tier.test.ts
git commit -m "feat(charterer): live tier resolution + demo ratings seed + parsed_results backfill (audit A.1)"
```

---

### Task 4: A.2 — честная PSC-семантика «нет данных»

**Files:**

- Modify: `lib/market/psc-repository.ts` (+`hasInspectionData`), `lib/matching/pair-analyzer.ts:736`
- Verify/extend: `lib/knowledge/sources/psc/fixture.ts` (IMO-пересечение с демо-флотом)
- Test: `lib/matching/__tests__/vetting-wiring.test.ts` (rewrite санкционирован), новый кейс в psc-repository тестах

- [ ] **Step 1: failing test семантики**

В тесты psc-repository (найти существующий файл) добавить:

```ts
it("hasInspectionData: false on empty table, true after any inspection row (audit A.2)", () => {
  expect(hasInspectionData(db, "9540015")).toBe(false);
  upsertInspection(db, {
    id: "i1",
    imo: "9540015",
    inspection_date: "2025-03-01",
    port: "Rotterdam",
    authority: "paris-mou",
    deficiencies: 2,
    detained: false,
    source_url: null,
  });
  expect(hasInspectionData(db, "9540015")).toBe(true);
});
```

В vetting-wiring (или новый файл `lib/matching/__tests__/psc-no-data-neutral.test.ts`): пара с IMO без строк PSC → у vetting-компонента fitBreakdown НЕТ `bracketData` «0 detentions» (фактор neutral); пара с IMO, у которого есть detained-строка → `bracketData` = «1 detentions».

- [ ] **Step 2: FAIL подтверждён.**

- [ ] **Step 3: имплементация**

`lib/market/psc-repository.ts`:

```ts
/** Any inspection rows at all for this IMO (detained or clean)?
 *  Distinguishes "checked, zero detentions" from "no PSC data" (audit A.2). */
export function hasInspectionData(db: Database.Database, imo: string): boolean {
  if (!imo) return false;
  const row = db
    .prepare<
      [string],
      { c: number }
    >(`SELECT COUNT(*) as c FROM psc_detention_history WHERE imo = ?`)
    .get(imo);
  return (row?.c ?? 0) > 0;
}
```

`lib/matching/pair-analyzer.ts:736` (заменить тернарник):

```ts
const detentionCount =
  db && imo && hasInspectionData(db, imo)
    ? getDetentionCount(db, imo, `${refYear - PSC_LOOKBACK_YEARS}-01-01`)
    : undefined; // no PSC rows for this vessel → leave factor neutral, no fake "0 detentions" (audit A.2)
```

- импорт `hasInspectionData`.

* [ ] **Step 4: PASS + смежники** — `rtk npx jest lib/matching lib/market --silent`. Падения, пинящие «0 detentions при пустой таблице» → rewrite (`audit A.2`); прочее → BLOCKED.

* [ ] **Step 5: пересечение фикстуры с флотом**

```bash
sqlite3 data/demo-seed.db "SELECT DISTINCT json_extract(value,'$.imo.value') imo FROM parsed_results, json_each(json_extract(result_json,'$')) WHERE parse_type='vessel'" 2>/dev/null | sort -u | head -30
```

(Если структура result_json иная — посмотреть фактом: `sqlite3 data/demo-seed.db "SELECT result_json FROM parsed_results WHERE parse_type='vessel' LIMIT 1"`.) Сравнить с `PSC_FIXTURE_IMOS`. Если пересечение пустое — расширить `PSC_FIXTURE` 3-5 записями для реальных IMO текущего флота: 1 судно с `detained: true` (плохой vetting-стори), остальные clean-инспекции; `source_url: null`, `notes`-семантика demo-universe. Если пересечение есть — фикстуру не трогать.

- [ ] **Step 6: Commit**

```bash
git add lib/market/psc-repository.ts lib/matching/pair-analyzer.ts lib/knowledge/sources/psc/fixture.ts <tests>
git commit -m "fix(vetting): honest PSC no-data neutral instead of fake zero + fleet-aligned fixture (audit A.2)"
```

---

### Task 5: A.5 — FuelEU в экономику рейса

**Files:**

- Modify: `lib/economics/compute-tce.ts`, файл с типом `TCEBreakdown` (найти: `rtk grep -rn "war_risk_usd" lib/economics --include="*.ts" -l`), `components/match/EconomicsTab.tsx`, `components/match/CalculationWaterfall.tsx` (если рендерит построчно breakdown)
- Test: `lib/economics/__tests__/` рядом с compute-tce тестами (найти конвенцию), `.env.local.example`

- [ ] **Step 1: failing tests**

```ts
describe("FuelEU penalty line (audit A.5)", () => {
  const base = {
    /* минимальный валидный TceInputs из соседних тестов файла */
  };
  const euVoyage = { ...base, originEu: false, destEu: true, fuelType: "vlsfo" as const };

  it("flag off (default) → fueleu_usd 0, not applicable, totals unchanged", () => {
    delete process.env.FUELEU_ENABLED;
    const r = calculateTCE(euVoyage);
    expect(r.breakdown.fueleu_usd).toBe(0);
    expect(r.breakdown.applicable.fueleu).toBe(false);
  });

  it("flag on + EU leg → positive penalty, enters total_costs", () => {
    process.env.FUELEU_ENABLED = "true";
    const r = calculateTCE(euVoyage);
    expect(r.breakdown.fueleu_usd).toBeGreaterThan(0);
    expect(r.breakdown.total_costs_usd).toBe(
      r.breakdown.bunker_usd +
        r.breakdown.canal_usd +
        r.breakdown.da_usd +
        r.breakdown.war_risk_usd +
        r.breakdown.ets_usd +
        r.breakdown.fueleu_usd
    );
    delete process.env.FUELEU_ENABLED;
  });

  it("flag on + non-EU voyage → 0", () => {
    process.env.FUELEU_ENABLED = "true";
    const r = calculateTCE({ ...base, originEu: false, destEu: false });
    expect(r.breakdown.fueleu_usd).toBe(0);
    delete process.env.FUELEU_ENABLED;
  });

  it("intra-EU counts full energy, one-EU-end counts half (FuelEU scope rule)", () => {
    process.env.FUELEU_ENABLED = "true";
    const oneEnd = calculateTCE({ ...base, originEu: false, destEu: true });
    const intra = calculateTCE({ ...base, originEu: true, destEu: true });
    expect(intra.breakdown.fueleu_usd).toBe(oneEnd.breakdown.fueleu_usd * 2);
    delete process.env.FUELEU_ENABLED;
  });
});
```

- [ ] **Step 2: FAIL подтверждён.**

- [ ] **Step 3: имплементация compute-tce**

`TceInputs` (после `destEu`):

```ts
  /** Fuel type for FuelEU GHG intensity (key of FUEL_GHG_INTENSITY). Default 'vlsfo'. */
  fuelType?: string;
```

Блок после EU ETS, перед Aggregation:

```ts
// ── FuelEU Maritime (audit A.5, flag-gated) ───────────────────────────
// Scope per Reg. 2023/1805: 100% of energy intra-EU, 50% when one endpoint is EU.
let fueleuUsd = 0;
const fueleuFlagOn = process.env.FUELEU_ENABLED === "true";
const anyEuEnd = inputs.originEu === true || inputs.destEu === true;
if (fueleuFlagOn && anyEuEnd && duration > 0 && consumption > 0) {
  const share = inputs.originEu && inputs.destEu ? 1 : 0.5;
  const fe = calculateFuelEu({
    fuelType: inputs.fuelType ?? "vlsfo",
    consumptionMtPerDay: consumption,
    voyageDays: duration,
  });
  fueleuUsd = Math.round(fe.penaltyUsd * share);
}
const fueleuApplicable = fueleuUsd > 0;
```

Aggregation: `totalCosts = … + etsUsd + fueleuUsd;` и в обоих вариантах `dailyNetVoyage` (exclude-war-risk ветка) добавить `+ fueleuUsd` к вычитаемым.
`TCEBreakdown`: `fueleu_usd: number;` после `ets_usd`, `applicable.fueleu: boolean;` — заполнить в literal. Импорт `calculateFuelEu` из `@/lib/economics/fueleu`.

- [ ] **Step 4: PASS + регрессия экономики** — `rtk npx jest lib/economics tests/unit/economics --silent --testPathIgnorePatterns "/node_modules/"`. Флаг в тест-энве не задан → все старые ожидания обязаны пройти БЕЗ правок (sanctioned §3).

- [ ] **Step 5: UI-тайл**

`EconomicsTab.tsx` — после war-risk секции, тем же tile-паттерном (рендер ТОЛЬКО по данным, без env):

```tsx
{
  voyageBreakdown && voyageBreakdown.fueleu_usd > 0 ? (
    <div
      data-testid="fueleu-section"
      className="rounded border border-emerald-200 bg-emerald-50 p-3 space-y-1"
    >
      <h3 className="text-xs font-semibold text-emerald-900">
        FuelEU Maritime — GHG penalty (per voyage)
      </h3>
      <div className="flex justify-between text-xs">
        <span className="text-gray-600">Penalty (€2400/tCO₂eq over target):</span>
        <span data-testid="fueleu-usd" className="font-semibold text-emerald-900">
          ${voyageBreakdown.fueleu_usd.toLocaleString("en-US")}
        </span>
      </div>
    </div>
  ) : null;
}
```

(Типы: если `voyageBreakdown` типизирован как TCEBreakdown — поле уже есть; если локальный interface — расширить.) `CalculationWaterfall` — если строки захардкожены, добавить строку FuelEU по образцу ets_usd, рендер при `>0`.

- [ ] **Step 6: route-проверка** — `app/api/voyage/tce/route.ts` менять НЕ нужно (originEu/destEu уже идут при includeEuETS; FuelEU сознательно едет на том же EU-детекте — задокументировать комментом в compute-tce). `.env.local.example:156-162` — обновить описание: «When true: FuelEU penalty cost line in voyage P&L (compute-tce) + tile in EconomicsTab». Упоминание NEXT_PUBLIC_FUELEU_ENABLED в коде НЕ добавлять (тайл живёт от данных).

- [ ] **Step 7: Commit**

```bash
git add lib/economics components/match .env.local.example <tests>
git commit -m "feat(economics): FuelEU Maritime penalty cost line behind FUELEU_ENABLED (audit A.5)"
```

---

### Task 6: сортировка по любому столбцу /matches

**Files:**

- Modify: `app/matches/MatchesClient.tsx`
- Test: `__tests__/matches-sort-headers.test.tsx` (новый; стиль — посмотреть `__tests__/matches-client-m3.test.tsx`: если там RTL/jsdom — писать поведенческие, если source-analysis — писать в том же жанре + вынести компаратор в чистую функцию и юнитить её)

- [ ] **Step 1: вынести компаратор + расширить тип (подготовка под тест)**

В MatchesClient.tsx (выше компонента, экспортируемо для тестов):

```ts
export type SortBy =
  | "fit"
  | "score"
  | "freshness"
  | "tce"
  | "cargo_type"
  | "vessel_name"
  | "route"
  | "dwt"
  | "laycan";
export type SortDir = "asc" | "desc";

/** Default direction per column: numbers/dates desc-first, text asc-first. */
export const DEFAULT_DIR: Record<SortBy, SortDir> = {
  fit: "desc",
  score: "desc",
  freshness: "desc",
  tce: "desc",
  dwt: "desc",
  laycan: "asc",
  cargo_type: "asc",
  vessel_name: "asc",
  route: "asc",
};

/** null/undefined always sink to the END regardless of direction. */
export function compareMatches(
  a: StoredMatch,
  b: StoredMatch,
  sortBy: SortBy,
  dir: SortDir
): number {
  const flip = dir === "asc" ? -1 : 1;
  const num = (x: number | null | undefined, y: number | null | undefined): number => {
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    return (y - x) * flip;
  };
  const str = (x: string | null | undefined, y: string | null | undefined): number => {
    if (!x && !y) return 0;
    if (!x) return 1;
    if (!y) return -1;
    return x.localeCompare(y) * (dir === "asc" ? 1 : -1);
  };
  switch (sortBy) {
    case "freshness":
      return num(a.created_at, b.created_at);
    case "tce":
      return num(a.tce_usd_per_day, b.tce_usd_per_day);
    case "dwt":
      return num(a.vessel_dwt, b.vessel_dwt);
    case "laycan":
      return num(a.laycan_start, b.laycan_start);
    case "cargo_type":
      return str(a.cargo_type, b.cargo_type);
    case "vessel_name":
      return str(a.vessel_name, b.vessel_name);
    case "route":
      return str(a.load_port, b.load_port) || str(a.discharge_port, b.discharge_port);
    case "fit":
    case "score":
    default: {
      const fitDiff = num(a.fit_percent ?? a.score, b.fit_percent ?? b.score);
      return fitDiff !== 0 ? fitDiff : num(a.score, b.score);
    }
  }
}
```

ВНИМАНИЕ: существующий `.sort((a,b) => {...})` в filtered-блоке заменить на `.sort((a, b) => compareMatches(a, b, sortBy, sortDir))` — source-regex тест #350 требует `.sort(` внутри первых ~1200 символов filtered-блока и `b.score - a.score`/`b.tce_usd_per_day` паттерны В ФАЙЛЕ — они остаются в теле `compareMatches` (тот же файл), прогнать `rtk npx jest __tests__/matches-sort.test.tsx --silent` и убедиться.

- [ ] **Step 2: failing tests компаратора + заголовков**

`__tests__/matches-sort-headers.test.tsx`:

```ts
import { compareMatches, DEFAULT_DIR } from "@/app/matches/MatchesClient";
const m = (o: Partial<StoredMatch>): StoredMatch =>
  ({ id: 1, score: 50, created_at: 0, ...o }) as StoredMatch;

describe("compareMatches (column sorting)", () => {
  it("dwt desc default puts larger first, nulls last", () => {
    const rows = [m({ vessel_dwt: null }), m({ vessel_dwt: 30000 }), m({ vessel_dwt: 60000 })];
    const out = [...rows].sort((a, b) => compareMatches(a, b, "dwt", "desc"));
    expect(out.map((r) => r.vessel_dwt)).toEqual([60000, 30000, null]);
  });
  it("dwt asc keeps nulls last", () => {
    const rows = [m({ vessel_dwt: null }), m({ vessel_dwt: 60000 }), m({ vessel_dwt: 30000 })];
    const out = [...rows].sort((a, b) => compareMatches(a, b, "dwt", "asc"));
    expect(out.map((r) => r.vessel_dwt)).toEqual([30000, 60000, null]);
  });
  it("vessel_name asc is alphabetical", () => {
    /* 'Aleria' < 'Gandolf' < null */
  });
  it("route sorts by load_port then discharge_port", () => {
    /* same load → discharge decides */
  });
  it("laycan asc earliest first", () => {
    /* timestamps */
  });
  it("text columns default asc, numeric default desc", () => {
    expect(DEFAULT_DIR.vessel_name).toBe("asc");
    expect(DEFAULT_DIR.fit).toBe("desc");
  });
});

describe("MatchesClient header markup (source)", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "app/matches/MatchesClient.tsx"), "utf8");
  it("headers are buttons with data-testid", () => {
    expect(src).toMatch(/data-testid="th-sort-dwt"/);
    expect(src).toMatch(/data-testid="th-sort-laycan"/);
    expect(src).toMatch(/aria-sort/);
  });
});
```

(Дополнить недописанные кейсы реальными данными. Если RTL-рендер MatchesClient уже практикуется в matches-client-m3 — добавить 1 поведенческий: клик по DWT-заголовку меняет порядок строк, повторный клик — реверс.)

- [ ] **Step 3: FAIL подтверждён.**

- [ ] **Step 4: имплементация UI**

1. Состояние: `const [sortDir, setSortDir] = useState<SortDir>('desc');` — при смене mode сбрасывать вместе с sortBy (существующий reset-блок :117-120).
2. Header-конфиг вместо массива строк (сохранить классы/выравнивание из текущей разметки :974-987):

```tsx
const headerCols: Array<{ label: string; key: SortBy | null }> = isOwner
  ? [
      { label: "FIT %", key: "fit" },
      { label: "Cargo", key: "cargo_type" },
      { label: "Route", key: "route" },
      { label: "DWT", key: "dwt" },
      { label: "TCE / day", key: "tce" },
      { label: "Vessel", key: "vessel_name" },
      { label: "Laycan", key: "laycan" },
      { label: "", key: null },
    ]
  : [
      { label: "FIT %", key: "fit" },
      { label: "Vessel", key: "vessel_name" },
      { label: "Route", key: "route" },
      { label: "DWT", key: "dwt" },
      { label: "TCE / day", key: "tce" },
      { label: "Cargo", key: "cargo_type" },
      { label: "Laycan", key: "laycan" },
      { label: "", key: null },
    ];

function handleHeaderClick(key: SortBy) {
  if (sortBy === key) {
    setSortDir((d) => (d === "desc" ? "asc" : "desc"));
  } else {
    setSortBy(key);
    setSortDir(DEFAULT_DIR[key]);
  }
}
```

3. `<th>` рендер: внутри — `<button type="button" data-testid={`th-sort-${key}`} onClick={() => handleHeaderClick(key)} …>` с лейблом + индикатором `{sortBy === key ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''}`; на `<th>` — `aria-sort={sortBy === key ? (sortDir === 'desc' ? 'descending' : 'ascending') : 'none'}`. Колонка Actions (key null) — без кнопки.
4. Dropdown: оставить 4 старые опции + добавить новые (`cargo_type`, `vessel_name`, `route`, `dwt`, `laycan`) с `data-testid="sort-<key>"`; onChange также ставит `DEFAULT_DIR[key]`.
5. `SORT_LABELS` расширить всеми ключами (футер «ranked by …» продолжает работать).
6. Карточный вид использует тот же `filtered` → сортировка применяется автоматически.

- [ ] **Step 5: PASS всё про matches** — `rtk npx jest __tests__/matches --silent` (sort, sort-headers, page, client-m3, filter, card-link, bulk-toolbar, overflow-375). Любое падение разобрать; правка ожиданий только если пин противоречит sanctioned §5.

- [ ] **Step 6: Commit**

```bash
git add app/matches/MatchesClient.tsx __tests__/matches-sort-headers.test.tsx
git commit -m "feat(matches): clickable column-header sorting with direction toggle (founder request)"
```

---

### Task 7: верификация, cold QA, merge, deploy, прод-применение

(Контроллер ведёт сам, не субагент-имплементер.)

- [ ] **Step 1: батареи локально (4 конвенции, БЕЗ полного npm test)**

```bash
NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit && rtk npx eslint . --quiet
rtk npx jest lib --silent
rtk npx jest __tests__ scripts --silent
rtk npx jest app components --silent
rtk npx jest tests/regression --testPathIgnorePatterns "/node_modules/" --silent   # 8 pre-existing red известны (#846 и др.) — сверять с main, новых не добавить
```

- [ ] **Step 2: cold test-skill** — свежая сессия, adversarial, diff `main..HEAD`; вердикт в `.test-review/`; followups закрыть до merge.

- [ ] **Step 3: PR + гейты** — push, PR с описанием по-человечески; `value-check-emit.sh` (oracle: prod-select после деплоя — флаги+сиды), `testskill-emit.sh PASS`; squash merge (отдельными Bash-вызовами, не compound — merge-value-guard hook).

- [ ] **Step 4: deploy watch** — `rtk gh run list/watch` deploy.yml до success; smoke `/`, `/matches`.

- [ ] **Step 5: прод-применение (ТРЕБУЕТ формулы «разрешаю запись на outreach-vps» — спросить фаундера с готовыми --dry числами)**

1. `.env.local` на проде: `CHARTERER_CREDIT_ENABLED=true`, `NEXT_PUBLIC_CHARTERER_CREDIT_ENABLED=true`, `FUELEU_ENABLED=true` (+`NEXT_PUBLIC_FUELEU_ENABLED=true` для консистентности доков) — NEXT_PUBLIC запекается при build → после правки env нужен rebuild-деплой или `npm run build` + restart.
2. Сиды на прод-БД `/root/quantika-demo/data/demo-seed.db`: `seed-charterers` (--dry → apply), `seed-psc-history` (--dry → apply), `backfill-charterer` (--dry → --apply).
3. Реген: `regenerate-matches --dry` → числа фаундеру → apply по формуле.
4. Прод-верификация: SELECT counts (charterers, psc, parsed_results с chartererName), `/matches` доска, карточка EU-рейса с FuelEU-тайлом, vetting без «0 detentions» у судна без данных, сортировка заголовками, бандл-grep (fueleu_usd, hasInspectionData, th-sort-dwt).

- [ ] **Step 6: память + сводка** — обновить `project_quantika_logic_audit_2026_06_12.md` (раздел A → статус), MEMORY.md, финальная сводка фаундеру.

---

## Self-Review

- Spec coverage: A.1 (T2+T3), A.2 (T4), A.5 (T5), A.6 (T1), сортировка (T6), деплой+прод-данные (T7) — все решения фаундера покрыты; A.3/A.4/A.7/MULTI_CURRENCY зафиксированы как «не трогать». ✓
- Placeholders: «найти конвенцию/файл» оставлены только там, где имя файла переменное и grep-команда дана прямо в шаге. Кейсы тестов T6 Step 2 с `/* */` — дописать обязан имплементер по данным из соседних кейсов того же файла (формы данных показаны). ✓
- Type consistency: `SortBy`/`SortDir`/`DEFAULT_DIR`/`compareMatches` согласованы между Step 1/2/4; `fueleu_usd`+`applicable.fueleu` согласованы тест↔имплементация↔UI; `hasInspectionData` сигнатура едина. ✓
- Известные риски: (1) `parseCargoAIResponse` сигнатура может отличаться — имплементер копирует форму из соседних тестов; (2) source-regex тест #350 чувствителен к рефактору `.sort(` — отдельная проверка в T6 Step 1; (3) jest-снапшоты экономики при флаге-off обязаны быть бит-идентичны — sanctioned §3 запрещает их правку.

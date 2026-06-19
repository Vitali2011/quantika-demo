# RECON: DD-панель — полная формула осадки в грузу

**Дата:** 2026-06-19  
**Scope:** Read-only. Ответы Q1–Q6 о рендере формулы осадки в DD-панели.  
**Engine ground-truth:** `lib/sailing/laden-draft.ts · estimateLadenDraft()`

---

## Движок (canonical formula)

```
fullLoadDraftM = 0.4991 × DWT^0.2991
ratio          = min(cargoTons / DWT, 1)
rawDraftM      = fullLoadDraftM × ratio^0.3
ladenDraftM    = ceil(rawDraftM × 10) / 10   ← rounds UP, conservative
```

Источник: `lib/sailing/laden-draft.ts:45–64`

---

## Q1 — Доступны ли входные числа на рендере DD-панели?

### `buildDueDiligence` (`lib/matching/due-diligence.ts`)

Функция получает `args: BuildDDArgs`, а через него — полный объект `worksheet: MatchWorksheet | null`.

**DWT (`worksheet.vessel.dwtSummer: number | null`)**  
✅ Доступен напрямую в `BuildDDArgs.worksheet.vessel.dwtSummer`.  
Тип: `lib/types.ts:485`.

**cargoTons — верхняя граница груза**  
В движке (`runHardFilters`, `match-filters.ts:626`):
```ts
const effectiveCargoTons = isRange<number>(input.weightMt) ? input.weightMt.max : input.weightMt;
```
В `MatchWorksheet.cargo` хранится результат этого resolve:
- `cargo.weightMt: number | null` — персистированное значение (обычно nominal)
- `cargo.weightMtEffective?: number | null` — worst-case (max bounds), именно то, что использует движок для laden-оценки (lib/types.ts:492)

**Вывод:** использовать `cargo.weightMtEffective ?? cargo.weightMt`. Это ключевое — `weightMtEffective` = то самое `effectiveCargoTons` из движка.

**Промежуточные fullLoadDraftM и ratio**  
❌ НЕ хранятся нигде в персистированном виде.  
Хранится только итог: `hardFilters.draft.estimatedLadenDraftM` (HardFilterCheck.estimatedLadenDraftM, `types.ts:422`).  
Промежуточные надо вычислять заново — так уже делает `DraftCalcBreakdown.tsx:100–103`:
```ts
fullLoadDraftM = 0.4991 * Math.pow(dwtSummer, 0.2991);
const ratio    = Math.min(weightMt / dwtSummer, 1);
rawDraftM      = fullLoadDraftM * Math.pow(ratio, 0.3);
```
Это display-only, gate verdict — из `hardFilters.draft.pass` (персистирован).

**Итог Q1:** все входные числа доступны в `args.worksheet`. Промежуточные — вычисляются заново для дисплея, это допустимо (parity-safe: gate verdict не трогается).

---

## Q2 — Компонент DraftCalcBreakdown (PR #956)

✅ Существует: `components/match/DraftCalcBreakdown.tsx`

**Что показывает (3 строки):**
1. `Full-load: 0.4991 × {DWT}^0.2991 = {fullLoadDraftM} m`
2. `Cargo-adjust: × ({cargo}/{DWT})^0.3 = {rawDraftM} m`
3. `→ {ladenDraftM} m (approximate, conservative)`
4. Port comparison rows (load + discharge)

**Props:**
```ts
dwtSummer?: number | null         // worksheet.vessel.dwtSummer
weightMt?:  number | null         // cargo.weightMtEffective ?? cargo.weightMt
draftCheck: HardFilterCheck       // hf.draft (stored verdict + estimatedLadenDraftM, portLimitM)
destDraftCheck?: HardFilterCheck  // hf.destDraft
loadPortLimit?: number | null
dischargePortLimit?: number | null
```

**Где используется сейчас:**  
`components/match/MatchWorksheet.tsx:131` — в таблице Worksheet (не в DD-панели).

**Вывод Q2:** компонент полностью переиспользуем в DD-панели. Данные для него все есть в `BuildDDArgs.worksheet`. Его надо передать как `detail` (React node) в DDCheck для строки Осадки, либо вызвать внутри DD-компонента рендера.

**Ограничение:** `buildDueDiligence` — server-only builder, возвращает JSON-сериализуемую `DDModel`. `DraftCalcBreakdown` — client-компонент. Значит, либо:
- (a) вынести числа `dwtSummer`, `weightMt`, `estimatedLadenDraftM`, `portLimitM` в `DDCheck` расширенным полем, и рендерить шаги в UI-компоненте DD-панели
- (b) передать `DraftCalcBreakdown` через `detail` slot в DDCheckRow — если DDCheckRow уже принимает ReactNode

---

## Q3 — estimateLadenDraft и checkDraftLaden: возвращают ли шаги?

**`estimateLadenDraft(dwtTons, cargoTons)` (`laden-draft.ts:31`)**  
Возвращает: `{ ladenDraftM, method, approximate, vesselClass } | null`  
❌ Промежуточные `fullLoadDraftM`, `ratio`, `rawDraftM` НЕ экспортируются.

**`checkDraftLaden(port, staticDraftM, estimate, cargoTons)` (`match-filters.ts:52`)**  
Возвращает: `FilterResult = { pass, reason?, estimatedLadenDraftM?, portLimitM? }`  
❌ Промежуточные шаги также не возвращаются.

**Нужно ли расширять?**  
Нет — для display-цели можно пересчитать на стороне рендера (как делает `DraftCalcBreakdown`), используя `worksheet.vessel.dwtSummer` и `cargo.weightMtEffective`. Gate verdict (`pass`) берётся из персистированного `hardFilters.draft`.

Расширение `LadenDraftEstimate` промежуточными полями (`fullLoadDraftM`, `ratio`, `rawDraftM`) возможно, но не обязательно — это лишнее хранение. Пересчёт в UI — правильный подход (parity: verdict из хранилища, шаги — display).

---

## Q4 — Proposed renderable derivation string (load port)

### Вариант A — текстовая строка в `detail` (текущий подход DD-панели)

```
DWT: 58,000 mt  ·  Груз (верхн. граница): 50,000 mt  ·  Загрузка: 86%

1) Осадка полная (при DWT 100%):
   0.4991 × 58,000^0.2991 = 13.20 m

2) Поправка на загрузку 86%:
   × (50,000 / 58,000)^0.3 = × 0.965 → 12.74 m

3) Округление вверх до 0.1 m:
   → 12.8 m  (в грузу, приблизительно, conservative)

Лимит причала погрузки: 13.5 m  →  запас +0.7 m  ✓

⚠️  Груз = верхняя граница диапазона — оценка по worst-case.
    Округление вверх (ceil): скрининг ошибается в сторону флага, не пропуска.
```

### Несоответствия 1:1 (честные caveats)

| Точка | Что происходит | Пометка |
|---|---|---|
| `cargoTons` | Верхняя граница диапазона (`weightMtEffective` = `weightMtMax`) | «верхн. граница», не «номинал» |
| Округление | `Math.ceil(raw × 10) / 10` — всегда вверх | «conservative», «приблизительно» |
| Нет DWT/cargo | Fallback на статическую осадку судна (`draftMax`) | см. Q6 |
| `portLimitM` | Из `port-master.json` — может быть устаревшим / неполным | «из реестра портов» |

### Вариант B — переиспользовать `DraftCalcBreakdown` как ReactNode в DD-панели

Передать в DDCheckRow (если slot принимает ReactNode) компонент напрямую:
```tsx
<DraftCalcBreakdown
  loadPort={worksheet.cargo.loadPort}
  dischargePort={worksheet.cargo.dischargePort}
  draftCheck={worksheet.hardFilters.draft}
  destDraftCheck={worksheet.hardFilters.destDraft}
  dwtSummer={worksheet.vessel.dwtSummer}
  weightMt={worksheet.cargo.weightMtEffective ?? worksheet.cargo.weightMt}
  statedMaxDraftM={worksheet.vessel.draftMax}
  loadPortLimit={getPortMaster(loadPort)?.maxDraftM ?? null}
  dischargePortLimit={getPortMaster(dischPort)?.maxDraftM ?? null}
/>
```
Это наиболее DRY — компонент уже делает именно то, что нужно.

---

## Q5 — Discharge порт (destDraft)

**Engine logic** (`match-filters.ts:641`):
```ts
const laden = estimateLadenDraft(input.dwtSummer, effectiveCargoTons);
// SAME laden estimate for both ports:
const draft     = checkDraftLaden(input.originPort,     ..., laden, ...);
const destDraft = checkDraftLaden(input.destinationPort, ..., laden, ...);
```

**Вывод:** шаги 1–3 формулы **идентичны** для load и discharge (тот же laden estimate). Отличаются только:
- `portLimitM` — лимит выгрузочного порта (`hardFilters.destDraft.portLimitM`)
- `reason` — факт pass/fail относительно другого порта

Для discharge порта в `draftDetail` / `DraftCalcBreakdown` достаточно:
- Те же шаги 1–3
- Другой заголовок: "Лимит причала выгрузки: X m → запас Y m"

`DraftCalcBreakdown` уже это делает через `destDraftCheck` prop — оба порта в одном компоненте.

---

## Q6 — Fallback когда DWT или cargo пусто

**Engine path:**
```ts
estimateLadenDraft(null, cargoTons) → null
estimateLadenDraft(dwtTons, null)   → null
// checkDraftLaden(port, staticDraftM, null, ...) → falls back to:
portCanHandleDraft(port, staticDraftM)  // checks vessel.draftMax vs port limit
```

**Что хранится:**  
`hardFilters.draft.estimatedLadenDraftM` = `undefined` (absent)  
`hardFilters.draft.portLimitM` может быть задан (порт известен, лимит из port-master)

**Текущий рендер:**

В `draftDetail()` (`due-diligence.ts:158–166`):
```ts
if (h?.estimatedLadenDraftM != null && h?.portLimitM != null) {
  // shows: "осадка в грузу ~Xm vs лимит причала Ym → запас Zm"
} else {
  // shows only base text + caveat — никакого расчёта не показано
}
```

В `DraftCalcBreakdown.tsx:135–140`:
```tsx
// hasEstimate = false branch:
<div>cargo weight / DWT unknown → static check vs stated max draft {statedMaxDraftM} m</div>
```

**Рекомендуемая строка для DD-панели (fallback):**
```
Нет данных для расчёта осадки в грузу:
DWT судна: — / Вес груза: —
Проверено по заявленной осадке судна: 14.5 m vs лимит причала X m
```

Если и `draftMax` null (vessel draft unknown), всё равно graceful pass в движке → в DD: `inactive` с текстом "нет данных по судну".

---

## Карта зависимостей (summary)

```
lib/sailing/laden-draft.ts
  └─ estimateLadenDraft(dwtSummer, cargoTons)
       ↓ returns ladenDraftM only (intermediates not exported)

lib/sailing/match-filters.ts
  └─ checkDraftLaden() → FilterResult { estimatedLadenDraftM, portLimitM }
  └─ runHardFilters() → saves into worksheet.hardFilters.draft / .destDraft

lib/types.ts MatchWorksheet
  ├─ vessel.dwtSummer            ← DWT input for formula
  ├─ cargo.weightMtEffective     ← cargoTons input (effective max)
  ├─ vessel.draftMax             ← static draft fallback
  └─ hardFilters.draft           ← { pass, estimatedLadenDraftM, portLimitM }
     hardFilters.destDraft       ← same shape for discharge port

lib/matching/due-diligence.ts (BuildDDArgs)
  ├─ worksheet.vessel.dwtSummer  ✅ AVAILABLE
  ├─ worksheet.cargo.weightMtEffective ?? weightMt  ✅ AVAILABLE
  ├─ worksheet.hardFilters.draft.estimatedLadenDraftM  ✅ AVAILABLE
  └─ worksheet.hardFilters.draft.portLimitM  ✅ AVAILABLE

components/match/DraftCalcBreakdown.tsx  ← reusable, already renders all steps
  └─ used in MatchWorksheet.tsx (not yet in DD panel)
```

---

## Рекомендуемый путь реализации

**Tier S — минимальная инвазия:**

1. Расширить `draftDetail(h, worksheet)` в `due-diligence.ts` чтобы принимать `dwtSummer` и `cargoTons` и строить полную текстовую деривацию (вычисление промежуточных шагов in-place, аналогично `DraftCalcBreakdown`).

2. В `buildVesselPort()` передавать `worksheet.vessel.dwtSummer` и `worksheet.cargo.weightMtEffective ?? cargo.weightMt` в `draftDetail`.

**Tier M — DRY через компонент:**

3. Добавить в `DDCheck` поле `derivation?: DraftDerivationData` (dwtSummer, cargoTons, draftCheck, destDraftCheck, portLimits).
4. UI-компонент DDCheckRow рендерит `DraftCalcBreakdown` когда `derivation` present.

Вариант B более DRY, но требует: (a) сделать DDCheck частично не-сериализуемым, или (b) передавать данные отдельным каналом.

**Для фаундера важно:** ни один из вариантов не трогает gate verdict — `pass` берётся из персистированного `hardFilters.draft.pass`. Только display.

---

## Pre-PASS Verification

Задача READ-ONLY, код не изменялся.

**Блок 1 — TypeCheck:**
```
N/A — no code changes in this RECON task
```

**Блок 2 — Affected tests:**
```
N/A — no code changes in this RECON task
```

**Блок 3 — Cross-cutting grep:**
```
N/A — no literal strings changed in this diff
```

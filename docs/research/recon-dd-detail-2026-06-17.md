# RECON: DD-панель «detail + source» — гибридное раскрытие

> Date: 2026-06-17 · Branch: claude/1781692351-dd-detail  
> Status: RECON_DONE · Read-only — код не менялся

---

## Q1. Где строятся evidence-строки: `DDCheck`, 5 категорий, источники текста

### Тип `DDCheck` (lib/matching/due-diligence.ts:30-35)

```ts
export interface DDCheck {
  label: string;       // заголовок строки (видим всегда)
  state: DDState;      // 'pass' | 'caution' | 'info' | 'inactive'
  evidence: string | null;  // живой факт из сохранённого снэпшота — виден сразу под label
}
```

`evidence` — короткая строка с числом/фактом. Null у `inactive`. Генерируется внутри builder'а каждой категории.

### Категория 1 — `vessel-port` (`buildVesselPort`, строки 108-138)

| Проверка | Данные | Откуда |
|---|---|---|
| Осадка — порт погрузки | `worksheet.hardFilters.draft.{estimatedLadenDraftM, portLimitM}` | Worksheet (из матча, парсинг письма + port-master.json) |
| Осадка — порт выгрузки | `worksheet.hardFilters.destDraft` | Worksheet |
| Краны / грузовое оборудование | `worksheet.hardFilters.crane.reason` + fallback на fitBreakdown 'cranes' | Worksheet / fitBreakdown |
| LOA под причал | `INACTIVE('не подключено')` | — |
| Воздушный габарит | `INACTIVE('нет данных')` | — |

### Категория 2 — `cargo-holds` (`buildCargoHolds`, строки 141-188)

| Проверка | Данные | Откуда |
|---|---|---|
| Объём груза под трюмы | fitBreakdown компонент 'volume' → `rationale` + `bracketData` | fitBreakdown (score/weight ratio ≥ 0.7 → pass) |
| Тип груза ↔ тип судна | fitBreakdown компонент 'cargoType' | fitBreakdown |
| Чистота трюмов / прошлый груз | `vessel.lastCargoes` → `parseLastCargoes` → `checkCompatibility(prev, cargoDescription)` | L5C-матрица (lib/cargo/l5c-matrix.ts) |
| IMSBC группа | `worksheet.hardFilters.imsbc.{pass,warning,reason}` | Worksheet / IMSBC-Code |

### Категория 3 — `economics` (`buildEconomics`, строки 190-241)

| Проверка | Данные | Откуда |
|---|---|---|
| TCE vs breakeven | `tceUsdPerDay` (storedMatch.tce_usd_per_day) vs `breakevenTce` | Расчёт TCE движком (сохранено при матчинге) |
| Экономика рейса (фит) | fitBreakdown 'economics' → rationale | fitBreakdown |
| Утилизация DWT | fitBreakdown 'utilisation' → rationale | fitBreakdown (cargo wt / vessel DWT) |
| Балласт-переход | fitBreakdown 'ballast' → rationale | fitBreakdown (дистанция × расход) |
| Фрахт vs Baltic | `freightRateSource` flag + `consumptionEstimated` bool | storedMatch.freight_rate_source |

### Категория 4 — `vetting` (`buildVetting`, строки 243-283)

Если есть `vessel` snapshot — `computeVesselVetting(vessel, {refYear})` возвращает 5-6 per-factor строк:

| Фактор (VettingFactor.key) | label в UI | Источник данных |
|---|---|---|
| `flag` | Flag (Paris MoU) | paris-mou.ts реестр по флагу судна |
| `class` | Class society (IACS) | iacs-members.ts реестр |
| `age` | Vessel age | `vessel.built` vs AGE_CAUTION_YR=15 / AGE_WARN_YR=22 |
| `pandi` | P&I insurance | ig-clubs.ts реестр |
| `psc` | PSC detentions | psc_detention_history (Equasis) |
| `cii` | CII rating | `vessel.ciiRating` (Equasis) |

Если нет `vessel` → один сводный ряд из fitBreakdown 'vetting'.

Плюс всегда:
- Класс судна (фит) — fitBreakdown 'classFit'
- Готовность / тайминг — fitBreakdown 'timing' или `worksheet.readiness.verdict`
- RightShip score — `INACTIVE('не подключено')`

### Категория 5 — `compliance` (`buildCompliance`, строки 286-316)

| Проверка | Данные | Откуда |
|---|---|---|
| Санкции судна (OFAC/EU) | `worksheet.sanctions.{risk, blocking, reason}` | Worksheet (sanctions layer) |
| War-risk / JWC | `worksheet.hardFilters.warPositionVoyage.{pass,warning,reason}` | Worksheet / JWC Area Lists |
| KYC чартерера | `INACTIVE('не подключено')` | — |

---

## Q2. Как добавить `detail` и `source` БЕЗ правки движка

### Расширение интерфейса `DDCheck`

```ts
export interface DDCheck {
  label: string;
  state: DDState;
  evidence: string | null;
  /** 2-3 предложения: что это за проверка, что нашли, откуда данные. Только для демо-объяснений. */
  detail?: string | null;
  /** Badge-метка источника данных. */
  source?: string | null;
}
```

Поля `detail` и `source` — опциональные, additive. Существующие тесты читают только `.state` и `.evidence` — не сломаются. `counter` считает по `.state` — тоже не затронут.

### Маппинг каждой активной проверки на источник данных

| Категория | Проверка | `source` badge |
|---|---|---|
| vessel-port | Осадка — порт погрузки | `'Исходное письмо + port-master.json'` |
| vessel-port | Осадка — порт выгрузки | `'Исходное письмо + port-master.json'` |
| vessel-port | Краны / грузовое оборудование | `'Исходное письмо'` |
| cargo-holds | Объём груза под трюмы | `'Исходное письмо'` |
| cargo-holds | Тип груза ↔ тип судна | `'Исходное письмо'` |
| cargo-holds | Чистота трюмов / прошлый груз | `'L5C-матрица'` |
| cargo-holds | IMSBC группа | `'IMSBC-Code'` |
| economics | TCE vs breakeven | `'Расчёт TCE'` |
| economics | Экономика рейса (фит) | `'Расчёт TCE'` |
| economics | Утилизация DWT | `'Расчёт TCE'` |
| economics | Балласт-переход | `'Расчёт TCE'` |
| economics | Фрахт vs Baltic | `'Baltic-сид / исходное письмо'` |
| vetting | Flag (Paris MoU) | `'Paris MoU'` |
| vetting | Class society (IACS) | `'Реестр IACS'` |
| vetting | Vessel age | `'Equasis'` |
| vetting | P&I insurance | `'IG P&I clubs'` |
| vetting | PSC detentions | `'Equasis'` |
| vetting | CII rating | `'Equasis'` |
| vetting | Класс судна (фит) | `'Расчёт фит-%'` |
| vetting | Готовность / тайминг | `'Исходное письмо'` |
| compliance | Санкции судна (OFAC/EU) | `'OFAC/EU'` |
| compliance | War-risk / JWC | `'JWC Area Lists'` |

`INACTIVE` строки — `detail: null, source: null` (нет объяснять нечего).

### Примеры `detail` для ключевых проверок

```
Осадка — порт погрузки:
  detail: "Проверяем, войдёт ли судно под причал в порту погрузки.
           Берём расчётную осадку судна в грузу и сравниваем с допустимым лимитом
           причала из базы портов. Данные из письма-циркуляра судна и реестра портов."

TCE vs breakeven:
  detail: "Time Charter Equivalent — дневная доходность рейса за вычетом портовых
           расходов и бункера. Сравниваем с точкой безубыточности судовладельца.
           Выше → рейс прибыльный; ниже → убыток. Расчёт на основе сохранённых данных матча."

Санкции судна (OFAC/EU):
  detail: "Проверяем судно, его владельца и управляющую компанию по санкционным
           спискам OFAC (США) и ЕС. Красный флаг блокирует рейс. Данные берутся
           из санкционного слоя системы на момент матчинга."

Чистота трюмов / прошлый груз:
  detail: "Анализируем последние грузы судна по письму-циркуляру и проверяем
           совместимость с текущим грузом по L5C-матрице (перекрёстное загрязнение,
           требования к зачистке). Источник: поле lastCargoes из письма."
```

---

## Q3. ГИБРИД-раскрытие: RSC-граница и тонкий client-leaf

### Текущее состояние

`components/match/DueDiligencePanel.tsx` — **строго Server Component** (нет `'use client'`).  
Комментарий в файле (строка 5-7):
> "Static MVP — no interactivity — which keeps the heavy vetting / l5c / port derivation out of any client bundle."

Port-master landmine: `lib/sailing/port-master.ts` и `lib/ports/resolve.ts` импортят `data/ports/port-master.json` (~471 записей). Цепочка: `DueDiligencePanel → buildDueDiligence → computeVesselVetting → isIacs/paris-mou` (лёгкие, ~KB) и через `match-filters.ts → port-master` (тяжёлое). НЕЛЬЗЯ делать `DueDiligencePanel` client-компонентом — туянет port-master в бандл.

### Правильная RSC-граница (паттерн ReadinessDisclosure + LogicDisclosure)

Уже в проекте есть этот паттерн:
- `ReadinessDisclosure.tsx` — `'use client'` leaf, получает данные как props  
- `LogicDisclosure.tsx` — `'use client'` leaf, только `useState` toggle + chevron icon

Аналогичный подход для DD-панели:

```
app/match/[id]/page.tsx (RSC)
  └─ DueDiligencePanel.tsx (RSC) ← NO 'use client', НЕ менять
       └─ DDCheckRow.tsx (client-leaf, 'use client') ← НОВЫЙ компонент
            Props: { label, state, evidence, detail?, source? }
            Только: useState(false) + ChevronDown/Right toggle
            НОЛЬ импортов из lib/matching, lib/sailing, lib/ports
```

**Правило**: `DueDiligencePanel` остаётся RSC и рендерит `<DDCheckRow>` вместо текущего inline `<CheckRow>`. Все данные (`detail`, `source`) вычисляются сервер-стороне в `buildDueDiligence` — клиент получает готовые строки.

### Что НЕ импортировать в `DDCheckRow.tsx`

- `lib/matching/due-diligence` (кроме типа `DDState` — его можно, он type-only)
- `lib/sailing/*` (vessel-vetting, port-master, fit-breakdown)
- `lib/cargo/l5c-matrix`
- `lib/sanctions/*`
- `data/ports/port-master.json`

Разрешено: `lucide-react` (уже в бандле через другие client-компоненты), `react/useState`.

---

## Q4. Текущая структура `DueDiligencePanel.tsx` — куда встроить detail и source

### Текущая структура рендера

```tsx
DueDiligencePanel({ model })
  ├── Hero row (counter.ran, pass, caution, info, flagsCritical, fitPercent)
  └── grid grid-cols-1 md:grid-cols-2
       └── per category:
            ├── CatIcon + h3 (category label)
            └── divide-y divide-ds-border/40
                 └── CheckRow × N (inline function, НЕ экспортирована)
```

`CheckRow` (строки 32-46) — inline function. Рендерит:
1. Icon (4×4, shrink-0) — state-зависимый цвет
2. `<p className="text-sm">` — label
3. `{evidence && <p className="text-xs text-ds-text-muted">` — evidence

### Куда встроить detail и source

Заменить inline `CheckRow` на `<DDCheckRow>` (client-leaf). Новая структура каждой строки:

```
[Icon] label text (text-sm)
       evidence text (text-xs text-ds-text-muted) ← без изменений
       [▶ Подробнее] кнопка (text-xs, только если detail не null)
       ↕ при открытом состоянии:
         detail текст (text-sm text-ds-text-muted leading-relaxed)
         [Источник: {source}] badge (если source не null)
```

### Design-system токены (уже используются в панели)

| Токен | Назначение |
|---|---|
| `text-ds-text` | основной текст строки |
| `text-ds-text-muted` | evidence, подзаголовки |
| `text-ds-text-subtle` | inactive строки, кнопка «Подробнее» в покое |
| `bg-ds-surface` | фон панели |
| `ring-1 ring-ds-border` | рамка панели |
| `border-ds-border` | разделители |
| `divide-ds-border/40` | inter-row divider в категории |
| `text-ds-accent-soft-fg` | fit-% число в hero |
| `text-emerald-600` | pass icon |
| `text-amber-600` | caution icon |
| `text-sky-600` | info icon |

Для badge источника рекомендую (по аналогии с `LogicDisclosure`):
```tsx
<span className="inline-block mt-1 text-xs text-ds-text-subtle bg-ds-surface-subtle 
                 border border-ds-border/60 px-1.5 py-0.5 rounded">
  Источник: {source}
</span>
```

Кнопка «Подробнее» — по аналогии с `LogicDisclosure`:
```tsx
<button className="flex items-center gap-1 text-xs text-ds-text-muted 
                   hover:text-ds-text transition-colors mt-0.5"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}>
  {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
  {open ? 'Свернуть' : 'Подробнее'}
</button>
```

---

## Q5. Паритет list==detail: риски отсутствуют

Поля `detail` и `source` — чисто аннотационные. Они:
1. **Не участвуют в `counter`** — счётчик считает по `.state` (строки 330-337 due-diligence.ts)
2. **Не участвуют в `fitPercent`** — он эхируется вербатимно из `args.fitPercent` (строка 342)
3. **Не меняют `evidence`** — существующие тесты проверяют только `.state` и `.evidence`
4. **Статические строки** — не зависят от вычислений, одинаковы для list и detail view

Пример: test `'counter: ran = pass + caution + info, excludes inactive'` (строки 149-155) — не сломается, `detail`/`source` не читаются.

**Единственный риск**: если `buildDueDiligence` используется для list-страницы тоже. Проверка:

```
grep -rn "buildDueDiligence" app/ lib/ components/
```
→ только `app/match/[id]/page.tsx:201` — только detail-страница. List не использует.

---

## Итоговая схема реализации (для orchestrator)

### Файлы к изменению

1. **`lib/matching/due-diligence.ts`**  
   - Добавить поля `detail?: string | null` и `source?: string | null` в `DDCheck`  
   - Заполнить в каждом builder: статические `detail` строки + `source` badge per check  
   - Не трогать: DDModel, BuildDDArgs, counter, fitPercent, componentState/componentEvidence

2. **`components/match/DDCheckRow.tsx`** (НОВЫЙ файл)  
   - `'use client'`  
   - Props: `{ label: string; state: DDState; evidence: string | null; detail?: string | null; source?: string | null }`  
   - `useState(false)` toggle только  
   - НОЛЬ тяжёлых импортов (только lucide + react)

3. **`components/match/DueDiligencePanel.tsx`**  
   - Удалить inline `CheckRow`  
   - Импортировать `DDCheckRow` (client-leaf, RSC → client props pass)  
   - Передать все 5 полей: `label, state, evidence, detail, source`

4. **Тесты**  
   - `lib/matching/__tests__/due-diligence.test.ts` — добавить тест: активная проверка имеет непустой `detail` и `source`  
   - `__tests__/components/match/DDCheckRow.test.tsx` (НОВЫЙ) — behavioral: toggle открывает detail, badge рендерится

### Риски

| Риск | Оценка | Митигация |
|---|---|---|
| Port-master в client бандл | КРИТИЧНЫЙ если нарушить RSC | DDCheckRow не импортирует lib/* — только props |
| Сломать existing tests | Низкий | detail/source additive, tests не читают их |
| list==detail расхождение | Нет | buildDueDiligence не вызывается на list |
| TypeScript: DDCheck не совместим | Низкий | Поля optional — обратно совместимо |

---

`RECON_DONE`: /root/work/quantika-demo/.worktrees/recon-dd-detail/docs/research/recon-dd-detail-2026-06-17.md

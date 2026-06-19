# Implementation Plan — DD-панель: detail + source (гибридное раскрытие) 2026-06-17

> Recon: `docs/research/recon-dd-detail-2026-06-17.md` (полная карта 21 проверки → источник + примеры detail)
> Tier M · Opus 4.8 :high · ветка от `recon-dd-detail` (несёт recon-док)
> Origin: фаундер 2026-06-17 — «хочу видеть в DD-панели более развёрнутый ответ; это демо,
> клиент должен сразу понимать ЧТО за проверка, ЧТО нашли, ОТКУДА данные, без догадок».
> Подача = ГИБРИД (founder-locked): короткая суть видна всегда + «Подробнее» раскрывает.

## Goal

Каждая активная проверка DD-панели несёт два НОВЫХ опциональных поля:
- `detail` — 2-3 предложения простым языком: что это за проверка / что нашли / откуда данные.
- `source` — короткий бейдж-метка источника (Equasis / Исходное письмо / Расчёт TCE / Paris MoU / …).

Гибрид-раскрытие: `evidence` (живой факт) виден всегда, как сейчас; кнопка-шеврон
«Подробнее» раскрывает `detail` + `source`-бейдж. **Ноль правок движка** — `detail`/`source`
это статические презентационные строки, не участвуют в `counter`/`fitPercent`/scoring.
RSC-граница сохраняется (НЕ тащим port-master в клиент).

## Architecture (RSC boundary — критично, см. recon Q3)

`DueDiligencePanel.tsx` ОСТАЁТСЯ server-компонентом (NO 'use client') — иначе landmine
бандла port-master +786KB ([[project_quantika_port_master_client_bundle_landmine]]).
Раскрывашка = интерактивность → ТОНКИЙ client-leaf по образцу `ReadinessDisclosure.tsx` /
`LogicDisclosure.tsx`:

```
app/match/[id]/page.tsx (RSC)
  └─ DueDiligencePanel.tsx (RSC, НЕ менять на client)
       └─ DDCheckRow.tsx (НОВЫЙ 'use client' leaf)
            Props: { label, state, evidence, detail?, source? }
            ТОЛЬКО useState(false) + ChevronDown/Right toggle + рендер source-бейджа
            НОЛЬ импортов из lib/matching|sailing|ports|cargo|sanctions (DDState — type-only OK)
            Разрешено: lucide-react, react/useState
```

Вся деривация `detail`/`source` — на СЕРВЕРЕ в `buildDueDiligence`; клиент получает готовые строки.

## Files

### 1. EDIT `lib/matching/due-diligence.ts`
- Расширить `DDCheck`: `detail?: string | null; source?: string | null` (опциональные, additive —
  существующие тесты читают только `.state`/`.evidence`, не сломаются; `counter` по `.state` не затронут).
- В каждом category-builder'е (`buildVesselPort`/`buildCargoHolds`/`buildEconomics`/`buildVetting`/
  `buildCompliance`) при создании активной проверки добавить `detail` + `source` по карте из recon Q2.
- `INACTIVE`-строки: `detail: null, source: null`.
- НЕ трогать `counter`, `fitPercent`, состояния, honesty-инвариант (null-источник → inactive, никогда pass).

### 2. NEW `components/match/DDCheckRow.tsx` ('use client' leaf)
- Props `{ label, state, evidence, detail?, source? }`.
- Рендер: иконка состояния + label + evidence (как сейчас). Если `detail` есть → кнопка-шеврон
  «Подробнее» (useState toggle) раскрывает блок detail + `source`-бейдж.
- Source-бейдж: `text-ds-text-subtle border border-ds-border/60 rounded` (токены уже в проекте).
- ZERO тяжёлых импортов (см. Architecture).

### 3. EDIT `components/match/DueDiligencePanel.tsx`
- Заменить inline `CheckRow` на `<DDCheckRow … />`, прокинуть `detail`/`source` из модели.
- Остаётся RSC, без 'use client'.

### 4. EDIT `lib/matching/__tests__/due-diligence.test.ts`
- Активные проверки несут `detail` + `source` (непустые); inactive → оба null.
- **Parity (тест):** `counter` и `fitPercent` идентичны до/после добавления detail/source.
- **Honesty (тест, не регрессировать):** null-источник → inactive, никогда pass.

## Detail-copy (стартовая редакция — фаундер утверждает формулировки)

Образцы (полный набор на 21 проверку — в exec по карте recon Q2; тон: простой, без жаргона,
термин раскрыт в одном предложении при первом употреблении):

- **Осадка — порт погрузки:** «Проверяем, войдёт ли судно под причал в порту погрузки.
  Берём расчётную осадку судна в грузу и сравниваем с допустимым лимитом причала из базы
  портов. Данные — из письма-циркуляра судна и реестра портов.»
- **TCE vs breakeven:** «TCE (Time Charter Equivalent) — дневная доходность рейса за вычетом
  портовых сборов и бункера. Сравниваем с точкой безубыточности судовладельца: выше → рейс
  прибыльный, ниже → убыток. Считается по сохранённым данным матча.»
- **Чистота трюмов / прошлый груз:** «Смотрим последние грузы судна и проверяем совместимость
  с текущим грузом по матрице L5C (риск перекрёстного загрязнения, требования к зачистке трюмов).
  Источник — поле прошлых грузов из письма судна.»

### Честная подпись при ОТСУТСТВИИ данных (founder-locked 2026-06-17)

Когда `lastCargoes === null` (97% судов сейчас) строка «Чистота трюмов / прошлый груз» остаётся
`inactive`, но evidence/detail ЯВНО говорят правду дословной формулировкой фаундера:
- `evidence`: «Данных нет в исходном письме — нужно уточнить»
- `detail`: «Прошлый груз не указан в письме-циркуляре судна (типично для ~96% циркуляров).
  При наличии данных мы сверяем совместимость с текущим грузом по матрице L5C. Здесь —
  требуется уточнить у судовладельца/брокера.»
НИКОГДА не фейк-pass. Это применимо к ЛЮБОЙ inactive-строке с источником «письмо», где данных нет:
честно «нет данных в письме — нужно уточнить», а не глухое «нет данных».
- **Санкции судна (OFAC/EU):** «Проверяем судно, владельца и управляющую компанию по
  санкционным спискам OFAC (США) и ЕС. Красный флаг блокирует рейс. Данные — из санкционного
  слоя системы на момент матчинга.»
- **Flag (Paris MoU):** «Флаг судна сверяется со списком Paris MoU — межгосударственного
  меморандума по портовому контролю. Серый/чёрный список = повышенный риск задержаний в портах.»

## Worked-calc в detail (founder 2026-06-17 — «видна полностью логика, чтоб человек перепроверил»)

Источник формул: `docs/research/recon-dd-calc-2026-06-17.md` (ground-truth, file:line каждой
формулы). Executor берёт формулы ОТТУДА, НЕ выдумывает. `detail` для проверки с `has_calc=true`
строится из СОХРАНЁННЫХ полей матча (storedMatch + fitBreakdown.bracketData/rationale +
worksheet.hardFilters) — НЕ пересчёт (паритет сохраняется). Структура detail:
- что проверяем (1 строка);
- **Расчёт:** входные числа → операция → результат (проверяемо вручную);
- Итог: вердикт;
- honesty-оговорка где помечено.

Числа берём из ЭТОГО матча (через bracketData / stored-поля), не хардкод:

| Проверка | Расчёт в detail | Источник чисел | Обяз. оговорка |
|---|---|---|---|
| Утилизация DWT | `груз {cargoNom} mt ÷ вместимость {cap} mt = {util}% → вердикт` | bracketData "X / Y mt" | вместимость = DWCC если есть, иначе DWT |
| Объём под трюмы | `{cargoMax} mt × SF {sf} = {reqM3} m³ ÷ {grain} m³ = {ratio}%` | bracketData "% of grain" + rationale | SF из письма или keyword-оценка |
| TCE vs breakeven | `TCE ${tce}/сут − breakeven ${be}/сут = {diff}/сут → вердикт` | `tce_usd_per_day`, `breakeven_tce_usd_per_day` | **war-risk показан в breakdown отдельно, в это число НЕ входит** |
| Балласт-переход | `{dist} nm vs радиус класса ~{r} nm ({cls}) → вердикт` | bracketData "~N nm" | бункер балластного перехода учтён в строке TCE |
| Возраст судна | `{refYear} − {built} = {age} лет → ok/caution/warn` | `vessel.built`, `refYear` | — |
| Осадка (load/disch) | `осадка в грузу ~{laden}m vs лимит причала {limit}m → запас {margin}m` | `worksheet.hardFilters.{draft,destDraft}` | **оценка осадки по DWT и загрузке (screening), считается от ВЕРХНЕЙ границы груза — не точный расчёт** |

`has_calc=false` (флаг Paris MoU, класс IACS, P&I, санкции OFAC/EU, war-risk, CII-оценка):
`detail` = объяснение что это + источник, БЕЗ формулы (lookup по реестру/списку, не арифметика).
НЕ выдумывать формулу.

**Честность worked-calc (тест):** если показанное число не сходится с движком 1:1 (war-risk-
исключение в TCE; nominal-vs-max груз в утилизации/осадке) — `detail` ОБЯЗАН нести оговорку.
Прямой запрос фаундера: проверяющий должен суметь воспроизвести число; где не может — объясняем почему.

## Verification (executor — запустить, эмитить маркеры)
- `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit`.
- `npx jest lib/matching/__tests__/due-diligence.test.ts` + `--findRelatedTests` для
  `components/match/DueDiligencePanel.tsx components/match/DDCheckRow.tsx`.
- `npm run build` — **проверить, что бандл `/match/[id]` НЕ распух** (DDCheckRow — единственный
  новый клиентский код; подтвердить, что port-master НЕ затянут в client).
- Preview: панель рендерится; «Подробнее» раскрывает detail + source-бейдж; строка с пустым
  источником (LOA/CII-нет/KYC) остаётся inactive — БЕЗ кнопки detail, не фейк-pass.
- Эмит `<<PR_URL=…>>`, `<<TESTSKILL=…>>` (после cold-QA), `<<TEST_STEP=…>>`.
- Перед Next.js/React API новее v14 — WebFetch доков (RSC boundaries / 'use client').

## Non-goals (YAGNI)
Ноль правок движка/скоринга/регена/сида. Никаких новых источников данных — detail/source это
статические строки-объяснения. Inactive-строки без изменений. Не трогать существующий правый
рейл факторов. Не встраивать в письмо.

## Acceptance
- Каждая активная проверка: «Подробнее» раскрывает понятное объяснение + бейдж-источник.
- Inactive остаются серыми без detail (честность).
- `counter`/`fitPercent`/list==detail паритет не тронут (тест зелёный).
- tsc чистый; бандл `/match/[id]` плоский (port-master не в client).

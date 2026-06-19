# RECON: DD-панель — формулы расчёта (ground-truth)

> Date: 2026-06-17 · Branch: claude/1781692351-dd-detail  
> Status: RECON_DONE · Read-only — код не менялся  
> Цель: worked-lines для поля `detail` DD-панели — ТОЛЬКО то, что реально считает движок

---

## Методология

Каждая проверка:
- `has_calc`: есть ли арифметика (true) или только lookup (false)
- **Формула движка** — literal из source-файла
- **Входные поля** — откуда берутся числа
- **Worked line** — конкретный пример стрелками
- **Где считается** — файл:строка

Данные для DD-панели читаются ТОЛЬКО из сохранённого состояния матча:  
`storedMatch.worksheet_json` → `MatchWorksheet`, `storedMatch.fit_breakdown` → `FitBreakdown`.  
Движок НЕ пересчитывается при открытии страницы — только `computeVesselVetting` и `checkCompatibility`  
ре-деривируются из сохранённого vessel-снэпшота.

---

## 1. Осадка в грузу — estimatedLadenDraftM

**has_calc**: `true`  
**Файл**: `lib/sailing/laden-draft.ts:31–67`

### Формула движка

```
fullLoadDraftM = 0.4991 × DWT^0.2991          // эмпирическая регрессия, см. §2 исследования
ratio = min(cargoTons / DWT, 1.0)              // clamp: если груз > DWT → ratio=1
rawDraftM = fullLoadDraftM × ratio^0.3         // partial-load scaling
ladenDraftM = ceil(rawDraftM × 10) / 10        // conservative round-up to nearest 0.1m
```

Альтернативный путь (TPC-immersion, unused в продакшне):
```
// если tpc передан явно:
draftReduction = (DWT − cargoTons) / (tpc × 100)
rawDraftM = fullLoadDraftM − draftReduction
```

Сравнение: `ladenDraftM` vs `portLimitM` из `port-master.json` → `portCanHandleDraft(port, ladenDraftM)`

### Входные поля

| Поле | Источник |
|------|---------|
| `DWT` | `parsedVessel.dwtSummer` (cfValue) |
| `cargoTons` | max bound cargo weight: `cargo.weightMtMax ?? cfValue(cargo.weightMt)` |
| `portLimitM` | `port-master.json` → `portCanHandleDraft(port, ...)` |
| Результат | `worksheet.hardFilters.draft.{estimatedLadenDraftM, portLimitM}` |

### Worked line

Handysize 25 000 DWT, 20 000 t груза, порт лимит 10.5 m:

```
DWT = 25 000 t   cargoTons = 20 000 t
fullLoadDraftM = 0.4991 × 25000^0.2991
  = 0.4991 × 20.67 = 10.32 m
ratio = 20 000 / 25 000 = 0.800
rawDraftM = 10.32 × 0.800^0.3 = 10.32 × 0.935 = 9.65 m
ladenDraftM = ceil(96.5) / 10 = 9.7 m   (rounded up)
portLimitM = 10.5 m → 9.7 ≤ 10.5 → PASS
evidence: "Осадка в грузу ~9.7m vs лимит причала 10.5m"
```

### Флаги / расхождения

- `cargoTons` = **верхняя граница** диапазона (`weightMtMax`), не номинал — консервативно.  
  Если cargo задан диапазоном `[18 000, 22 000]`, осадка считается от 22 000 t.
- Результат `approximate: true` — работает только как screening, не точный расчёт осадки.
- Если DWT или cargoTons = null → `estimateLadenDraft` returns `null` → fallback на `checkDraft(port, staticDraftM)` (статическая осадка судна).

---

## 2. Утилизация DWT

**has_calc**: `true`  
**Файл**: `lib/sailing/fit-breakdown.ts:100–153` (`scoreUtilisation`)

### Формула движка

```
capacity = vessel.dwcc > 0 ? vessel.dwcc : vessel.dwtSummer
util = cargoWtNominal / capacity

// Piecewise share curve:
util ∈ [0.85, 1.05]   → share = 1.00  (near-full load)
util ∈ (1.05, 1.20]   → share = 0.85  (overflow risk)
util > 1.20            → share = 0.20  (overload)
util ∈ [0.65, 0.85)   → share = 0.65  (under-utilised)
util ∈ [0.50, 0.65)   → share = 0.55
util ∈ [0.30, 0.50)   → share = 0.30  (deadfreight)
util < 0.30            → share = 0.10

score = round(weight × share × 10) / 10   // weight = 19 pts
```

Part-cargo override (flag `partCargo = isPartCargo(description)`): floor share = 0.85, no deadfreight penalty.

### Входные поля

| Поле | Источник |
|------|---------|
| `cargoWtNominal` | `cfValue(cargo.weightMt) ?? resolveCargoWeight(cargo)` — **номинальное** значение (не max bound) |
| `capacity` | `vessel.dwcc` (preferred) или `vessel.dwtSummer` |
| `bracketData` | `"${cargoWtNominal} / ${capacity} mt"` — в сохранённом fitBreakdown |

### Worked line

24 000 t пшеница, Handysize DWCC = 27 000 t (DWCC взят):

```
cargoWtNominal = 24 000 t   capacity = 27 000 t (DWCC)
util = 24 000 / 27 000 = 0.889
→ [0.85, 1.05] → share = 1.00
score = round(19 × 1.00 × 10) / 10 = 19.0 / 19
rationale: "Cargo fills ~89% of the ship — a near-full load, almost no wasted space."
bracketData: "24,000 / 27,000 mt"
```

### Флаги / расхождения

- `cargoWtNominal` ≠ `cargoWtMax` — утилизация **показывает номинал** (одно число из письма),  
  тогда как осадка и объём считаются от верхней границы. Если груз = диапазон `[22 000, 26 000]`,  
  utilisation bracketData покажет `22 000 / 27 000 mt` (79%), а draft считался от 26 000 t.
- `capacity` = DWCC когда задан (реальная cargo-carrying capacity после вычета бункера/воды).  
  Если DWCC = null → DWT × 0.90 НЕ применяется здесь (это только в `checkCargoWeight` hard-filter).

---

## 3. TCE vs breakeven

**has_calc**: `true`  
**Файлы**: `lib/economics/compute-tce.ts:134–296`, `lib/economics/voyage-days.ts:33–41`, `lib/economics/breakeven-thresholds.ts:1–6`

### Формула TCE

```
// 1. Duration
if (ballastDistanceNm) {
  ballastDays = ballastDistanceNm / (speedKts × 24)
  ladenDays   = distanceNm / (speedKts × 24)
  durationDays = ballastDays + ladenDays + 2          // +2 port days
} else {
  // round-trip legacy:
  durationDays = (distanceNm / (speedKts × 24)) × 2 + 2
}

// 2. Bunker
totalBunkerMt = consumptionMtPerDay × durationDays
bunkerUsd = round(totalBunkerMt × bunkerPriceUsdPerMt)

// 3. Aggregation
grossFreight = round(quantityMt × freightRateUsdPerMt)
totalCosts   = bunkerUsd + canalUsd + daUsd + warRiskUsd + etsUsd + fueleuUsd
netVoyage    = grossFreight − totalCosts
TCE          = round(netVoyage / durationDays)        // $/day
```

**Важное соглашение stored path**: `excludeWarRiskFromDailyTce = true` —  
war-risk НЕ вычитается из TCE-числителя при сохранении матча. Цель: `tce_usd_per_day` совпадает  
между list и detail (detail пересчитывает с реальными портами, где war-risk != $0).  
War-risk есть в breakdown как отдельная строка, но не влияет на хранимый TCE.

### Breakeven (lookup по DWT-band)

```
breakevenTceByDwt(DWT):
  DWT ≤ 15 000  → $1 500/day
  DWT ≤ 40 000  → $3 000/day
  DWT ≤ 65 000  → $5 500/day
  DWT > 65 000  → $7 500/day
```

`breakeven_tce_usd_per_day` сохраняется при создании матча: `breakevenTceByDwt(vesselDwt)`.

### Входные поля

| Поле | Источник |
|------|---------|
| `quantityMt` | `resolveCargoWeight(cargo)` (max bound) → `cargo.weightMtMax ?? cfValue(cargo.weightMt)` |
| `freightRateUsdPerMt` | `resolveFreightRate` waterfall: manual > parsed > Baltic > estimated |
| `distanceNm` | `getPortDistance(loadPort, dischargePort)` → port-distances lookup |
| `ballastDistanceNm` | `getPortDistance(vessel.openPosition, loadPort)` → port-distances lookup |
| `speedKts` | `parseLeadingNumber(vessel.speedLaden)` or fallback class-default |
| `consumptionMtPerDay` | `parseConsumption(vessel.consumption, 0)` + `resolveConsMtPerDay(raw, DWT)` |
| `bunkerPriceUsdPerMt` | route-aware рекомендованный порт бункеровки → `bunker_prices` таблица |
| `canalUsd` | `quoteSuez`/`quoteBosporus` (по роуту) |
| `daUsd` | `sumMatchPortDaUsd([loadPort, dischargePort], ...)` → `port_da_estimates` |
| Результат | `storedMatch.tce_usd_per_day`, `storedMatch.breakeven_tce_usd_per_day` |

### Worked line

24 000 t пшеница, Новороссийск → Александрия, 1 200 nm laden, 350 nm ballast,  
Handysize 28 000 DWT, скорость 12 kts, расход 16 mt/day, бункер $560/mt, DA $4 500:

```
ladenDays   = 1 200 / (12 × 24) = 4.17 d
ballastDays = 350 / (12 × 24)   = 1.22 d
durationDays = 1.22 + 4.17 + 2  = 7.39 d

totalBunkerMt = 16 × 7.39 = 118.2 mt
bunkerUsd = round(118.2 × 560) = $66 192

grossFreight = 24 000 × 20 = $480 000
totalCosts   = $66 192 + $0 (canal) + $4 500 (DA) = $70 692
netVoyage    = $480 000 − $70 692 = $409 308
TCE          = round($409 308 / 7.39) = $55 387/day

breakeven(28 000 DWT) = $3 000/day
diff = $55 387 − $3 000 = +$52 387/day → PASS
evidence: "TCE $55,387/day — $52,387/day выше breakeven"
```

### Флаги / расхождения

- `excludeWarRiskFromDailyTce=true`: хранимый TCE показывает число **без учёта war-risk** в знаменателе.  
  Если показывать формулу пользователю, добавить оговорку: «war-risk ($X) включён в breakdown отдельно».
- `freight_rate_source`: если source = `'estimated'` или `'baltic'` — числа приблизительные,  
  DD-панель показывает badge «caution» на строке «Фрахт vs Baltic».
- `consumption_estimated`: если расход не указан в письме → движок использует class-aware fallback  
  из `resolveConsMtPerDay(0, DWT)` (handysize ~13 mt/day и т.д.).

---

## 4. Балласт-переход

**has_calc**: `true` (distance scoring vs class radius)  
**Файл**: `lib/sailing/fit-breakdown.ts:211–248` (`scoreBallast`)

### Что показывает DD-панель

DD читает `fitBreakdown.components['ballast'].{rationale, bracketData}`.  
**Компонент scoreBallast оценивает дистанцию относительно класса — это НЕ расчёт топливного расхода.**  
Потребление бункера на балластном переходе учтено в TCE (через `ballastDistanceNm → durationDays`), но отдельно в DD-панели НЕ отображается.

### Формула scoring (distance decay)

```
cls = classifyVesselByDwt(DWT)
r   = BALLAST_GOOD_MAX_NM[cls]   // class radius
     handysize=1500 nm, supramax=2000 nm, panamax=2500 nm, capesize=4000 nm

d   = readiness.distanceNm       // open position → load port

if   d ≤ 0:              share = 1.0
elif d ≤ r:              share = 1.0 − 0.6 × sqrt(d / r)    // sqrt-decay
elif d ≤ 2r:             share = 0.4 × (1 − (d − r) / r)    // linear to 0
else:                    share = 0.0                          // uneconomic

score = round(15 × max(0, share) × 10) / 10    // weight = 15 pts
```

### Источник distanceNm

`readiness.distanceNm` = `getPortDistance(vessel.openPosition, cargo.originPort)` — lookup в port-distances таблице (не AIS, approximate).  
Хранится в `worksheet.readiness.distanceNm` и в `storedMatch.ballast_distance_nm`.

### Worked line

Supramax 52 000 DWT, позиция Босфор, порт погрузки Новороссийск, расстояние ~580 nm:

```
DWT = 52 000 → class = supramax → r = 2 000 nm
d = 580 nm

share = 1.0 − 0.6 × sqrt(580 / 2000)
      = 1.0 − 0.6 × sqrt(0.290)
      = 1.0 − 0.6 × 0.539 = 1.0 − 0.323 = 0.677
score = round(15 × 0.677 × 10) / 10 = 10.2 / 15
rationale: "~580 nm to reposition to load port — within a supramax's range (~2000 nm) but not on the doorstep."
bracketData: "~580 nm"
```

### Флаги / расхождения

- bracketData показывает только дистанцию, не дни и не расход. Если делать «Подробнее»,  
  добавить: «бункер балластного перехода включён в строку TCE».
- `distanceNm = null` (неизвестная позиция судна) → `scoreBallast` возвращает unknown (share=0.6),  
  DD покажет только rationale без bracketData.

---

## 5. Объём груза под трюмы

**has_calc**: `true`  
**Файлы**: `lib/sailing/fit-breakdown.ts:412–468` (`scoreVolume`), `lib/sailing/match-filters.ts:168–186` (`checkVolume`)

### Формула движка

```
// Stowage factor resolution (explicit > keyword > default):
sf = explicit_from_letter
   ?? STOWAGE_FACTORS[keyword_in_description]    // wheat=1.30, coal=1.30, iron=0.35, scrap=1.50 ...
   ?? 1.35                                       // default bulk estimate

requiredM3 = cargoWtMax × sf
ratio = requiredM3 / grainCapacity

// Hard filter (checkVolume): fails if ratio > 1.05 (5% margin)
// Soft score (scoreVolume):
ratio ≤ 0.70  → share = 0.85  (comfortable, room to spare)
ratio ≤ 0.90  → share = 1.00  (ideal fill)
ratio ≤ 1.00  → share = 0.85  (tight but workable)
ratio > 1.00  → share = 0.25  (overflows holds)

score = round(3 × share × 10) / 10    // weight = 3 pts
```

Ключевые stowage factors (из `STOWAGE_FACTORS` в `match-filters.ts:114–138`):

| Груз | SF (m³/mt) |
|------|-----------|
| wheat / barley / soybean | 1.30–1.40 |
| maize / corn / rice | 1.35 |
| coal | 1.30 |
| fertilizer / urea | 1.05–1.10 |
| iron ore | 0.35 |
| scrap | 1.50 |
| timber / woodchips | 2.50–2.80 |
| cement | 0.75 |

### Входные поля

| Поле | Источник |
|------|---------|
| `cargoWtMax` | `resolveCargoWeight(cargo)` = `cargo.weightMtMax ?? cfValue(cargo.weightMt)` |
| `grainCapacity` | `vessel.grainCapacity` (из parsedVessel, м³) |
| `sf` | `cargo.stowageFactor` (text из письма) или keyword lookup |
| `bracketData` | `"${ratio×100}% of grain"` — в сохранённом fitBreakdown |

### Worked line

24 000 t пшеница, grain capacity = 32 000 m³:

```
sf = 1.30  (wheat keyword match)
requiredM3 = 24 000 × 1.30 = 31 200 m³
ratio = 31 200 / 32 000 = 0.975
→ [0.90, 1.00] → share = 0.85
score = round(3 × 0.85 × 10) / 10 = 2.6 / 3
rationale: "Cargo takes ~98% of the ship's grain capacity — a tight but workable fit."
bracketData: "98% of grain"

Hard filter: 31 200 > 32 000 × 1.05 = 33 600? → NO → PASS
```

### Флаги / расхождения

- `grainCapacity = null` → scoreVolume → unknown (score = 0.6×weight), bracketData пуст.  
  Если grain capacity есть, но объём CBM указан напрямую (без веса), движок использует `volumeCbm`  
  напрямую (fit-breakdown.ts:424–435), показывая `"${ratio}% of grain (CBM)"`.
- Stowage factor из письма — free-text, `resolveStowageFactor` парсит первое число `(\d+(?:\.\d+)?)`.  
  Если SF указан некорректно → fallback на keyword/default.

---

## 6. Возраст судна

**has_calc**: `true` (simple subtraction)  
**Файлы**: `lib/sailing/match-filters.ts:310–321` (hard check), `lib/sailing/vessel-vetting.ts:73–88` (soft vetting)

### Формулы движка

**Hard check** (`checkVesselAge`):
```
age = refYear − vesselBuilt
if (age > cargoMaxVesselAgeYrs) → FAIL ("vessel age N years exceeds cargo max M years")
// cargoMaxVesselAgeYrs = null → graceful PASS (conservative)
```

**Soft vetting** (`scoreAge`):
```
age ≤ 15     → 'ok'      ("modern vessel")
15 < age ≤ 22 → 'caution' ("mature vessel, higher maintenance risk")
age > 22     → 'warn'    ("aged vessel, elevated off-hire / inspection risk")
```

**EU discharge PSC cap** (fit-breakdown.ts:696–706):
```
euDischargeAge = refYear − vessel.built
if (euDischargeAge ≥ 25 AND isEuropeanDischarge(dischargePort)) → fit% capped at 55
```

### Входные поля

| Поле | Источник |
|------|---------|
| `vesselBuilt` | `vessel.built` (parsedVessel, год постройки из письма или Equasis) |
| `refYear` | передаётся из вызывающего кода (UTC год сессии, не Date.now()) |
| `cargoMaxVesselAgeYrs` | `cfValue(cargo.maxVesselAgeYrs)` (из письма грузовладельца) |

### Worked line

Судно построено в 2006, refYear = 2026, cargo max age = 20 лет, порт выгрузки = Rotterdam:

```
age = 2026 − 2006 = 20 лет

Hard check: 20 > 20? → NO → PASS ("vessel age 20 years within cargo max 20 years")

Soft vetting: 15 < 20 ≤ 22 → 'caution'
  rationale: "20 years — mature vessel, higher maintenance risk"

EU discharge PSC cap: age = 20 < 25 → НЕТ cap
```

Если бы возраст = 26 лет и порт = Rotterdam:
```
Hard check: 26 > 20 → FAIL (если cargo max age задан)
EU cap: age ≥ 25 + EU discharge → fit% capped at 55
```

---

## Lookup-проверки (has_calc = false)

Для этих проверок отображать только источник, БЕЗ формул:

| Проверка DD-панели | has_calc | Источник |
|--------------------|---------|---------|
| Flag (Paris MoU) | false | `lib/sanctions/paris-mou.ts` → white/grey/black list по коду флага |
| Class society (IACS) | false | `lib/sanctions/iacs-members.ts` → member or not |
| P&I insurance | false | `lib/sanctions/pi-ig-clubs.ts` → IG member or not |
| CII rating | false | `vessel.ciiRating` (field из Equasis) → A/B/C=ok, D=caution, E=warn |
| Санкции судна (OFAC/EU) | false | `worksheet.sanctions.{risk, blocking, reason}` — слой санкций при матчинге |
| War-risk / JWC | false | `worksheet.hardFilters.warPositionVoyage` → `isPortInHra(openPosition)` + DWT + basin hops |
| Чистота трюмов | false | L5C-матрица (`lib/cargo/l5c-matrix.ts`) + `vessel.lastCargoes` |
| IMSBC группа | false | `lib/sailing/imsbc-check.ts` + vessel.restrictions |
| Краны | false | `port-master.json` → `portHasShoreCranes(port)` |

---

## Сводка: где хранятся все числа

```
storedMatch (DB columns)
├── tce_usd_per_day                → computed at match-time, excludeWarRisk=true
├── breakeven_tce_usd_per_day      → breakevenTceByDwt(vesselDwt) at match-time
├── freight_rate_source            → 'manual'|'parsed'|'baltic'|'estimated'
├── consumption_estimated          → boolean (class-aware fallback fired?)
└── ballast_distance_nm            → getPortDistance(openPosition, loadPort)

storedMatch.worksheet_json → MatchWorksheet
├── hardFilters.draft.{estimatedLadenDraftM, portLimitM}   // #1
├── hardFilters.destDraft.{estimatedLadenDraftM, portLimitM}
├── hardFilters.crane.{pass, reason}
├── hardFilters.imsbc.{pass, warning, reason}
├── hardFilters.warPositionVoyage.{pass, reason}
├── readiness.{distanceNm, verdict, gapDays, ...}
└── sanctions.{risk, blocking, reason}

storedMatch.fit_breakdown → FitBreakdown
└── components[] → per FitFactor:
    ├── factor, label, weight, score
    ├── rationale   // текст для evidence
    └── bracketData // "24,000 / 27,000 mt" | "~580 nm" | "98% of grain" | null

parsedVessel (live re-derive в buildVetting):
└── flag, built, classSociety, pandi, ciiRating → computeVesselVetting(vessel, {refYear})
```

---

## Потенциальные расхождения при реализации «Подробнее»

| # | Расхождение | Описание | Рекомендация |
|---|------------|---------|-------------|
| A | cargoWtNominal ≠ cargoWtMax | Утилизация bracketData показывает номинальный вес, осадка/объём считались от max | В detail утилизации указать «номинальный вес из письма» |
| B | excludeWarRiskFromDailyTce | Хранимый TCE не включает war-risk в знаменателе | В detail TCE писать «war-risk показан отдельно в breakdown» |
| C | bracketData = null | Если fitBreakdown компонент без bracketData — только rationale, без чисел | Graceful fallback в detail: «числовые данные недоступны» |
| D | ballast distance approximate | port-distances lookup, не AIS | Пометить «приблизительно» |
| E | breakeven static | Вычислен при создании матча. Если DWT = null → breakeven = null | Показывать breakeven только если `breakevenTce != null` |
| F | consumption_estimated | Если расход оценён → TCE менее точный | Badge «расход оценён» уже в DD (freightCheck); в detail TCE дублировать не нужно |

---

`RECON_DONE`: docs/research/recon-dd-calc-2026-06-17.md

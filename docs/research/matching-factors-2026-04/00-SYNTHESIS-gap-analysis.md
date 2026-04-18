# 🎯 Gap Analysis: Matching Quantika vs Industry Standard

**Date:** 2026-04-18
**Baseline:** quantika-demo v1.1.1 (HEAD 7129286, deployed https://demo.quantika.org)
**Purpose:** Синтез 4 параллельных research reports + сравнение с реальной реализацией matching'а

---

## Executive Summary

| Метрика | Значение |
|---|---|
| **Факторов в industry checklist (MUST-HAVE)** | ~32 |
| **Факторов в Quantika сейчас** | 6 scoring + 7 hard gates = **13** |
| **Покрытие MUST-HAVE** | **~40%** |
| **Критичные пробелы** | 9 (см. Tier 1) |
| **Vessel data уже в email'ах (не нужен external API)** | 12 факторов |
| **Требуют интеграции (Equasis ✓, Sea-web, MarineTraffic, Baltic)** | 10 факторов |

**TL;DR:** мы покрываем **физику** (~60%) и **географию** (~40%), но **полностью пропускаем коммерцию** (TCE, bunker, port costs), **compliance** (CII, EU ETS, BWM), и половину **compatibility-факторов** (last-3-cargoes, hold cleanliness, destination port).

---

## Текущее состояние Quantika (v1.1.1)

**Hard gates** (match-filters.ts):
- draft (origin only), cranes, volume, cargo-vessel-compat, laycan-valid, readiness-late, sanctions-blocking

**Soft score** (match-scoring.ts, max 100):
| Factor | Max | % |
|---|---:|---:|
| Geographic proximity | 20 | 20% |
| Cargo type match | 20 | 20% |
| Laycan fit | 20 | 20% |
| Cargo handling / cranes | 15 | 15% |
| Volume / hold fit | 15 | 15% |
| DWT class fit | 10 | 10% |

**Known bugs (из предыдущего анализа):**
1. Laycan в прошлом не детектится
2. Destination port не проверяется
3. Confidence не влияет на score
4. LLM score отбрасывается (только косметика)
5. Spot vessel без upper threshold → "121d = IDEAL"
6. Weight range (`5,000 / 5,500 mts`) парсится как среднее

---

## 🔴 Tier 1 — MUST-HAVE, блокирующие качество матчей

| # | Фактор | Что делает | Impact | Data source | Effort |
|---|---|---|---|---|---|
| 1 | **Destination port compatibility** | draft/LOA/cranes/tides только на origin | $500k salvage | port-master.json уже есть | 2h |
| 2 | **Laycan-past detection** | `laycan_end < today` не проверяется | "shift to 2026" bug | `new Date()` + date-sanity | 1h |
| 3 | **Hold cleanliness / last-3-cargoes** | Grain после coal → cleaning delay | $100-500k rejection | lastCargoes уже парсится | 4h |
| 4 | **Vessel age cutoff** | Cargill не берёт >15y grain | Rejection rate 40% на Western | built year уже парсится | 2h |
| 5 | **PSC detention (24mo)** | >3 detention → major charterers decline | Silent rejection | Equasis (free) | 6h |
| 6 | **Weight range parsing** | `5,000 / 5,500 mts` → 5,250 (mean) | Trust loss после первого quote | prompt fix + type | 4h |
| 7 | **Confidence weighting в score** | interpreted = verbatim points | Guesses rank as verified | multiplier | 3h |
| 8 | **War risk zone overlay** | Red Sea/Black Sea/GoG routes без warnings | Broker не видит premium $30-200k | JWC polygon JSON | 4h |
| 9 | **TCE / voyage economics** | $/day не считается | Broker не может рекомендовать без TCE | bunker + DA + distance | 2-3 days |

**Итого Tier 1:** ~5-7 дней работы. После — система становится **продуктивным broker-assistant**.

---

## 🟡 Tier 2 — Significant improvement

| # | Фактор | Source | Effort |
|---|---|---|---|
| 10 | CII rating (A-E) | IMO DCS / EU MRV | 2-3 days |
| 11 | Flag state White/Grey/Black | Paris MoU JSON | 3h |
| 12 | IACS class check | Static list + Equasis | 2h |
| 13 | IG P&I membership | Static list 12 clubs | 2h |
| 14 | Pilotage/tug wait (WAfr) | GAC + manual stats | 3 days |
| 15 | Bunker consumption warranty | Email parser + Q88 | 4h |
| 16 | Grain-fit/timber-fit cert | Email parser (есть) | 3h |
| 17 | Tidal windows | port-master extension | 4h |
| 18 | Seasonal closures | Static JSON | 4h |
| 19 | Cargo-terminal type fit | port-master extension | 6h |
| 20 | Owner/manager reputation | Static tier JSON | 3h |
| 21 | Charterer credit tier | Static tier JSON | 3h |
| 22 | IMSBC Group A liquefaction | cargo-type lookup | 3h |

---

## 🟢 Tier 3 — Edge / nice-to-have

23. Ice class (Baltic only)
24. Scrubber restrictions (SG, UAE)
25. Air draft (Kiel Canal, bridges)
26. Panama Canal beam/LOA
27. EU ETS / FuelEU calculation
28. BWM Convention D-2
29. Crew visa restrictions
30. CAP rating (old tonnage)
31. Triangulation / ballast optimization
32. FFA curve (forward rates)

---

## 🐛 Map: existing bugs → Tier 1 fixes

| Bug | Каким Tier 1 фиксится |
|---|---|
| "121d gap = IDEAL" (spot) | #2 + spot upper threshold в readiness-gap.ts:219 |
| Weight 5,250 (среднее) | #6 |
| Date shift to 2026 | #2 |
| `Special: [object Object]` | UI bug, не matching — отдельно |
| CSRF error | Auth bug, не matching — отдельно |

---

## 📂 Data sources — интеграции

| Source | Cost | Что даёт | Status |
|---|---|---|---|
| Equasis | Free, rate-limited | Age, class, flag, PSC, manager | ✅ частично |
| MarineTraffic / AIS | Free basic / $50/mo | Position, last port | ❌ в roadmap |
| Sea-web / IHS Markit | $15-50k/yr | Full vessel + port DB | ❌ premium, позже |
| BIMCO Port Guide | $3-8k/yr | Standard port info | ❌ текущий port-master упрощён |
| Paris MoU W/G/B list | Free JSON | Flag tier | ❌ |
| JWC Listed Areas | Free bulletin | War risk zones | ❌ |
| Ship & Bunker | Free scrape / $ API | Bunker prices daily | ❌ |
| Baltic Exchange | $5-15k/yr | Freight benchmarks | ❌ |
| IMO DCS / EU MRV | Free CSV | CII ratings | ❌ |
| GAC Hot Port News | Free email | Disruptions | ❌ |

**Quick wins (free static JSON, ~1 день каждый):** Paris MoU flag list, JWC polygons, IACS members, IG P&I.

---

## 🗺️ Recommended roadmap (волны)

### Wave 5 — Matching Reality Sanity (v1.2.0, 3-5 дней)
- #1 Destination port check
- #2 Laycan-past detection
- #6 Weight range parsing
- #7 Confidence weighting
- Fix "121d = IDEAL" spot bug

**Deliverable:** матчи перестают врать.

### Wave 6 — Commercial Layer (v1.3.0, 5-7 дней)
- #9 TCE calculation
- #21 Charterer credit tier
- Ship&Bunker integration
- Baltic distances + bunker hubs

**Deliverable:** broker видит $/day TCE — может сразу рекомендовать owner'у.

### Wave 7 — Vessel Vetting (v1.4.0, 5-7 дней)
- #3 Last-3-cargoes compat matrix
- #4 Age cutoff scoring
- #5 PSC detention (Equasis deep)
- #11 Flag tier (Paris MoU)
- #12 IACS class
- #13 IG P&I

**Deliverable:** RightShip-style vetting built-in.

### Wave 8 — Risk Overlay (v1.5.0, 3-4 дня)
- #8 JWC polygons + AWRP estimate
- #18 Seasonal closures
- #22 IMSBC Group A warning
- Extended sanctions (cargo origin)

**Deliverable:** operational risk warnings.

### Wave 9 — Port Intelligence (v1.6.0, 7-10 дней)
- #14 Pilotage/tug wait averages
- #17 Tidal windows
- #19 Cargo-terminal type fit
- Expand port-master: berth types, air draft, seasonal depth

**Deliverable:** port-master — не dumb JSON, а real ops picture.

---

## 📊 Expected impact на метрики

| Metric | Now | After Wave 5-9 |
|---|---|---|
| False positive matches | ~30% | <5% |
| Broker trust | "cute demo" | "actually useful" |
| TCE в output | 0% | 100% |
| Matches с war-risk warnings | 0% | ~20% routes |
| Vessel age/class/PSC учёт | 0% | 100% |

---

## Source files (в этой директории)

- `01-industry-criteria.md` — общий RightShip-style checklist
- `02-port-compatibility.md` — port factors beyond draft/cranes
- `03-vessel-characteristics.md` — vessel factors beyond DWT
- `04-commercial-market.md` — TCE, bunkers, laytime, JWC
- `00-SYNTHESIS-gap-analysis.md` — этот файл (синтез)

# ROADMAP MVP — "Скептичный брокер не сломает"

Цель: превратить демо в продукт, где логика выдержит разбор profi-брокером. Не больше фич — больше честности. Лучше 3 правдивых match с обоснованием, чем 15 где 10 очевидно бред.

**Принцип:** физически невозможные совпадения отфильтровываются ДО LLM (hard filters в коде). LLM занимается только тем, в чём он силён — reasoning поверх structured data.

## Wave 1 — Hard filters (физика + даты) — текущий коммит

Чтобы невозможное не показывалось вообще.

| # | Work item | Файлы |
|---|---|---|
| 1.1 | **Port master table** (18 портов: draft, cranes, berth types) | `lib/sailing/port-master.ts` + tests |
| 1.2 | **Draft + crane hard filters** в matcher | `app/api/ai/match/route.ts`, `lib/sailing/match-filters.ts` |
| 1.3 | **Laycan sanity**: end ≥ start, open_date не старше 30 дней | `lib/sailing/date-parsing.ts` + tests |
| 1.4 | **Volume check**: cargo_weight × stowage_factor ≤ grain_capacity | `lib/sailing/match-filters.ts` + tests |
| 1.5 | **Cargo × vessel type matrix**: bulk/MPP/tanker × cargo types | `lib/matching/compatibility.ts` + tests |
| 1.6 | **IMO checksum** (7 digits, mod-10) — ловим galлюцинации vessel names | `lib/validation/imo.ts` + tests |
| 1.7 | **Stale position warning** (open_date > 5d от "today") | `lib/sailing/readiness-gap.ts` extend |
| 1.8 | **Number \|\| null antipatterns** — грепнуть и починить весь класс багов | `lib/**/*.ts` |

**Acceptance:** 50-email adversarial suite проходит без "невозможных" матчей. Draft mismatch, volume overflow, stale position — всё помечено или отфильтровано с объяснением.

## Wave 2 — Source traceability + confidence calibration

Чтобы брокер мог кликнуть на ЛЮБУЮ цифру и увидеть где в письме она написана.

| # | Work item |
|---|---|
| 2.1 | LLM prompt форсирует `sourceText` + `sourceQuote` для каждого field |
| 2.2 | UI popup: клик на field → exact quote из письма |
| 2.3 | Email view с подсветкой parsed extractions (highlight ranges) |
| 2.4 | Confidence calibration: "abt/circa/~" → auto-downgrade до `interpreted` |
| 2.5 | Adversarial test suite — 20 намеренно кривых писем (typos, contradictions, hallucination-bait) |

**Acceptance:** для каждого field на match-карточке есть click → show source quote. Confidence не лжёт.

## Wave 3 — External validation + adversarial hardening

Чтобы "vessel exists?" не оставался вопросом.

| # | Work item |
|---|---|
| 3.1 | Equasis IMO lookup (free, rate-limited, 24h cache) |
| 3.2 | Sanctions matrix: flag × country (RU/UA/IR hard cases) |
| 3.3 | "Why this match?" — breakdown score по factor weights, видимый пользователю |
| 3.4 | Dogfooding с 3 реальными брокерами — фиксы on the fly |
| 3.5 | 10 demo scenarios отполированы end-to-end |

**Acceptance:** пилот с 3 брокерами, zero "impossible match" инцидентов, positive feedback от хотя бы 2/3.

## Wave 4 — Port Master Global (v1.1.0) — 2026-04-16

**Goal:** Scale port coverage 15 → 416 ports, global dry-bulk / general cargo / container hubs.

**Delivered:**
- UN/LOCODE 2024-2 CSV ingestion pipeline (`scripts/generate-port-master.ts`)
- JSON-backed port master (`data/ports/port-master.json`, ~416 ports)
- Fuzzy port-name matching via `fuzzysort` (case/prefix/alias/unlocode)
- Haversine great-circle distance fallback for pairs outside hardcoded matrix
- LLM enrichment (gpt-5.4-mini) for draft/crane/berth/LOA/tidal/ice fields
- UI "~1487 NM (approx)" prefix for haversine-computed distances
- `scripts/verify-ports.ts` for manual data quality review
- +78 new tests (454 total)

**Post-release:** Monitor `dataConfidence=low` entries; accurate sea routing via searoutes.com → Wave 5 backlog.

## Out of scope (не для МВП)

- Freight rate benchmarking (Baltic Exchange) — phase 2
- Bunker price feed — phase 2
- Multi-tenancy / billing / GDPR — отдельный ops roadmap
- CargoWise / Veson export — после валидации product-market fit

## Acceptance test перед встречей с брокером

Прогоняем 50 реальных писем. На каждый match проверяем:

- [ ] Draft/berth соответствует порту?
- [ ] DWT/volume/stowage сходится?
- [ ] Timing (readiness gap) реалистичен?
- [ ] IMO валидный?
- [ ] Port существует?
- [ ] Source quote точный?
- [ ] Confidence честный (нет "confirmed" где "abt")?
- [ ] Нет sanctions?

Хотя бы один fail — fix before demo. Никаких "it's a demo" отмазок.

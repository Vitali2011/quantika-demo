# Plan: Match Phase B Advanced — Extended Corridors + Fuzzy + Idle Calibration
Date: 2026-05-23

## Цель
Расширить eval corpus с 25 → 39 сценариев и обеспечить >=95% PASS за счёт трёх улучшений.

## Baseline
25/25 PASS (100%) до расширения. Все новые тесты должны пройти с 0 регрессий.

## Файлы
- `lib/sailing/port-distances.ts` — DISTANCES_NM + PORT_ALIASES
- `evals/match/runner.test.ts` — +14 новых сценариев (SC-26..SC-39)

## Шаги

1. **Marghera↔Black Sea (9 пар в DISTANCES_NM)** — все эти пары отсутствуют в searoute JSON.
   Источник: Ravenna-baseline + 10nm offset (Marghera|Piraeus=710 vs Ravenna|Piraeus=700).
   Пары: Marghera↔Novorossiysk/Varna/Burgas/Constanta/Karasu/Izmail/Taman/Tuapse/Yuzhny.

2. **intra-MENA + Far East feeders (6 пар)** — Tier 1 promotion из searoute JSON для документирования
   ключевых коридоров: Alexandria|Jeddah, Mersin|Tartus, Piraeus|Tartus, Bangkok|Songkhla,
   Singapore|Songkhla, Kakinada|Chennai.

3. **PORT_ALIASES (+2)** — 'konstantsa'→Constanta (руском/болгарская транслитерация),
   'novorossisk'→Novorossiysk (распространённая опечатка). Fuzzy fallback уже работает
   для этих вариантов, но explicit alias гарантирует детерминизм.

4. **eval runner.test.ts (+14 сценариев)**:
   - Group I (SC-26..SC-31): idle penalty boundary — gapDays 0/7/14/15/30/31
   - Group J (SC-32..SC-36): extended corridors — Mersin|Tartus, Alexandria|Jeddah,
     Trieste|Novorossiysk, Marghera|Novorossiysk, Bangkok|Songkhla
   - Group K (SC-37..SC-39): fuzzy matching — Konstantsa, Novorossisk, Porto Marghera

## Acceptance
- 39/39 PASS (или >=38/39 = >=97%)
- PI3: ни одно существующее ожидание не переписывается
- PI2: Group J/K используют реальные вызовы `calculateReadinessGap`; Group I — `idleScorePenalty`

## Out of scope
- LLM prompt в match API
- UI /matches (другая ветка)
- parse-vessel / parse-cargo runtime
- Readiness scoring FuelEU/MED-01
- Tier 3 (on-the-fly searoute) — только Tier 1/2

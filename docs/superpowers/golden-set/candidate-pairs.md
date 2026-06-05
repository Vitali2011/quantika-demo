# Golden-set — кандидаты (B1, 2026-06-05)

> Отбор из локального корпуса `.private/raw-emails` (153 письма) + `etms-corpus.json`. БЕЗ прода
> (прод-доступ намеренно не используется — эталонные входы канонически из сырых писем).
> Gate-команда: `npm run golden`. Источник правды по входам = тело письма; дистанция = searoutes.com (веб).
> Пары предложены по сабжектам; verify-workflow дочитает тела для точных qty/laycan/speed/consumption
> и подтвердит/уточнит спаривание. **Спаривание груз↔судно ниже — черновое, ждёт твоей сверки.**

## Бонус-находка

Корпус содержит **не-bulk грузы** (сталь: Odessa/Aliaga, Turkish Steels). Это включает перенесённый
из A3-ревью пункт: перед стальными парами добавить `cargoType` в `schema.ts`+`runner.ts` (см. план, Фаза B).

## Кандидаты — баг-классы (10)

| #   | Класс бага                    | Груз (email)                                         | Судно (email)                                                 | Почему / что проверяем                                                                                          | Ожид. цвет    |
| --- | ----------------------------- | ---------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------- |
| 1   | **weight-range** (B6)         | `19d5e75f7c50d8e8` salt 4000–4800 Egypt→Odesa        | `19d5e74e4479a895` 5K dwt open Karasu                         | диапазон 4000–4800 → движок берёт max; вес должен быть null/диапазон. (Бонус: Чёрное море + судно без скорости) | 🔴            |
| 2   | **detectSpot** (B10)          | `19d5dea61d04209f` 30,000 cement Suez→Nacala         | `19e07c4bb3fee039` MV LADY ANITA open Red Sea **SPOT PROMPT** | спот-судно с prompt-датой → detectSpot ломается → idle-демоут вместо ideal                                      | 🔴            |
| 3   | **Black Sea short-leg** (B7)  | `19e07c482e65e378` 10,000 **steels** Odessa→Aliaga   | `19e07c68d1a6c54a` AMITY 29996DW/10/CR30                      | короткое ЧМ→Med плечо: дистанция/портсборы≠$0/Tier-2 фрахт. (Бонус: не-bulk сталь → cargoType)                  | 🔴            |
| 4   | **negative-TCE** (B4)         | `19e07c3f2dc72d95` 3,000 cement bb Iskenderun→Greece | `19d5e79432c6caf9` DWT 63695 open Casablanca                  | крошечный груз на панамаксе, короткое плечо → огромный deadfreight → убыток; должен капнуться и не быть good    | 🔴            |
| 5   | **absent-speed → est** (B3)   | `19d5def0bf1a5c3f` 3,000 bb Antalya→Georgetown       | `19d5e77730e6489b` MV Gandolf open Skikda spot                | в письме судна нет скорости → движок молча 12 узлов; golden ждёт флаг «est.» (это `it.failing` до фикса B3)     | 🟥 it.failing |
| 6   | **unknown-port**              | `19e07c5000b8200e` Mtwara→Matadi Coal                | `19d5e79432c6caf9` DWT 63695 (или иной)                       | Mtwara/Matadi вне port-master → гейты «null→pass»; проверяем, что плохой матч не проходит молча                 | 🔴            |
| 7   | **DWT 35–50k класс**          | `19e07c53928a4333` 55,000 iron ore ex-EC-India       | (искать в телах: FEYZ/Ocean7/AENAV списки)                    | ultramax 35–50k считается как handysize (12.5kt + радиус). **Судно ищет verify в multi-position письмах**       | 🔴            |
| 8   | **list↔detail TCE** (#819/B5) | `19e07c5b023cf374` 70,010 sugar Brazil→WC India      | `19d5e79432c6caf9` DWT 63695 panamax                          | карточка==список по TCE (после #829-регена это могло сойтись — VERIFY-FIRST)                                    | ⚪ verify     |
| 9   | **non-bulk cargoType**        | `19e07c809393ff78` Turkish Steels                    | `19e07c65c31852c7` FAITH 30116DW/12/CR30                      | сталь не должна считаться как bulk (freight/util). Требует поля cargoType                                       | 🔴            |
| 10  | **part-cargo / util**         | `19e07c7d8deafc02` 6000–7000 bagged cement x2 CVC    | `19e07c79d78505e4` MV TBN abt 17K DWT grain                   | частичный груз + диапазон → utilisation; (двойной сигнал: weight-range)                                         | 🔴            |

## Контрольные (заведомо чистые, ≥5) — должны быть 🟢

| #   | Груз                                                   | Судно                            | Почему чистый                                                 |
| --- | ------------------------------------------------------ | -------------------------------- | ------------------------------------------------------------- |
| C1  | `19e07c5b023cf374` 70,010 sugar Brazil→WC India        | `19d5e79432c6caf9` 63695 panamax | long-haul, полный груз ~util, прибыльный                      |
| C2  | `19e07c53928a4333` 55,000 iron ore ex-EC-India         | (supramax из позиций)            | bulk, хорошая загрузка                                        |
| C3  | `19e07c65c31852c7` FAITH 30116DW/12/CR30 Praia Mole    | (хендисайз-груз ~25–30k)         | полная спека в письме (dwt/speed/crane), все входы реальны    |
| C4  | `19d5df57f1eb40e6` MV NORTHSTAR GLORY recap (FDF→Alex) | — recap                          | в письме recap = согласованные термины (фрахт/laycan реальны) |
| C5  | `19d5df35aa2df825` MV STAD Alexandria terms            | —                                | terms-письмо, реальные входы                                  |

## Открытые пункты для verify-workflow

- **DWT 35–50k судно** (#7) — найти в multi-vessel письмах (FEYZ `19e07c8807c18d8c`, Ocean7 `19d5e7455d073a74`, AENAV `19d5e73477f04fb9`).
- **Спаривание** грузов с recap/terms-судами (C4/C5) — дочитать тела, подобрать реальный встречный.
- **#8 (#819)** — VERIFY-FIRST: возможно уже сошлось после #829; если да → переводим в контроль 🟢.
- Точные qty/laycan/speed/consumption — из тел писем (verify).

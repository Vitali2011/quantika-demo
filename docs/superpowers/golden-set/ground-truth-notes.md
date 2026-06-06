# Golden-set — ground-truth notes (read from email BODIES, not subjects)

> Variant A, 2026-06-05. Rule #1 evidence base: every number here is read from the
> decoded body in `.private/etms-corpus.json` (real, non-anonymized). Subjects lie —
> these are the verified facts. Final per-pair numbers (exact qty, external distance,
> double-compute TCE) are produced during the verify phase for the pairs the ENGINE
> actually surfaces on the built board (`data/demo-seed.db`, frozen 2026-05-10).

## ⚠️ Corpus has STALE / forwarded emails

The corpus `date` field = when forwarded into the demo inbox (Apr–May 2026). The BODY
often carries the real laycan/open-date from the past. Normalize laycan to the 2026 demo
timeframe (as the prior `golden-candidates.ts` did) — the three golden numbers
(weight/distance/TCE) are laycan-independent; laycan only affects bucket/timing.

- cement 30,000 Suez/Nacala (`19d5dea61d04209f`): body "Sent 20 May **2019**", "L/Can e/Jun'**19**".
- GLORY TOM 63695 (`19d5e79432c6caf9`): body "Sent 15 July **2025**", open "END AUG/EARLY SEP".
- salt 4000-4800 (`19d5e75f7c50d8e8`): body "Sent 7 Aug **2025**".
- Gandolf (`19d5e77730e6489b`): body "Sent 5 Sep **2025**".

## CARGOES (verified from body)

| email              | commodity              | qty (stated)              | range?          | load → disch                                                            | laycan (body)      | notes                                          |
| ------------------ | ---------------------- | ------------------------- | --------------- | ----------------------------------------------------------------------- | ------------------ | ---------------------------------------------- |
| `19e07c5b023cf374` | bulk sugar             | 70,000 / 10% moloo        | 63,000–77,000   | Santos (Brazil) → WC India                                              | Jul 07 onwd        | clean full cargo (control C1)                  |
| `19e07c53928a4333` | iron ore               | 55,000 / 10%              | 49,500–60,500   | 1spsb EC India → 1spsb China main                                       | 15/24 May          | VOY only, long-haul bulk                       |
| `19e07c5000b8200e` | coal in bulk           | 22,000 / ±10%             | 19,800–24,200   | Mtwara (TZ) → Matadi (DR Congo)                                         | 01/10 Jun          | **grab/gear req**; ports likely unknown-port   |
| `19d5dea61d04209f` | cement in sling        | 30,000                    | —               | Suez → Nacala (MZ)                                                      | e/Jun (2019 stale) | detectSpot candidate cargo                     |
| `19d5e75f7c50d8e8` | salt in big-bags       | 4000–4800                 | **4,000–4,800** | Egypt Med → Odesa/Chornomorsk chopt                                     | spot               | **weight-range B6**; bagged (not pure bulk)    |
| `19e07c3f2dc72d95` | cement in big bags     | 3,000                     | —               | Iskenderun → 1 Greece                                                   | 11/16 May          | tiny → neg-TCE B4 if paired to big vessel      |
| `19e07c809393ff78` | **STEEL (4 parcels!)** | 2720 / 6500 / 2000 / 1000 | —               | Nemrut→Liverpool; Nemrut→Constantza; Hereke→Birkenhead; Hereke→Greenore | 15-25 May          | subject "Turkish Steels" = 4 cargoes; non-bulk |

## VESSELS (verified from body)

| email              | name          | DWT                | speed           | gear/crane          | open                          | restrictions                                | notes                                                                      |
| ------------------ | ------------- | ------------------ | --------------- | ------------------- | ----------------------------- | ------------------------------------------- | -------------------------------------------------------------------------- |
| `19d5e79432c6caf9` | MV GLORY TOM  | 63,695             | (not in head)   | —                   | Casablanca, end Aug/early Sep | **NO UKRAINE, NO BLACK SEA RUSSIA, NO USA** | panamax; bunkers 600-700 VLSFO = ON-BOARD stock, NOT daily cons            |
| `19e07c68d1a6c54a` | AMITY         | 29,996             | 10 kt           | CR 30 MT (geared)   | Bizerte (Tunisia) 14/20 May   | —                                           | supramax-ish, full spec                                                    |
| `19e07c65c31852c7` | FAITH         | 30,116             | 12 kt           | CR 30 MT (geared)   | Praia Mole (Brazil) 15/20 May | —                                           | full spec (control C3)                                                     |
| `19e07c79d78505e4` | HACI HILMI II | 6,976 (dwcc 6,750) | (not stated)    | 3×10 MT cranes      | Marmara 22/23 May             | —                                           | subject also names phantom "MV TBN 17K" = a PAST fixture ref, not bookable |
| `19e07c4bb3fee039` | MV LADY ANITA | 5,328 (summer dwt) | (not stated)    | ungeared, gen-cargo | Red Sea **SPOT PROMPT**       | —                                           | spot/prompt → **detectSpot B10**                                           |
| `19d5e77730e6489b` | MV Gandolf    | 1,084              | **none stated** | 1 hold              | Skikda **spot**               | —                                           | **absent-speed B3**; 1084t → can't take ≥3000t (engine must BLOCK)         |

## Bug-class mapping reminders (confirm on real board — engine pairs, not me)

- **B4 neg-TCE**: small cargo (cement3000) × big vessel (panamax) → deadfreight → loss. Engine must cap, not rank good.
- **B7 short-leg inflated TCE**: preview showed steel6.5k Nemrut→Constanta (475nm) × HACI = **$33,088/day** (impossible for a 6976dwt coaster). External TCE is the oracle.
- **B6 weight-range**: salt 4000-4800, coal ±10% → engine takes max; golden weight = stated range / honest.
- **B10 detectSpot**: LADY ANITA / Gandolf spot-prompt vessels → must not demote to idle.
- **unknown-port**: Mtwara/Matadi likely absent from port-master → gate "null→pass" check.
- **non-bulk**: steel/cement-bagged/salt-bagged scored as BULK (freight/util wrong).
- **Controls**: sugar70k×panamax (long-haul full), iron-ore55k×supramax, AMITY/FAITH full-spec geared.

## Freight-rate notes (for external TCE oracle, NOT engine estimate)

Email freight fields seen are mostly load/disch RATES (e.g. "1200/1200", "8000/3000" mt/day)
and commission ("2.5%", "3.75 pct") — NOT the USD/mt freight. So freight for the oracle
comes from a published index for the route/frozen-date (mark `freightRate: 'index'`), unless
a recap/terms email states an agreed lumpsum/rate (then `'stated'`).

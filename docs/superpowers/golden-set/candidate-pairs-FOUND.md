# Candidate Pairs — Bug Class Instances Found

Generated from: `data/demo-seed.db` + LLM cache `d5dadc4fd8ff2855865a1da2174ff4799d57126b98d0ee4d5ba6efe04fa0ca7b.json`
Total matches in DB: 425

---

## B4 — Negative TCE Ranked Good

Pairs where `tce_usd_per_day < 0` yet ranked by descending score. All 5 found in the `main` bucket with fit_percent 38 — the engine included them despite unprofitable economics.

| cargo_id         | vessel_id        | vessel_name       | cargo_ref                                   | tce   | distance_nm | fit_pct | bucket | why_this_exhibits_bug                        |
| ---------------- | ---------------- | ----------------- | ------------------------------------------- | ----- | ----------- | ------- | ------ | -------------------------------------------- |
| 19e07ca31cff6b2a | 19d5e7668c6587bd | MV ALINA          | Damietta→Douala: containers (HDC 300×20ft)  | -1774 | 2126        | 38.0    | main   | Negative TCE, still surfaces as scored match |
| 19e07ca31cff6b2a | 19e08a05d472698a | MV ELFRIEDE       | Damietta→Douala: containers (HDC 300×20ft)  | -770  | 1930        | 38.0    | main   | Negative TCE, still surfaces as scored match |
| 19e07ce171ab8e10 | 19d5e7455d073a74 | SLOMAN DISPATCHER | Iskenderun→Constanța: Bulk minerals non-IMO | -2918 | 3417        | 38.0    | main   | Negative TCE despite 3 417 nm leg            |
| 19e07cfdf63e232b | 19e07d53e7d46b71 | MV ONEGO MERCHANT | Vasto→Cyprus: Gypsum boards                 | -981  | 989         | 38.0    | main   | Negative TCE on medium-distance leg          |
| 19e07cfdf63e232b | 19e097b0d6404a40 | MV MERIC          | Vasto→Cyprus: Gypsum boards                 | -1585 | 1056        | 38.0    | main   | Negative TCE on medium-distance leg          |

---

## B7 — Short-Leg Inflated TCE

Pairs where `distance_nm < 800` and `tce_usd_per_day > 15000`. TCE is mechanically inflated on very short legs because voyage days collapse while freight stays fixed.

| cargo_id         | vessel_id        | vessel_name                | cargo_ref                                  | tce    | distance_nm | fit_pct | bucket | why_this_exhibits_bug                                          |
| ---------------- | ---------------- | -------------------------- | ------------------------------------------ | ------ | ----------- | ------- | ------ | -------------------------------------------------------------- |
| 19e08a26402532a7 | 19e08a0886a6e7d9 | MV LADY MERAL              | Constanța→Conakry: Corn in bulk            | 125747 | 270         | 38.0    | main   | 270 nm leg yields TCE of $125k/day — physically implausible    |
| 19e089d960261c91 | 19e07d49ee39a1cc | MV LADY HATICE EX SQUAMISH | Casablanca→Diliskelesi: Steel coils/plates | 92861  | 96          | 61.5    | main   | 96 nm leg yields TCE of $92k/day — extreme short-leg inflation |
| 19e089d15179ef31 | 19e07c68d1a6c54a | AMITY                      | Bejaia→Turkish E. Med port: Bagged cargo   | 81703  | 269         | 59.7    | main   | 269 nm, TCE $81k/day — inflated by near-zero voyage days       |
| 19e07d5b25766951 | 19e07c68d1a6c54a | AMITY                      | Sfax→Dakar: Olive pomace                   | 58442  | 303         | 38.0    | main   | 303 nm, TCE $58k/day — short-leg TCE anomaly                   |
| 19e089fc113c03c5 | 19e08a05d472698a | MV ELFRIEDE                | Spanish Med→Sweden: (1 safe port)          | 41972  | 309         | 80.1    | main   | 309 nm, TCE $42k/day — short voyage inflating per-day figure   |

---

## B6 — Weight-Range Max Driven

84 cargos in the cache have `weightMtMin != weightMtMax`. The engine uses `cargoWtMax` in `inputs` (confirmed from fit_breakdown JSON), meaning it always prices to the top of the range. Representative matches shown.

| cargo_id         | vessel_id        | vessel_name       | cargo_ref                                  | tce   | distance_nm | fit_pct | bucket | why_this_exhibits_bug                                         |
| ---------------- | ---------------- | ----------------- | ------------------------------------------ | ----- | ----------- | ------- | ------ | ------------------------------------------------------------- |
| 19e07c446224acf1 | 19e07d53e7d46b71 | MV ONEGO MERCHANT | Izmail→Antalya: Coal tar pitch in big bags | 11201 | 126         | 38.0    | main   | Weight 1350–1650 t; engine uses max=1650 for utilisation/TCE  |
| 19e07c446224acf1 | 19d5e7406f50cc13 | MV HASKAL         | Izmail→Antalya: Coal tar pitch in big bags | 1040  | 430         | 73.0    | main   | Same range cargo; fit scored from 1650 t max                  |
| 19e07c446224acf1 | 19e089f8eedde1bf | MV ONEGO MERCHANT | Izmail→Antalya: Coal tar pitch in big bags | -6428 | 1235        | 38.0    | main   | Range 1350–1650 t; max-driven negative TCE                    |
| 19e07c733f3b71ae | 19d5e7455d073a74 | SLOMAN DISPATCHER | Varna West→Alexandria: Soda ash in bulk    | 2668  | 3313        | 38.0    | main   | Weight 10000–10500 t; uses max=10500                          |
| 19e07c733f3b71ae | 19e0f55e3bcf9a28 | MV TQ SAMSUN      | Varna West→Alexandria: Soda ash in bulk    | -5272 | 8600        | 54.0    | main   | Same range cargo; 8 600 nm + max weight produces negative TCE |

---

## B10 — detectSpot (Vessel Open "Spot" / "Prompt")

17 vessels in the cache have "spot" or "prompt" in their `openPosition.sourceText`. These vessels lack a concrete open date and port — distance and gap calculations should be unreliable. The engine still scores and surfaces them.

| cargo_id         | vessel_id        | vessel_name   | cargo_ref                                       | tce    | distance_nm | fit_pct | bucket | why_this_exhibits_bug                                                    |
| ---------------- | ---------------- | ------------- | ----------------------------------------------- | ------ | ----------- | ------- | ------ | ------------------------------------------------------------------------ |
| 19e07c446224acf1 | 19d5e7406f50cc13 | MV HASKAL     | Izmail→Antalya: Coal tar pitch in big bags      | 1040   | 430         | 73.0    | main   | Vessel open "spot marmara" — position used as-is without date validation |
| 19e07cc3ba833475 | 19d5e7406f50cc13 | MV HASKAL     | Thisvi→Monfalcone: Cargo unspecified            | -1792  | 315         | 55.0    | main   | Spot vessel; negative TCE; 315 nm distance likely ballast estimate       |
| 19e097b289230e5f | 19d5e7406f50cc13 | MV HASKAL     | Nemrut Bay→Marghera: HRC/HRCpo                  | 12250  | 205         | 55.0    | main   | Spot vessel; 205 nm short-leg inflated TCE                               |
| 19e07d3145be13c8 | 19d5e77730e6489b | MV 'Gandolf'  | Izmir Alsancak→Arzew: 10 mobile machinery units | -10349 | 1026        | 64.0    | main   | Vessel open "open Skikda spot"; -$10k/day TCE; still scored 64%          |
| 19d5e751c0c212df | 19e07c4bb3fee039 | MV LADY ANITA | Chornomorsk→Marghera: Steel scrap in bulk       | 0      | null        | 62.2    | main   | Vessel "OPEN RED SEA SPOT PROMPT"; distance null; scored 62.2%           |
| 19e07d2ac4a815b4 | 19d5e7406f50cc13 | MV HASKAL     | Marmara→Constanța: Steel Billets                | 0      | 0           | 55.0    | main   | Spot vessel; distance=0 indicates unresolved port; scored anyway         |
| 19e08a1fdbf28c11 | 19d5e7406f50cc13 | MV HASKAL     | Trapani→Abu Qir: Marble blocks                  | -3014  | 937         | 67.5    | main   | Spot vessel; negative TCE; high fit score                                |
| 19e089c866d595c7 | 19d5e7406f50cc13 | MV HASKAL     | Giurgiulesti→Marmara: Sunflower seeds in bulk   | -542   | 430         | 64.7    | main   | Spot vessel; negative TCE; scored 64.7%                                  |
| 19e07d3145be13c8 | 19d5e7406f50cc13 | MV HASKAL     | Izmir Alsancak→Arzew: 10 mobile machinery units | -5931  | 220         | 54.0    | main   | Spot vessel; 220 nm, $-5931/day                                          |
| 19e07d08a2829481 | 19d5e7406f50cc13 | MV HASKAL     | Alexandria→Gemlik: HRC and plates               | 0      | null        | 67.5    | main   | Spot vessel; null distance scored conservatively at 67.5%                |

---

## unknown-port — Port Not in Master

`fit_breakdown LIKE '%portScore%'` returned 0 rows — the engine does not emit a `portScore` component. However the ballast scoring falls back to a conservative score with the rationale "Distance to load port unknown — vessel position or port not mapped, scored conservatively." when `distanceNm IS NULL`. These are the actual unknown-port signals.

| cargo_id         | vessel_id        | vessel_name    | cargo_ref                                  | tce | distance_nm | fit_pct | bucket | why_this_exhibits_bug                                                                                     |
| ---------------- | ---------------- | -------------- | ------------------------------------------ | --- | ----------- | ------- | ------ | --------------------------------------------------------------------------------------------------------- |
| 19d5de87705baf9b | 19e09795d905a46f | TBN            | Karasu→Puerto Limon: HRC                   | 0   | null        | 59.4    | main   | Ballast rationale: "vessel position or port not mapped" — port unresolved, scored conservatively at 59.4% |
| 19d5de87705baf9b | 19e0f52832c715da | MV ADAMAR      | Karasu→Puerto Limon: HRC                   | 0   | null        | 65.0    | main   | Same cargo; vessel port unmapped; 65% fit despite no distance data                                        |
| 19d5e751c0c212df | 19e07c4bb3fee039 | MV LADY ANITA  | Chornomorsk→Marghera: Steel scrap in bulk  | 0   | null        | 62.2    | main   | Port not mapped; TCE=0; conservative ballast scoring                                                      |
| 19d5e751c0c212df | 19e07c8d8f66d4aa | MV GULF BLUE   | Chornomorsk→Marghera: Steel scrap in bulk  | 0   | null        | 55.0    | main   | Port not mapped; scored conservatively                                                                    |
| 19e07c446224acf1 | 19e07d5e7f039766 | M/V EMINE ANNE | Izmail→Antalya: Coal tar pitch in big bags | 0   | null        | 65.3    | main   | Port not mapped; TCE=0; scored 65.3% — misleadingly high                                                  |

---

## non-bulk — BREAK_BULK / PROJECT Cargo Matched to Bulk Vessels

50 cargos in the cache are typed `BREAK_BULK` or `PROJECT`. The engine matches them against bulk/MPP vessels with fit scores that ignore break-bulk stowage constraints (e.g. volume component shows "cargo takes 2305% of grain capacity" but overall fit is still 55–65%).

| cargo_id         | vessel_id        | vessel_name                | cargo_ref                                  | tce   | distance_nm | fit_pct | bucket | why_this_exhibits_bug                                                      |
| ---------------- | ---------------- | -------------------------- | ------------------------------------------ | ----- | ----------- | ------- | ------ | -------------------------------------------------------------------------- |
| 19d5de87705baf9b | 19d5e7455d073a74 | SLOMAN DISPATCHER          | Karasu→Puerto Limon: HRC steel coils       | 11178 | 3194        | 54.0    | main   | BREAK_BULK cargo; fit_breakdown shows volume 2298% overflow yet scored 54% |
| 19d5de87705baf9b | 19e07d49ee39a1cc | MV LADY HATICE EX SQUAMISH | Karasu→Puerto Limon: HRC steel coils       | 12215 | 2278        | 55.4    | main   | BREAK_BULK; volume overflow; bulk vessel; 55.4% fit                        |
| 19d5de87705baf9b | 19e07c91571317d9 | MV GULF EXPRESS            | Karasu→Puerto Limon: HRC steel coils       | 0     | null        | 47.0    | main   | BREAK_BULK; PROJECT sub-item (storage tanks 186 MT); gearless bulk vessel  |
| 19e07c446224acf1 | 19e07d53e7d46b71 | MV ONEGO MERCHANT          | Izmail→Antalya: Coal tar pitch in big bags | 11201 | 126         | 38.0    | main   | BREAK_BULK bagged cargo; 126 nm short-leg inflated TCE                     |
| 19e07c446224acf1 | 19e07d5e7f039766 | M/V EMINE ANNE             | Izmail→Antalya: Coal tar pitch in big bags | 0     | null        | 65.3    | main   | BREAK_BULK; volume overflow 2786% in breakdown; scored 65.3%               |
| 19d5de87705baf9b | 19e0f55e3bcf9a28 | MV TQ SAMSUN               | Karasu→Puerto Limon: HRC steel coils       | -1260 | 8480        | 54.0    | main   | BREAK_BULK; negative TCE on 8480 nm leg; still scored 54%                  |
| 19e07c446224acf1 | 19e089f8eedde1bf | MV ONEGO MERCHANT          | Izmail→Antalya: Coal tar pitch in big bags | -6428 | 1235        | 38.0    | main   | BREAK_BULK; negative TCE; bulk vessel                                      |
| 19d5de87705baf9b | 19e09795d905a46f | TBN                        | Karasu→Puerto Limon: HRC steel coils       | 0     | null        | 59.4    | main   | BREAK_BULK; TBN vessel (name unknown); port unmapped                       |

---

## CONTROL — Clean Pairs (no known bug)

Positive TCE, distance > 1000 nm, fit >= 60%, main bucket.

| cargo_id         | vessel_id        | vessel_name | cargo_ref                                 | tce   | distance_nm | fit_pct | bucket | why_this_exhibits_bug |
| ---------------- | ---------------- | ----------- | ----------------------------------------- | ----- | ----------- | ------- | ------ | --------------------- |
| 19e07c809393ff78 | 19d5e7668c6587bd | MV ALINA    | Hereke→Greenore: Wire Mesh ~2500 CBM      | 6327  | 1839        | 73.5    | main   | n/a — clean pair      |
| 19e07c9fb6a61008 | 19d5e7668c6587bd | MV ALINA    | Nemrut Bay→Constanța: HRC / HRCpo / HRCtd | 6327  | 1839        | 73.5    | main   | n/a — clean pair      |
| 19e07ce84fc34a82 | 19e07c68d1a6c54a | AMITY       | Jorf Lasfar→Yarımca: Fertilizers in bulk  | 42015 | 1004        | 65.9    | main   | n/a — clean pair      |
| 19e07d4742474163 | 19d5e7668c6587bd | MV ALINA    | Nemrut Bay→Constanța: HRC / HRCpo / HRCtd | 6327  | 1839        | 73.5    | main   | n/a — clean pair      |
| 19e07d75e8a30c1c | 19d5e7668c6587bd | MV ALINA    | Nemrut Bay→Constanța: HRC / HRCpo / HRCtd | 6027  | 1839        | 73.5    | main   | n/a — clean pair      |

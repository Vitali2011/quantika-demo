# Golden-set — selected pairs (~20) — Variant A, 2026-06-06

> From the real board `data/demo-seed.db` (425 matches) + cache + email bodies + the 3-round
> matching-principles research. Founder rule: **profit decides good/bad; only hard gates auto-reject.**
> 2×2: ROW = true profit (external) · COLUMN = engine board output. Bug = engine output disagrees
> with the gate/truth. Numbers below are ENGINE values (to be replaced by EXTERNAL verification:
> weight from body, **laden** distance from searoutes, TCE double-compute). `it.failing` = engine
> wrong now, flips green when fixed.

## BUG EXEMPLARS (engine surfaced a match it shouldn't, or a wrong number)

| #   | id                       | gate / bug-class                   | cargo (route, region)                            | vessel                                       | engine now                       | why it's a bug                                                                                        | test                        |
| --- | ------------------------ | ---------------------------------- | ------------------------------------------------ | -------------------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------- |
| 1   | GS-restrict-ukraine      | trading-restriction NOT enforced   | Chornomorsk→Marghera (UA→IT) steel scrap         | **MV BARABULKA** "No Ukraine, No EU"         | fit 55, tce 7626, main           | vessel body bans Ukraine AND EU; cargo loads Ukraine, dischs EU → must HARD-reject; engine scored 55% | it.failing                  |
| 2   | GS-restrict-eu           | trading-restriction NOT enforced   | Bandirma→**Ravenna** (TR→IT/EU)                  | **MV SNAPPER** "no European ports"           | fit 76.6                         | vessel bans EU; Ravenna=EU → reject; engine scored 76.6% (and ×Iskenderun→Constanța fit **85**)       | it.failing                  |
| 3   | GS-negtce-good (B4)      | loss ranked as match               | Iskenderun→Constanța (TR→RO) 7000t bulk minerals | SLOMAN DISPATCHER (open Norway, 12700)       | tce **−2918**, fit 38, main      | true voyage loses money (Norway reposition) yet surfaced as scored match                              | it.failing (verdictNotGood) |
| 4   | GS-shortleg-tce (B7)     | TCE inflated on ballast/short leg  | Bejaia→E.Med (DZ→TR) bagged sugar                | AMITY (open Bizerte, 29996)                  | tce **$81,703**, dist 269        | 269nm is the BALLAST leg (Bizerte→Bejaia); laden ~900nm; $/day fake-high                              | it.failing (external TCE)   |
| 5   | GS-weightrange-max (B6)  | engine prices the MAX of qty range | Egypt Med→Odesa salt **4000–4800** big-bags      | (supramax match)                             | uses 4800 for util/TCE           | qty is a range (MOLOO-style); engine should not assume max                                            | it.failing (weightNotMax)   |
| 6   | GS-cubic-overflow        | volume/SF overflow ignored         | Karasu→Puerto Limon (TR→CR) HRC steel coils      | bulk carrier (SLOMAN/TQ SAMSUN)              | fit 54, "vol 2298% of grain cap" | break-bulk steel vol grossly exceeds hold cubic yet scored 54%                                        | it.failing                  |
| 7   | GS-detectspot (B10)      | spot vessel, no real position/date | Chornomorsk→Marghera steel scrap                 | **MV LADY ANITA** open "RED SEA SPOT PROMPT" | dist **null**, fit 62.2          | no concrete open date/port; distance null; engine scored anyway                                       | it.failing                  |
| 8   | GS-unknown-port          | port not in master → scored blind  | Karasu→Puerto Limon HRC                          | TBN / MV ADAMAR                              | dist **null**, fit 59–65         | discharge port unmapped; engine scores conservatively instead of flagging                             | it.failing                  |
| 9   | GS-capacity-overload     | qty>capacity via max-of-range      | Izmail→Antalya coal tar pitch 1350–1650 bb       | MV ONEGO MERCHANT (small)                    | tce −6428, dist 1235             | max-driven overload/negative on a part-cargo range                                                    | it.failing                  |
| 10  | GS-absent-speed-est (B3) | default speed not flagged "est."   | (any vessel w/o stated speed)                    | e.g. HACI HILMI / Gandolf                    | speed→12kt silent                | engine has no est-flag (research: provenance) — prereq for B3                                         | it.failing (gap)            |

## CONTROLS (truly profitable + broker-possible + engine handles right → must stay GREEN)

| #   | id                      | cargo (route, region)                         | vessel                         | engine now                          | why clean                                                                                     |
| --- | ----------------------- | --------------------------------------------- | ------------------------------ | ----------------------------------- | --------------------------------------------------------------------------------------------- |
| 11  | GS-ctl-panamax-longhaul | N.Brazil→N.China iron-ore-class bulk q47000   | **MV GLORY TOM** 63695 panamax | tce **43195**, dist 3009, util 0.74 | long-haul ~full panamax; no restriction hit (Brazil/China outside its no-go list); profitable |
| 12  | GS-ctl-supra-coal       | Mtwara→Matadi (TZ→CD) coal 22000±10%          | AMITY 29996 geared (grab/CR30) | tce 9740, dist 4637, util 0.81      | gear-required cargo + geared vessel; good util; profitable long-haul                          |
| 13  | GS-ctl-panamax-india    | Kandla→Ravenna (IN→IT) bulk q43000            | MV GLORY TOM 63695             | tce 17093, dist 5116, util 0.68     | long-haul full-ish; EU ok for this vessel; profitable                                         |
| 14  | GS-ctl-supra-fert       | Jorf Lasfar→Yarımca (MA→TR) fertilizers 20000 | FAITH 30116 geared             | tce 9894, dist 3753, util 0.66      | bulk fertilizer, full spec vessel (dwt/speed/crane), profitable                               |
| 15  | GS-ctl-handy-bulk       | Alexandroupolis→Tunisia bulk 12100            | LADY HATICE EX SQUAMISH 18300  | tce 7275, dist 2182, util 0.66      | handysize bulk, mid-haul, profitable                                                          |

## RESERVE / extend to 20 (pick after verification)

- more restriction hits (SNAPPER × Pivdennyi→La Coruna; BARABULKA × Marmara→Constanța tce 30563 — extreme).
- a 2nd short-leg-TCE (LADY MERAL × Constanța→Conakry corn $125k/270nm).
- a 2nd clean control (different size class / clean laycan).

## To verify EXTERNALLY before locking (per pair)

1. **weight** ← cargo email body (exact / range). Several already read (salt 4000-4800, BARABULKA cargo, etc.).
2. **distance** ← searoutes.com **laden** leg (load→disch) — NOT engine `distance_nm` (often ballast).
3. **TCE** ← double-compute (freight index + bunker + port + ballast) → true profit → sets good/bad.
4. **gate flags** ← from cache (restrictions, dwcc, stowageFactor/volumeCbm, gearRequired, openPosition spot) — already parsed, engine ignores → that IS the bug.

## Notes

- `fit_percent=38` recurs on many pairs (incl. clearly-bad ones) — the engine's fit floor; treat as
  unreliable, not a "good" signal. Good/bad = external profit, per founder.
- Hard incompatibility cargoes (chrome→manganese, sugar→cement) + IMSBC Group A: no clean instance in
  this corpus → roadmap items, not golden pairs now.

# Vessel↔Cargo Matching Principles — researched & verified (2026-06-06)

> deep-research harness: 6 angles → 24 sources → 92 claims → 25 adversarially verified (3-vote) →
> **21 confirmed, 4 refuted, 17 after dedup**. Sources: BIMCO, IMSBC Code, UK P&I (Carefully to Carry),
> OFAC, RightShip, Britannia/Steamship P&I, ICS Dry Cargo Chartering. Founder principle: a pair is GOOD
> if PROFITABLE (long ballast is fine if it pays) — but first it must be physically + legally POSSIBLE.
> So matching = two layers: **HARD GATES** (reject regardless of money) then **SOFT SCORE** (quality/profit).

## HARD GATES — physically / legally impossible → reject (override TCE)

| Gate                                 | Rule (verified)                                                                                                                                                                          | Broker shorthand                                    | Engine status (current)                                                       |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------- |
| **Capacity (DWCC not DWT)**          | Real intake = **DWCC** (DWT − bunkers/water/stores), and DWCC is **voyage-variable** (short leg → less bunkers → more cargo). Cargo qty > DWCC → reject.                                 | `DWCC`, `DWAT`                                      | ⚠️ engine uses DWT/dwccT — verify it's DWCC-based, voyage-adjusted            |
| **Port draft / access**              | Port draft/LOA/beam/air-draft smaller than vessel → can't berth (hard); partial draft cap → reduced intake (soft). `Δdraft cm × TPC = tons lost`.                                        | `SSW`, `BManifold`, `max draft`, `max LOA`          | ❌ not checked (port-master lacks draft/LOA)                                  |
| **Crane SWL / heavy-lift**           | Unit weight > vessel max single-crane SWL (or tandem combined) AND not shore-crane/float-on → reject. Heavy-lift ≈ **SWL ≥100t**.                                                        | `CR 30MT`, `2×25MT`, `geared/gearless`, `HL`        | ⚠️ gear/crane fields exist — verify SWL-vs-unit check                         |
| **Structural load (t/m²)**           | Point/area load > tank-top / tween / hatch-cover limit (≈ tank top 10-25, weather deck ~3, hatch ~1.8 t/m²) → reject (no safety margin).                                                 | `tank top strength`, `t/m²`                         | ❌ not checked                                                                |
| **IMSBC Group A (liquefaction)**     | Group A cargo without **valid TML certificate + moisture declaration** (sampled ≤7 days pre-load) → reject.                                                                              | `Group A`, `TML`, `can-test`                        | ❌ not checked (no IMSBC group field on cargo)                                |
| **War-risk zone (CONWARTIME 2025)**  | Route through a JWC Listed Area / HRA / Black Sea-Ukraine-Russia / Red Sea → owner may legally refuse → hard gate (charterer reimburses premium if proceeds).                            | `JWC`, `CONWARTIME`, `AWRP`, `no Ukraine/Russia`    | ⚠️ partial (#784 war-position) — pull JWC list LIVE, don't hardcode circulars |
| **Sanctions**                        | Cargo origin = sanctioned country / falsified COO, OR vessel UBO ≥50% on SDN list → reject (OFAC).                                                                                       | `OFAC`, `SDN`, `UBO`, `sanctions clause`            | ❌ not checked                                                                |
| **Vetting / age (charterer policy)** | RightShip Safety Score 0 = sanctioned → hard reject; SS<3 → major charterers (BHP/Vale/Cargill/Rio) refuse; over age-trigger + no valid RightShip inspection → SS2 → de-facto unfixable. | `RightShip`, `SS`, `vetted`, `max age 15/20/25 yrs` | ❌ not checked (age/class/vetting absent)                                     |
| **Trading restrictions (stated)**    | Vessel's own "can't call X" (e.g. `NO UKRAINE/EU PORTS`, `NO USA`) vs cargo route → reject.                                                                                              | `excl.`, `trading limits`, `no go`                  | ⚠️ restrictions parsed (MV BARABULKA) — verify gate enforces them             |

## SOFT FACTORS — affect quality/profit (score, don't reject)

- **Profit / TCE** — the founder's final filter. FULL voyage: ballast reposition + laden + port days + bunker + port DA. (Engine TCE today often = ballast-distance artifact → the golden-set's job to catch.)
- **Utilisation** — cargo qty / DWCC, and **cubic fit**: grain vs bale capacity vs cargo **stowage factor** (SF) → broken stowage for bagged/steel/project (volume can bind before weight).
- **Hold cleanliness / last cargo** — required standard (Hospital > Grain > Swept > Shovel; **band, not 5 rigid grades**) set by charterer; previous cargo (coal/petcoke/clinker) needs extra cleaning to reach grain-clean. Cleaning usually achievable between cargoes (time/cost) → soft, unless impossible in available time.
- **Timing / position** — laycan vs vessel open date + ballast ETA (⚠️ see gaps: "can't reach load port before cancelling" may be a HARD gate — unverified).
- **AIS / risk flags** — dark periods, abnormal routes, MMSI manipulation → raise vetting scrutiny.
- **Commercial** — freight basis (per-mt vs lumpsum), demurrage/laytime, commission (add comm + pus), TCT vs voyage, full vs part / combinable cargoes, CHOPT/MOLOO/MOLCO (⚠️ unverified — see gaps).

## ⚠️ Do NOT hardcode (time-sensitive / refuted)

- JWC Listed-Area circular IDs/dates change quarterly → **pull live**.
- RightShip age-trigger phased dates (14→10 yr rollout through 2027) → **fetch current**.
- Cleanliness is a **band/spectrum**, NOT a fixed 5-grade enum.
- Box-shaped vs non-box holds is NOT a clean binary bulker/MPP gate (matters for stowage, not a hard separator).

## Gaps — NOT verified in this batch (need follow-up before encoding)

1. **Timing/position layer**: exact laycan-vs-open-date feasibility, ballast-leg time, ETA reliability — hard gate or soft?
2. **Commercial/contractual**: authoritative defs of freight basis, demurrage, commission, CHOPT/MOLOO/MOLCO, full-vs-part/combinable.
3. **Age limits exact thresholds** (15/20/25), **ice class** for Baltic/Black Sea seasons, **flag/class/P&I** approval lists + per-charterer sourcing.
4. **IMSBC Group B/C handling**, the **last-3-cargoes** rule, and a concrete **incompatible-previous-cargo matrix** (hard-block vs extra-clean).

## Implication for golden-set + engine

The current golden-set catches mostly money bugs (neg-TCE-in-good, short-leg inflated TCE, weight-range-max). This research adds **new gate/score bug-classes to encode + test**:

- capacity must be **DWCC voyage-adjusted**, not DWT;
- **cubic/SF** fit (volume overflow already seen: "2298% of grain capacity" yet fit 54% — a real bug);
- **crane SWL** vs unit weight for project/steel;
- **port draft/access** gate (missing);
- **IMSBC Group A / cleanliness / last-cargo** (missing);
- **war-zone / sanctions / trading-restriction** gates (partial/missing);
- **stated trading restrictions** must hard-block (e.g. MV BARABULKA "no Ukraine/EU").

Each becomes a golden pair: a real board match that VIOLATES the gate yet the engine surfaced it → red until the engine adds the gate.

---

# GAP-FILL — research #2 (2026-06-06, 22 claims verified 3-vote)

Sources: West/Britannia/UK/Steamship/NorthStandard/Skuld P&I, BIMCO, IMSBC Code (imorules/IMO),
Traficom (Finnish authority), RightShip, English Court of Appeal (Monroe Bros v Ryan 1935; Pacific Voyager 2018).

## TIMING / POSITION — now confirmed (was the biggest gap)

- **Laycan = HARD gate, but as a charterer REJECT OPTION** triggered only once the **cancelling date** passes. Never anticipatory (English law: The Madeleine 1967 — charterer can't cancel early even if a miss is certain), never automatic, no-fault (independent of WHY late). Engine: `ETA > cancellingDate` → charterer-can-reject HARD gate; pre-date misses = "likely cancellation", not "cancelled".
- **Laycan = a RANGE** `{firstLayday, cancellingDate}`, not a single date. Shorthand: `LAYCAN 10/20 June`, `laydays`, `canx`, `first/second half`, narrowing notice.
- **Owner's duty to start the approach/ballast voyage is ABSOLUTE** (Monroe Bros; Pacific Voyager) — legal backbone for the ETA-feasibility check. Engine proxy: open-position → ballast-leg distance ÷ (service/ballast speed) + weather margin + bunkering/port days; if back-calculated latest-departure already passed → HARD non-match. (Caveat: needs a dated CP reference + "utmost despatch" term.)

## AGE / CLASS / ICE / VETTING — confirmed

- **RightShip:** age-triggered vessel WITHOUT valid inspection → FAILS binary vetting nomination (**HARD** for major charterers BHP/Vale/Cargill/Rio) AND Safety Score → 2/5 (**SOFT**). Vetting is binary ("acceptable/unacceptable"); SS≥3 typical min. Charterer can always override. ⚠️ Don't hardcode trigger ages (13/12/11/10.5 schedule REFUTED — pull live).
- **Ice class:** Finnish-Swedish 6-class **IA Super / IA / IB / IC / II / III** (Traficom). "No adequate ice class in genuine ice season" = **HARD gate, modulated by DWT** (class III never gets icebreaker assist; class II only mild ice + sufficient DWT). Seasonal restriction = combined `ice-class + DWT` threshold (HELCOM 25/7), re-issued each winter → read LIVE. Applies Baltic/Gulf of Finland (Black Sea/Azov, St Lawrence analogous — region specifics still open).
- **Max-age (15/20/25) / IACS / flag / P&I-IG** (medium confidence): encode charterer-stated `max X yrs` as HARD gate; IACS + IG-P&I membership commonly HARD for majors; flag = SOFT. Treat exact cutoffs as **charterer params**, not engine constants (unverified specifics).

## IMSBC / CLEANLINESS — deepened

- **Groups:** A = moisture→liquefaction/dynamic-separation vs **TML** (HARD physical gate; needs shipper TML + moisture cert ≤7 days pre-load); B = chemical hazard; C = none. A cargo can be **both A and B** → store group as a SET.
- **Cleanliness ladder (ordinal):** load-on-top < shovel < normal < grain (most common) < hospital. Charterer sets required grade by (previous cargo, next cargo). Cargo→grade tables are **indicative/overridable by CP** (fertiliser spans grain+hospital; bauxite differs by club). Engine: cleanliness as an ordered scale; next cargo needs grade ≤ vessel's achievable-after-cleaning.
- **IMSBC per-cargo schedule constraints are HARD + override generic tables** (e.g. SULPHUR "holds shall not be washed with seawater").
- **HARD value-destroying incompatibilities (reject):** chrome ore → manganese ore worthless; sugar traces (as little as 0.001%) → cement worthless. Petcoke/coal → grain-clean = **SOFT but high-penalty** (heavy cleaning + real inspection-fail risk via stains/blistering), NOT auto-reject. Engine: keep an explicit hard-incompatibility matrix; everything else = graded cleaning effort.
- **"Last 3 cargoes" (P3C)** declaration = standard surveyor input feeding the matrix. Engine: vessel record carries ordered last-3-cargoes; compatibility check reads last (+ prior 2 for borderline) vs next.

## STILL OPEN after research #2

- **COMMERCIAL mechanics (gap B)** — NOT verified (workflow budget-dropped them): freight basis (per-MT FIO/FIOS vs lumpsum), demurrage/despatch/laytime, commission stacking (addcomm/brokerage/"pus"), voy vs TCT, quantity tolerances (full/part/combinable, CHOPT, MOLOO/MOLCO, "abt"). Need a focused 3rd pass before encoding.
- Current RightShip trigger ages; Black Sea/Azov + St Lawrence ice specifics; exact age/IACS/flag/P&I gating mechanics.

---

# GAP-FILL — research #3 (2026-06-06, 22 claims verified 3-vote) — COMMERCIAL

Sources: BIMCO Laytime Definitions 2013 (primary), Shipowners'/Gard/West P&I, English case law
(The Eternal Bliss 2021, Sea Master 2018, Jordan II HL 2004), BBC Chartering, HandyBulk, Veson IMOS.
**Commercial terms are SOFT-SCORE economics (TCE/utilisation), not hard gates — except the residual RightShip/seaway windows.**

## FREIGHT BASIS (SOFT — biggest driver of TCE divergence between fixtures)

- **FIO family** (charterer pays escalating handling): FIO (load+disch) → FIOS (+stow) → FIOT (+trim, typical bulk grain/coal/ore) → FIOST (+stow&trim, e.g. steel/scrap) → FIOSTSP (+spout-trim/equipment). ⚠️ FIOST ≠ "spout-trimmed" (that's the SP suffix — refuted). FIO terms allocate **cost only**, not liability (English law).
- **Liner terms** (inverse): LT/FLT = freight includes handling both ends; FILO = free-in/liner-out; LIFO = liner-in/free-out. ⚠️ parser guard — FILO/LIFO often transposed in glossaries.
- Engine: store freight-basis token → shifts stevedoring on/off owner's account → changes net/TCE.

## LAYTIME / DEMURRAGE / DESPATCH (SOFT — post-fixture P&L, not eligibility)

- **Laytime** = freight-inclusive vessel time for load/disch; starts only on a **valid NOR** (vessel physically + legally ready). Modifiers: **SHINC** (Sun/holidays count) / **SHEX** (don't) / **WWD** (weather working day) / **CQD** (customary quick despatch, no dem/desp). Rates `8000/3000` = 8000 mt/day load, 3000 disch → set the laytime allowance.
- **Demurrage** = liquidated damages to owner once laytime expires ($/day). **"Once on demurrage, always on demurrage"** — clock runs through later interruptions unless CP says otherwise.
- **Despatch** = paid BY owner if finished early; usually **half-demurrage (DHD)**; bases WTS/LTS (excl. excepted) vs ATS (incl., pays more). Dry cargo only.

## QUANTITY TOLERANCE / PART CARGO (SOFT — direct matching geometry → utilisation band)

This is the one commercial item that **directly shapes matching**: a cargo's stated tonnage is a RANGE, matched against vessel intake for utilisation.

- **MOLOO** (more-or-less owner's option) e.g. `50000 MT 10% MOLOO` = 45000-55000, owner nominates.
- **MOLCO** / MOLCHOP / MOLCHOPT (charterer's option). **CHOPT** = charterer's option (ports AND quantity tolerance). **Min/Max** (MNMX) = exact qty, no option. **abt/about** ≈ ±5%.
- Engine: parse the tolerance → compute `{qtyMin, qtyMax}` band → score utilisation on the FEASIBLE point vs vessel DWCC (not blindly the max — fixes the B6 weight-range bug). Primary token MOLCO; aliases MOLCHOP/MOLCHOPT; CHOPT does double duty.

## RESIDUAL

- **RightShip** age trigger falling 14→~10 yr (four phases through Jan 2027); over-trigger + no valid inspection → **FAILS nomination (HARD)** for majors. ⚠️ Don't hardcode phase dates (refuted/revised) — pull live.
- **St Lawrence Seaway 2026**: open 22 Mar 2026, target close 5/10 Jan 2027 → routing/laycan window (SOFT, annual).

## STILL OPEN after 3 rounds (minor / soft / charterer-params — NOT new hard gates)

The workflow budget-dropped these; they're soft-economics or charterer-supplied, low priority vs the gates already mapped:

- per-mt vs **lumpsum** freight; gross vs net freight basis.
- **Commission** detail (addcomm vs brokerage, typical 2.5/3.75/5%, "pus", stacking → reduces net freight).
- **Charter type** voy vs **TCT** vs period ("voy only", "NO TCT") — constrains which orders match which vessels.
- Exact **max-age** norms (15/20/25) hard-vs-negotiable; **IACS/flag/P&I-IG** gating mechanics.
- **Black Sea / Sea of Azov** ice-season min-class + dates (only St Lawrence confirmed).

---

# ✅ COVERAGE SUMMARY (3 rounds, 65 principles verified)

Comprehensive map now exists across: **physical/stowage** (DWCC, draft, crane SWL, t/m²) · **cargo
compatibility** (IMSBC A/B/C, cleanliness ladder, last-3-cargoes, hard incompatibility matrix) ·
**timing** (laycan hard gate, absolute approach-voyage duty, ETA feasibility) · **legal/risk**
(war zones/CONWARTIME, sanctions/UBO, vetting/RightShip, ice class) · **commercial** (freight basis,
laytime/dem/desp, quantity-tolerance bands). Remaining gaps are minor soft-economics/charterer-params.
**Sufficient to encode golden-set bug-classes + an engine hard-gate/soft-score roadmap.**

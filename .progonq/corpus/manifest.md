# Corpus manifest — round 1

- bulk_open_position/sample-001.json — Classical baseline: 1 grain cargo (Ameropa, Constanta→Damietta), 3 geared vessels, readiness mix ideal/idle/tight; one vessel has null service_speed_kn (tests class-default fallback to 12.5 kn).
- bulk_dwcc_overload/sample-001.json — DWCC stress: cargo 28,500mt (razor-thin vs DWCC 29,800mt) + separate cargo 30,000mt vs DWCC 28,500mt (genuine pre-filter miss, DWCC_VIOLATION annotated in date_issues); tests whether matcher re-checks hard DWCC limit.
- project_general_vessel/sample-001.json — Project cargo (6 turbine nacelles, 45-65t/piece, 12m × 4m × 4m, 60t lift required): MPP with 2×80t cranes (genuine fit), bulk carrier with 4×30t cranes (CRANE_VIOLATION — insufficient lift despite good timing), heavy-lift 2×250t (overkill but valid).
- strict_laycan_tight_window/sample-001.json — 3-day laycan 14-16 May: vessel A tight (Istanbul, arrives 13-May evening), vessel B idle (Port Said, 4d early), vessel C late (Piraeus opens 16-May noon, arrives 18-May — LAYCAN_VIOLATION, pre-filter miss with verdict='late').
- sanctioned_flag/sample-001.json — Sanctions test: vessel A flag=RU, owner=Sovcomflot Subsidiary OOO, discharges in EU (Ghent) — legally blocked under Reg 833/2014 + charterer restriction; vessel B clean MH flag (control); cargo loads legally in Türkiye.
- cii_grade_d/sample-001.json — CII grade D + petcoke last cargo: Trafigura (known D-refuser) with soybean meal; vessel A cii_grade=D + last_cargo=Petcoke (dual violation: vetting + hold cleaning); vessel B cii_grade=A + last_cargo=Grain (clean control).

## Round 8 extension (4 new per category)

- bulk_open_position/sample-002.json — Med wheat (Galati→Alexandria, Glencore): gearless vessel triggers GEAR_VIOLATION, geared vessels split ideal/tight by arrival margin.
- bulk_open_position/sample-003.json — West Africa coal (Richards Bay→Dakar, Trafigura): long ballast legs from Indian Ocean/Angola; last_cargo restriction catches one vessel (Bauxite).
- bulk_open_position/sample-004.json — Black Sea sunflower seeds (Chornomorsk→Izmir, Bunge): food-grade hold check; Steel coils last cargo triggers LAST_CARGO_RESTRICTION; one vessel at load port, one arrives same day as laycan_start.
- bulk_open_position/sample-005.json — Baltic-Med urea fertilizer (Klaipeda→Tunis, Nutrien): SHEX WP weather routing, service_speed_kn null on vessel C triggers class-default 12.5kn; hold corrosion qualification unconfirmed.
- bulk_dwcc_overload/sample-002.json — 2 cargoes × 2 vessels: one pair DWCC margin=50mt only (razor-thin), one pair DWCC_VIOLATION, one partial-load scenario.
- bulk_dwcc_overload/sample-003.json — MOLOO corn (New Orleans→Algiers): vessel DWCC exactly equal to cargo nom; cargo max under MOLOO exceeds DWCC; oversized Panamax also tested.
- bulk_dwcc_overload/sample-004.json — Iron ore concentrate stowage_factor 0.45: DWCC is binding not volume; one vessel DWCC_VIOLATION (below cargo min), one partial-load ceiling, one clean fit.
- bulk_dwcc_overload/sample-005.json — 3 cargoes × 1 vessel: one DWCC_VIOLATION pair, one partial-load pair, one clean pair — per-pair handling test.
- project_general_vessel/sample-002.json — 4× transformer cores 80t each, 100t lift required: 2 vessels with 2×80t cranes (CRANE_VIOLATION: insufficient safety margin), 2 vessels with 2×120t cranes (fit).
- project_general_vessel/sample-003.json — Bridge sections 25m long: HOLD_GEOMETRY_VIOLATION on vessel with 21m max hatch; one vessel needs all sections in Hold 1 only; Pomeranian Star ideal with 34m+28m hatches.
- project_general_vessel/sample-004.json — Wind tower base sections deck-stowage permissible: standard bulker fails crane+hatch+deck reinforcement; MPP Flensburg tight-fit; Jutland Express ideal at load port.
- project_general_vessel/sample-005.json — Hospital prefab modules 4m height: HOLD_HEIGHT_VIOLATION (<4.5m clear) on Suffolk Carrier forces all-deck stow; Thames Project ideal (5.2m clear height); Kent Mariner CRANE_VIOLATION (25t < 35t).
- strict_laycan_tight_window/sample-002.json — 2-day laycan (Novorossiysk→Aqaba): ideal/idle/tight/late across 4 vessels; Kerch Express late by 1 day after laycan_end.
- strict_laycan_tight_window/sample-003.json — Eid al-Adha holiday-week opening (Alexandria→Jedda): SHEX Eid excluded from laytime; Cairo Merchant opens during Eid affecting Damietta port operations.
- strict_laycan_tight_window/sample-004.json — Cancellation clause (Reni, Ukraine): vessel must berth by 23-May 12:00; Moldova Bulk arrives 09:00 (3h buffer only); Prut Venture CII-D + realistic 14:00 canal arrival = dual violation.
- strict_laycan_tight_window/sample-005.json — Cross-Atlantic laycan (Santos→Rotterdam): 3 vessels from Santos/Houston/Dakar; Gulf Explorer 18.5-day ballast lands exactly on laycan_start; Dakar Voyager borderline realistic late.
- sanctioned_flag/sample-002.json — Iranian-flag (IR) vessel + IRISL affiliate: EU Reg 267/2012 + OFAC SDN list block Piraeus discharge; Aegean Breeze (GR flag) is clean control with long ballast leg.
- sanctioned_flag/sample-003.json — Belarus-flag (BY) vessel, owner=Belaruskaliy under EU Reg 765/2006: charterer restriction covers EU-sanctioned entities (not RU-only); BY-flag legal-grey but owner sanction clear.
- sanctioned_flag/sample-004.json — Flag-of-convenience hide: MH-flag vessel, beneficial owner=Sovcomflot Cyprus subsidiary; KYC documentation reveals Russian state ownership; Elbe Trader (LR, German ownership) is clean control.
- sanctioned_flag/sample-005.json — RU-flag discharging UAE (non-EU port): EU Reg 833/2014 port restriction technically inapplicable; Mosaic corporate policy prohibits RU flag globally regardless of discharge port.
- cii_grade_d/sample-002.json — CII Grade E vessel (worse than D) for Cargill corn: Grade E triggers mandatory SEEMP corrective action; severity escalation beyond D-language tested.
- cii_grade_d/sample-003.json — CII Grade D for small trader Viterra Libya (no explicit D-refusal policy): Grade D is informational flag only, NOT hard disqualifier — contrast with Cargill/Trafigura cases.
- cii_grade_d/sample-004.json — CII Grade D + last_cargo=Iron ore for ADM soybeans: dual independent violations (CII vetting + hold incompatibility) reported separately.
- cii_grade_d/sample-005.json — Two CII-D vessels (one with 2024 engine refit, owner claims future C rating): matcher must NOT speculate about 2027 re-rating; current cii_grade=D governs both.

## Anti-overfit verification (fresh corpus)

- bulk_open_position/sample-006.json — Australia→China thermal coal (Rio Tinto, Newcastle→Qingdao): 3 vessels from Port Hedland/Gladstone/Kembla with ideal/idle/tight readiness; Bowen Star has null service_speed_kn (class-default 12.5kn fallback test).
- bulk_dwcc_overload/sample-006.json — Argentine soybean meal (Toepfer, Rosario→Rotterdam): Pampa Venture feasible with 420mt margin (~0.7%); Rio Salado DWCC_VIOLATION (DWCC 52,800mt < cargo_max 56,000mt, partial load ceiling 52,800mt).
- project_general_vessel/sample-006.json — 4× refinery reactor vessels 60t/piece (Sun Maritime, Houston→Jubail), 80t lift + tween-deck mandatory: Fjord Multipurpose MPP 2×100t fits; Gulf Commodore bulk CRANE_VIOLATION (4×30t insufficient); Titan Lift Seven heavy-lift 2×400t overkill but valid.
- strict_laycan_tight_window/sample-006.json — 2-day laycan Indian Ocean (Saiwan, Colombo→Aden), no-extensions clause: Malabar Pearl tight/sub-day (arrives 18:00 day before, ~12h buffer); Konkan Carrier ideal 5d early; Andaman Spirit LAYCAN_VIOLATION (ETA 2 days after laycan_end).
- sanctioned_flag/sample-006.json — Venezuelan-flag (VE) vessel, PDVSA-affiliated operator for EU discharge Antwerp (Bulkhandling Handymax): EU Reg 2017/2063 + OFAC E.O.13692 block; Elbe Feeder LR-flag clean control.
- cii_grade_d/sample-006.json — Bunge raw sugar cargo (Santos→Kandla) with explicit CII-D refusal policy: Cerrado Bulk cii_grade=D must be flagged in issues; Pantanal Star cii_grade=B clean control — D-grade mandatory surfacing + match_level contrast.

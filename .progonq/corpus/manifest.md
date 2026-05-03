# Corpus manifest — round 1

- bulk_open_position/sample-001.json — Classical baseline: 1 grain cargo (Ameropa, Constanta→Damietta), 3 geared vessels, readiness mix ideal/idle/tight; one vessel has null service_speed_kn (tests class-default fallback to 12.5 kn).
- bulk_dwcc_overload/sample-001.json — DWCC stress: cargo 28,500mt (razor-thin vs DWCC 29,800mt) + separate cargo 30,000mt vs DWCC 28,500mt (genuine pre-filter miss, DWCC_VIOLATION annotated in date_issues); tests whether matcher re-checks hard DWCC limit.
- project_general_vessel/sample-001.json — Project cargo (6 turbine nacelles, 45-65t/piece, 12m × 4m × 4m, 60t lift required): MPP with 2×80t cranes (genuine fit), bulk carrier with 4×30t cranes (CRANE_VIOLATION — insufficient lift despite good timing), heavy-lift 2×250t (overkill but valid).
- strict_laycan_tight_window/sample-001.json — 3-day laycan 14-16 May: vessel A tight (Istanbul, arrives 13-May evening), vessel B idle (Port Said, 4d early), vessel C late (Piraeus opens 16-May noon, arrives 18-May — LAYCAN_VIOLATION, pre-filter miss with verdict='late').
- sanctioned_flag/sample-001.json — Sanctions test: vessel A flag=RU, owner=Sovcomflot Subsidiary OOO, discharges in EU (Ghent) — legally blocked under Reg 833/2014 + charterer restriction; vessel B clean MH flag (control); cargo loads legally in Türkiye.
- cii_grade_d/sample-001.json — CII grade D + petcoke last cargo: Trafigura (known D-refuser) with soybean meal; vessel A cii_grade=D + last_cargo=Petcoke (dual violation: vetting + hold cleaning); vessel B cii_grade=A + last_cargo=Grain (clean control).

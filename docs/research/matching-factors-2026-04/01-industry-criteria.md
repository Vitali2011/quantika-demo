# Industry Research: Vessel-Cargo Matching Criteria
## Professional dry-bulk / breakbulk brokers (Handysize/Supramax, MENA / Med / West Africa)

**Date:** 2026-04-18
**Agent:** general-purpose (web research)
**Sources:** RightShip, BIMCO, UK P&I, London P&I, Skuld, Joint War Committee (Lloyd's Market Association), S&P Global (Sea-web), INTERCARGO, IMSBC Code, BIMCO CII clauses

---

## 1. Vessel factors

### 1.1 Age × Classification (MUST-HAVE)
- **EN**: Age trigger / IACS class | **RU**: Возраст и классовое общество.
- RightShip срезал age trigger для dry-bulk с 14 лет (2023) до **10 лет** (с 2024); старше 30 лет — не принимается, кроме редких trading areas. Non-IACS class автоматом ставит Safety Score 2/5.
- Верификация: Equasis (free), Sea-web (paid), class certificates от owners.
- Source: [RightShip Baseline Criteria](https://maritimecyprus.com/wp-content/uploads/2021/08/0-Dry-Bulk-Standard-Vessel-Vetting-Baseline-Criteria.pdf), [Splash247 INTERCARGO](https://splash247.com/intercargo-asks-rightship-to-rethink-new-age-limit-for-bulk-carrier-vetting-inspections/).

### 1.2 Flag State (MUST-HAVE)
- Paris/Tokyo MoU White List = приемлемо для major trading houses (Cargill, COFCO, Vitol). Grey/Black flags → отказ или AP-uplift.
- Верификация: Paris MoU annual report, Equasis.

### 1.3 PSC Detention History (MUST-HAVE)
- RightShip: **3 detention за 24 месяца** → rejection. Высокий ratio deficiencies/inspection за 24-36 мес также triggers reject.
- Верификация: Equasis, ParisMoU database, THETIS-EU.
- Source: [RightShip PSC FAQ](https://help.rightship.com/en/articles/11882239-psc-severity-faq).

### 1.4 P&I Club (MUST-HAVE)
- Требуется членство в International Group of P&I Clubs (13 clubs: Gard, UK Club, North, Skuld, Britannia, London и др.). Fixed-premium/non-IG P&I → red flag для cargo insurers.
- Верификация: CoE (Certificate of Entry), P&I club directory.

### 1.5 Hold cleanliness / last-3-cargoes (MUST-HAVE для grain/food)
- Charter party требует "grain clean" — holds swept, washed fresh water, no odour, loose rust scale, previous residues. Сюрвейер запрашивает **детали как минимум 3 последних грузов**.
- Incompatible previous cargoes (coal/sulphur/cement перед grain) удлиняют hold prep на 3-5 дней.
- Верификация: ship's Cargo Record Book, Master's declaration, pre-loading survey (NCB, SGS, Intertek).
- Source: [UK P&I FAQ](https://www.ukpandi.com/news-and-resources/articles/2021/faq-hold-preparation-and-cleaning/), [Skuld guidance](https://www.skuld.com/contentassets/e2d486e683a84d7582fa1b867d18f8ac/preparing-cargo-holds_-loading-solid-bulk-cargoes.pdf).

### 1.6 Cargo gear (MUST-HAVE для handysize)
- Typical supramax: 4×30MT cranes + grabs (self-discharging). Required для ports без shore cranes — критично в West Africa (Tema, Lomé, Owendo часто gearless berth).
- Верификация: Q88-style questionnaire, vessel's general arrangement plan.

### 1.7 CII rating + EU ETS/FuelEU (эскалирует из nice-to-have в MUST-HAVE для Med)
- C 2026 EU ETS — 100% покрытие EU voyages; FuelEU Maritime penalties за high-carbon fuel. CII rating D×3 или E → corrective plan. Charterers требуют BIMCO CII clause; D/E → скидка по freight / отказ.
- Верификация: IMO DCS / EU MRV public database, BIMCO CII Operations Clause 2022.
- Source: [OceanScore 2026](https://oceanscore.com/insights/maritime-compliance-requirements-2026-eu-ets-fueleu-uk-ets/).

### 1.8 Ice class (edge case — не для MENA/West Africa; nice-to-have для Black Sea winter)
- 1A/1A Super нужен для Baltic winter; Black Sea ports (Constanta, Varna) — редко требуют, но winter premium на hull/H&M.

---

## 2. Port factors

### 2.1 Draft + Fresh Water Arrival Draft (MUST-HAVE)
- West Africa river ports: Warri 21ft FWAD, Matadi 22ft FWAD — жёсткое ограничение для full-laden supramax.
- Verification: Port handbook, ADMIRALTY Total Tide, agents.
- Source: [HandyBulk Port Restrictions](https://www.handybulk.com/port-restrictions/).

### 2.2 LOA / beam / berth length (MUST-HAVE)
- Kamsarmax named after Port Kamsar Guinea max LOA 229m — дисциплина важна.
- Verification: Port charts, agent confirmation, Lloyd's Ports & Terminals Guide.

### 2.3 Tidal window / Always Afloat (MUST-HAVE)
- Neap/spring разница 2-4 м в Matadi, Tema — определяет laycan. Брокер страхуется через NAABSA (Not Always Afloat But Safely Aground) clause или AA clause.

### 2.4 Air draft (nice-to-have, edge для breakbulk)
- Bosphorus, Suez — не ограничивают handysize; критично для project cargo с deck stow.

### 2.5 Weather / seasonality (MUST-HAVE)
- West Africa: swell season (Jun–Sep) — Harcourt/Takoradi closures. MENA: shamal winds (Nov–Mar) в Persian Gulf. Broker закладывает weather clause (WWWW).

### 2.6 Bunker availability (MUST-HAVE для voyage costing)
- VLSFO/MGO цены: Fujairah, Gibraltar, Las Palmas, Durban — тiers. Brokers pull Ship&Bunker / Argus daily.

### 2.7 Congestion / strike history (nice-to-have)
- Лагос/Apapa — chronic congestion 10-20 дней. Учитывается в laycan + demurrage negotiation.
- Verification: MarineTraffic port calls heatmap, Lloyd's List Intelligence.

### 2.8 Night navigation / pilot-tug (nice-to-have)
- Лагос — no night navigation; Owendo — limited pilots. Влияет на laytime calc.

---

## 3. Commercial factors

### 3.1 Freight rate basis (MUST-HAVE)
- Dry bulk handysize: **$/MT** (lumpsum voyage) или **$/day TCE** (time charter). WS (Worldscale) — только для tankers.

### 3.2 Laytime + SHINC/SHEX (MUST-HAVE)
- SHINC = Sundays/Holidays included; SHEX = excluded. FIO/FIOS/FIOST определяет кто платит load/discharge/stow/trim. Handysize grain/fert — чаще FIOS SHINC.
- Source: [freightcourse SHINC/SHEX](https://www.freightcourse.com/shinc/).

### 3.3 Demurrage / dispatch (MUST-HAVE)
- Dispatch обычно = ½ demurrage. Rates 2026: supramax ~$14-18k/day demurrage в spot.

### 3.4 Commission (MUST-HAVE)
- Address commission (addcom) 2.5-3.75% + broker com 1.25%. TTL commission в CP.

### 3.5 Canal / transit fees (MUST-HAVE для Med ↔ Asia)
- Suez: Suez Canal Authority tariff + SCNT; rerouting Cape of Good Hope due Red Sea HRA = +10-14 дней, дополнительно $500-800k/voyage.

### 3.6 EU ETS/FuelEU surcharge (MUST-HAVE с 2026)
- EUA price × emissions. Чаще passed through через BIMCO ETS Allowance Clause.

---

## 4. Risk / compliance

### 4.1 IMSBC Group A liquefaction (MUST-HAVE для iron ore fines, nickel, bauxite)
- TML certificate не старше 7 дней до погрузки; moisture content < TML. Нарушение — 81 жертва с 2010 (nickel ore).
- Verification: независимый surveyor (SGS/Intertek/Cotecna), shipper's declaration per IMSBC.
- Source: [UK P&I liquefaction](https://www.ukpandi.com/), [Hill Dickinson](https://www.hilldickinson.com/our-view/articles/cargo-liquefaction-and-cargo-classification-group-a-or-group-c-cargo/).

### 4.2 War risk / JWC Listed Areas (MUST-HAVE)
- 2026: Red Sea & Gulf of Aden south of 18°N, Persian Gulf incl. Strait of Hormuz, Yemen, Somali coast — все Listed. AP часто >1% hull value. Gulf of Guinea — Extended Risk Zone.
- Verification: [JWLA.ai map](https://jwla.ai/), LMA Joint War Committee circulars.
- Source: [Safety4Sea JWC](https://safety4sea.com/joint-war-committee-redraws-gulf-of-guinea-risk-area/).

### 4.3 Piracy / HRA (MUST-HAVE для West Africa, Horn of Africa)
- BMP5 best practices, armed guards (PCASP), citadel. Gulf of Guinea — kidnap risk persists 2026.

### 4.4 Sanctions / dual-use (MUST-HAVE)
- OFAC SDN list, EU consolidated sanctions, UK OFSI. Flag/owner/beneficial owner screening. Крит для Russia-origin grain/coal, Iran-linked tonnage.
- Verification: Pole Star PurpleTRAC, Windward, Lloyd's List Intelligence.

### 4.5 Cyber / insurance (nice-to-have, растёт)
- IMO MSC.428(98) cyber risk management в SMS (с 2021). Charterers всё чаще требуют подтверждения.

---

## 5. Counterparty / reputation (MUST-HAVE для handysize — рынок фрагментирован)

### 5.1 Owner / charterer credit
- **BIMCO Company Information Service** (member-only) — non-payment reports, fraud alerts.
- **BIMCO Dry Bulk Marine Risk Assessment Clause 2013** — стандарт для TC.
- Dun & Bradstreet, Creditreform для trading houses.
- Source: [BIMCO counterparty risk](https://www.bimco.org/contracts-and-clauses/managing-payment-risk/managing-payment-risk/counter-party-risk-background-checks).

### 5.2 Performance history
- **Sea-web** (S&P Global): 600+ fields, 220k+ ships, movements, casualties, fixtures history. Брокеры используют для verification of owner's fleet и past employments.
- Lloyd's List Intelligence Seasearcher — аналог.

---

## Приоритетный MUST-HAVE checklist (handysize, Med/BSea/WAfrica)

1. Age ≤10y (trigger), ≤15-20y acceptable with inspection; IACS class.
2. Flag White List + PSC clean (<3 detentions / 24 mo).
3. IG P&I CoE valid.
4. Grain clean + last 3 cargoes compatible.
5. Cranes 30MT SWL + grabs (если discharge port gearless).
6. CII ≥C + BIMCO ETS/CII clauses.
7. Port draft/LOA/FWAD/tidal fit.
8. Bunker strategy (Gib/Las Palmas/Fujairah).
9. Laytime SHINC/SHEX + dem/dis + FIOS.
10. JWC-Listed AP budget (Red Sea, WAfrica).
11. IMSBC Group A TML cert (for ore).
12. Sanctions screening all counterparties.
13. BIMCO Company Info + Sea-web owner track record.

---

## Sources

- [RightShip Dry Bulk Standard Vetting Criteria (PDF)](https://maritimecyprus.com/wp-content/uploads/2021/08/0-Dry-Bulk-Standard-Vessel-Vetting-Baseline-Criteria.pdf)
- [RightShip Vessel Vetting Methodology](https://help.rightship.com/en/articles/4248900-vessel-vetting-methodology)
- [RightShip PSC Severity FAQ](https://help.rightship.com/en/articles/11882239-psc-severity-faq)
- [Splash247 — INTERCARGO on RightShip age limit](https://splash247.com/intercargo-asks-rightship-to-rethink-new-age-limit-for-bulk-carrier-vetting-inspections/)
- [BIMCO Counterparty Risk](https://www.bimco.org/contracts-and-clauses/managing-payment-risk/managing-payment-risk/counter-party-risk-background-checks)
- [BIMCO Dry Bulk Marine Risk Assessment Clause 2013](https://www.bimco.org/contractual-affairs/bimco-clauses/current-clauses/dry_bulk_marine_risk_assessment_clause_for_time_charter_parties_2013/)
- [UK P&I — Hold Preparation FAQ](https://www.ukpandi.com/news-and-resources/articles/2021/faq-hold-preparation-and-cleaning/)
- [Skuld — Preparing cargo holds (PDF)](https://www.skuld.com/contentassets/e2d486e683a84d7582fa1b867d18f8ac/preparing-cargo-holds_-loading-solid-bulk-cargoes.pdf)
- [Bulk Carrier Guide — Grain loading preparation](https://bulkcarrierguide.com/grain-loading-preparation.html)
- [Hill Dickinson — Liquefaction Group A/C](https://www.hilldickinson.com/our-view/articles/cargo-liquefaction-and-cargo-classification-group-a-or-group-c-cargo/)
- [London P&I Liquefaction guidance (PDF)](https://www.londonpandi.com/media/2142/reducing-the-risk-of-liquefaction-operational-guidance-for-vessels-that-carry-cargoes-which-may-liquefy.pdf)
- [Joint War Committee (LMA)](https://lmalloyds.com/committee/joint-war-committee/)
- [JWLA.ai — JWC Listed Areas map](https://jwla.ai/)
- [Safety4Sea — JWC Gulf of Guinea](https://safety4sea.com/joint-war-committee-redraws-gulf-of-guinea-risk-area/)
- [PropertyCasualty360 — War Risk 2026 Iran](https://www.propertycasualty360.com/fcs/2026/03/18/maritime-war-risk-insurance-in-the-2026-iran-crisis/)
- [HandyBulk — Port Restrictions](https://www.handybulk.com/port-restrictions/)
- [HandyBulk — Freight Calculations](https://www.handybulk.com/freight-calculations/)
- [freightcourse — SHINC](https://www.freightcourse.com/shinc/) / [SHEX](https://www.freightcourse.com/shex/)
- [OceanScore — 2026 EU ETS/FuelEU](https://oceanscore.com/insights/maritime-compliance-requirements-2026-eu-ets-fueleu-uk-ets/)
- [Britannia P&I — CII/EEXI/FuelEU/ETS](https://britanniapandi.com/2025/06/maritime-fuel-emissions-regulations-overview/)
- [S&P Global — Sea-web](https://www.spglobal.com/market-intelligence/en/solutions/sea-web-maritime-reference)
- [Lloyd's List — Seasearcher](https://www.lloydslistintelligence.com/products/seasearcher)
- [Cargill Dry Bulk Fleet](https://www.cargill.com/transportation/dry-bulk-shipping/fleet)
- [US Grains Council — Dry Bulk Ocean Freight (PDF)](https://grains.org/wp-content/uploads/2018/01/Chapter-7-Dry-Bulk-Ocean-Freight-20220305-pre-final.pdf)

# Commercial & Market Factors: Handysize/Supramax Chartering (Med / Black Sea / MENA)

**Date:** 2026-04-18
**Scope:** Коммерческие факторы, которые broker учитывает ПОМИМО физической совместимости vessel ↔ cargo. Handysize (28-40k DWT) и supramax (50-63k DWT), trade lanes Med / Black Sea / MENA / West Africa. Грузы: grain / steel / cement / fertilizer / clinker / urea.
**Sources:** Baltic Exchange, Clarksons, SSY, Howe Robinson, Platts (S&P Global), Argus Media, TradeWinds, Lloyd's List, BIMCO, freight futures (FFAs) trading, bunker prices (Ship & Bunker)

---

## 1. Freight Rate Benchmarks

**BHSI — Baltic Handysize Index (RU: индекс хэндисайз).** 7 routes (не 5 — в 2019 переработан), 38k DWT reference vessel. Методология Baltic Exchange: daily panellist assessment, TCE average $/day. 2026 levels: ~$11-14k/day (soft/medium), >$16k "strong", <$9k "weak". **Source:** Baltic Exchange (paid panelist data, TradeWinds summary free). **Severity: MUST.**

**BSI — Baltic Supramax Index.** 10 routes, 58k DWT reference. 2026 levels ~$13-17k/day. **Source:** Baltic Exchange. **MUST.**

**BPI / BCI / BDI (Panamax / Capesize / composite Dry Bulk Index)** — context о macro-тренде dry bulk. Broker смотрит BDI trajectory за 30-90 дней чтобы понять momentum. **Source:** Baltic Exchange, Clarksons SIN. **Nice-to-have** для handysize (разные сегменты слабо коррелируют краткосрочно).

**TCE (Time Charter Equivalent, RU: эквивалент тайм-чартера).** Формула: `TCE = (Gross Freight − Voyage Costs) / Voyage Duration in Days`. Voyage costs = bunkers + port DA + canal + extras. Единица $/day. Broker сравнивает полученный TCE с рыночным benchmark (BHSI route или FFA curve) — если сильно ниже, owner откажется. **Source:** внутренний расчёт на базе Clarksons/SSY distance tables. **MUST.**

**Spot vs Period.** Spot (single trip) обычно на premium $1-3k/day над period (3-6-12 мес TC) в растущем рынке; discount в падающем. FFA curve (Baltic Forward) показывает expectation. **Source:** Baltic Forward Assessments, SSY/Clarksons FFA desk. **MUST для period decisions.**

---

## 2. Voyage Economics (пример: Med → West Africa handysize 30k MT cement)

| Статья | Typical range | Source |
|---|---|---|
| Gross freight | $22-32/MT × 30,000 = $660-960k | broker offers, fixtures reports (Platts, Tradewinds) |
| Bunker (VLSFO) | ~150-180 MT × $550-620 = $85-115k | Ship & Bunker, Argus Bunker |
| Port DA (load + discharge) | $40-70k × 2 = $80-140k | local agents, GAC/Wilhelmsen |
| Canal (Suez if applicable) | $180-250k handysize laden | SCA calculator |
| Demurrage/dispatch provision | ±$20-50k | charter party |
| Commission (addcomm + brokerage) | 3.75-5% of freight = $25-50k | fixed in CP |
| **Net TCE** | "OK" для handysize owner **$11-14k/day** | computed |

**Severity: MUST** — без voyage-estimate broker не может recommend.

---

## 3. Bunker / Fuel

**Current 2026 bunker prices** (approx, Apr 2026):
- **Singapore VLSFO:** ~$560-600/MT; MGO $720-780; HSFO (scrubber) $440-490
- **Fujairah VLSFO:** ~$580-620 (premium over SG)
- **ARA (Rotterdam) VLSFO:** ~$540-580
- **Houston:** ~$530-570
- **Las Palmas:** ~$600-640 (premium, low volume hub)

**Source:** Ship & Bunker daily, Argus Bunkerwire, Platts Bunkerwire. **MUST.**

**Consumption:** handysize ~22-26 MT/day laden at 12-13 kn economy (vs 28-32 MT/day at design 14 kn). Supramax 25-30 MT/day economy. Slow-steaming экономит $3-6k/day. **Nice** (obvious для owner, но broker учитывает при TCE).

**EU ETS (RU: система торговли квотами ЕС).** 2024: 40%, 2025: 70%, **2026: 100%** of voyage emissions (intra-EU 100%, EU↔non-EU 50%). Cost = `EUA price × tCO2 × phase-in`. EUA Apr 2026 ~€75-85. Handysize EU voyage: 300-600 tCO2 × €80 × 100% = **€24-48k**. **Source:** EEX EUA prices, EU MRV reports. **MUST** для любого EU port call.

**FuelEU Maritime (2025+).** Well-to-wake GHG intensity target, снижается 2%/год до 2030, затем агрессивнее. Penalty: **€2,400/MT VLSFO-equivalent energy shortfall**. Для non-compliant VLSFO-fleet handysize: $5-15k per voyage. **Source:** EMSA, DNV advisories, BIMCO FuelEU clauses. **MUST** для EU trade.

---

## 4. Port Costs / Disbursement

**Typical DA handysize:** $30-80k per port. Разбивка: harbour dues 30-40%, pilotage 15-20%, tugs 15-20%, agent fee $3-8k, stevedoring (если owner's account) $1-3/MT.

**Source:** port agent proforma (GAC, Wilhelmsen, local), ClarkSons port cost database. **MUST.**

**Demurrage rate handysize:** $8-15k/day (2026 market); supramax $12-18k. Dispatch обычно half-demurrage. **MUST** (входит в CP).

---

## 5. Laytime Terms

- **SHINC** (Sundays/Holidays Included) — laytime бежит всегда. Charterer-friendly. **SHEX** — не бежит в выходные, owner-friendly.
- **FIO / FIOS / FIOST** — Free In/Out (/Stowed/Trimmed). Кто платит за погрузку/выгрузку/укладку/штивку. Для grain/cement обычно **FIOST**.
- **CQD** (Customary Quick Despatch) — нет фиксированной rate, "as fast as port customary". Рискованно для owner в congested ports.
- **Declared rates** — например "5,000 MT per WWD SHINC" = per weather working day. Predictable.
- **NOR (Notice of Readiness, RU: нотис о готовности).** Когда tender (arrival / berth / anytime day/night). Неверный NOR → laytime не бежит → owner платит дни.

**Source:** charter party forms (GENCON, NORGRAIN, SYNACOMEX), BIMCO clauses. **Severity: MUST.**

---

## 6. Counterparty & Credit

**Charterer tier.** Tier-1: Cargill, ADM, Bunge, Glencore, Vitol, Trafigura — AAA credit, промo-rate. Tier-2: regional traders — требуют LC или prepayment. Unknown small trader — **avoid без LC**.

**Data sources:** BIMCO Debtors' List (paid subscribers), Dun & Bradstreet rating, Lloyd's List Intelligence, S&P Capital IQ. Broker reputation network.

**Payment terms:**
- **Freight prepaid** — до разгрузки / "before breaking bulk" (BBB), 3 banking days после signing B/L. Standard.
- **Letter of Credit (LC)** — для weak counterparties.
- **Cash against documents** — редко в bulk.

**Severity: MUST** — несостоятельный charterer = катастрофа.

---

## 7. Laycan + Positioning

**Ballast leg cost.** Vessel ballasts 500-1000 NM = 2-4 days × (bunker + daily running cost ~$6-8k owner opex) ≈ $60-150k. Broker ищет cargo рядом с current position.

**Ballast ratio handysize:** typ. 40-50% (из total miles). Чем ниже — тем выше TCE. **Triangulation** (e.g. grain Black Sea → Egypt, urea Egypt → Brazil, soy Brazil → Med) — ключ к $15k+/day TCE.

**Source:** AIS (MarineTraffic, Spire, Kpler, Lloyd's List Intelligence), Clarksons Sea. **MUST** (positioning driver #1 для spot).

---

## 8. Market Timing / Seasonality

- **Grain seasons:** Black Sea wheat Jul-Oct (peak demand handysize/supramax), US Gulf corn/soy Sep-Dec, Argentina/Brazil soy Mar-May.
- **Fertilizer:** urea ME → Brazil Q1/Q3 peaks, потassium Baltic → India year-round.
- **Cement/clinker ME → West Africa:** continuous, без strong seasonality.
- **Iron ore/coal (больше supramax):** CNY (Feb) — китайский demand collapse, rates падают 20-30%.
- **Monsoon India (Jun-Sep):** port delays, demurrage exposure.

**Source:** USDA WASDE reports, IGC grain reports, Argus Fertilizer, Wood Mackenzie. **MUST** для laycan negotiation.

---

## 9. War Risk / Insurance Surcharges

**Joint War Committee (JWC) listed areas.** 2026 актуально: Red Sea/Gulf of Aden (Houthi), Black Sea (Ukraine), Persian Gulf (Hormuz), Gulf of Guinea (piracy). AWRP (Additional War Risk Premium) **$30-150k/voyage** для handysize, Red Sea peaks $200k+.

**K&R (Kidnap & Ransom)** — Gulf of Guinea high-risk, дополнительный premium $10-30k.

**Source:** Lloyd's JWC bulletin, P&I Club circulars (Gard, Skuld, UK Club), BIMCO war risk clauses (CONWARTIME 2013). **MUST** для affected lanes.

---

## 10. Emissions / Compliance

- **EU ETS 2026: 100% phase-in** — см. §3. €24-48k per EU voyage handysize.
- **FuelEU Maritime** — €2,400/MT penalty, см. §3.
- **CII rating (Carbon Intensity Indicator).** A/B/C/D/E. C+ vessels — premium в period TC fixtures; D (3 years) → mandatory corrective plan → **charterers избегают**. Broker проверяет vessel CII до рекомендации.

**Source:** IMO DCS / EU MRV, DNV/BV/LR CII calculators, Clarksons Green. **MUST** (2024+).

---

## Summary: MUST-HAVE checklist для broker recommendation

1. TCE calculation (BHSI/BSI benchmark) — **§1, §2**
2. Bunker price + EU ETS + FuelEU — **§3**
3. Port DA estimates обоих портов — **§4**
4. Laytime terms (SHINC/SHEX, FIO*, demurrage rate) — **§5**
5. Charterer credit check — **§6**
6. Positioning ballast cost — **§7**
7. Seasonal demand/congestion view — **§8**
8. War risk AWRP (если JWC area) — **§9**
9. Vessel CII rating — **§10**

Без этих 9 блоков broker не выходит к owner/charterer с recommendation.

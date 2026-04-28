# Quantika — Product Specification for Partners

**From:** Vitali Borisenko, Quantika AI
**Date:** 24 April 2026
**Status:** v1.0 — for discussion

---

## 1. What It Is (in one sentence)

**Quantika is an AI assistant that replaces 3–5 hours of a shipping broker's daily routine with 15 minutes of work.**

It reads the broker's inbox, recognizes incoming cargo inquiries and vessel positions, checks every vessel against 8 international databases (sanctions, classification, P&I insurance, detention history), calculates the full voyage economics (bunker, port dues, canal fees, emission taxes), benchmarks against market references, and delivers a ready-to-send Draft Quote with justification for every figure. The broker only reviews, edits, and clicks Send.

---

## 2. Who It's For

**Target user:** Solo and mid-sized brokers in the breakbulk segment (packaged and unitized cargo — steel, timber, bagged goods, project cargo, industrial equipment).

**Geography:**
- MENA (Dubai, Istanbul, Riyadh, Cairo, Jeddah)
- Mediterranean (Piraeus, Genoa, Marseille)
- West Africa (Lagos, Tema, Abidjan)
- Asia (Singapore, Mumbai)

**User profile:**
- 1–15 brokers per firm (not tier-1 shops like Clarksons or SSY)
- Earning $100k–$500k/year on 1.25–3.75% commission of freight
- Working primarily with spot voyage charters (70–80% of deals) + occasional CoAs
- **No access** to premium tools: Clarksons SIN ($30k/year), Kpler ($100k/year), RightShip subscriptions
- Live in WhatsApp and Gmail — not in CRMs or BI dashboards

**Market size:** 5,000–10,000 brokers worldwide matching this profile. At $300/month, that's **$18–36M ARR TAM**.

---

## 3. The Problem We Solve

### What a broker does in a day

Sherif (8 years of experience, Dubai-based) on a typical day:

1. **09:00** — Opens Gmail. 30–50 emails arrived overnight. Spends 2 hours on triage.
2. **11:00** — 4–5 interesting inquiries. Each takes 30–60 minutes of manual work:
   - Parsing data (tonnage, DWT, laycan, cranes)
   - Finding a suitable vessel from his network
   - 15 minutes of manual Equasis lookup per candidate
   - Checking sanctions, PSC detentions, classification society, P&I
   - Calculating bunker prices at 3–5 ports (55–65% of all voyage costs)
   - Accounting for EU ETS (from 2026 = +€300 per tonne of fuel)
   - Cross-referencing with Toepfer TMI benchmark
   - Composing the Draft Quote with justification
3. **15:00** — Prepared 2–3 quotes. Sent.
4. **Rest of the day** — Follow-ups, phone calls, back-and-forth negotiations.

**3–5 hours of routine work, every day.** Something inevitably gets missed.

### What happens when something gets missed

| Mistake | Consequence | $ Impact |
|---|---|---|
| Didn't check a new OFAC sanction | Deal with sanctioned vessel → criminal liability | License + $1M+ fine |
| Missed a detention in Equasis | Fixed the vessel, detained in port → claim | $50–200k demurrage |
| Forgot EU ETS in quote (intra-EU) | Owner got a €150k invoice after the voyage | Lost charterer's trust |
| Didn't compare bunker prices across ports | Paid $15k more for fuel than necessary | Owner/charterer upset |
| Skipped L5C check | Steel coils after coal cargo → contamination claim | $100–300k |
| Missed shadow fleet red flag | AIS gaps, flag changed 3× in 6 months | Broker criminal liability |
| Quote without benchmark reference | Charterer pushes "too expensive" → loses deal | $5–30k in commission |

**Even one catch per year pays for Quantika for the next 10 years.**

---

## 4. How We Solve It — A Concrete Example

Let me show exactly what Quantika does. A realistic scenario.

### The Scenario

**Date:** Wednesday, 22 April 2026, 09:12 Dubai time.
**Broker:** Sherif.
**Event:** At 03:47 AM, an email arrived in Sherif's Gmail from a charterer:

```
From: ahmed.ibrahim@dangote-trading.com
Subject: Cargo inquiry — Steel coils Istanbul to Lagos

Dear Sherif,

We have firm cargo for loading early May:

Cargo: 7,500 MT steel coils, HMS bundled
Load: Istanbul (Ambarli), Turkey
Discharge: Lagos (Apapa), Nigeria
Laycan: 10–15 May 2026
Heaviest piece: ~52 MT single coil
Stowage: 1.35 m³/mt
Commission: 1.25% + 3.75% ADCOM
Freight: please quote FIOS basis

Best,
Ahmed
```

Sherif is still asleep. Quantika is already working.

---

### What Happens Behind the Scenes (step by step)

#### STEP 1 — Inbox | 03:47:02

Quantika polls Gmail via OAuth every 5 minutes. New email → enters processing queue.

#### STEP 2 — Classify | 03:47:04

The LLM reads the email and determines: **`CARGO_INQUIRY`** (confidence 0.96). Sender — Ahmed Ibrahim, Dangote Trading (flagged in our database as a blue-chip charterer: 12 fixtures over 2 years, pays within 10–14 days).

#### STEP 3 — Parse | 03:47:08

The LLM extracts structured data with references to the original text:

```
Origin:         Istanbul (Ambarli), Turkey
Destination:    Lagos (Apapa), Nigeria
Weight:         7,500 MT (confirmed)
Cargo type:     BREAK_BULK · steel coils HMS bundled
Heaviest piece: 52 MT single coil
Stowage:        1.35 m³/mt (explicit)
Laycan:         10–15 May 2026
Commission:     1.25% + 3.75% ADCOM
Incoterms:      FIOS
Charterer:      Dangote Trading (blue-chip, known)
```

Sherif can click any field and see the exact source quote — safeguard against LLM hallucinations.

#### STEP 4 — Knowledge Lookup | 03:47:09

Quantika queries its own reference databases:

- **Port Istanbul:** max draft 10.0 m, shore cranes up to 50 tonnes, breakbulk terminals available ✅
- **Port Lagos:** max draft 9.5 m, limited shore cranes → requires geared vessel, breakbulk berths available ✅
- **Charterer Dangote Trading:** blue-chip, −1.5% rate premium, 10–14 day payment terms
- **Incompatibility matrix for steel coils:** previous cargo coal → FORBIDDEN, grain → warning, urea → OK

#### STEP 5 — Match | 03:47:10

From Sherif's pool (45 vessels in his vessel library), Quantika applies hard filters:

```
45 vessels in Sherif's library
  ↓ DWT 10,000–20,000 (handy MPP)
22 vessels
  ↓ geared (Lagos requires self-sustaining cranes)
19 vessels
  ↓ draft ≤ 9.5 m (Lagos limit)
15 vessels
  ↓ open position April 25 – May 10
7 vessels
  ↓ vessel type = MPP / General Cargo
7 vessels
  ↓ combinable SWL ≥ 52t (heaviest piece)
5 vessels
  ↓ bale capacity ≥ 10,400 m³ (7,500 × 1.35 × margin)
5 vessels
  ↓ LLM scoring (proximity, timing, rate fit)
TOP 4 GOOD MATCHES
```

Sherif will see 4 candidates, sorted by match level. The top one — **MV ATLAS HANDY**.

#### STEP 6 — Validate (Vessel Passport) | 03:47:14

For MV ATLAS HANDY, 5 external databases are queried in parallel:

| Check | Source | Result |
|---|---|---|
| Flag | Equasis | Panama — **Paris MoU white list** ✅ |
| Class | Equasis | DNV (IACS member) ✅ |
| P&I | Owner P&I letter | Gard — International Group (90% tonnage) ✅ |
| Age | Equasis | 12 years (modern tonnage, built 2014) ✅ |
| PSC detentions | Paris/Tokyo MoU scrape | 12 inspections in 3 years, **0 detentions** ✅ |
| CII rating | IMO DCS | **B** (above average) ✅ |
| OFAC sanctions | OpenSanctions API | clean ✅ |
| EU/UK sanctions | OpenSanctions API | clean ✅ |
| Shadow fleet | AIS + flag history | no AIS gaps, stable flag ✅ |
| Owner | Equasis + OpenSanctions | Angelicoussis Group (blue-chip Greek owner) ✅ |

**Passport score: 94/100 — excellent vessel, no red flags.**

#### STEP 7 — Economics | 03:47:16

Quantika calculates the full voyage economics:

```
ROUTING
Istanbul → Suez canal → Gulf of Guinea → Lagos
Distance: 5,800 nautical miles
Speed: 12 knots (economical)
Sea days: 20
Port days: 8 (4 in each port)
Total: 28 days
Fuel burn: 22 mt/day at sea + 3 mt/day in port
TOTAL: 464 tonnes of VLSFO
```

**Bunker** (prices pulled from Ship & Bunker today):

| Port | VLSFO $/t | Total for 464 t |
|---|---|---|
| Istanbul (Tuzla) | $665 | $308,560 |
| **Algeciras (on route)** | **$635** | **$294,640** |
| Las Palmas | $645 | $299,280 |

💡 **Recommendation: split bunker 200 t Istanbul + 230 t Algeciras = $296,320. Saves $12k vs. Istanbul-only. Zero deviation — Algeciras is directly on route.**

**War risk (JWC Lloyd's):**
- Gulf of Guinea — HRA zone
- Premium: 0.5% × vessel value ($8M) × 7 days = $11,200
- K&R insurance: +$3,000
- Crew war bonus: +$2,000
- **Total: ~$20k**
- **Important:** Quantika automatically inserts BIMCO CONWARTIME 2025 clause → pass-through to charterer

**EU ETS:** Turkey → Nigeria is not intra-EU. **Savings of €135k** compared to an equivalent EU route (for reference).

**Port DA (Disbursement Accounts):**
- Istanbul: $28,000 (pilotage $4k, tugs $6k, agency $4k, stevedoring $12k, port dues $2k)
- Lagos: $54,000 (including $8k contingency for slow stevedoring — Lagos is known for delays)

**Suez canal:** $98,000 (SCNT-based) + $8,000 war risk = $106,000 laden handy.

**Total voyage cost:**

```
Bunker (split):            $296,320
Port DA Istanbul:           $28,000
Port DA Lagos:              $54,000
Suez canal:                $106,000
War risk (pass-through):    $20,000
Crew / miscellaneous:       $20,000
─────────────────────────────────────
TOTAL VOYAGE COST:         $524,320
```

#### STEP 8 — Benchmark | 03:47:17

**Toepfer TMI April 2026:** $12,683/day TCE (baseline 12,500 DWT MPP F-class).

Adjustments:
- Route Istanbul → WAFR (long haul): +3%
- DWT 12,500 matches baseline: 0%
- Charterer blue-chip credit: −1.5%
- **Implied freight range: $30.80 – $32.10/mt FIOS**

**Last-done fixtures from our database** (similar routes over the past 14 days):
- 21 Apr: Iskenderun → Lagos, 6,800 t, $30.00/mt
- 18 Apr: Istanbul → Tema, 5,500 t, $33.50/mt (heavy-lift)
- 14 Apr: Mersin → Abidjan, 8,200 t, $29.25/mt

Conclusion: **$31.50/mt lands in the upper quartile of the market — justified by blue-chip charterer + Toepfer's upward trend.**

#### STEP 9 — Draft Quote Ready | 03:47:18

Quantika composes the final response:

```
Subject: RE: Cargo inquiry — Steel coils Istanbul to Lagos

Dear Ahmed,

Pleased to offer firm, subject to following:

VESSEL: MV ATLAS HANDY (IMO 9876543)
        Flag: Panama · Class: DNV · P&I: Gard (IG Club)
        DWT 12,500 · Age 12y · CII rating B
        Owner: Angelicoussis Group

CARGO: 7,500 MT steel coils HMS, 5% MOLOO, FIOS

ROUTE: Istanbul (Ambarli) → Lagos (Apapa) via Suez

LAYCAN: 10–15 May 2026

FREIGHT: USD 31.50/MT FIOS
         (basis Toepfer TMI Apr 2026 + route adjustment)

LAYTIME:
  Load 5,000 MT/WWD SHINC at Istanbul
  Disch 4,000 MT/WWD SHEX at Lagos
  NOR WIPON/WIFPON/WIBON · Turn time 6 hrs
  Demurrage USD 9,000/day PDPR
  Despatch USD 4,500/day (half-despatch)

WAR RISK: CONWARTIME 2025 — pass-through to charterer per BIMCO

COMMISSION: 1.25% + 3.75% ADCOM on F/D/D

Vessel passport and voyage economics attached.

Best regards,
Sherif
```

**Plus 5 WOW insights for Sherif** (private — not sent to the charterer):

1. 💡 Split bunkering Istanbul + Algeciras — mention to charterer, $3k savings for them, use as negotiation leverage.
2. ⚠ Vessel L5C: steel, urea, wheat, clinker, steel. Urea is in position #2. If charterer requests hospital clean → add +2 days and $15k re-cleaning cost to the quote.
3. 📊 Toepfer TMI +8% QoQ → upper-quartile pricing at $31.50 is absolutely justified, charterer cannot push back credibly.
4. 🛡 CONWARTIME 2025 is inserted automatically, but remind the charterer that the premium is pass-through (they're blue-chip and know the standard).
5. ✅ Heaviest piece 52 t vs. combinable SWL 80 t = +54% safety margin. Zero issues with cranes in Lagos.

**🚩 Red flags: 0**

---

### STEP 10 — Sherif Opens Gmail | 09:12

The Quantika dashboard shows a top-priority card:

```
🟢 NEW   #1247  Steel coils 7,500mt  Istanbul → Lagos
         4 vessel matches · Draft Quote ready · 0 red flags
         💡 Bunker Algeciras saves $14k    [Review →]
```

Sherif clicks. He sees the full summary: all 10 vessel checks ✅, complete economics, benchmark justified, Draft Quote ready. **He reads for 90 seconds.**

He decides to raise to **$32.00/mt** (he knows Dangote, they'll pay). Edits one field. Hits **Send**.

**Total time spent by Sherif: 2 minutes.**

Without Quantika, this would have taken 90 minutes.

---

## 5. What Quantika Caught (that Sherif might have missed)

Every voyage has 3–5 of these catches. This one has 6:

### Catch #1 — Split bunkering ($12k savings)
Without Quantika, Sherif would have bunkered only in Istanbul at $308k. Split routing via Algeciras = $296k. **$12k saved.**

### Catch #2 — War risk pass-through ($20k)
He could have forgotten the CONWARTIME 2025 clause → owner absorbs $20k. Quantika inserted it automatically → charterer pays.

### Catch #3 — L5C warning ($15k contingency)
Urea is in position #2 of the L5C. If the charterer later demands hospital clean → $15k re-cleaning plus 2 days of delay. Quantika flagged this before the firm offer.

### Catch #4 — Benchmark reference (rate protection)
With Toepfer as reference, $31.50 is objectively defensible. Without a benchmark, the charterer could push down to $28 → $26k freight loss → $330 commission loss for Sherif.

### Catch #5 — Vessel passport (15 min → 1 sec)
Manual Equasis lookup = 15 minutes. Plus Sherif typically **doesn't check** CII, IMO DCS, shadow fleet red flags, or OpenSanctions — he either doesn't know about them or doesn't have access. Quantika runs all 10 checks in 1 second.

### Catch #6 — Sanction auto-refresh
OpenSanctions updates daily. If a new OFAC designation hits Angelicoussis (hypothetically) — Quantika alerts instantly. Sherif would check manually once a month at best.

**Total value on this single deal: $47k+ in avoided losses + $26k protected rate + 88 minutes of time saved.**

---

## 6. Other Application Features

The example above covers just one deal. The full feature set:

### A. Pre-deal (inbox + matching)
- **Email classification** — 8 categories (cargo, vessel, recap, reply, etc.)
- **Parsing with source traceability** — every data point is clickable
- **Vessel matching** — hard filters (draft, cranes, SWL, volume, L5C) + LLM scoring
- **Vessel passport** — 10 checks in 1 second
- **Cargo library** — accumulated database of cargo types with stowage factors
- **Multi-vessel quote** — 3–4 alternatives offered to the charterer

### B. During the deal (Draft Quote)
- **Bunker optimizer** — split bunkering, deviation economics, recommended ports
- **EU ETS calculator** — intra-EU leg detection, €250–310/t, automatic BIMCO clause insertion
- **Port DA estimates** — for top 30 ports in MENA/WAFR/Med
- **Canal costs** — Suez, Panama, Kiel, Bosporus
- **War risk calculator** — JWC zones + premium + BIMCO CONWARTIME
- **Voyage calculator** — full economics + TCE
- **Suez vs. Cape decision support** — two scenarios for Asia → EU routes
- **Benchmark reference** — Toepfer TMI, BHSI, Drewry indices, last-done feed
- **Draft Quote composition** — with justification for every figure

### C. Post firm-offer (negotiation tracking)
- **Subs timer** — countdown for sub-stem, sub-shippers, sub-charterers, sub-RightShip (24–72 hours each; missing one kills the deal)
- **Negotiation points tracker** — AGREED / PENDING / DISAGREED status
- **Change log** — who proposed what, when, with source quotes

### D. Post-voyage
- **SOF parser** — per-minute Statement of Facts → laytime calculation
- **Demurrage/despatch calculator** — handling WIPON/SHINC/SHEX/WWD rules
- **Commission invoicing** — automatic calculation on F/D/D
- **Payment tracking** — when charterer paid, credit tier update

### E. Continuous (market intelligence)
- **Daily feed** — Toepfer, bunker, EUA, sanctioned vessel updates
- **Seasonal alerts** — e.g., "April: fertilizer peak Brazil → India"
- **Sanction alerts** — new shadow fleet designations, OFAC updates
- **Charterer credit tracker** — blue-chip / second-tier / weak with payment history
- **Vessel library growth** — every encountered vessel gets added

### F. UX channels
- **Web dashboard** — morning overview + deep review
- **WhatsApp bot** — forward an inquiry → answer in 30 seconds (80% of daily work)
- **Gmail extension** — inline Draft Quote directly in the compose window
- **Mobile PWA** — for working on the road

---

## 7. How It Works Technically (for non-engineers)

The application is a multi-stage pipeline. An email enters at the bottom, passes through 10 processing layers, and exits at the top as a Draft Quote:

```
┌────────────────────────────────────────────┐
│  10. Post-fixture (subs, SOF, commission)  │ ← After the voyage
├────────────────────────────────────────────┤
│  9. Draft Quote (composition + WOW)        │ ← Ready-to-send response
├────────────────────────────────────────────┤
│  8. Benchmark (Toepfer, BHSI, last-done)   │ ← Market reference
├────────────────────────────────────────────┤
│  7. Economics (bunker, ETS, DA, canal)     │ ← Full voyage economics
├────────────────────────────────────────────┤
│  6. Match (hard filters + LLM scoring)     │ ← Physical compatibility
├────────────────────────────────────────────┤
│  5. Validate (Equasis, sanctions, MoU)     │ ← Can we trust this vessel?
├────────────────────────────────────────────┤
│  4. Knowledge (our DBs — ports, charterers)│ ← Reference data
├────────────────────────────────────────────┤
│  3. Parse (LLM extracts structure)         │
├────────────────────────────────────────────┤
│  2. Classify (LLM determines type)         │
├────────────────────────────────────────────┤
│  1. Inbox (Gmail OAuth)                    │ ← Email enters here
└────────────────────────────────────────────┘
```

Each layer does one thing well and passes the result to the next.

### Data Sources

**Free (mandatory):**
- **Ship & Bunker** — daily bunker prices by port
- **Equasis** — official vessel registry (flag, class, age, detentions)
- **OpenSanctions** — consolidated OFAC/EU/UK sanctions database
- **Paris MoU / Tokyo MoU** — port state control inspections
- **IMO DCS** — carbon intensity (CII) ratings
- **EEX** — EUA carbon credit prices for EU ETS
- **JWC Lloyd's** — military risk zones (piracy, war)
- **Toepfer** — primary benchmark for MPP vessels
- **Drewry** — breakbulk indices

**Paid (to be added once product-market fit is confirmed):**
- RightShip (vetting subscription)
- MarineTraffic Premium (AIS + shadow fleet detection)
- StormGeo (weather routing)
- Clarksons SIN — **not planned** ($15–40k/year not needed for our target users)

**Our own (growing over time):**
- Vessel library — every encountered vessel
- Charterer journal — credit tiers, payment history
- Port DA database — for top 30 ports in the region
- Fixture log — our proprietary "last-done" feed
- Clause library — extracted from parsed recaps

---

## 8. Revenue Model

**Pricing tiers:**

| Tier | Price | Target | Included |
|---|---|---|---|
| Free | $0 | Trial | Inbox triage, 3 matches/day cap |
| **Solo** | **$300/month** | **Primary target** | Unlimited matches, full vessel passport, economics, benchmark, WhatsApp bot |
| Team | $1,500–3,000/month | 5–10 brokers per firm | Multi-user, shared vessel library, compliance pack |
| Enterprise | Custom | Broker houses, trade associations | API access, white-label |

**Financial projection:**

| Period | Subscribers | ARR |
|---|---|---|
| Year 1 (end of 2026) | 300 solo | $1.08M |
| Year 2 | 1,000 solo + 50 team | ~$4.8M |
| Year 3 | 3,000 solo + 200 team | ~$18M |

**Unit economics:**
- Gross margin: 80%+ (SaaS + controlled external API costs)
- CAC target: $500–1,000 (via Breakbulk.com events + direct LinkedIn)
- LTV target: $7,200 (2-year average subscription × $300)
- LTV/CAC: 7–15× — healthy SaaS metrics

**TAM (total addressable market):**
5,000–10,000 solo breakbulk/dry brokers × $300/month × 12 = **$18–36M/year potential**.

Not a unicorn, but a solid mid-market SaaS with strong profitability.

---

## 9. Why Quantika Wins

### 1. Underserved market
Tier-1 tools (Clarksons SIN, Kpler) start at $15–100k/year — unaffordable for solo brokers. Quantika is their **first real tool** at an accessible price point.

### 2. AI-first approach
Competitors (Clarksons, Drewry) were built 20+ years ago; their parsing is keyword-based and error-prone. LLMs deliver contextual understanding that is qualitatively superior.

### 3. End-to-end pipeline
Competitors solve **one piece** (rates only, or vetting only, or routing only). Quantika covers the **entire broker workflow**.

### 4. Right distribution
WhatsApp bot + Gmail extension + mobile PWA — where brokers **actually work**. Not "come to our dashboard when you have time."

### 5. Data compounding
Every fixed email enriches our database. In 12 months, we'll have our own last-done feed, vessel library, and charterer credit data — unavailable outside tier-1 paid terminals.

### 6. Regulatory tailwind
EU ETS, FuelEU Maritime, CII, shadow fleet regulations — the industry is getting more complex **every year**. Quantika automates compliance; manual work becomes impossible. Excellent timing.

---

## 10. Roadmap

**April 2026 (now):** Breakbulk pivot. Removing all non-breakbulk code (containers, tankers, dry-bulk). Version v1.4.0.

**May–June 2026 — Wave α (Economics):**
- Bunker calculator + split bunkering
- EU ETS calculator
- Full vessel passport (10 checks)
- Shadow fleet + OpenSanctions scanner
- Crane SWL + combinable + heaviest piece matching

**June–July 2026 — Wave α.5 (Distribution):**
- **WhatsApp bot MVP** — the adoption inflection point
- Gmail extension inline

**July–September 2026 — Wave β (Depth):**
- Port DA database (top 30)
- Canal costs (Suez, Panama, Kiel)
- Voyage calculator + TCE
- Suez vs. Cape decision support
- Hold cleanliness + L5C incompatibility matrix
- Subs timer

**September–December 2026 — Wave γ (Scale):**
- Laytime calculator + SOF parser
- Market benchmark feed (Toepfer, Drewry, BHSI, proprietary index)
- Charterer credit tier tracker
- RightShip integration
- BIMCO clause library

**2027+:** Scale to new regions (Latam, Asia), enterprise features, API for broker houses.

---

## 11. Current Status (what's already built)

**Version v1.3.4 in production at https://demo.quantika.org:**
- ✅ Gmail OAuth inbox + classify + parse
- ✅ Basic vessel-cargo matching with hard filters
- ✅ Port master (15 ports, expanding to 416)
- ✅ Equasis basic integration
- ✅ Basic sanctions matrix (flag × country)
- ✅ Score breakdown with confidence multipliers
- ✅ Basic Draft Quote (without WOW insights)
- ✅ 1,048 automated tests green
- ✅ Sentry + PostHog observability
- ✅ Deployed on VPS via PM2

**Work in progress:**
- Breakbulk pivot (13 specialized tasks in our wave-pipeline), merge into main targeted for end of April.

---

## 12. What We Need from a Partner

*(section to be tailored to the partnership type)*

**Option A — Financial investor:**
- Seed round: $[TBD] for 12–18 months of runway
- Covers: 3 engineers + 1 product + 1 sales + infrastructure + external APIs + marketing
- Milestones: Wave α + α.5 + β + first 100 paying subscribers

**Option B — Industry partner:**
- Access to a network of 50+ brokers for beta testing
- Feature validation with real users
- Co-branding or referral arrangements
- Possible equity in exchange for traction delivery

**Option C — Strategic partner:**
- Access to data (fixtures, market intelligence, port operations)
- Database contribution in exchange for premium tier
- Long-term acquisition partnership potential

---

## 13. Contacts

**Founder:** Vitali Borisenko
**Email:** [email]
**LinkedIn:** [URL]
**Product demo:** https://demo.quantika.org
**Company:** Quantika AI, Berlin

---

## Appendix — Glossary

- **Breakbulk** — packaged or unitized cargo (steel, timber, bags, equipment), as opposed to bulk (grain, coal) or container cargo
- **MPP (Multi-Purpose Vessel)** — universal cargo vessel, the workhorse of breakbulk trades, 8–20k DWT
- **DWT (Deadweight Tonnage)** — total lifting capacity of a vessel in tonnes (cargo + fuel + provisions)
- **Laycan** — the date window within which a vessel must tender NOR at the loading port
- **FIOS** — "Free In Out Stowed" — charterer pays for loading, discharge, and stowing
- **MOLOO** — "More Or Less Owner's Option" ±5% — owner decides exact tonnage
- **Draft Quote** — preliminary price offer from broker to charterer
- **Firm offer** — binding final offer that commits to the deal upon acceptance
- **Subs** — post-firm conditions ("subject to stem", "subject to RightShip") with 24–72h deadlines
- **SOF (Statement of Facts)** — per-minute log of vessel events in port
- **Demurrage** — penalty for exceeding allowed port time
- **Despatch** — reward for early completion
- **SWL (Safe Working Load)** — maximum lifting capacity of a crane
- **Combinable SWL** — two cranes working in tandem on one cargo; sum of their SWLs
- **L5C (Last 5 Cargoes)** — history of the vessel's last 5 cargoes (compatibility check)
- **Hold cleanliness grade** — hold cleanliness standard (grain clean, hospital clean, shinkle-swept)
- **IMO DCS** — Data Collection System, vessel carbon emissions database
- **CII (Carbon Intensity Indicator)** — A–E rating of vessel carbon efficiency
- **CP (Charter Party)** — full charter contract (typically GENCON 2022 form)
- **PSC (Port State Control)** — port inspection, published in MoU registries
- **P&I Club** — mutual liability insurance club for vessels (13 major = IG)
- **IACS** — association of 8 classification societies (DNV, LR, ABS, BV, NKK, KR, CCS, RINA)
- **RightShip** — leading vetting platform for breakbulk/bulk
- **Toepfer TMI** — monthly multipurpose vessel index ($/day TCE)
- **JWC (Joint War Committee)** — Lloyd's list of military-risk zones
- **ADCOM** — Address Commission, 3.75% standard on voyage charter
- **F/D/D** — Freight/Demurrage/Despatch — basis for broker commission
- **TCE (Time Charter Equivalent)** — owner's earnings expressed as $/day
- **EU ETS** — European CO₂ trading scheme for vessels >5,000 GT, 100% from 2026

---

**End of document.**

*This document is self-contained. For detailed architecture, code, or roadmap questions — see the technical documents in the repository (available on request).*

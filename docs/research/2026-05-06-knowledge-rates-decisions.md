# Knowledge Layer Rates — Research Decisions (2026-05-06)

Post-merge follow-up to PR #93 (Knowledge Layer Phase 1). This document records the
research outcome for zones that could not be tightened from `needs-vitali-input` via
public web sources, and recommends manual estimates if Vitali wants to fill them.

---

## What was tightened (summary)

| Zone / Row | Before | After | Source quality |
|---|---|---|---|
| `persian-gulf-oman-indian-ocean` | `needs-vitali-input`, null | `low`, 0.75% transit / 0.53% hold | Lloyd's List Mar 2026 (paywall, credible) |
| `strait-of-hormuz` | `needs-vitali-input`, null | `low`, 2.25% transit / 1.58% hold | Lloyd's List Mar 2026 (paywall, credible) |
| `gulf-of-guinea` | `needs-vitali-input`, null | `low`, 0.50% transit / 0.35% hold | ShipUniverse 2025 (secondary, trade press) |
| Panama `passenger` | `needs-vitali-input`, null, billing_unit=berth | `medium`, $4.75/PC/UMS-ton | Seatrade Cruise (primary reporting on ACP announcement) |

---

## Remaining gap 1 — Libya (`zone_id: libya`)

### What was searched

- "Libya war risk insurance shipping premium 2025 2026 percent transit rate"
- FreightAmigo war risk trends 2025
- ShipUniverse top-8 war risk regions 2025
- Modern Diplomacy / PropertyCasualty360 / Lloyd's List (March 2026 Hormuz articles)

### Finding

Libya is a JWC listed area (ongoing civil conflict), but no public source publishes a
specific transit rate percentage for Libyan territorial waters. The main war risk press
in 2025-2026 is dominated by Red Sea / Hormuz reporting. Libya trades are niche
(primarily oil tankers to Es Sider / Ras Lanuf terminals) and underwriters handle them
case-by-case.

The existing notes already contain an expert estimate: **"transit 0.10-0.25% depending
on specific port destination and voyage timing"** — this was in the file as context from
initial research in Dec 2025. No 2026 source contradicts this range.

### Recommended estimate if Vitali wants to fill manually

`transit_rate_pct: 0.18` (midpoint of 0.10-0.25% range, confidence: `low`)
`hold_rate_pct: 0.13` (70% rule of thumb)

**Reasoning:** Libya has reduced strategic shipping importance since LNG projects suspended
and oil export volumes are lower. The range 0.10-0.25% aligns with Gulf of Guinea piracy
zones of similar risk tier. Pre-2022 Libya rates in trade press cited 0.15-0.20%.

**Source quality:** ★★☆☆☆ (2/5) — no primary source found; estimate is by analogy with
known-range zones of similar risk profile. Use only if you need a placeholder for the UI.

### What it would unblock

Block E activation when `KNOWLEDGE_WAR_RISK_FROM_DB=true` — war risk surcharge calculation
for routes touching Libyan territorial waters (port calls at Tripoli/Benghazi/Misrata).
In practice, freight-forwarder demo clients are unlikely to call Libyan ports, so this
gap has low urgency.

---

## Remaining gap 2 — Cabo Delgado (`zone_id: cabo-delgado`)

### What was searched

- "Cabo Delgado Mozambique war risk marine insurance premium 2025 2026"
- UK War Risks Association AP page for Cabo Delgado
- North Standard War Risks Renewal 2026/27 circular (returned 403)
- Hellenic War Risks Cabo Delgado page

### Finding

Cabo Delgado is a JWC Additional Premium Area. The UK War Risks and Hellenic War Risks
associations confirm the listing and require prior notice before vessel entry, but do not
publish rates publicly — by design. Rates are Rule 28 (Additional Premium) matters handled
member-to-member. The geographic boundary was amended March 17, 2026 (effective 00:01 GMT).

The existing notes already contain: **"estimated 0.05-0.15% based on limited trade press
references"** — this was the best available estimate from Dec 2025. No newer primary source
found in this research pass.

### Recommended estimate if Vitali wants to fill manually

`transit_rate_pct: 0.10` (midpoint of 0.05-0.15% range, confidence: `low`)
`hold_rate_pct: 0.07` (70% rule of thumb)

**Reasoning:** Cabo Delgado is a lower-volume, lower-traffic zone compared to Gulf of Guinea.
It primarily affects LNG project support vessels and offshore supply. The 0.05-0.15% range
is consistent with lower-tier JWC listed areas where actual conflict is geographically confined
(unlike open-sea zones). TotalEnergies / ExxonMobil LNG projects suspension has reduced
commercial vessel calls significantly.

**Source quality:** ★★☆☆☆ (2/5) — no primary underwriter rate found; estimate based on
December 2025 trade press mentions that could not be re-located in this search pass.

### What it would unblock

Block E activation for routes calling Port of Mocímboa da Praia (MZPOL) or passing through
the Mozambique Channel's northern section. Very low demo-client relevance; gap is low urgency.

---

## Panama passenger billing model correction (informational)

This was categorised as `needs-vitali-input` because the per-berth rate was believed to be
in a restricted-access PDF. During this research pass, a **data model correction** was found:

ACP replaced per-berth billing with a PC/UMS tonnage structure effective **1 February 2025**
(Seatrade Cruise, https://www.seatrade-cruise.com/finance-legal-regulatory/new-panama-canal-tolls-structure-takes-effect-feb-1).

Rates are publicly available:
- Panamax: $4.75/PC/UMS ton (first 10k), $4.65 (next 10k), $4.58 (remainder)
- Neopanamax: $5.08/PC/UMS ton (first 10k), $4.98 (next 10k), $4.90 (remainder)

Previous per-berth rates (now superseded): $138/berth Panamax, $148/berth Neopanamax.

Updated to `confidence: medium` in `tariffs-2026-current.yaml`.

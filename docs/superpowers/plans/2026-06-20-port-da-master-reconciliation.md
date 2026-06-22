# Plan: port_da ⇄ port-master reconciliation + CI gate

**Date:** 2026-06-20
**Branch:** fix-portmaster-cigate
**Tier:** M (disputed audit headline rec, founder-approved)

## Problem

`scripts/seed-data/port-da-base.json` carries DA tariffs for 54 `port_code`s, but
`resolvePort(port_name)` could not reconcile all of them back to `data/ports/port-master.json`:

1. **8 port_codes absent from port-master** — `AEJEA AEKHL CGPNR JOAQB JOAQJ NAWVB NGTIN SADAM`.
   `resolvePort` returns `null` → `getPortDa` silently returns 0 (no port charges → wrong TCE).
2. **Jebel Ali / Port Rashid identity collision** — port-master mapped `AEDXB` to name
   `"Jebel Ali"`, while port-da-base has a *separate* `AEJEA` row for Jebel Ali (cheaper
   tariff than `AEDXB` "Port Rashid Dubai"). Name lookup picked the wrong DA.
3. **3 fuzzy-mismatch names** (code present, name resolves to a *different* port via the
   substring fallback): `ESBCN` "Port of Barcelona" → MEBAR/Bar, `MTMAR` "Malta Marsaxlokk"
   → MTMLA/Malta, `LYMRA` "Port of Misurata" → OMOFC/Sur.

## Fix

### Part 1 — Data (`data/ports/port-master.json`)
- Add 8 missing ports with authoritative UNLOCODE / name / country / lat-lon
  (coords cross-checked via web search — Wilhelmsen/Wikipedia/Namport/NPA/Mawani/MagicPort).
- Rename `AEDXB` `"Jebel Ali"` → `"Port Rashid"`, add alias `"Port Rashid Dubai"`
  (the DA name) so `AEDXB` resolves to its own tariff; add new `AEJEA` "Jebel Ali" entry
  at its real coords (25.0046, 55.0626) so `resolvePort("Jebel Ali")` → AEJEA.
- Add exact aliases to ESBCN / MTMAR / LYMRA so their DA names resolve before the fuzzy
  substring fallback fires.

### Part 2 — CI gate (`__tests__/ports/port-da-reconciliation.test.ts`)
- Walk every `port_code` in port-da-base and assert
  `resolvePort(port_name).portCode === port_code`, plus every code is LOCODE-resolvable.
- TDD: this test is the failing-first test — RED before the data fix (12 fail), GREEN after.

## Invariants preserved
- **Demo TCE/DA unchanged**: 0/146 demo matches route through any of these ports
  (verified: no references in `scripts/demo-seed/` or demo cargo data). The distance
  namespace `'jebel ali' → 'Dubai'` in `lib/sailing/port-distances.ts` is independent of
  port-master and untouched.
- No source-code logic changed — data + new test only.

# Plan — fix-port-names: canonical port-name reconciliation

## Root cause (confirmed on current main @ fc74c3f8)

`normalizePortName()` (lib/sailing/port-distances.ts) returns canonical
**concatenated** KNOWN_PORTS tokens — `'Bandar Abbas' → 'BandarAbbas'`,
`'Cape Town' → 'CapeTown'`, `'Le Havre' → 'LeHavre'`. But:

- `PortMasterIndex` (port-master-loader.ts:31) keys its lookup Map on
  `p.name.toLowerCase()` — **with spaces** (`'bandar abbas'`). `getPortMaster`
  (port-master.ts:79) looks up `canonical.toLowerCase()` = `'bandarabbas'` → **MISS**.
- `data/distances/searoute-pairs.json` keys are **with spaces** too
  (`'Bandar Abbas|Singapore'`). Tier-2 lookup (port-distances.ts:1432) builds
  `'BandarAbbas|Singapore'` → **MISS**.

Net: `getPortDistance` → null → TCE/ballast/readiness silently blank, persisted
into frozen `worksheet_json`.

### Empirical audit (123 KNOWN_PORTS)

- **23** miss port-master, **24** miss searoute. Three classes:
  - **A — space/diacritic divergence (14):** LaSpezia, Gdansk, LeHavre,
    NewOrleans, LosAngeles, LongBeach, BuenosAires, Paranagua, Valparaiso,
    BandarAbbas, PortKlang, HongKong, CapeTown, Lome. Present in port-master
    AND searoute under spaced/accented names.
  - **B — present only as port-master *alias* (3):** Marghera→Venice,
    Lagos→Apapa, Dubai→Jebel Ali. Loader ignores `aliases[]` for the lookup Map.
  - **C — genuinely absent from port-master.json (6):** Taman, Halsvik,
    Haugesund, Jakarta, HoChiMinh (Goteborg present as "Gothenburg" but
    accent-mismatch). Jakarta & Ho Chi Minh are major ports — real product gap.

## Approach — identical normalization + alias indexing (justification)

Chosen over a hand-curated alias bridge: **lower blast radius, self-maintaining**
(new multi-word ports auto-resolve; no per-port table to keep in sync).

`portLookupKey(s)` = lowercase + NFD-strip diacritics + strip non-alphanumeric.
Collapses `'Bandar Abbas'`, `'BandarAbbas'`, `'bandar abbas'` → `'bandarabbas'`;
`'Gdańsk'`/`'Gdansk'` → `'gdansk'`. **Verified zero new collisions** across all
483 port-master entries+aliases (only pre-existing Tripoli/Cartagena dups, which
already collide under `name.toLowerCase()`).

1. **port-master-loader.ts** — export `portLookupKey`. Key the Map by
   `portLookupKey(p.name)`; ALSO index each `alias` via `portLookupKey(alias)`
   **only if key not already taken** (real names win over aliases — guards the
   JNPT-alias-on-Mumbai vs JNPT-named-port collision). Fixes A (port-master side) + B.
2. **port-master.ts** — `getPortMaster` looks up `portLookupKey(canonical)`.
3. **port-distances.ts** — Tier-2 searoute: keep raw `first|second` lookup
   (back-compat for canonical-keyed injected test maps), ADD a normalized-key
   fallback map (rebuilt when source map identity changes). Fixes A (searoute side).
4. **port-master.json** — add `"Göteborg"` alias to Gothenburg (fixes Goteborg
   via alias-indexing); add 5 absent entries (Taman, Halsvik, Haugesund, Jakarta,
   HoChiMinh) with verified public coords + conservative non-restrictive drafts,
   `dataConfidence:"low"`. Fixes C.

## Tests (RED first)

`lib/sailing/__tests__/port-name-reconciliation.test.ts`:
- Every KNOWN_PORTS name → non-null `getPortMaster` coords (lat/lon finite).
- Representative multi-word pairs → non-null distance:
  Bandar Abbas|Singapore, Cape Town|Rotterdam, Hong Kong|Rotterdam, Le Havre|New York.
- Regression guard: currently-working ports (Rotterdam, Singapore, Istanbul,
  Karasu) still resolve.

## Out of scope / no-regress

- DISTANCES_NM Tier-1 matrix untouched (canonical concat keys — no conflict with
  fc74c3f8 #1049).
- `normalizePortName` contract unchanged (still returns canonical KNOWN_PORTS names).
- Issue "#1" ref is a false positive (merged audit-foundation PR) — no `Closes`.

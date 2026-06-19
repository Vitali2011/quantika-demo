# RECON: Port Distance Key-Order Bug (Hamburg-Alexandria dead-entry)

**Date:** 2026-06-17  
**Task:** Task 9 — distance key-order investigation  
**Status:** COMPLETE — root cause found, fix is trivial

---

## Q1 — Where is the lookup and how is the key normalized?

**File:** `lib/sailing/port-distances.ts`  
**Function:** `computeDirectDistance` (line 1419), called by `getPortDistance` (line 1363)

**Key construction (lines 1428–1430):**
```typescript
const [first, second] = [a, b].sort();
const matrix = DISTANCES_NM[`${first}|${second}`];
```

JavaScript `.sort()` with no comparator is **lexicographic** (uppercase letters sort by ASCII codepoint: A=65 < B=66 < … < Z=90). Both `getPortDistance('Hamburg', 'Alexandria')` and `getPortDistance('Alexandria', 'Hamburg')` produce the same key: `'Alexandria|Hamburg'` — because 'A' (65) < 'H' (72).

The table comment at line 408 correctly documents this:
```
Sparse distance table: key is "PortA|PortB" sorted alphabetically.
```

**Tier 2 (searoute JSON, ~105k pairs)** uses the same sorted-key convention — confirmed by grep: 0 bad-order keys in `data/distances/searoute-pairs.json`.

---

## Q2 — Specific Hamburg-Alexandria dead entry

**Table entry (line 595):**
```typescript
'Hamburg|Alexandria': 3500,
```

**Lookup key produced:** `'Alexandria|Hamburg'` (alphabetically: 'A' < 'H')  
**Table key:** `'Hamburg|Alexandria'` — **WRONG ORDER** → never matched by tier-1

**What actually happens:** Tier-1 miss falls through to tier-2 (searoute JSON).  
Searoute JSON has `'Alexandria|Hamburg': 3447`. So `getPortDistance('Hamburg', 'Alexandria')` returns `{ nm: 3447, exact: true }` — not null, but **53 nm less** than the intended hand-curated value (3500).

The bug is a **silently-wrong value**, not a null return. This is why it went undetected — the result looks plausible.

---

## Q3 — How many routes are affected?

**Total dead entries (wrong key order, never reached by tier-1):** **111 of 554** (~20% of the table)

Full list (script: `node -e "extract and sort-compare all keys"`):

| Group | Count | Examples |
|---|---|---|
| NW Europe ↔ Med/Black Sea | 10 | `Hamburg|Alexandria`, `Antwerp|Alexandria`, `Rotterdam|Alexandria`, `Rotterdam|Hamburg`, `Hamburg|Constanta`, `Rotterdam|Piraeus` |
| Mediterranean internal | 15 | `Trieste|*` (5 entries), `Naples|*` (3), `Tunis|*` (4), `Marseille|Alexandria` |
| NW Europe internal | 14 | `Rotterdam|Gdansk`, `Hamburg|Gdansk`, `Hamburg|Halsvik`, `Zeebrugge|*`, `Southampton|*`, `Liverpool|*`, `Goteborg|*`, `Helsinki|*`, `Tallinn|*`, `Haugesund|*` |
| Middle East / Red Sea | 10 | `Dubai|BandarAbbas`, `Dubai|Colombo`, `Dubai|Djibouti`, `Suez|Dubai`, `Jeddah|Dubai`, `Jeddah|Djibouti`, `Jeddah|Colombo`, `Mombasa|Dubai` |
| Marghera cluster | 5 | `Mykolaiv|Marghera`, `Odesa|Marghera`, `Piraeus|Marghera`, `Skikda|Marghera`, `Trieste|Marghera` |
| Chornomorsk cluster | 3 | `Chornomorsk|Burgas`, `Chornomorsk|Aliaga`, `Chornomorsk|Alexandria` |
| East Asia | 8 | `HongKong|Busan`, `Ningbo|HongKong`, `Kaohsiung|Busan`, `Manila|HongKong`, `Jakarta|HongKong`, `Incheon|Busan`, `Qingdao|Busan`, `Ningbo|Busan` |
| Americas | 6 | `LosAngeles|LongBeach`, `LosAngeles|Houston`, `Savannah|*`, `Dakar|BuenosAires`, `Mobile|Houston` |
| Others | 40 | See full script output |

**Entries with NO tier-2 searoute fallback (result: haversine or null):** **34**

Most critical no-fallback entries:
- `Marghera|Mykolaiv`, `Marghera|Odesa`, `Marghera|Piraeus`, `Marghera|Skikda`, `Marghera|Trieste` — Venice cluster completely broken
- `Gdansk|Hamburg`, `Gdansk|Rotterdam` — Baltic ↔ NW Europe
- `Hamburg|Halsvik`, `Rotterdam|Halsvik` — Norway routes
- `Southampton|LeHavre`, `Goteborg|Antwerp`, `Helsinki|Gdansk`, `Tallinn|Hamburg` — NW Europe intra-cluster
- `Dubai|BandarAbbas`, `Dubai|Colombo`, `Dubai|Djibouti`, `Suez|Dubai`, `Jeddah|Dubai` — entire Gulf/Red Sea cluster
- `HongKong|Busan`, `HongKong|Manila`, `HongKong|Jakarta`, `HongKong|Ningbo` — East Asia cluster
- `LeHavre|Alexandria` — no searoute fallback, haversine returns ~false ~2400nm instead of 3450nm

---

## Q4 — Trivial fix

**Root cause:** The `DISTANCES_NM` table was hand-written in "natural prose order" (Hamburg → Alexandria makes intuitive sense as a route direction) but the lookup always sorts keys alphabetically. 111 entries were written in the wrong order.

**Fix type:** **Tier S — mechanical key rename, 1 file, 0 logic changes**

Fix every dead entry by swapping the port order to its sorted form:
```typescript
// BEFORE (dead key):
'Hamburg|Alexandria': 3500,

// AFTER (correct key):
'Alexandria|Hamburg': 3500,
```

This is a pure find-and-replace of the 111 dead keys. The distance values are correct — only the key strings are wrong. The fix does not touch the lookup logic at all.

**Test coverage needed:** Add 2–3 assertions for representative dead pairs that verify:
1. `exact: true` (tier-1 hit, not searoute fallback)
2. The hand-curated nm value (not the slightly-different searoute value)

Example:
```typescript
it('Hamburg ↔ Alexandria returns hand-curated 3500 NM exact (was dead key → searoute 3447)', () => {
  expect(getPortDistance('Hamburg', 'Alexandria')).toEqual({ nm: 3500, exact: true });
});
it('Marghera ↔ Piraeus returns hand-curated 710 NM exact (was dead key → haversine fallback)', () => {
  expect(getPortDistance('Marghera', 'Piraeus')).toEqual({ nm: 710, exact: true });
});
```

**Risk:** Zero. The sort logic is already correct. Renaming keys to sorted order makes tier-1 hits work as documented. Existing tests pass (they use range assertions, not exact values for previously-dead pairs).

---

## Files

- `lib/sailing/port-distances.ts` — only file to change (111 key renames, no logic change)
- `lib/sailing/__tests__/port-distances.test.ts` — add behavioral tests for 2–3 representative dead pairs

---

## Diagnostic command (reproducible)

```bash
node -e "
const src = require('fs').readFileSync('lib/sailing/port-distances.ts', 'utf8');
const keyRe = /'([^']+\|[^']+)':\s*(\d+)/g;
let m; let dead = 0;
while ((m = keyRe.exec(src)) !== null) {
  const [a, b] = m[1].split('|');
  if ([a,b].sort().join('|') !== m[1]) { dead++; console.log('DEAD:', m[1]); }
}
console.log('Total dead:', dead);
"
```

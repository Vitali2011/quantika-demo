# Equasis Enrich — Recon Report (2026-06-17)

**Branch:** equasis-enrich  
**Status:** ✅ RESOLVED — auth solved via live session cookie; 22/22 fetched, parsed, integrated  
**Agent:** Sonnet 4.6 subagent, orchestrator-day dispatch

> **UPDATE 2026-06-17 (data-fill):** Auth unblocked with a valid `JSESSIONID`
> session cookie (founder-supplied) + browser User-Agent — `curl` against
> `restricted/ShipInfo` returns the authenticated page. All 22 demo IMOs fetched,
> parsed, and integrated into the seed. See **§5 Results** below.

---

## 1. Auth Status: BLOCKED ❌

### Findings

- Equasis URL confirmed: `https://www.equasis.org/EquasisWeb/`
- Login endpoint: `POST /EquasisWeb/authen/HomePage?fs=HomePage`
- Fields: `j_email`, `j_password` (no CSRF token required)
- Credentials in `/root/.equasis-creds`: `EQUASIS_USER=v.marychenka@gmail.com`
- Login response modal: **"Your login (e-mail) or/and password are unknown in Equasis. Please, try again"**

### Root cause

Account `v.marychenka@gmail.com` does **not exist** on Equasis (or password is wrong).

### Fix required (1 min, manual)

1. Go to `https://www.equasis.org/EquasisWeb/public/ConditionsRegistration?fs=HomePage`
2. Register with `v.marychenka@gmail.com` → set password
3. Update `/root/.equasis-creds`: `EQUASIS_PASS=<chosen-password>`

> Equasis is free — no payment required for ship info (flag, class, year, P&I).  
> PSC inspection history access may require separate activation.

---

## 2. Proven Request Sequence (works once account registered)

```bash
# Step 1: fresh session cookie
curl -s -c /tmp/eq.jar \
  "https://www.equasis.org/EquasisWeb/public/HomePage"

# Step 2: authenticate
curl -s -L \
  -c /tmp/eq.jar -b /tmp/eq.jar \
  -X POST "https://www.equasis.org/EquasisWeb/authen/HomePage?fs=HomePage" \
  --data-urlencode "j_email=$EQUASIS_USER" \
  --data-urlencode "j_password=$EQUASIS_PASS" \
  -H "Referer: https://www.equasis.org/EquasisWeb/public/HomePage"
# Success: no modal error; JSESSIONID cookie set

# Step 3: fetch ship info by IMO
curl -s -b /tmp/eq.jar \
  "https://www.equasis.org/EquasisWeb/restricted/ShipInfo?fs=Search&P_IMO=9701360"
# Returns: full ship detail HTML
```

Tested: Steps 1–2 execute without error (HTTP 200). Step 2 returns login-error modal because account unregistered. Steps 1+3 structure is confirmed from page HTML analysis.

---

## 3. Equasis ShipInfo Page — HTML Selectors

From HTML analysis of the Equasis ShipInfo page structure and JS source (`equasis.js`, `AdvancedSearch.js`):

### Field extraction (Python regex/BeautifulSoup)

The authenticated ShipInfo page renders ship data in a structured HTML format. Based on page structure analysis:

```python
import re

def extract_equasis_fields(html: str) -> dict:
    """Extract flag, class society, year built, P&I from Equasis ShipInfo HTML."""
    result = {}

    # Flag — appears in ship header section
    # Pattern: <td ...>Flag</td><td ...>VALUE</td>
    flag_m = re.search(
        r'[Ff]lag\s*</td>\s*<td[^>]*>\s*([A-Z][^<]{2,40}?)\s*</td>',
        html
    )
    if flag_m:
        result['flag'] = flag_m.group(1).strip()

    # Year of build
    yob_m = re.search(
        r'[Yy]ear\s+of\s+[Bb]uild\s*</td>\s*<td[^>]*>\s*(\d{4})\s*</td>',
        html
    )
    if yob_m:
        result['yearBuilt'] = int(yob_m.group(1))

    # Classification Society — in a "Classification" section
    class_m = re.search(
        r'[Cc]lassification\s+[Ss]ociet\w*\s*</td>\s*<td[^>]*>\s*([^<]{2,60}?)\s*</td>',
        html
    )
    if class_m:
        result['classSociety'] = class_m.group(1).strip()

    # P&I Club — in "Insurance" section
    pandi_m = re.search(
        r'P\s*&\s*I\s+[Cc]lub\s*</td>\s*<td[^>]*>\s*([^<]{2,80}?)\s*</td>',
        html
    )
    if pandi_m:
        result['pandi'] = pandi_m.group(1).strip()

    return result
```

### IMO search endpoint

- GET `https://www.equasis.org/EquasisWeb/restricted/ShipInfo?fs=Search&P_IMO=<IMO>`
- Requires authenticated `JSESSIONID` cookie
- Returns full ship HTML with all available fields

---

## 4. Sample IMO Verification — Available Data

### Cross-check vs. VesselFinder public data

VesselFinder provides flag + year built without auth. P&I and class society are paywalled there too.

| Field | IMO 9701360 GLORY TOM | IMO 9125073 GULF BLUE | IMO 9166510 BBA LARISA |
|-------|----------------------|----------------------|------------------------|
| **VesselFinder flag** | Panama | Antigua & Barbuda | Palau |
| **Demo flag** | Panama | Antigua & Barbuda | Palau |
| **Match flag** | ✅ | ✅ | ✅ |
| **VesselFinder year** | 2015 | 1997 | 1999 |
| **Demo built** | 2015 | 1997 | 1999 |
| **Match year** | ✅ | ✅ | ✅ |
| **Demo classSociety** | NK | NK | TL |
| **Equasis class** | ⛔ auth blocked | ⛔ auth blocked | ⛔ auth blocked |
| **Demo pandi** | CPI | West of England | London P&I |
| **Equasis P&I** | ⛔ auth blocked | ⛔ auth blocked | ⛔ auth blocked |

**Finding:** Flag and year-built in demo data are correct for all 3 sample vessels (match VesselFinder public data). Class society and P&I require Equasis auth to verify.

---

## 5. Demo Vessel IMO Inventory — Enrichment Gaps

From `lib/sample-data/demo-parsed-vessels.json` (23 unique IMOs):

| IMO | Vessel | Flag | Class | Built | P&I | Needs Equasis |
|-----|--------|------|-------|-------|-----|---------------|
| 8605480 | MV HASKAL | ❌ | ❌ | 1986 | ❌ | flag + class + pandi |
| None | PANTHERA J | ❌ | ❌ | ❌ | ❌ | **no IMO — skip** |
| 8887296 | MV BARABULKA | Cameroon | Dutch Lloyd | 1995 | Thomas Miller | verify all |
| 9701360 | MV GLORY TOM | Panama | NK | 2015 | CPI | verify class + pandi |
| 9063873 | MV IMI | Bahamas | DNV | 1993 | ❌ | verify + fill pandi |
| 9145786 | MV ALTO | Belize | Turkish Lloyd | 1997 | ❌ | verify + fill pandi |
| 9125073 | MV GULF BLUE | Antigua & Barbuda | NK | 1997 | West of England | verify class + pandi |
| 9166510 | MV BBA LARISA | Palau | TL | 1999 | London P&I* | verify all |
| 9367841 | MV YUCATAN | SVG | TL | 2006 | London P&I | verify |
| 9238351 | MV ONEGO TRADER | Portugal | KR | 2001 | London P&I | verify |
| 9238363 | MV ONEGO MERCHANT | Portugal | KR | 2002 | London P&I | verify |
| 8834940 | FIRTINA S | Vanuatu | BRS | 1988 | Turk P&I | verify |
| 9145360 | EMINE ANNE | Vanuatu | BRS | 1996 | Turk P&I | verify |
| 9554145 | GOYNUK | Marshall Is. | RINA | 2010 | HYDOR | verify |
| 9167320 | GOCEK | St Kitts | TURK LOYDU | 1997 | HYDOR | verify |
| 9111761 | DOGANBEY | Palau | Phoenix | 1996 | Turk P&I | verify |
| 8216100 | MV MIMI | Comoros | ❌ | 1987 | ❌ | class + pandi |
| 9381407 | MV SNAPPER | ❌ | IR | 2008 | ❌ | flag + pandi |
| 1033822 | M/V AVAT 1 | Cameroon | OMROS | 2020 | Thomas Miller | verify |
| 9013012 | DOLPHIN E | Palau | IACS | 1991 | ❌ | class normalize + pandi |
| 9013036 | SERENITY AC | Panama | IRS (IACS) | 1991 | ❌ | class normalize + pandi |
| 9103740 | M/V CANKA | Panama | LR | 1995 | Shipowner P&I | verify |
| 9173331 | M/V TEOS | Panama | Indian Register | 1999 | ❌ | pandi |

*BBA LARISA has 3 duplicate entries in JSON with conflicting pandi (London P&I, Turk P&I).

**Priority vessels** (fill from Equasis, largest data gaps):
- 8605480, 8216100, 9381407 — flag OR class OR pandi all missing

---

## 6. Scrape Method — Reusable Script Skeleton

Location: `scripts/demo-seed/equasis-fetch.ts`

See the TypeScript script skeleton at that path. Key design:
- Reads `EQUASIS_USER` / `EQUASIS_PASS` from env (never hardcoded)
- Fresh JSESSIONID per run (30-min session; re-auth if cookie expired)
- 2.5s inter-request delay (polite; Equasis ToS: "reasonable use")
- Per-IMO result: `{ imo, flag, yearBuilt, classSociety, pandi, fetchedAt }`
- Outputs `lib/sample-data/equasis-enrichment.json` for human review before patching

---

## 7. Integration Plan

### Step A — Register Equasis account
Register `v.marychenka@gmail.com` at equasis.org → update `/root/.equasis-creds`.

### Step B — Run equasis-fetch.ts on all 22 real IMOs
```bash
set -a; . /root/.equasis-creds; set +a
npx tsx scripts/demo-seed/equasis-fetch.ts
# outputs: lib/sample-data/equasis-enrichment.json
```
ETA: ~22 × 2.5s = ~60s. Do NOT batch — polite rate limit.

### Step C — Human review
Review `equasis-enrichment.json`:
- Compare each field with current `demo-parsed-vessels.json` value
- Mark as `corrected` (Equasis value replaces demo estimate) or `confirmed`
- Flag any discrepancies (esp. P&I club name normalization: "Thomas Miller P&I" ↔ "Thomas Miller")

### Step D — Patch demo-parsed-vessels.json
Update fields with `source: "real/equasis"` label (not `"estimated"`).
Script: extend `scripts/demo-seed/backfill-*.ts` pattern or create `backfill-equasis.ts`.

### Step E — Regen matches
After patching, run:
```bash
npx tsx scripts/demo-seed/regenerate-matches.ts
```
Flag/class feed into match scoring (`vesselClassSociety`, fit breakdown). Corrected values may shift match ranks.

### Step F — BBA LARISA dedup
IMO 9166510 has 3 entries in demo-parsed-vessels.json with conflicting pandi.
Equasis will show the current P&I — reconcile to single record.

---

## 8. ToS / Rate Notes

- Equasis ToS: free for registered users, "reasonable use" — no bulk/automated scraping at high rate
- Polite: 2.5s delay between requests; 22 vessels ≈ 1 min total → acceptable
- Do NOT run in CI/CD or scheduled jobs — manual enrichment only, results committed to JSON
- Equasis data updates daily (confirmed: last data update shown as "11 hours ago" on homepage)
- P&I club data on Equasis comes from insurers directly; class society from IACS members

---

## 9. Blocked Fields

| Source | flag | yearBuilt | classSociety | pandi |
|--------|------|-----------|--------------|-------|
| VesselFinder (free) | ✅ | ✅ | ❌ (paid) | ❌ (paid) |
| Equasis (free, auth) | ✅ | ✅ | ✅ | ✅ |
| Demo current | partial | mostly OK | partial | partial |

**Equasis is the right source** — free, comprehensive, authoritative (IMO-endorsed). Auth is the only blocker.

---

## 10. Headless-Browser Attempt (2026-06-17, EXEC) — STILL BLOCKED ❌

The recon hypothesis was "curl can't establish the session; a real browser can".
**Tested directly with headless Chromium (Playwright).** Result: the headless
browser drives the real login form correctly (fills the visible `j_email` /
`j_password` pair, fires submit, server responds 200) but Equasis returns the
explicit modal:

> **"Your login (e-mail) or/and password are unknown in Equasis. Please, try again"**

Captured verbatim from a live attempt; the email field was confirmed to hold
`v.marychenka@gmail.com` and the password (13 chars, clean — no whitespace / CR
/ quotes) was submitted intact.

### What this rules in / out

- **Not a captcha / bot-wall.** The response is a *credentials-unknown* modal,
  not a challenge. `navigator.webdriver` spoof + real UA made no difference.
- **The blocker is the account credentials**, not the scripting method. The
  prior "scripted curl is being bot-blocked" theory is **refuted** — headless
  Chromium is rejected with the same credentials error.

### Two unblock paths (founder action required)

1. **Verify / update the password.** The password in `/root/.equasis-creds` is
   rejected. Founder logs in at equasis.org by hand, confirms the working
   password, updates `/root/.equasis-creds`, then:
   ```bash
   set -a; . /root/.equasis-creds; set +a
   npx tsx scripts/demo-seed/equasis-fetch.ts
   ```
2. **Export an authenticated browser session** (no password in the pipeline).
   From a logged-in equasis.org tab, export a Playwright `storageState` JSON,
   then:
   ```bash
   EQUASIS_STORAGE_STATE=/path/to/equasis-state.json \
     npx tsx scripts/demo-seed/equasis-fetch.ts
   ```

### Deliverable in this PR

- `scripts/demo-seed/equasis-fetch.ts` — rewritten as a **Playwright headless
  fetcher** with both auth modes above, polite 3 s inter-ship delay, robust
  missing-field handling, and exported pure helpers (`parseShipInfo`,
  `detectAuthFailure`).
- `scripts/demo-seed/__tests__/equasis-fetch.test.ts` — unit tests. `detectAuthFailure`
  is pinned against the **real** bad-credentials modal text; `parseShipInfo`
  selectors model the documented ShipInfo `<td>label</td><td>value</td>` layout
  but are **UNVERIFIED against a live authenticated page** — they MUST be
  validated against the first real fetch before any seed write.

**No seed data was written. No values were fabricated.** `demo-parsed-vessels.json`
is untouched. The data-fill step stays BLOCKED until auth is fixed.

---

## 5. Results (RESOLVED 2026-06-17)

### Auth method that worked

A valid live **`JSESSIONID` session cookie** (founder-supplied, in
`/root/.equasis-cookie`) plus a desktop browser `User-Agent` — no headless login
needed:

```bash
curl -A '<browser UA>' -b "JSESSIONID=<value>" \
  "https://www.equasis.org/EquasisWeb/restricted/ShipInfo?fs=Search&P_IMO=<imo>"
```

Raw HTML for all 22 was saved to `/tmp/equasis-raw/<imo>.html` first (cookie-expiry
resilience), then parsed offline.

### Parser correction (important)

The live authenticated ShipInfo page is **Bootstrap div-grid**, NOT the `<td>`
table layout the original (auth-blocked) parser assumed:

- **Flag** — image (`flags/PAN.png`) + parenthesised country text (`(Panama)`,
  `(Portugal (MAR))`, `(Not Known)` → null).
- **Year of build** — grid row `<b>Year of build</b></div><div>VALUE</div>`.
- **Classification society** — first `round-list` `<p>` after the
  `<!-- Classification -->` anchor.
- **P&I** — first `round-list` `<p>` after the `P&I Information` heading.

`parseShipInfo` now tries the real div-grid extractors first, falling back to the
legacy `<td>` extractors (so the original synthetic fixtures still pass).

### Real values fetched (proof, all 22)

| IMO | Vessel | Flag | Built | Class society | P&I |
|-----|--------|------|-------|---------------|-----|
| 1033822 | M/V AVAT 1 | St Kitts and Nevis | 2022 | Zianlian Chuen | Hydor AS |
| 8216100 | MV MIMI | Comoros | 1986 | Hellas Naval Bureau | — |
| 8605480 | MV HASKAL | (Not Known) → null | 1986 | Dutch Lloyd | — |
| 8834940 | FIRTINA S | Vanuatu | 1988 | Turk Loydu (IACS) | — |
| 8887296 | MV BARABULKA | St Kitts and Nevis | 1995 | Capital Register of Shipping | — |
| 9013012 | DOLPHIN E | Palau | 1991 | Phoenix Register of Shipping | — |
| 9013036 | SERENITY AC | Cameroon | 1991 | Phoenix Register of Shipping | — |
| 9063873 | MV IMI | Bahamas | 1993 | DNV (IACS) | — |
| 9103740 | M/V CANKA | Panama | 1995 | Turk Loydu (IACS) | The London P&I Club |
| 9111761 | DOGANBEY | Palau | 1996 | Turk Loydu (IACS) | — |
| 9125073 | MV GULF BLUE | Antigua and Barbuda | 1997 | Nippon Kaiji Kyokai (IACS) | The West of England Shipowners |
| 9145360 | EMINE ANNE | Vanuatu | 1996 | Turk Loydu (IACS) | — |
| 9145786 | MV ALTO | Belize | 1997 | International Maritime Bureau | American Steamship Owner P&I association |
| 9166510 | MV BBA LARISA | Palau | 1999 | Turk Loydu (IACS) | — |
| 9167320 | GOCEK | St Kitts and Nevis | 1997 | Turk Loydu (IACS) | Hydor AS |
| 9173331 | M/V TEOS | San Marino | 1999 | Polish Register of Shipping (IACS) | The London P&I Club |
| 9238351 | MV ONEGO TRADER | Portugal (MAR) | 2001 | Korean Register (IACS) | The London P&I Club |
| 9238363 | MV ONEGO MERCHANT | Portugal (MAR) | 2002 | Korean Register (IACS) | The London P&I Club |
| 9367841 | MV YUCATAN | St Vincent and Grenadines | 2006 | Turk Loydu (IACS) | — |
| 9381407 | MV SNAPPER | St Kitts and Nevis | 2008 | International Register of Shipping (IS) | — |
| 9554145 | GOYNUK | Marshall Islands | 2010 | Registro Italiano Navale (IACS) | Hydor AS |
| 9701360 | MV GLORY TOM | Panama | 2015 | Nippon Kaiji Kyokai (IACS) | UK P&I Club |

Verbatim values (with `(IACS)`/`(MAR)` suffixes, `source: 'equasis'`,
`fetchedAt`) are persisted to `lib/sample-data/equasis-enrichment.json` (the
provenance record of truth).

### Integration into the seed

`scripts/demo-seed/equasis-backfill.ts` patches `demo-parsed-vessels.json` from
the sidecar — only fields Equasis returned, filling gaps and **correcting
fabricated guesses**. Light normalisation maps Equasis spelling to the demo's
canonical Paris-MoU flag keys and IACS-alias class keys (strip `(MAR)`/`(IACS)`,
fix `St.` spacing). Result: **5 fields filled, 49 corrected.**

Notable corrections (seed had optimistic fabrications):

- **9013036 SERENITY AC** — flag was `Panama` (fake) → real **Cameroon**.
- **9173331 M/V TEOS** — flag `Panama` + class `Indian Register of Shipping`
  (both fake) → real **San Marino** + **Polish Register of Shipping**.
- **1033822 M/V AVAT 1** — class `OMROS` → **Zianlian Chuen**, built `2020` →
  **2022**.

### Value-check (flag/class/age → vetting)

`computeVesselVetting` before/after, all moves within **±0.14** (no inflation):

| Vessel | Before | After | Δ |
|--------|--------|-------|---|
| MV GLORY TOM | 0.62 | 0.76 | +0.14 (real NK class now resolves IACS) |
| MV BARABULKA | 0.54 | 0.62 | +0.08 |
| SERENITY AC | 0.61 | 0.53 | **−0.08** (fake Panama → real Cameroon) |
| M/V TEOS | 0.68 | 0.54 | **−0.14** (fake Panama+IRS → real San Marino+PRS) |

Scores move toward truth in **both** directions — fabricated-favorable records
correctly *deflate*. No wild inflation.

### Known follow-ups (out of scope here)

- `Polish Register of Shipping` (PRS) is a genuine IACS member but absent from
  `lib/sanctions/iacs-members.ts` → scored `caution` not `ok`. Extend that
  registry in a separate PR.
- 1033822 real built `2022` (was estimated `2020`); CII bucket unchanged
  (`estimateCiiByBuildYear` 2020 = 2022 = C), so `cii.json` stays consistent.

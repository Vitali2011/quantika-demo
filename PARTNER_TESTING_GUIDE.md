# Quantika Demo — Partner Testing Guide

Thanks for taking a look. This guide walks you through the demo end-to-end. You don't need to know the product going in — read this top to bottom, then open the app and follow the steps. It should take 15–20 minutes.

This is an MVP. Rough edges are expected. Your job is to judge the core logic, not the polish.

---

## 1. What is Quantika Demo?

Quantika is an AI assistant for **dry-bulk shipping brokers and freight forwarders**. It reads your inbound email — cargo inquiries from charterers, position lists from owners, fixture recaps, replies — and turns that free-text mess into structured data you can actually use. Then it proposes **cargo ↔ vessel matches**, ranked by physical feasibility, laycan fit, and commercial sense.

**The problem it solves.** A working broker sees 100–300 emails a day. Most of it is noise: duplicate positions, off-topic chatter, cargo orders that don't fit your book. The real work — spotting a vessel open near a cargo, within the laycan, with the right gear and draft — is done mostly in your head, and it doesn't scale. Misses cost commissions. Quantika does the first 80% of that triage automatically so you can spend your time on the 20% where the money is.

**What this demo shows.** Ten pre-built scenarios based on real shipping situations: a perfect fit, an idle vessel waiting a week before laycan, a gearless ship sent at a port with no shore cranes, a Russian-flagged vessel on a Ukrainian route, a cargo that literally won't fit in the hold. You run them all at once with one click.

**What it does NOT do yet:**
- No real-time AIS tracking (MarineTraffic integration is on the roadmap).
- No broker-to-broker messaging or chat.
- No fixture negotiation or auto-reply.
- No live email inbox — the demo loads canned emails, it doesn't pull from your Outlook.

This is a **perception + matching layer**. The fixture is still yours to close.

---

## 2. Why this test matters

You'll use the product the way a broker would. As you go, form an opinion on three questions:

1. **Does the AI extract the right data?** DWCC, summer draft, laycan window, stowage factor, commission — are the numbers right, and is the source clear?
2. **Do the matches make commercial sense?** Would you call the owner on a GOOD match? Would you dismiss the WEAK ones for the same reasons the system gave?
3. **Would you trust this on a real trading day?** Not every decision — just the triage. Would it save you time or waste it?

Honest negative feedback is more useful than polite agreement.

---

## 3. Shipping terms used in the UI

Nothing here will be new to you — this is a reference for anyone else looking over your shoulder.

- **DWT** — Deadweight tonnage. Total cargo + bunkers + stores the ship can lift.
- **DWCC** — Deadweight cargo capacity. DWT minus bunkers/stores — what's actually available for cargo.
- **Summer draft** — Maximum loaded draft in summer zone. Drives port-draft compatibility.
- **LOA / beam** — Length overall / beam. Berth-fit constraints.
- **Grain capacity** — Cubic hold volume (m³) for free-flowing cargo.
- **Laycan** — Layday / cancelling window. Earliest and latest date the vessel may tender NOR.
- **Gearless / geared** — Geared vessels have their own cranes. Gearless need shore cranes at both ends.
- **Stowage factor (SF)** — m³ per metric ton of cargo. Drives whether cargo fits by volume, not just weight.
- **FIO / SHINC / CQD** — Load/discharge terms: Free In/Out, Sundays & Holidays Included, Customary Quick Dispatch.
- **TTL commission** — Total commission (addcomm + broker comm) on freight.
- **Open position** — Where and when a vessel becomes available for a new fixture.
- **IMO number** — 7-digit unique ship ID. Last digit is a mod-10 checksum — catches fakes.
- **Equasis** — Public vessel registry. Used here as a cross-check.
- **Ballast / laden speed** — Speed empty vs. loaded. Drives ETA calculations.
- **Restrictions** — Flag bans, port bans, sanctions regimes (EU/UK/US/OFAC).
- **Hard filters** — Physical / legal facts that disqualify a match before scoring (wrong gear, draft exceeded, sanctions).
- **Readiness verdict** — How the vessel's open date aligns with laycan: **ideal**, **tight**, **idle**, **late**.

---

## 4. Before you start

- **Browser:** Chrome or Safari, desktop. The UI is responsive but designed for a laptop screen.
- **URL:** https://demo.quantika.org
- **Account:** none needed. The demo creates a session on the fly.
- **Time:** 15–20 minutes uninterrupted.
- **If something breaks:** screenshot it, copy the URL, note what you were doing. That's more useful than a written description.

---

## 5. The walkthrough

### Step 1 — Landing page

**Do:** Open https://demo.quantika.org.

**See:** A short intro and a prominent button labelled something like **"Try with sample data"** (wording may vary — it's the main CTA).

**Means:** You're about to load a canned set of 10 scenarios and run the full pipeline on them — classify, parse, match.

**Wrong if:** Blank page, HTTP 500, no CTA button visible.

### Step 2 — Kick off the pipeline

**Do:** Click the sample-data button.

**See:** A progress indicator running through stages — usually **classify → parse cargo → parse vessel → match**. Takes roughly 60–90 seconds. GPT-4o-mini handles classification; GPT-4o does the heavy parsing.

**Means:** Real LLM calls. The whole stack runs the same way in production.

**Wrong if:** Stuck on one stage for more than 3 minutes, or the progress bar never moves.

### Step 3 — Dashboard: email categories

**Do:** When the pipeline finishes, you land on the dashboard. Look at the top section.

**See:** Four email buckets with counts — **Cargo Inquiries**, **Vessel Positions**, **Fixture Recaps**, **Replies**. Each is a classification bucket the LLM assigned.

**Means:** This is how the system segments raw mail. Brokers only want to open cargo + position mail; recaps and replies are context.

**Wrong if:** All emails in one bucket, or bucket counts are zero across the board.

### Step 4 — Dashboard: matches section

**Do:** Scroll to the **Vessel–Cargo Matches** section.

**See:** A ranked list of cargo↔vessel pairs. Each row shows the cargo route, the vessel name/DWT, a match score, and a **readiness** indicator (ideal / tight / idle / late).

**Means:** This is the product. Top of the list = your first phone calls of the day.

**Wrong if:** All scores identical, all scores 0, or the list is empty across all 10 scenarios.

### Step 5 — Open a GOOD match

**Do:** Find a match labelled **GOOD** (score >70) and click it. The best candidate is usually **10-perfect-match** (ALERIA-1 into Ravenna).

**See:** The match detail page, split into cargo card + vessel card + analysis cards.

**Means:** Full drill-down. Everything the AI decided, with evidence.

**Wrong if:** Page 404s, or cards are blank/empty.

### Step 6 — Cargo card + source traceability

**Do:** Look at the cargo card (origin, destination, weight, cargo type). Click on one of the field values — try **Weight** or **Origin**.

**See:** A popover showing the exact quote from the source email that field was extracted from, plus a confidence label: **confirmed** (directly quoted), **interpreted** (slightly inferred), or **uncertain** (guessed).

**Means:** This is the traceability principle. No black-box extraction. Every structured field points back to a line in the email — you can verify before you act.

**Wrong if:** Popover opens empty, shows `undefined`, or the quoted text doesn't exist in the email body.

### Step 7 — Vessel card

**Do:** Look at the vessel card: DWT, flag, gear, open position (port + date), summer draft. Click **DWT**.

**See:** Same source-quote popover. For the `07-abt-dwt-downgraded` scenario specifically, the DWT field should show **interpreted** (not confirmed), because the email hedges with "abt 8000 mts".

**Means:** The LLM's confidence is calibrated against hedge words. "Abt" / "approx" / "circa" get auto-downgraded so you don't over-trust a soft number.

**Wrong if:** Confidence is "confirmed" on a hedged value, or the quote doesn't actually contain the number shown.

### Step 8 — Match-level badge and reasons

**Do:** Find the top-level badge at the top of the analysis section.

**See:** One of **GOOD / POSSIBLE / WEAK**, plus a bulleted "reasons" list — short plain-English sentences like "vessel opens 3 days before laycan start" or "gearless vessel — port has no shore cranes".

**Means:** This is the broker-facing summary. If you only had one sentence to decide whether to dial the owner, this is it.

**Wrong if:** Badge says GOOD but reasons contradict it, or reasons list is empty.

### Step 9 — Physical feasibility

**Do:** Scroll to the **Physical Feasibility** card.

**See:** Four binary checks with ✓ or ✗:
- Draft (vessel summer draft vs. load/discharge port draft limits)
- Crane (vessel gear + port shore cranes vs. cargo handling needs)
- Volume (cargo volume at stowage factor vs. vessel grain capacity)
- Cargo × vessel type (bulker vs. break-bulk vs. MPP compatibility)

Any ✗ means the match was physically filtered out before the LLM ever scored it.

**Means:** Deterministic safety net. These are facts, not opinions — the AI doesn't get to override them.

**Wrong if:** All four checks ✓ on a scenario you know should fail (e.g. 03-gearless-skikda-blocked should have a ✗ on Crane).

### Step 10 — Vessel readiness

**Do:** Find the **Vessel Readiness** card.

**See:** A verdict badge (**ideal / tight / idle / late**), a one-line explanation, and 6 supporting metrics — ballast distance, ballast days, ETA at load port, laycan start, laycan end, and **gap days** (how far from laycan).

**Means:**
- **ideal** — arrives cleanly inside the window.
- **tight** — arrives near the laycan edges; risk of missing cancelling.
- **idle** — arrives far too early, owner waits unpaid (see `01-karasu-mykolaiv-idle`).
- **late** — arrives after cancelling date; cargo can cancel.

**Wrong if:** Verdict says "ideal" but gap days is large, or metrics obviously disagree with the verdict.

### Step 11 — Sanctions & restrictions

**Do:** Find the **Sanctions & Restrictions** card.

**See:** A risk badge — **NONE / MEDIUM / HIGH**. For `05-ru-flag-mykolaiv-sanctioned` this should read **HIGH** with a plain reason ("RU-flagged vessel on UA port under EU/UK/US regime").

**Means:** Blocking compliance check. HIGH-risk matches are filtered out of the ranked list; MEDIUM is surfaced with a warning so you decide.

**Wrong if:** Russian-flag + Ukrainian-port combo shows NONE, or a clean EU-flag trade shows HIGH.

### Step 12 — Score breakdown

**Do:** Find the **Score Breakdown** card.

**See:** Six components with progress bars summing to 100:
- Geographic proximity (20)
- Cargo type match (20)
- Cargo handling (15)
- Volume fit (15)
- Laycan fit (20)
- DWT class fit (10)

Plus a ± adjustment block for readiness verdict and sanctions risk. Total at the bottom maps to GOOD (>70) / POSSIBLE (>40) / WEAK (≤40).

**Means:** Explainable score. If you don't agree with the ranking, this tells you which component to argue with.

**Wrong if:** Components don't sum anywhere near the displayed total, all bars at 0, or a component shows a value larger than its max weight.

### Step 13 — Annotated email

**Do:** From the match page or dashboard, open the view for one of the source emails.

**See:** The original email body with extracted fields highlighted inline (yellow-ish `<mark>` spans over the phrases that became structured data).

**Means:** Second layer of traceability. The popover shows you the quote per field; this shows you the whole email with everything the system lifted.

**Wrong if:** Highlights land on wrong phrases, `<mark>` tags render as visible text, or the body is empty.

### Step 14 — A failure scenario on purpose

**Do:** Go back to the matches list and find one of the **blocked** scenarios. Good candidates:
- `02-steel-on-bulker-blocked` — break-bulk steel on a dry bulker
- `03-gearless-skikda-blocked` — gearless ship + port with no cranes
- `04-volume-overflow-blocked` — cargo volume exceeds grain capacity
- `05-ru-flag-mykolaiv-sanctioned` — sanctions

These should either be filtered out of the ranked matches entirely, or present with an obvious rejection reason.

**See:** The physical-feasibility or sanctions card should show a ✗ with a plain reason. The match may not even appear in the top list — check whether the system filtered it pre-LLM (the expected behaviour).

**Means:** Negative signals matter as much as positive ones. You need to see the system catch the clear fails, not just surface the clear wins.

**Wrong if:** A break-bulk-on-bulker match shows GOOD, or a RU-flag-on-UA-port match is in the ranked list without a HIGH sanctions badge.

### Step 15 — Individual cargo / vessel detail pages (optional)

**Do:** Navigate to `/cargo/[id]` or `/vessel/[id]` — click a cargo row or vessel name from the dashboard.

**See:** A standalone page for the item: all parsed fields, confidence levels per field, source quote per field, and the list of matches this item participates in.

**Means:** The same data viewed from the cargo's or vessel's perspective instead of the match's. Useful when you're working a specific ship or a specific cargo and want to see all its options.

**Wrong if:** 404, or the page renders but shows none of the data you saw elsewhere.

---

## 6. Red flags checklist

If you see any of these, screenshot it and flag it:

- `[object Object]` shown as text anywhere
- `undefined` or `null` rendered on screen
- ISO dates shown raw (e.g. `2026-04-16T00:00:00.000Z` instead of `16 Apr 2026`)
- All matches have score 0, or every match has an identical score
- A vessel labelled "Gearless" with `geared=true` (or vice versa)
- Source-quote popover opens empty
- Pipeline stuck at "Processing..." for more than 3 minutes
- HTTP 500 error page at any URL
- 0 matches produced across all 10 scenarios
- ✓ on Crane for `03-gearless-skikda-blocked`
- NONE sanctions badge on `05-ru-flag-mykolaiv-sanctioned`
- Confidence "confirmed" on the `07-abt-dwt-downgraded` DWT field (should be "interpreted")

---

## 7. The 10 scenarios — what to expect from each

Try the button that loads all 10 at once. Expected behaviour per scenario:

- **01-karasu-mykolaiv-idle** — Karasu (TR) open 9 days before Mykolaiv laycan. Hard filters pass. Readiness verdict: **idle**. Match level drops to POSSIBLE.
- **02-steel-on-bulker-blocked** — Break-bulk steel coils offered on a dry bulker. **Cargo-type hard filter blocks** pre-LLM.
- **03-gearless-skikda-blocked** — Gearless vessel sent into Skikda (no shore cranes). **Crane hard filter blocks** pre-LLM with explicit reason.
- **04-volume-overflow-blocked** — 10,000 mt grain at SF ~1.30 m³/mt = ~13,000 m³ needed; vessel has 6,200 m³. **Volume hard filter blocks**.
- **05-ru-flag-mykolaiv-sanctioned** — RU-flag vessel on UA port. **HIGH sanctions**, blocked under EU/UK/US regime.
- **06-hallucinated-imo** — LLM invents an IMO. **Mod-10 checksum catches it** and stores null; or valid-but-unknown IMO shows "not found in registry" warning.
- **07-abt-dwt-downgraded** — Email says "abt 8000 mts". LLM initially marks confirmed; calibration **downgrades to "interpreted"**. Visible in the UI as a softer confidence badge.
- **08-inverted-laycan-rejected** — Cargo laycan end before start. **Date sanity filter rejects** with an inverted-laycan reason.
- **09-stale-vessel-position** — Vessel open-date >5 days before "today". Not filtered out, but **"stale position — confirm still open"** warning appears.
- **10-perfect-match** — Bagged fertilizer Karasu → Ravenna. MV ALERIA-1 (TR flag, geared, 5,200 DWT) open at Karasu 3 days before laycan. All filters ✓, readiness **ideal**, no sanctions, GOOD match.

If any of these come out differently, that's the most useful thing you can tell us.

---

## 8. How to report findings

For each issue, note:

1. **URL** — copy it from the address bar.
2. **What you expected.**
3. **What you saw.**
4. **Screenshot** if possible (one picture beats a paragraph).
5. **Severity**, your call:
   - **Showstopper** — would not use the product in this state.
   - **Polish** — ugly or confusing but not blocking.
   - **Business logic question** — you disagree with the AI's conclusion and want to discuss.

A short list in a note or email is perfect. No template needed.

---

## 9. End note

If you get stuck or see something strange, ping Vitali with the URL and a screenshot. Thank you for taking the time to review this.

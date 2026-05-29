# Design Decisions — Shipping Email Parsers

Intentional design choices that critics must NOT flag as bugs.

## D1 — Forwarded email: outer sender used for VESSEL_POSITION
For VESSEL_POSITION emails that are forwarded, `originalSender` = the FORWARDER (broker who circulated), NOT the inner shipowner. This is intentional — the forwarder is the trading counterparty.
Rationale: In dry-bulk market, vessel positions are circulated broker-to-broker. The immediate counterparty is the circulating broker, not the underlying shipowner.

## D2 — TCT_REQUEST is a separate category
Time-charter trip requests (keywords: TCT, delivery/redelivery ports, USD/day hire) are classified as TCT_REQUEST, NOT CARGO_INQUIRY. This is a distinct business workflow.

## D3 — VESSEL_CERTIFICATE is NOT VESSEL_POSITION
Emails containing P&I certificates, class certificates, insurance documents with vessel particulars are VESSEL_CERTIFICATE / DOCUMENT — NOT vessel position circulars. The vessel is the subject of the certificate, not an available vessel.

## D4 (UPDATED) — "2k dwcc spot" + "pls offer parcels for MV X" = VESSEL_POSITION
When the subject says "2k dwcc spot [port]" AND the body provides full vessel particulars (IMO, DWT, DWCC, LOA, built) and asks recipients to "offer parcels/cargo for MV X", this is VESSEL_POSITION — the vessel owner is seeking cargo, not a charterer seeking a vessel.
Rationale: Subject line is shorthand the market uses to position-post. The full body confirms the vessel is available and specs are listed. Compare with pure CARGO_INQUIRY (no vessel named, cargo specs only).
Exception: if the body says only "we need a vessel of 2k dwcc" with no specific vessel named → still CARGO_INQUIRY.

## D5 — RE: / FW: subject prefix does NOT change category
A subject starting "RE:" that contains cargo quantities and routes = CARGO_INQUIRY.
A subject starting "FW:" that is a vessel position circular = VESSEL_POSITION.
The prefix indicates threading, not content category.

## D6 — null for ports only when ZERO geographic reference
`origin_port = null` and `destination_port = null` only valid when the email contains ZERO geographic reference for that leg. If any region/country/port abbreviation exists, return a descriptive placeholder.

## D7 — `missingInfo` is a non-critical advisory field
Missing items in `missingInfo` array are MEDIUM severity at most. The array captures "would-be-useful" data gaps, not parse failures.

## D8 — "3.75 ttl" at end of cargo offer = 3.75% total commission
In a cargo inquiry formatted as port / cargo / quantity / laytime / commission, the final line "3.75 ttl" means 3.75% total commission (TTL = total, both ends). It is NOT a freight rate in USD/mt. Extracting it as `commission_percent=3.75, commission_terms="TTL"` is correct.
Context: "3.75 ttl" appears in the same position as "2.5% adc", "5% ADCOM", "3.75% ttl bends" — all commission formulas.
Do NOT flag as bug when the parser correctly places "3.75 ttl" in commission_percent.

## D9 — quantity is discrete unit count, weight_mt is tonnage
`quantity` in parse-cargo is for DISCRETE units only (pieces, bags, containers, tanks). It is NEVER the cargo weight in MT.
- "4000mt bulk" → weight_mt=4000, quantity=null (no discrete unit count)
- "14 pcs storage tanks" → quantity=14, weight_mt derived from total weight if stated
- "GRAIN/BALE 3000/2950 CBM" (vessel capacity field) → vessel capacity, NOT cargo quantity
Do NOT flag `quantity=null` for bulk/weight-only cargoes as a bug — per D9, it is correct.

## D10 — Fixture recap subject "VESSEL, LOAD / DISCH, RECAP" establishes discharge port
In fixture recap subjects formatted as "MV NAME, LOADPORT / DISCHPORT, RECAP OF AGREED TERMS" (e.g. "MV NORTHSTAR GLORY, FDF / ALEX, RECAP OF AGREED TERMS"), the "/" separator means LOAD PORT / DISCHARGE PORT. "ALEX" = Alexandria (disch_port with confidence='interpreted' since body does not repeat it).
This is standard market recap-subject notation. Extracting disch_port="Alexandria" from subject "FDF / ALEX" with confidence='interpreted' is CORRECT — do NOT flag as bug.
Exception: a subject ending in "// [PORT] TERMS" names a charter party TERMS TEMPLATE (not a port).

## D11 — CLIENT_REPLY for pure sub-lift notifications
"Owners subs are lifted" (or "Owners confirm subs lifted") in response to a fixture recap = CLIENT_REPLY, NOT FIXTURE_RECAP. Per classify prompt rule: when the body contains only a subs-lifted acknowledgement with no new commercial clauses → CLIENT_REPLY. The fact that attached or quoted recap content is present does not change the classification — it's the REPLY nature that determines it.

## D12 — cargo_type=BULK for salt/grain/ore regardless of big-bag packaging
Commercially traded dry bulk commodities (salt, grain, coal, ore, fertilizer, clinker, phosphate) are classified as cargo_type=BULK even when shipped in big-bags (BB). In dry-bulk chartering, the commercial category reflects the loading method (grabs/conveyors), not the bag material.
- "salt in big-bags" → BULK ✓
- "grain in bags" → BULK ✓
- "barite in big bags with specific dimensions and tier limits" → BREAK_BULK ✓ (specialty mineral with unitized handling requirements)
Do NOT flag cargo_type=BULK for salt in big-bags as a bug — it is by design.

## D13 — vessel_flag = null when not explicitly stated
vessel_flag in parse_recap must be explicitly stated in the email body (e.g., "PANAMA FLAG", "Vanuatu flag"). DO NOT infer flag from company corporate suffix (NV ≠ Netherlands; GmbH ≠ Germany; Ltd ≠ UK). When flag is not stated → vessel_flag = null.
Do NOT flag vessel_flag=null as a bug when the flag is genuinely absent from the email.

## D14 — "chrtrs full terms a/e as fllws for X mins" = VESSEL_POSITION (not FIXTURE_RECAP)
When an email says "charterers' full terms as expected/agreed, as follows, for X minutes/hours" with vessel specs, this is a TIME-LIMITED CHARTER OFFER — the deal is NOT concluded. VESSEL_POSITION classification is correct. The "for X mins" deadline is an offer/counter-offer window, not a fixture confirmation.
Only after both parties confirm → FIXTURE_RECAP. An offer for acceptance is still VESSEL_POSITION.

## D15 — Internal forwarding: inner FROM overrides D1 for same-domain outer FROM
When a VESSEL_POSITION email is forwarded internally (outer FROM and To/Cc share the same company domain), the INNER email's FROM is the trading counterparty, not the internal relay. D1's "forwarder = trading counterparty" applies to EXTERNAL forwarders only.
Example: outer FROM "management@etm-services.net", To "chartering@etm-services.net" (same domain) → use inner FROM "Varan Shipping <operation@varanshipping.com>" as original_sender.

## D17 — BOX/SID hold: bale_capacity = grain_capacity (combined notation)
For vessels with BOX-shaped or SID (Single Integral Double-bottom) holds, grain and bale capacities are identical because the flat floor has no bilge waste. When an email uses combined "grain/bale X cbft" notation, both grain_capacity and bale_capacity must be set to X (same value). Do NOT flag bale_capacity=grain_capacity as fabrication for BOX/SID holds — it is physically correct.
Rationale: In BOX/SID holds there is no bilge void between the floor and the ship's shell plating. Standard holds have bilge corners that create dead space (bale < grain). BOX holds eliminate this — hence both measurements are the same.
Code-level: B8 in geared-fallback.ts mirrors this for the case where LLM populated only grainCapacity.

## D16 — Harness always runs all 4 parsers on every email
The progong harness runs classify, parse_cargo, parse_vessel, and parse_recap on EVERY corpus email regardless of the email's classified type. This is intentional for broad regression testing coverage. In production, routing runs only the relevant parser for the classified type.
Consequence: parse_cargo and parse_recap outputs for VESSEL_POSITION emails (and parse_vessel output for CARGO_INQUIRY emails) are expected to be empty or low-quality — the email doesn't contain data those parsers need. Do NOT flag empty or minimal parse_cargo/parse_vessel/parse_recap output as a bug when the email type doesn't match the parser domain.
Example: VESSEL_POSITION email → parse_cargo may return 1 spurious item with minimal data — expected, NOT a bug. Only flag if the output is confidently wrong or contains hallucinated data.

# Schema Gaps

Fields that critics may notice are missing from the output schema — intentional limitations.

## G1 — No `freight_rate` in CARGO_INQUIRY parser output
The cargo parser captures `freightRateUsd` (optional) but NOT negotiation history or counter-offers. Multi-round negotiation context is outside the single-email parsing scope.

## G2 — No full laycan date in vessel-position
`openDate` captures vessel open/available date. There is no `openDateEnd` range field. A range like "open 15-20 May" maps to `openDate.value = "15-20 May 2025"` as a string — not split into start/end timestamps.

## G3 — No `bunker_price` field in fixture recap
Bunker cost and BSS adjustment clauses are not extracted. These require negotiated fixture context beyond single-email scope.

## G4 — No attachment content parsing
Email attachments (PDFs, Excel) are not processed. Only email body text is parsed. Missing attachment data → `missingInfo` entries, not parse failures.

## G5 — No PARSE_TCT for TCT_REQUEST emails
TCT_REQUEST is a classified category but has no dedicated parser. Fields like hire_rate (USD/day), delivery_port, redelivery_range, charter_duration, vessel_type_requirement are not extracted. Critics must NOT flag missing TCT extraction as a prompt bug — it is an intentional schema gap. Classifier correctly labels TCT_REQUEST; downstream handling is a product roadmap item.

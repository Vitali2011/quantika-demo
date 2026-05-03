import { SHIPPING_GLOSSARY } from './glossary';

export const FIXTURE_RECAP_PARSER_PROMPT = `You are a chartering fixture recap parser. You understand charter party terminology, GENCON 94, BIMCO terms, and standard fixture recap structure. This is a legally significant document — accuracy is critical.

${SHIPPING_GLOSSARY}

CONFIDENCE LEVELS AND MANDATORY SOURCE QUOTING:
- "confirmed": explicitly stated — MUST include source_text
- "interpreted": inferred from context or standard practice — MUST include source_text
- "uncertain": possible interpretation — MUST include source_text if any text supports it

CRITICAL: source_text is REQUIRED for every ConfidenceField. It MUST be a verbatim
substring copied character-for-character from the email body. Omitting source_text is
a parsing error. Paraphrasing is NOT allowed — copy the exact characters.

CORRECT:   { "value": "Rotterdam", "confidence": "confirmed", "source_text": "Load: Rotterdam" }
CORRECT:   { "value": 5000, "confidence": "interpreted", "source_text": "abt 5k mts wheat" }
WRONG:     { "value": "Rotterdam", "confidence": "confirmed" }          ← missing source_text
WRONG:     { "value": 5000, "confidence": "confirmed", "source_text": "approximately 5000 metric tons" } ← paraphrased

Each field: { value: ..., confidence: "confirmed" | "interpreted" | "uncertain", source_text: "exact quote" }
If a field is set to null (information not present), source_text is not needed.

PORT NAME RULE: Extract ONLY the port name — do NOT include berth/safety conditions.
"1 safe berth, Sharjah, UAE" → load_port = "Sharjah, UAE" (strip "1 safe berth")
"1 sb sp aaaa, Rotterdam" → load_port = "Rotterdam" (strip all berth conditions)
Berth conditions like "1 safe berth", "1 sb", "sp aaaa", "AAAA" belong in additional_terms or are silently stripped. They are NOT part of the port name.

BROKER FIELD: broker is a PLAIN STRING — do NOT wrap in ConfidenceField. Example:
CORRECT: "broker": "Gulf Maritime Brokers LLC, Dubai"
WRONG:   "broker": { "value": "...", "confidence": "confirmed", "source_text": "..." }

NOR TERMS: Clauses like "WIPON WIBON WIFPON WICCON" and similar NOR tendering conditions must be captured in additional_terms (as a verbatim string from the email) or in unknown_terms if their operational meaning is flagged as uncertain. Do NOT silently discard these clauses.

SPLIT LAYTIME: Extract loading and discharging terms separately:
- loading_rate: MT/day or similar
- loading_terms: SHINC / SHEX / SSHEX / SSHINC etc.
- loading_working_hours: if specified (e.g. "0800-1700 Mon-Fri")
- discharging_rate: MT/day or similar
- discharging_terms: SHINC / SHEX / SSHEX / SSHINC etc.
- discharging_working_hours: if specified

ACCOUNT vs CHARTERERS:
- charterers: the party who chartered the vessel (may be a trading company)
- account: the actual shipper/cargo owner ("for account of [X]") — separate field

COMMISSION CALCULATION:
- commission_percent: extract numeric percentage
- commission_base: what it applies to (usually "freight" or "total freight")
- commission_amount: calculate = (freight_rate x cargo_quantity x commission_percent / 100) if calculable, else null
- commission_currency: currency of commission amount
- commission: full original commission clause text

UNKNOWN TERMS:
- unknown_terms: array of { term, context } for any abbreviations or clauses not recognized

SUBJECT/BODY DATE CROSS-CHECK: When the email subject line contains a date (e.g. "8-12 JUN 2025") and the email body contains a different date for the same field (e.g. "LAYCAN: 8/12 June 2026"), this is a CONFLICT. Set the field value from the body (the body is the authoritative legal document) and set confidence='confirmed' if the body value is unambiguous. Document the discrepancy in unknown_terms: { "term": "DATE_CONFLICT", "context": "Subject says [X], body says [Y] — body value used" }. Only downgrade to confidence='uncertain' if the BODY TEXT ITSELF is ambiguous or contradictory, not merely because the subject disagrees.

Extract fields:
- vessel_name
- vessel_yob: year of build (integer, if stated in the recap)
- vessel_flag: flag state (if stated)
- owners: shipowner or disponent owner
- charterers
- account: cargo account / actual shipper if different from charterers
- broker: broker(s) involved
- load_port
- disch_port
- cargo_description
- cargo_quantity_min: minimum quantity (MT or units)
- cargo_quantity_max: maximum quantity
- cargo_packaging: e.g. "in bags", "bulk", "on pallets"
- laycan: laycan window
- transit_time: estimated transit
- freight_rate: rate per unit or lump
- freight_basis: e.g. FIOST, FIO, liner terms
- freight_payment: e.g. "90% on signing BS/L, balance on right/true delivery"
- loading_rate, loading_terms, loading_working_hours
- discharging_rate, discharging_terms, discharging_working_hours
- demurrage_rate: per day rate
- demurrage_payment: who pays, when
- despatch_rate: if stated (complement of demurrage; e.g. "USD 2,250 per day / pro rata")
- load_port_agent
- disch_port_agent
- vessel_dwt
- vessel_draft
- vessel_geared: boolean
- cp_form: charter party form used (e.g. GENCON 94, NYPE 93)
- arbitration: arbitration clause
- law: governing law
- commission: full commission clause text
- commission_percent
- commission_base
- commission_amount
- commission_currency
- subs: array of subjects/conditions outstanding. SUBS DEADLINE ARITHMETIC: If a subs clause states a deadline as "X hours from [event/date]", verify the arithmetic and include the computed absolute deadline in the array entry (e.g. "Subs: 48hrs from midnight 3 May 2026 = 5 May 2026 00:00 UTC"). If there is a discrepancy between the stated deadline and the computed deadline (e.g. email says '6 May' but 48hrs from midnight 3 May = 5 May), flag this as a SUBS_DEADLINE_CONFLICT in unknown_terms.
- acknowledgement_deadline: if the recap requires a written acknowledgement by a specific time (e.g. "please acknowledge within 12 hours", "confirm receipt by EOD"), capture that deadline as a string here. This is operationally critical — missing an ack deadline can jeopardise the fixture.
- confidentiality: boolean (true if marked private/confidential)
- additional_terms: array of any other clauses
- unknown_terms: array of { term, context }

Output: JSON object with all fields above.`;

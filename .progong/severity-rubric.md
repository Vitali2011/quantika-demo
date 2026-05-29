# Severity Rubric — Shipping Email Parser Adversarial QA

Domain: dry-bulk/breakbulk freight chartering (Black Sea, Mediterranean, Baltic)
Prompts: classify, parse-cargo, parse-vessel, parse-recap

---

## CRITICAL (automatic FAIL — prompt must be fixed)

- Wrong top-level category (e.g. CARGO_INQUIRY returned for VESSEL_POSITION email)
- Vessel name / cargo description completely wrong or fabricated
- Weight/tonnage off by >10% from stated value
- Port name factually wrong (e.g. Alexandria returned for Odessa)
- Null returned for a field where the value is explicitly stated in the email text
- Items=[] returned when the email is clearly a vessel position or cargo inquiry
- Multiple vessels in email but only 1 item extracted (missing vessels)
- Certificate/document email processed as vessel position or cargo inquiry (should be items=[])
- `laycan` / open_date swapped between origin and destination
- Fixture recap critical party (owner/charterer) completely wrong or swapped

## HIGH (FAIL if any present — needs fix this round)

- `urgency` wrong tier by 2+ levels (e.g. 'low' for active laycan within 7 days)
- DWT or DWCC off by >5% from stated value
- Commission percentage extracted from wrong field
- Port name correct region but wrong city (e.g. "Mediterranean" when specific port is stated)
- `isUnanswered` wrong (email is clearly answered/contains reply)
- Literal string `"null"` returned instead of JSON null (Gemini quirk)
- Category = DOCUMENT when email is clearly cargo inquiry (cert mentioned but not primary content)
- `originalSender` extracted from domain instead of signature block
- Load rate / discharge rate values swapped

## MEDIUM (log to backlog — not exit-blocker)

- `urgency` off by 1 tier (e.g. 'medium' vs 'high' on borderline laycan)
- Minor port name variation (e.g. "Yuzhne" vs "Pivdennyi (Yuzhne)")
- Confidence label over-marked "confirmed" on hedged language
- Commission terms format slightly wrong (minor variation, value correct)
- `originalSenderCompany` from email domain rather than signature (when signature exists)
- `missingInfo` array missing an obvious gap

## LOW (note only)

- Formatting/spacing variations in extracted strings
- Optional field missing when it genuinely can't be inferred
- Enum synonym substitution when meaning is clear
- Minor date format variation (DD/MM vs MM/DD when unambiguous)

---

## Gemini-specific additions

- **HIGH**: literal `"null"` string instead of JSON null (C.6 / D.6 provider quirk)
- **MEDIUM**: enum value replaced with non-listed synonym (D.6)
- **Note (not severity)**: RECITATION block, safety-filter blank, thinking-token leak → log to gemini-quirks.md, don't score as parse failure

# Gemini Quirks Observed

Provider-level Gemini artefacts encountered during the loop — NOT prompt bugs.

## Artefact 1: NULL_STRING

**What happens**: When the prompt instructs Gemini to return `null` for a ConfidenceField field (e.g., `despatch_rate = null` for Free Despatch, `vessel_flag = null` when unknown), Gemini instead wraps the string `"null"` in a ConfidenceField object:
```json
{"value": "null", "confidence": "interpreted", "source_text": ""}
```
instead of plain `null`.

**Code-level fix**: Post-process all ConfidenceField values — if `value === "null"` (the string), replace the entire ConfidenceField with `null`. Applied in `scripts/progong-harness.ts` (eval) and `lib/parsing/parse-vessel-helpers.ts` (production).

**Observed in**: FIXTURE_RECAP/Humbold Bay (`despatch_rate.value="null"`, `vessel_flag.value="null"`); VESSEL_POSITION/MV STAD (~12 fields); FIXTURE_RECAP/NORTHSTAR GLORY (~10 fields).

---

## Artefact 2: ZERO_NUMERIC

**What happens**: When a numeric ConfidenceField is absent from the email, Gemini returns `{value: 0, confidence: "uncertain", source_text: ""}` instead of `null`. Value `0` is semantically wrong for vessel dimensions (LOA, beam, draft_max).

**Code-level fix**: Post-process numeric vessel dimension ConfidenceFields — if `value === 0` AND `source_text === ""`, replace with `null`. Applied to fields: `loa`, `beam`, `draft_max`, `grt`, `nrt`, `grain_capacity`, `bale_capacity`, `dwt_summer`, `dwcc`.

**Observed in**: VESSEL_POSITION/Ocean7 (`beam/loa/draft_max` for 3 of 4 vessels with no dimension specs stated in email).

---

## Artefact 3: BUILT_FROM_DATE

**What happens**: Despite explicit prompt guard ("NEVER extract built year from email dates"), Gemini extracts the vessel build year from the email circulation date or subject-line date when it is the only year-like value in context. The guard is ineffective when the only year present in the email text is the email send date (e.g., "21 May 2025").

**Code-level fix**: Post-process `built` — if `source_text` contains a calendar month name (Jan–Dec) without an explicit "BLT"/"built"/"YOB" keyword, set `built = null`. Day-month patterns ("21 May", "23-26 FEB") in `source_text` reliably indicate a date reference, not a construction year label.

**Observed in**: VESSEL_POSITION/Ocean7 (`built=2025` for all 4 vessels from "21 May 2025" email date); CLIENT_REPLY/Everest Bay (`built=2021` from "LAYCAN: 23-26 FEB 2021").

---

---

## Artefact 4: SQM_AS_DIMENSION

**What happens**: When vessel specs include deck area in square meters (e.g., "2900sqm", "3700 sqm"), Gemini assigns these as `loa`, `beam`, AND `draft_max` simultaneously — using the same sqm value for all three linear dimension fields. The prompt guard ("NEVER assign sqm to loa or beam") is ineffective for Gemini.

**Code-level fix**: Post-process `loa`, `beam`, `draft_max` — if `source_text` contains "sqm", "sq.m", or "cm" (centimeters from cargo bag dimensions like "110X110X65 CM"), replace with `null`. Also catches THREE_DIM patterns (`NxNxN`) which indicate bag package dimensions.

**Observed in**: VESSEL_POSITION/Ocean7 (all 4 vessels: loa/beam/draft_max = 2900/3700/5000/4300 from deck area sqm values); EDGE_CASES/Everest Bay (loa/beam = 1.1 from "ABT 110X110X65 CM" cargo big-bag dimensions).

---

## Artefact 5: BUILT_FROM_LAYCAN_EMPTY_SOURCE

**What happens**: In fixture recaps, Gemini extracts `vessel_yob` from the LAYCAN year when no build year is stated, returning `{value: <laycan_year>, confidence: "uncertain", source_text: ""}` with an empty source_text.

**Code-level fix**: Post-process `vessel_yob` in recap normalizer — if `source_text` is empty string AND no BLT/built/YOB keyword in source → `vessel_yob = null`.

**Observed in**: FIXTURE_RECAP/Humbold Bay (`vessel_yob={value:2018, source_text:""}` from LAYCAN: 13-15 AUGUST 2018).

---

## Pattern: Prompt guards for built year have ~30% success rate

Tested over 3 rounds with increasingly explicit guards including counter-examples. Gemini's year-extraction heuristic is robust enough that prompt instructions alone cannot override it when the only year in the email is the circulation date. Code-level normalizer is the reliable solution.

---

## Artefact 6: CBM_AS_DRAFT

**What happens**: When vessel specs include grain/hold capacity in cubic meters (CBM) but no explicit draft is stated, Gemini assigns the CBM capacity value to `draft_max` — making `draft_max = grain_capacity_cbm` (e.g., 9600 CBM becomes `draft_max=9600`).

**Code-level fix**: Extend the SQM/CM guard for `loa`, `beam`, `draft_max` to also null when `source_text` contains "cbm". CBM is a volume unit — it can never be a valid `draft_max` in metres. Applied in `scripts/progong-harness.ts` (eval) and `lib/parsing/parse-vessel-helpers.ts` (production).

**Observed in**: VESSEL_POSITION/Ocean7 (all 4 MPP vessels: draft_max = 9600/14700/18700/14900 from "9600cbm"/"14700cbm"/"18700 cbm"/"14900cbm" grain capacity values).

**Sub-artefact — SPEED_AS_DRAFT**: When no explicit draft and only speed is available, Gemini also assigns speed values to `draft_max` (e.g. `draft_max=13` from `source_text="13 knts"`). Guard extended to also null when source_text contains knot-unit keywords (kn/knts/knots/kts). Observed in VESSEL_POSITION/Ocean7 PANTHERA J.

---

---

## Artefact 7: IMO_ANNOTATION_DROPPED

**What happens**: After adding IMDG/MARPOL disambiguation rules to the prompt, Gemini began returning `special_features=[]` for vessels that have "Suitable for imo 1.1 cargoes" or "IMO 1.1 & App B Fitted" in their specs. The disambiguation logic apparently conflicts with Gemini's decision to populate special_features, causing it to default to an empty array rather than risk misclassifying the notation.

**Code-level fix**: Post-process `specialFeatures` (production) and `special_features` (harness) using the email body: regex-scan for "imo X.X" pattern and "App B" → add IMDG annotation if not already present. Applied in `lib/parsing/geared-fallback.ts` (applyGearedFallback B4) and `scripts/progong-harness.ts` (addImoAnnotationFromBody).

**Observed in**: VESSEL_POSITION/HASKAL (R5, R6, R7 all return `special_features=[]` despite "Suitable for imo 1.1 cargoes" in email). Three consecutive prompt-only attempts failed.

---

## Pattern: Sqm→dimension cross-contamination resists all prompt guards

Tested over 3 rounds. Despite guards like "NEVER assign sqm to loa or beam", Gemini consistently uses sqm deck area values as loa/beam/draft_max when no explicit linear dimensions are stated. The prompt guard alone cannot override the model's dimensional inference heuristic. Code-level normalizer on source_text is the reliable solution.

---

## Artefact 8: CHARTERERS_ROLE_NOUN

**What happens**: In fixture recaps that contain "IN CHRTRS OPTION" or "CHARTERERS ACCOUNT" clauses, Gemini extracts the generic role word "Charterers" (or "chrtrs") as the `charterers` party name, despite explicit prompt rules saying role-nouns in boilerplate clauses are NOT party names.

**Code-level fix**: Post-process `charterers` in recap normalizer — if `value.trim().toLowerCase() === "charterers"` or `=== "chrtrs"`, replace with `null`. Applied in `scripts/progong-harness.ts` (normalizeRecapItem).

**Observed in**: FIXTURE_RECAP/NORTHSTAR GLORY (R9, R10, R11 all return `charterers={value:"Charterers", source_text:"CHRTRS"}` from "IN CHRTRS OPTION TO TRANSMIT THE FREIGHT" clause). Three consecutive prompt-only attempts failed.

---

## A1 Variant: EMPTY_STRING_CONFIDENCEFIELD

**What happens**: When a numeric or string field has no data in the email, Gemini sometimes returns `{value: "", confidence: "uncertain", source_text: ""}` (empty string) instead of `null`. This is a variant of Artefact 1 (NULL_STRING) but with an empty string value rather than the literal "null".

**Code-level fix**: Extended `fixNullString` to also null-out ConfidenceFields where `value === ""` AND `source_text === ""`. The combination of both being empty is the reliable indicator (an empty value with non-empty source could still be meaningful).

**Observed in**: FIXTURE_RECAP/NORTHSTAR GLORY (R11: `demurrage_rate`, `despatch_rate`, `freight_rate`, `laycan`, `loading_rate`, `discharging_rate` all return `{value:"", confidence:"uncertain", source_text:""}`).

---

## Artefact 9: NOT_SPECIFIED_STRING

**What happens**: When a ConfidenceField has no data in the email, Gemini sometimes returns `{value: "Not specified", confidence: "uncertain", source_text: ""}` instead of plain `null`. Despite prompt rules saying "NEVER use the literal string 'Not specified'", this appears when Gemini has no data but the `responseSchema` type requires a string. Fields affected: `demurrage_rate`, `despatch_rate`, `freight_rate`, `loading_working_hours`, `discharging_working_hours` in FIXTURE_RECAP.

**Code-level fix**: Extended `fixNullString` in `scripts/progong-harness.ts` to also null-out ConfidenceFields where `value.trim().toLowerCase() === "not specified"`. Code-level normalization is reliable; prompt alone is insufficient for this artefact.

**Observed in**: EDGE_CASES/Everest Bay CLIENT_REPLY (R13: `demurrage_rate`, `despatch_rate`, `freight_rate`, `loading_working_hours`, `discharging_working_hours` all return `{value:"Not specified", source_text:""}`).

---

## B1 Variant: GEARLESS_WINDOW_TOO_SMALL

**What happens**: The B1 gearless detection uses `vesselFragment()` to extract a 500-char window around the vessel name. In pipe-compact multi-vessel emails (like Ocean7 fleet circulars), "Gearless" keyword may appear more than 500 chars from the vessel name header, causing B1 to miss it.

**Code-level fix**: Extended vesselFragment window from 500 to 1000 chars in `geared-fallback.ts`. Also: harness now calls `applyGearedFallback` (it previously only called `normalizeVesselItem` + `addImoAnnotationFromBody`, missing B1–B3 production fixes entirely).

**Observed in**: VESSEL_POSITION/Ocean7 HC EVA-MARIE (R11: geared=true despite "Gearless" in spec block).

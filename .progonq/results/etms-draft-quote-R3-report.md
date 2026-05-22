# draft-quote eval — round R3

**Scenarios:** 6
**Generated:** 2026-05-22T08:11:03.665Z

## Overall

PASS: 6 | WARN: 0 | FAIL: 0

## Summary by category

| Category | Scenarios | Pass checks | Warn | Fail |
|---|---|---|---|---|
| standard | 2 | 29 | 0 | 0 |
| arabic-language | 1 | 18 | 0 | 0 |
| lumpsum-instead-of-per-mt | 1 | 13 | 0 | 0 |
| with-extra-clauses | 1 | 14 | 0 | 0 |
| hallucination-trap | 1 | 29 | 0 | 0 |

## Per-scenario detail

### etms-draft-quote-001 — PASS

**Category:** standard | **Language:** en | **Duration:** 6175ms

**Checks:** 14P 0W 0F

- ✓ Section "Subject" detected
- ✓ Section "Greeting" detected
- ✓ Section "Terms" detected
- ✓ Section "Closing" detected
- Facts cited: 3/3

**Output excerpt:**
```
Subject: Offer: 10,400 MT HRC, Karasu, Turkey to Puerto Limon, Costa Rica

Dear Marina Capelli,

Thank you for your inquiry. We are pleased to offer the following for your Hot Rolled Coils cargo:

Vessel: MV PETRA, Handysize Bulk Carrier, geared (3 x 25T cranes, DWCC 13,850 MT).
Route: Karasu, Turkey to Puerto Limon, Costa Rica.
Cargo: 10,400 MT Hot Rolled Coils (max 20.00 MT/piece).
Laycan: June ...
```

### etms-draft-quote-002 — PASS

**Category:** arabic-language | **Language:** ar | **Duration:** 9060ms

**Checks:** 18P 0W 0F

- ✓ Section "Subject" detected
- ✓ Section "Greeting" detected
- ✓ Section "Terms" detected
- ✓ Section "Closing" detected
- Facts cited: 5/5

**Output excerpt:**
```
Subject: عرض شحن: حبوب قمح سائبة - الإسكندرية (Alexandria) إلى جدة (Jeddah)

عزيزي أحمد الرشيدي،

يسرنا أن نقدم لكم عرض الشحن التالي لشحنتكم من الإسكندرية (Alexandria) إلى جدة (Jeddah).

السفينة المقترحة: MV AL-NOUR، ناقلة بضائع سائبة (HANDYSIZE BULK CARRIER)، مجهزة برافعتين (2 x 30T).
الوجهة: الإسكندرية (Alexandria)، مصر إلى جدة (Jeddah)، المملكة العربية السعودية.
البضاعة: 8,500 طن متري من حبوب ا...
```

### etms-draft-quote-003 — PASS

**Category:** lumpsum-instead-of-per-mt | **Language:** en | **Duration:** 5818ms

**Checks:** 13P 0W 0F

- ✓ Section "Subject" detected
- ✓ Section "Greeting" detected
- ✓ Section "Terms" detected
- ✓ Section "Closing" detected
- Facts cited: 3/3

**Output excerpt:**
```
Subject: Freight Quote: Project Cargo from Marmara, Turkey to Vera Cruz, Mexico

Dear Serkan Varan,

Thank you for your inquiry. We are pleased to offer the following freight quote for your project cargo.

Route: Marmara, Turkey to Vera Cruz, Mexico.
Cargo: 14 pieces of Storage Tanks (186 MT / 2120 CBM), including 10x 160m3 and 4x 80m3 tanks. On-deck stowage is acceptable.
Vessel: MV HELIOS, a GEN...
```

### etms-draft-quote-004 — PASS

**Category:** with-extra-clauses | **Language:** en | **Duration:** 14144ms

**Checks:** 14P 0W 0F

- ✓ Section "Subject" detected
- ✓ Section "Greeting" detected
- ✓ Section "Terms" detected
- ✓ Section "Closing" detected
- Facts cited: 4/4

**Output excerpt:**
```
Subject: Freight Quote: Novorossiysk, Russia to Istanbul, Turkey - Steam Coal

Dear Dmitri Volkov,

Thank you for your inquiry. We are pleased to offer the following freight quotation:

Vessel: MV BLACK SEA STAR, SUPRAMAX BULK CARRIER (IG P&I Gard, geared).
Route: Novorossiysk, Russia to Istanbul, Turkey.
Cargo: Approx. 25,000 MT Steam coal (Russian origin, min/max 24,000/26,000 MT).
Laycan: 01/15...
```

### etms-draft-quote-005 — PASS

**Category:** standard | **Language:** en | **Duration:** 12942ms

**Checks:** 15P 0W 0F

- ✓ Section "Subject" detected
- ✓ Section "Greeting" detected
- ✓ Section "Terms" detected
- ✓ Section "Closing" detected
- Facts cited: 4/4

**Output excerpt:**
```
Subject: Quote: Teignmouth, UK to Alexandria, Egypt / 3,000 MT China Clay

Dear Elif Kisabacak,

Thank you for your cargo inquiry. We offer the following for 3,000 MT China Clay in bulk from Teignmouth, UK to الإسكندرية (Alexandria), Egypt, laycan 25/28 July 2026:

Vessel: MV STAD (General Cargo, Gearless), DWT 3222 / DWCC 3050. Open Teignmouth, 25 July 2026.
Freight Rate: USD 28.50 per metric ton...
```

### etms-draft-quote-006 — PASS

**Category:** hallucination-trap | **Language:** en | **Duration:** 8304ms

**Checks:** 29P 0W 0F

- ✓ Section "Subject" detected
- ✓ Section "Greeting" detected
- ✓ Section "Terms" detected
- ✓ Section "Closing" detected
- Facts cited: 3/3

**Output excerpt:**
```
Subject: Freight Quote: Piraeus to Tunis for Bagged NPK Fertilizer

Dear Nikos Papadopoulos,

Thank you for your inquiry. We offer the following for your cargo from Piraeus, Greece to Tunis, Tunisia:

Vessel: MV IONIKOS, a Handysize Multi-purpose vessel (8500 DWT, 8250 DWCC), geared with 2 x 20T cranes. Position Piraeus, ETA July 28, 2026.
Cargo: 5200 MT (5000-5500 MT range) Bagged NPK fertilizer,...
```

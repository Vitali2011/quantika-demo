# draft-quote eval — round R0

**Scenarios:** 6
**Generated:** 2026-05-19T14:36:16.579Z

## Overall

PASS: 0 | WARN: 0 | FAIL: 6

## Summary by category

| Category | Scenarios | Pass checks | Warn | Fail |
|---|---|---|---|---|
| standard | 2 | 24 | 2 | 3 |
| arabic-language | 1 | 9 | 1 | 3 |
| lumpsum-instead-of-per-mt | 1 | 10 | 1 | 2 |
| with-extra-clauses | 1 | 12 | 1 | 1 |
| hallucination-trap | 1 | 16 | 1 | 1 |

## Per-scenario detail

### etms-draft-quote-001 — FAIL

**Category:** standard | **Language:** en | **Duration:** 8336ms

**Checks:** 12P 1W 1F

- ✗ Section "Subject" not found in output
- ✓ Section "Greeting" detected
- ✓ Section "Terms" detected
- ✓ Section "Closing" detected
- Facts cited: 3/3
- ⚠ Length too long: 31 lines (expected 5–15)

**Output excerpt:**
```
Dear Marina Capelli,

Thank you for your inquiry regarding the shipment of Hot Rolled Coils.

We are pleased to provide you with the following freight quote based on the details provided:

Route:
Origin: Karasu, Turkey
Destination: Puerto Limon, Costa Rica

Vessel Details:
Vessel Name: MV PETRA (Handysize Bulk Carrier)
Built: 2007
DWT: 14,200 MT
DWCC: 13,850 MT
Cranes: 3 x 25T deck cranes

Cargo D...
```

### etms-draft-quote-002 — FAIL

**Category:** arabic-language | **Language:** ar | **Duration:** 12434ms

**Checks:** 9P 1W 3F

- ✗ Section "Subject" not found in output
- ✓ Section "Greeting" detected
- ✓ Section "Terms" detected
- ✓ Section "Closing" detected
- ✗ FACT MISSING: "18.00" NOT found in output
- ✗ FACT MISSING: "Alexandria" NOT found in output
- Facts cited: 1/3
- ⚠ Length too long: 34 lines (expected 5–15)

**Output excerpt:**
```
عزيزي أحمد الرشيدي،

يسعدنا أن نقدم لكم عرض سعر شحن بخصوص استفساركم لشحنة الحبوب.

تفاصيل المسار والشحنة:
السلعة: قمح سائب
الكمية: 8,500 طن متري (الحد الأدنى 8,000 طن متري، الحد الأقصى 9,000 طن متري)
شروط الإنكوترمز: CIF
ميناء التحميل: الإسكندرية، مصر
ميناء التفريغ: جدة، المملكة العربية السعودية
فترة التحميل/الإلغاء (Laycan): 15 - 25 يونيو 2026
معدل التحميل: 3,000 طن متري يومياً
معدل التفريغ: 2,00...
```

### etms-draft-quote-003 — FAIL

**Category:** lumpsum-instead-of-per-mt | **Language:** en | **Duration:** 7975ms

**Checks:** 10P 1W 2F

- ✗ Section "Subject" not found in output
- ✓ Section "Greeting" detected
- ✓ Section "Terms" detected
- ✓ Section "Closing" detected
- ✗ FACT MISSING: "42,000" NOT found in output
- Facts cited: 2/3
- ⚠ Length too long: 35 lines (expected 5–15)

**Output excerpt:**
```
Dear Serkan Varan,

Thank you for your inquiry regarding the shipment of your project cargo.

We are pleased to provide the following preliminary freight quotation for the carriage of your storage tanks from Marmara, Turkey to Vera Cruz, Mexico.

Route:
Origin: Marmara, Turkey
Destination: Vera Cruz, Mexico

Cargo Details:
Commodity: 14 pieces of Storage Tanks (10 x 160m3 VT Storage Tanks, 4 x 80m...
```

### etms-draft-quote-004 — FAIL

**Category:** with-extra-clauses | **Language:** en | **Duration:** 8789ms

**Checks:** 12P 1W 1F

- ✓ Section "Subject" detected
- ✓ Section "Greeting" detected
- ✓ Section "Terms" detected
- ✓ Section "Closing" detected
- ✗ FACT MISSING: "22.50" NOT found in output
- Facts cited: 3/4
- ⚠ Length too long: 34 lines (expected 5–15)

**Output excerpt:**
```
Subject: Freight Quote Inquiry - Novorossiysk to Istanbul - Steam Coal - MV BLACK SEA STAR

Dear Dmitri Volkov,

Thank you for your freight inquiry. We are pleased to offer a quote for the carriage of your cargo.

Based on the details provided, we propose the following:

Route: Novorossiysk, Russia to Istanbul, Turkey
Cargo: Steam coal in bulk, Russian origin
Quantity: 25,000 metric tons (24,000-2...
```

### etms-draft-quote-005 — FAIL

**Category:** standard | **Language:** en | **Duration:** 7856ms

**Checks:** 12P 1W 2F

- ✓ Section "Subject" detected
- ✓ Section "Greeting" detected
- ✓ Section "Terms" detected
- ✓ Section "Closing" detected
- ✗ FACT MISSING: "28.50" NOT found in output
- Facts cited: 3/4
- ✗ CURRENCY: Currency mixing: non-USD currency amount found in output
- ⚠ Length too long: 27 lines (expected 5–15)

**Output excerpt:**
```
Subject: Freight Quote for China Clay - Teignmouth to Alexandria

Dear Elif Kisabacak,

Thank you for your freight inquiry.

We are pleased to offer the following quote for the shipment of China Clay:

Route: Teignmouth, United Kingdom to Alexandria, Egypt
Cargo: China Clay in bulk (STW/DWT)
Quantity: 3,000 MT
Cargo Type: BULK
Laycan: 25–28 July 2026

Vessel Recommendation:
We recommend the MV STA...
```

### etms-draft-quote-006 — FAIL

**Category:** hallucination-trap | **Language:** en | **Duration:** 6573ms

**Checks:** 16P 1W 1F

- ✗ Section "Subject" not found in output
- ✓ Section "Greeting" detected
- ✓ Section "Terms" detected
- ✓ Section "Closing" detected
- Facts cited: 3/3
- ⚠ Length too long: 21 lines (expected 5–15)

**Output excerpt:**
```
Dear Nikos Papadopoulos,

Thank you for your inquiry. We are pleased to provide an indicative freight quote for your cargo movement from Piraeus, Greece to Tunis, Tunisia, based on the information provided.

Cargo Details:
  Commodity: Bagged NPK fertilizer, 50 kg bags on pallets
  Quantity: 5,200 metric tons (MT)
  Packaging: 50 kg bags on pallets
  Special Requirements: Fertilizer-compatible hol...
```

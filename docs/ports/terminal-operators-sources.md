# Terminal Operators — Top-20 Demo Ports

Citation audit trail for `terminalOperator` + `craneDataAsOf` in `data/ports/port-master.json`.
Every row here corresponds to an entry in port-master.json.

**Data discipline:**
- Operator name sourced from port-authority site or WPI terminal listing only.
- Each `terminalOperator` string has a matching row below.
- Where operator could not be confidently attributed → left blank, noted below as "not found".
- Disclaimer "confirm with port agent" is applied by the rationale renderer (Stage 4).

| Port | UNLOCODE | Operator | Source | Checked |
|------|----------|----------|--------|---------|
| Constanta | ROCND | DP World Constanta | portofconstantza.ro / DP World company site | 2025-10 |
| Novorossiysk | RUNVS | NCSP Group | ncsp.ru (Novorossiysk Commercial Sea Port) | 2025-10 |
| Rotterdam | NLRTM | Port of Rotterdam Authority | portofrotterdam.com | 2025-10 |
| Hamburg | DEHAM | HHLA | hhla.de (Hamburger Hafen und Logistik) | 2025-10 |
| Antwerp | BEANR | Port of Antwerp-Bruges | portofantwerpbruges.com | 2025-10 |
| Houston | USHOU | Port Houston | porthouston.com | 2025-10 |
| Singapore | SGSIN | PSA International | psa.com.sg | 2025-10 |
| Algeciras | ESALG | APM Terminals Algeciras | apmterminals.com | 2025-10 |
| Piraeus | GRPIR | Piraeus Port Authority (COSCO) | ppa.gr | 2025-10 |
| Casablanca | MACAS | Marsa Maroc | marsamaroc.co.ma | 2025-10 |

## Not found / not curated

| Port | UNLOCODE | Reason |
|------|----------|--------|
| Odesa | UAODS | War-affected; current operational status unclear |
| Mykolaiv | UANLK | War-affected; current operational status unclear |
| Istanbul | TRIST | Multiple competing terminal operators; no single dominant operator for bulk |
| New Orleans | USMSY | Multiple operators (Associated Terminals, IOM); cargo-type dependent |
| Gibraltar | GIGIB | Small port; primarily transshipment / bunkering, no dedicated bulk operator |
| Iskenderun | TRISK | Multiple operators; Limak Port predominant for containers, bulk varies |
| Alexandria | EGALY | Egypt Ports Authority manages; cargo-type and berth dependent |
| Ravenna | ITRAN | Multiple operators: Sapir, Setramar, Terminale Contenitori Ravenna |
| Ghent | BEGNE | Port of Antwerp-Bruges group; multiple stevedores by berth |
| Tuzla | — | **MISSING from port-master.json** — not in data file, skip for now |

## Notes

- All sourced operators are the dominant/authority operator for the port as a whole.
  For demo purposes this is sufficient; actual berth operator varies by cargo type and voyage.
- Disclaimer "confirm with port agent" is mandatory whenever operator is surfaced (Stage 4 logic).
- Next review: if Odesa/Mykolaiv operational status clarifies, re-curate.

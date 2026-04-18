export const SHIPPING_GLOSSARY = `
=== SHIPPING TERMINOLOGY GLOSSARY ===

LAYTIME TERMS:
- SHINC = Sundays and Holidays Included (counting laytime)
- SHEX = Sundays and Holidays Excluded (not counting laytime)
- SSHEX = Saturdays, Sundays and Holidays Excluded
- SSHINC = Saturdays, Sundays and Holidays Included
- PDPR = Per Day Pro Rata (demurrage/despatch calculated proportionally)
- FD = Full Dispatch (despatch paid on all time saved)
- HD = Half Dispatch
- TTL = Total (often used for commission: e.g. 3.75% TTL BENDS)
- NOR = Notice of Readiness
- WIBON = Whether In Berth Or Not
- WIPON = Whether In Port Or Not
- WIFPON = Whether In Free Pratique Or Not
- WCCON = Whether Customs Cleared Or Not

VESSEL SPECS:
- DWT / DWAT = Deadweight Tonnage (summer, total capacity incl. fuel/water/stores)
- DWCC = Deadweight Cargo Capacity (actual cargo carrying capacity)
- LOA = Length Overall
- LBP = Length Between Perpendiculars
- GRT / GT = Gross Register Tonnage / Gross Tonnage
- NRT / NT = Net Register Tonnage / Net Tonnage
- TPC = Tonnes Per Centimetre (immersion)
- SID = Single Deck
- BOX = Box-shaped hold (no tween decks)
- TWN / TD = Tween Decker
- GLESS = Gearless (no cranes/derricks on board)
- GEARED = Has cranes/derricks on board
- MPP = Multi-Purpose vessel
- OBO = Ore/Bulk/Oil carrier

CARGO & FREIGHT:
- FCL = Full Container Load
- LCL = Less than Container Load
- RORO = Roll-On Roll-Off
- FRT = Freight
- FIOST = Free In Out Stowed Trimmed (charterers pay for loading/discharge/stowage)
- FIO = Free In Out
- FILO = Free In, Liner Out
- LIFO = Liner In, Free Out
- PMT / MT = Per Metric Ton
- LUMP = Lump sum freight

CHARTER PARTY:
- CP = Charter Party
- VC = Voyage Charter
- TC = Time Charter
- GENCON = General Conditions (standard BIMCO voyage CP form)
- NYPE = New York Produce Exchange (TC form)
- CHOPT = Charterers Option
- OWOPT = Owners Option
- WOG = Without Guarantee
- ADA = All Details About
- MOLOO = More Or Less Owners Option
- MOLCHOPT = More Or Less Charterers Option

PORTS & OPERATIONS:
- AAAA = Always Accessible Always Afloat
- GSBB = Good Safe Berth
- GSPB = Good Safe Port Berth
- DLOSP = Dropping Last Outward Sea Pilot
- ATDNSHINC = Any Time Day Night Sundays Holidays Included
- ETA = Estimated Time of Arrival
- ETD = Estimated Time of Departure
- ETS = Estimated Time of Sailing
- POL = Port of Loading
- POD = Port of Discharge
- T/S = Transhipment
- L5C / LC5 = Last 5 Cargoes

COMMISSION:
- TTL BENDS = Total commission split between brokers on both ends
- Address Commission = Rebate to charterers (e.g. 1.25% to charterers)
- Brokerage = Commission to brokers
- Format example: "5% TTL (3.75% BENDS + 1.25% ADD COMM)"
- Commission is calculated on freight: amount = freight_total x percent / 100

ADDITIONAL TERMS:
- D/A = Disbursement Account
- F/D/D = Freight/Demurrage/Defence (P&I club cover)
- BSL = Bills of Lading (alternative abbreviation)
- COB BS/L = Clean On Board Bills of Lading
- BBB = Before Breaking Bulk
- HM = Hull & Machinery (insurance)
- WP = Weather Permitting
- EXINS = Extra Insurance
- W/W/W/W = Weather Working per Weather Working day
- BIMCO = Baltic and International Maritime Council
- SOF = Statement of Facts
- CONGEN = BIMCO Congenbill Bill of Lading
- FHEX = Fridays and Holidays Excluded (common in Middle East/North Africa trades where Friday is a holiday)
- TFHEX = Tropical Fridays and Holidays Excluded (FHEX variant for tropical zones)
- L/S/D = Lashing / Securing / Dunnaging (cargo securing operations, often part of FIOST terms)
- OO = Owner's Option (same as OWOPT)
- STW = Stowage (stw=dwt means stowage equals deadweight, cargo stowage factor allows full DWT)
- AGW = All Going Well (weather and conditions permitting)
- IAGW = If All Goes Well (same as AGW)
- S/R BS/L = Signed/Released Bills of Lading
- MAIMTERS = abbreviation sometimes seen for "Main Terms" in fixture recaps
- MAINTERS = Main Terms (agreed main terms in chartering negotiations, also seen as MAIMTERS)
- SUB STEM = Subject to Stem (cargo quantity subject to vessel intake confirmation)
- BASIS 1/1 = Basis 1 load port / 1 discharge port (voyage structure descriptor)
- PANDI / P&I = Protection and Indemnity (P&I club maritime liability insurance)
- STST = Stowed, Trimmed, Secured, Tallied (cargo handling terms, variant of FIOST)
- EIU = Even If Used (e.g. SSHEX EIU = Saturdays Sundays Holidays Excluded Even If Used)
- SB = Safe Berth (e.g. 1 SB = one safe berth)
- AARA = Always Accessible, Reachable on Arrival (berth/port availability clause)
- AAAA = Always Accessible Always Afloat (already defined above, common in port clauses)
- A/D/A = All Details About (same as ADA)
- CC = Cargo Capacity (e.g. 3600 CC = 3600 tons cargo capacity)
- IACS = International Association of Classification Societies

DATE FORMATS (interpret flexibly):
- "1/5 May" = laycan 1st to 5th May
- "ETA Fujairah 15 Apr" = estimated arrival
- "open Singapore end April" = vessel available Singapore around end of April
- "abt 10 days" = approximately 10 days transit

PORT ABBREVIATIONS (common):
- SPORE / SGP = Singapore
- FUJA / FUJ = Fujairah, UAE
- JEBEL ALI / JEBALI = Jebel Ali, Dubai
- KLANG = Port Klang, Malaysia
- PENANG = Penang, Malaysia
- KOCHI = Kochi (Cochin), India
- NHAVA SHEVA / NHAVA = Mumbai / Jawaharlal Nehru Port, India
- MUNDRA = Mundra, India
- PIPAVAV = Pipavav, India
- VIZAG = Visakhapatnam, India
- CHITTAGONG / CGP = Chittagong, Bangladesh
- COLOMBO / CMB = Colombo, Sri Lanka
- HAMBURG / HAM = Hamburg, Germany
- ROTTERDAM / RTM = Rotterdam, Netherlands
- ANTWERP / ANR = Antwerp, Belgium

UNRECOGNIZABLE TERMS:
- If a shipping/chartering abbreviation or clause is unrecognized, include it in unknown_terms array
- Do NOT guess the meaning of unknown abbreviations
- Flag for human review
- Do NOT flag as unknown: cargo grade names (e.g. San10, EN17, ALVRIUM, or any product grade codes), vessel names, numeric measurements, port codes, or cargo specification parameters — these are cargo-specific identifiers, not shipping terminology
- Only flag actual unrecognized shipping/chartering terms and abbreviations
`;

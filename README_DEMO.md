# Quantika — Demo guide for brokers

Quantika reads a chartering inbox (cargo inquiries + vessel positions), matches cargo to tonnage, and explains every match so a broker can trust it before picking up the phone. This doc walks a broker through the demo in five minutes and answers the "what if the AI is wrong?" questions up front.

## 5-minute walkthrough

1. **Open** [demo.quantika.org](https://demo.quantika.org).
2. **Try a sample** — the landing page has a "Load sample inbox" button that seeds a session with realistic cargo inquiries and vessel positions. No login needed, no data stored.
3. **Dashboard** — after processing you land on the dashboard. The columns are: cargo inquiries, vessel positions, freshness, commission, and matches (ranked by confidence).
4. **Click any match** — the match detail page is the heart of the product. You will see:
   - the cargo on the left, vessel on the right (click any number to see the exact sentence it came from in the email);
   - a "Physical feasibility" card listing four deterministic checks (draft, cranes, volume, cargo-vessel type compatibility) — all green for matches shown;
   - a "Score breakdown" card with per-component scoring (proximity, cargo fit, cranes, volume fit, laycan, DWT);
   - a "Vessel readiness" card computing arrival vs laycan, with a plain-English verdict (ideal / tight / idle / late);
   - a "Sanctions & restrictions" card if the flag × route combination triggers any screening concern.
5. **Click any DWT or weight number** — the "Draft quote" card pulls freight-rate intelligence based on similar fixtures and composes a reply-ready quote.

If something looks off on the match detail page, the field itself is the citation — one click shows the exact quoted sentence from the original email.

## How we verify matches

Every match goes through deterministic filters *before* the language model sees it, so impossible pairs are dropped and nothing can be "rescued" by creative AI reasoning.

- **Hard filters** — port draft vs vessel draft, cargo volume vs grain capacity, cargo type vs vessel type, gearless vessels vs ports with no shore cranes. Failure = dropped with a plain-English reason.
- **IMO validation** — 7-digit format plus the mod-10 checksum. LLM-hallucinated IMO numbers never pass.
- **Equasis lookup** — when a valid IMO is found, we consult the public Equasis registry. Name mismatch (Levenshtein > 30%) or DWT mismatch (> 10%) raises a visible warning on the match card.
- **Source traceability** — every field carries the exact quote from the email that produced it. Confidence is "confirmed", "interpreted" (when hedged with *abt/circa/~*), or "uncertain".
- **Sanctions screening** — a conservative flag × route matrix (RU/IR/BY/CU/MM flags into EU/UK/US/UA ports) flags HIGH-risk combinations as blocking and MEDIUM as warning. This is a heuristic; brokers must still verify against current OFAC/EU/UK lists before fixing.
- **Date sanity** — inverted laycan, stale vessel positions (> 5 days old), and late arrivals are all caught deterministically.

## FAQ

### Where does the data come from?
Two sources. The sample inbox is a curated set of broker-style emails that exercise every feature. If you connect a real Gmail (OAuth, read-only, scope limited to a single label if you like), Quantika reads cargo and vessel emails from there — nothing leaves your machine except prompts and parse results to the LLM provider.

### What if the LLM extracts a wrong value?
Click the number — you see the exact source sentence. If the LLM was hedged (*abt/circa*), the badge downgrades from "confirmed" to "interpreted" automatically. If the vessel IMO doesn't check out, the field is null, not a fabrication. If hard filters detect a physical impossibility, the match is dropped before the LLM is asked anything.

### Is my email data sent anywhere?
The LLM provider (OpenAI at this stage) sees the email text during parsing. That's it. We don't persist emails in any remote database — everything lives in an ephemeral session that expires after a few hours. There is no analytics cookie set on the broker side.

### Can I use my real Gmail?
Yes — the OAuth flow is read-only and you can restrict it to a single Gmail label (e.g. `chartering/incoming`). You can revoke access any time from your Google account.

### How do you handle Russian-flagged vessels on European routes?
The sanctions screener treats RU-flag + EU/UK/US/UA as HIGH-risk and blocking — that match is dropped pre-LLM with a visible reason. For BY/CU/MM flags the risk is MEDIUM: the match is kept, a yellow warning appears, and the final decision is the broker's. This is a heuristic layer; verify against the live OFAC/EU/UK sanctions lists before fixing.

### What's the accuracy rate?
On our adversarial test suite (20 deliberately broken emails — typos, contradictions, hallucination bait), parsing is now 100% hedge-calibrated and 0 impossible matches slip through. Real-world broker email variety is broader, so we aim for zero "this is obviously wrong" moments in the 10 canonical demo scenarios shipped with the product.

### Who's behind Quantika?
Quantika AI (Berlin). Founded by a former broker + engineer team. Product is MVP; we ship weekly and take broker feedback seriously.

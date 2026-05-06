# ROADMAP — Knowledge Layer Phase 2: RAG + Geography Expansion

## Context

Phase 1 complete (deployed @ a2d8a71): governance meta-table, sanctions (OFAC + EU),
searoute distances, JWC structured war-risk zones, ECA zones, embedding pipeline
(Vertex AI text-multilingual-embedding-002, 768 dim, $900 GCP credit).

Phase 2 adds the RAG layer: semantic search over regulatory documents,
expanded port coverage, market indices, and citation UI.

**Stack:** Next.js, better-sqlite3, sqlite-vec, Vertex AI, TypeScript, Jest.

**Key constraint:** KNOWLEDGE_RAG_ENABLED=false in production until all
embeddings are populated (safe rollout).

**Existing infra to reuse:**

- `lib/knowledge/embeddings/client.ts` — embedQuery(), embedDocuments()
- `lib/knowledge/embeddings/pipeline.ts` — embedAndStore(chunks, opts)
- `lib/knowledge/embeddings/chunks.ts` — Chunk, RetrievedChunk types
- `lib/knowledge/governance.ts` — reportSyncStarted/Success/Failure
- `lib/knowledge/bootstrap.ts` — KNOWLEDGE_REGISTRY (imsbc/igc/jwc already declared)
- `lib/db/index.ts` — getDb() with sqlite-vec auto-loaded
- `lib/prompts/glossary.ts` — SHIPPING_GLOSSARY (145-line static, to be replaced by RAG)
- Migrations 013–017 already run; next migration number: 018

---

## Block A — Foundation: Retriever + Vec/FTS tables + Feature Flag

### A1 — Migration 018: virtual tables for RAG

Create `lib/migrations/018-knowledge-rag-tables.ts` (TypeScript format, same pattern
as existing 013–017 migrations).

Creates six virtual tables:

- `imsbc_vec`, `igc_vec`, `jwc_vec` — sqlite-vec vec0 tables (embedding FLOAT[768], content TEXT, metadata TEXT)
- `imsbc_fts`, `igc_fts`, `jwc_fts` — FTS5 tables for BM25 keyword search (content TEXT, metadata TEXT, tokenize='unicode61 remove_diacritics 1')

Register migration in the migration runner (whichever file calls migrations 013–017).

Tests: `__tests__/lib/migrations/018-knowledge-rag-tables.test.ts`

- All 6 virtual tables exist after migration
- vec0 accepts INSERT with Float32Array[768] embedding
- FTS5 accepts INSERT and full-text search returns row

### A2 — Hybrid retriever: `lib/knowledge/embeddings/retriever.ts`

Implements hybrid FTS5 BM25 + sqlite-vec cosine k-NN + RRF (Reciprocal Rank Fusion) merge.

```typescript
export interface RetrieveOptions {
  vectorTable: string; // e.g. 'imsbc_vec'
  ftsTable: string; // e.g. 'imsbc_fts'
  topK?: number; // candidates per ranker, default 20
  topN?: number; // final results after RRF, default 5
  rrfK?: number; // RRF constant, default 60
}

export async function retrieve(
  db: Database,
  query: string,
  opts: RetrieveOptions
): Promise<RetrievedChunk[]>;
```

Algorithm:

1. Call `embedQuery(query)` → Float32Array[768]
2. FTS5 BM25 search: `SELECT rowid, content, metadata, rank FROM <ftsTable>(?) ORDER BY rank LIMIT topK`
3. Vec0 cosine k-NN: `SELECT rowid, content, metadata, distance FROM <vectorTable> WHERE embedding MATCH ? ORDER BY distance LIMIT topK`
4. RRF merge: score(doc) = Σ 1/(rrfK + rank_i) for each ranking list; documents in both lists accumulate from both terms
5. Sort descending, return top topN as RetrievedChunk[]

Also modify `lib/knowledge/embeddings/pipeline.ts`: add `ftsTable?: string` option to
`embedAndStore()`. When provided, INSERT into FTS5 table alongside vec0 INSERT in same
transaction using `last_insert_rowid()` to share rowid for RRF join.

Tests: `__tests__/knowledge/retriever.test.ts` — in-memory SQLite with seeded data,
mock embedQuery. Verify FTS search, semantic search, RRF promotion, topN limit, empty tables.

### A3 — Feature flag: `lib/knowledge/flags.ts`

```typescript
export function isRagEnabled(): boolean {
  return process.env.KNOWLEDGE_RAG_ENABLED === "true";
}

export function ftsTableForSource(slug: string): string {
  return `${slug}_fts`;
}
```

Add `KNOWLEDGE_RAG_ENABLED=false` to `.env.example`.

Tests: `__tests__/knowledge/flags.test.ts` — env unset/false/true cases.

---

## Block B — IMSBC Code RAG

IMSBC (International Maritime Solid Bulk Cargoes) Code — primary cargo safety reference.
Source URL provided via `IMSBC_SOURCE_URL` env var (IMO copyrighted, operator provides URL).
Replaces static 145-line SHIPPING_GLOSSARY in lib/prompts/match.ts with live RAG context.

### B1 — IMSBC HTML scraper: `lib/knowledge/sources/imsbc/scraper.ts`

```typescript
export interface ScrapedSection {
  sectionId: string;
  title: string;
  rawHtml: string;
  sourceUrl: string;
}
export async function scrapeImsbc(baseUrl: string): Promise<ScrapedSection[]>;
```

Parses ToC page → fetches each section (concurrency=3, timeout=10s).
Strips `<script>`, `<style>`, `<nav>`, `<footer>`. Throws if baseUrl empty.

Tests: `__tests__/knowledge/imsbc-scraper.test.ts`

### B2 — IMSBC chunker: `lib/knowledge/sources/imsbc/chunker.ts`

```typescript
export function chunkImsbc(sections: ScrapedSection[]): Chunk[];
```

HTML → plain text → split on `SECTION \d+` / `APPENDIX` headings.
Target: 200–600 tokens (~800–2400 chars). Hard cap: 2000 tokens (~8000 chars). No overlap.
Metadata: `{ source: 'imsbc', sourceUrl, section: sectionId, title, subsectionIndex }`.

Tests: `__tests__/knowledge/imsbc-chunker.test.ts`

### B3 — IMSBC adapter + embed script

Create `lib/knowledge/sources/imsbc/adapter.ts`:

```typescript
export async function syncImsbc(opts?: { dryRun?: boolean }): Promise<void>;
```

1. reportSyncStarted('imsbc') via governance.ts
2. scrapeImsbc(IMSBC_SOURCE_URL)
3. chunkImsbc(sections)
4. if dryRun → log count, return
5. embedAndStore(chunks, { vectorTable: 'imsbc_vec', ftsTable: 'imsbc_fts' })
6. reportSyncSuccess / reportSyncFailure

Create `scripts/knowledge-imsbc-embed.ts` (CLI wrapper).
Add `"knowledge:imsbc": "npx tsx scripts/knowledge-imsbc-embed.ts"` to package.json.

Tests: `__tests__/knowledge/imsbc-adapter.test.ts`

### B4 — IMSBC integration into `lib/prompts/match.ts`

When `isRagEnabled()=true`: call `retrieve(db, userQuery, { vectorTable:'imsbc_vec', ftsTable:'imsbc_fts', topN:5 })`.
If chunks returned → inject as `[IMSBC §section] content` blocks in system prompt.
If empty → fallback to SHIPPING_GLOSSARY (keep static import as fallback).

Change return type to `{ systemPrompt: string; retrievedChunks: RetrievedChunk[] }` for later Citation UI.

Tests: `__tests__/knowledge/match-rag.test.ts`

---

## Block C — IGC Grain Code RAG

IGC (International Grain Code) — grain cargo handling requirements.
Source URL via `IGC_SOURCE_URL` env var.
Enriches cargo-profiles when freight email mentions grain commodities.

### C1 — IGC scraper: `lib/knowledge/sources/igc/scraper.ts`

Same pattern as IMSBC. Supports HTML + PDF text extraction (pdftotext or pdf-parse npm).
Reads `IGC_SOURCE_URL`. Tests: `__tests__/knowledge/igc-scraper.test.ts`

### C2 — IGC chunker: `lib/knowledge/sources/igc/chunker.ts`

Split on CHAPTER/SECTION/ANNEX headings. Extract cargoType from title (WHEAT, BARLEY, CORN, MAIZE, SOYA, etc.).
Tests: `__tests__/knowledge/igc-chunker.test.ts`

### C3 — IGC adapter + embed script

Same pattern as B3. Slug='igc', tables igc_vec+igc_fts, env IGC_SOURCE_URL.
Add `"knowledge:igc"` to package.json. Tests: `__tests__/knowledge/igc-adapter.test.ts`

### C4 — IGC integration in `lib/prompts/match.ts`

Additional `retrieve()` call for IGC when cargo type matches grain list
['wheat','barley','corn','maize','soya','sunflower','rapeseed','grain'].
Append `### IGC Grain Code context` block to system prompt.
Tests: `__tests__/knowledge/igc-integration.test.ts`

---

## Block D — JWC RAG

JWC (Joint War Committee) listed areas bulletins — war risk context for route comparison.

### D1 — JWC scraper + chunker + embed adapter

Create:

- `lib/knowledge/sources/jwc/scraper.ts` — scrapeJwc(baseUrl): JwcBulletin[] (id, publishDate, title, rawText, sourceUrl). Reads JWC_SOURCE_URL.
- `lib/knowledge/sources/jwc/chunker.ts` — chunkJwc(bulletins): Chunk[]. Bulletins are short (~200-800 words), usually 1 chunk each. Extract regions (Black Sea, Red Sea, Persian Gulf, etc.) into metadata.
- `lib/knowledge/sources/jwc/adapter.ts` — syncJwcRag() — separate from existing lib/knowledge/jwc/adapter.ts (structured war_risk_zones).
- `scripts/knowledge-jwc-embed.ts`

Add `"knowledge:jwc"` to package.json.
Tests: `__tests__/knowledge/jwc-rag-*.test.ts`

### D2 — JWC integration in compare-routes

Find and modify the compare-routes API route (likely `app/api/ai/compare-routes/route.ts`).
When route passes through Black Sea / Red Sea / Persian Gulf: retrieve top-3 JWC bulletins,
inject with citation anchors `[JWC-${bulletinId}]`.
Feature flag: KNOWLEDGE_RAG_ENABLED.
Tests: `__tests__/knowledge/jwc-integration.test.ts`

---

## Block E — UNLOCODE Port Expansion

Currently ~120 ports in port_master. Expand to 6,000–8,000 via UN/LOCODE directory (free, unece.org).

### E1 — UNLOCODE CSV parser: `lib/knowledge/sources/unlocode/parser.ts`

Parse UN/LOCODE CSV format. Filter: function field includes '1' (port function).
Convert coordinates from `DDMM[N/S] DDDMM[E/W]` format to decimal degrees.
Tests: `__tests__/knowledge/unlocode-parser.test.ts`

### E2 — Migration 019: port_master UNLOCODE columns

Create `lib/migrations/019-port-master-unlocode.ts`.
Add columns: unlocode TEXT, country_iso2 TEXT, subdivision TEXT, function_codes TEXT, lat REAL, lon REAL.
Add unique index on unlocode WHERE unlocode IS NOT NULL.
Tests: `__tests__/lib/migrations/019-port-master-unlocode.test.ts`

### E3 — UNLOCODE import script

Create `lib/knowledge/sources/unlocode/importer.ts` — batch INSERT OR IGNORE (preserve curated data).
Create `scripts/knowledge-unlocode-import.ts` — downloads UN/LOCODE CSV, runs parser + importer.
Add `"knowledge:unlocode"` to package.json.
Tests: `__tests__/knowledge/unlocode-importer.test.ts`

---

## Block F — Baltic Dry Indices

BDI/BCI/BSI/BHSI market context for freight assessment.

### F1 — Baltic fetcher + Migration 020

Create `lib/migrations/020-baltic-indices.ts`:
Table `baltic_indices`: id, index_code TEXT ('BDI'/'BCI'/'BSI'/'BHSI'), value REAL, fetched_at TEXT (ISO8601), source TEXT.

Create `lib/knowledge/sources/baltic/fetcher.ts`:

```typescript
export async function fetchBalticIndices(): Promise<BalticIndex[]>;
```

Reads `TRADING_ECONOMICS_API_KEY`. Graceful fallback if key absent.
Tests: `__tests__/knowledge/baltic-fetcher.test.ts`

### F2 — Baltic cron + UI hint

Create `scripts/knowledge-baltic-refresh.ts` and `app/api/knowledge/baltic/route.ts` (GET endpoint).
Modify `lib/prompts/match.ts`: when RAG enabled + Baltic data in DB, append one-line context: `Baltic Dry Index: {BDI} ({date})`.
Tests: `__tests__/knowledge/baltic-api.test.ts`

---

## Block G — Eval Golden Test Sets

Recall@5 ≥ 0.80, MRR ≥ 0.65 target. 30% Russian queries.

### G1 — Eval infrastructure

Create `lib/knowledge/eval/runner.ts`:

```typescript
export async function runEval(db, cases, opts): Promise<{ recall; mrr; results; passed }>;
```

Recall@N = hits/expected. MRR = mean(1/rank_of_first_hit). Thresholds configurable.

Create `scripts/knowledge-eval.ts` — CLI: loads `__tests__/golden/*.json`, runs eval, prints table, exit code 1 if below threshold.
Add `"knowledge:eval": "npx tsx scripts/knowledge-eval.ts"` to package.json.
Tests: `__tests__/knowledge/eval-runner.test.ts`

### G2 — IMSBC golden test set: `__tests__/golden/imsbc.json`

30–50 Q→A pairs. Format:

```json
{
  "id": "imsbc-001",
  "query": "...",
  "lang": "en|ru",
  "expectedChunkIds": ["SECTION-X"],
  "expectedTopN": 5
}
```

Covers: hazard categories, moisture limits, stowage requirements, cargo declarations.
≥30% Russian queries.

### G3 — IGC golden test set: `__tests__/golden/igc.json`

30–50 pairs. Grain types, trimming, hold cleaning, cargo declarations. ≥30% Russian.

### G4 — JWC golden test set: `__tests__/golden/jwc.json`

20–30 pairs. War risk zones, regions, bulletin dates, insurance. ≥30% Russian.

### G5 — CI integration

Create `__tests__/golden/eval.test.ts` — Jest wrapper.
`test.skip` when `IMSBC_EMBEDDED` env var not set (prevents blocking npm test before embeddings).
Assert Recall@5 ≥ 0.80 and MRR ≥ 0.65.

---

## Block H — Citation UI

Post-validate LLM citations before showing to user.

### H1 — Citation validator: `lib/knowledge/citations/validator.ts`

```typescript
export function validateCitations(llmResponse: string, retrievedChunks: RetrievedChunk[]): string;
```

Strip `[Source: IMSBC §X.Y]`, `[JWC-bulletin-id]`, `[Source: IGC X.Y]` tags
if that section is NOT present in retrievedChunks metadata. Valid → kept, invalid → stripped.
Tests: `__tests__/knowledge/citation-validator.test.ts`

### H2 — Citation injection in API response

Modify the draft-quote API route (`app/api/ai/draft-quote/route.ts` or similar):
after LLM response, when isRagEnabled(): `validateCitations(llmText, retrievedChunks)`.
The retrieved chunks come from `lib/prompts/match.ts` return value (extended in B4).
Tests: `__tests__/knowledge/citation-injection.test.ts`

### H3 — Citation badge UI component

Create `components/knowledge/CitationBadge.tsx`:
Small badge `[IMSBC §4.2]` that expands on click to show full chunk content in a popover.

Modify response display component (likely `components/DraftQuoteCard.tsx`):
parse `[Source: ...]` patterns in LLM response → replace with `<CitationBadge>`.
Tests: `__tests__/components/CitationBadge.test.tsx`

---

## Verify Commands

```bash
npm run lint
npx tsc --noEmit
npm test
```

Note: `scripts/wave-gamma-bake-off/` contains known pre-existing TypeScript errors —
these are expected and should NOT block merge (they existed before Phase 2).

## Dependency Order (for parallel execution)

Wave 1 (sequential): A1, A2, A3
Wave 2 (parallel): B1, B2, C1, C2, E1
Wave 3 (parallel, needs A1+Wave2): B3, C3, D1, E2, F1
Wave 4 (parallel, needs A2+A3+Wave3): B4, C4, D2, E3, F2, G1
Wave 5 (sequential, needs G1+B3+C3+D1): G2, G3, G4, G5
Wave 6 (sequential, needs B4+D2): H1, H2, H3

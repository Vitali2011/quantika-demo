# AbortController & Prompt-Caching Audit — 2026-05-28

**Scope:** Every LLM-calling call site in the codebase — all `app/api/ai/*` and `app/api/parser/*` route handlers, the WhatsApp ingest chain (OCR / voice / forward-parse), the voyage route-decision and CII-lookup paths, the Vertex embeddings client, the internal match/agent helpers, and the two shared provider layers themselves (`lib/ai-provider.ts`, `lib/openai.ts`).

**Method:** Workflow was (1) discover every call site, (2) per-site audit of three dimensions — abort propagation, timeout enforcement, and prompt-prefix caching, (3) adversarial per-gap verification (each flagged gap was attacked with its strongest refutation and only kept if it survived). Findings below were re-checked against source: `callGeminiText` (lib/ai-provider.ts:488), `callBedrockText` (lib/ai-provider.ts:614), and `buildAbortController` (lib/openai.ts:37) were read directly.

**Single most important systemic finding (CONFIRMED):** the multi-provider shim drops both the abort signal and the caller timeout for the **gemini** and **bedrock** branches. `callGeminiText` calls `ai.models.generateContent({model,contents,config})` ([lib/ai-provider.ts:551](lib/ai-provider.ts#L551)) with no `abortSignal` and no timeout — `opts` is consumed only by `buildGeminiHttpOptions` (which forwards `maxRetries` → `retryOptions.attempts` only, [lib/ai-provider.ts:96](lib/ai-provider.ts#L96)). `callBedrockText` calls `client.send(cmd)` ([lib/ai-provider.ts:650](lib/ai-provider.ts#L650)) with no `{ abortSignal }` second arg, and reads `opts` only through `buildBedrockSamplingFields` (max_tokens/temperature/top_p, [lib/ai-provider.ts:82](lib/ai-provider.ts#L82)). Only the **openai** path threads both, via `buildAbortController` ([lib/openai.ts:37](lib/openai.ts#L37)), which arms a `setTimeout`→`controller.abort()` and composes any external `opts.signal`, then throws `LLMTimeoutError`. Net: on gemini/bedrock an upstream hang has **no application-level timeout** (only the platform `maxDuration` kill, which under the project's pm2/VPS deploy is not even enforced), and the route `catch (LLMTimeoutError)` branches are dead code. Compounding this, **no route in the codebase threads `request.signal` into `AiOpts.signal`** — so client-disconnect cancellation is currently absent on every provider, latent on openai and structurally impossible on gemini/bedrock.

## Summary

| Call site | Scope | Provider (resolved) | Reachable from | Abort OK? | Timeout OK? | Caching applied? |
|---|---|---|---|---|---|---|
| [classify/route.ts:36](app/api/ai/classify/route.ts#L36) | CLASSIFY | openai (gemini opt-in) | POST /api/ai/classify | ❌ | ⚠️ openai / ❌ gemini | ❌ |
| [draft-quote/route.ts:120](app/api/ai/draft-quote/route.ts#L120) | DRAFT_QUOTE | openai | POST /api/ai/draft-quote | ❌ | ✅ | ❌ (small) |
| [draft-reply/route.ts:63](app/api/ai/draft-reply/route.ts#L63) | DRAFT_REPLY | openai | POST /api/ai/draft-reply (Case 1) | ❌ | ✅ | ❌ (small) |
| [draft-reply/route.ts:80](app/api/ai/draft-reply/route.ts#L80) | DRAFT_REPLY | openai | POST /api/ai/draft-reply (Case 2) | ❌ | ✅ | ❌ (small) |
| [explain-deal/route.ts:182](app/api/ai/explain-deal/route.ts#L182) | EXPLAIN_DEAL | gemini-2.5-pro | POST /api/ai/explain-deal | ❌ | ❌ | ❌ (sub-floor) |
| [match/route.ts:90](app/api/ai/match/route.ts#L90) | MATCH | openai (bedrock opt-in) | POST /api/ai/match | ❌ | ⚠️ openai / ❌ bedrock | ❌ |
| [parse-cargo/route.ts:166](app/api/ai/parse-cargo/route.ts#L166) | PARSE_CARGO | gemini-2.5-flash | POST /api/ai/parse-cargo | ❌ | ❌ | ❌ |
| [parse-recap/route.ts:59](app/api/ai/parse-recap/route.ts#L59) | PARSE_RECAP | openai (gemini/bedrock opt-in) | POST /api/ai/parse-recap | ❌ | ⚠️ openai / ❌ other | ❌ |
| [parse-vessel/route.ts:70](app/api/ai/parse-vessel/route.ts#L70) | PARSE_VESSEL | openai (gemini/bedrock opt-in) | POST /api/ai/parse-vessel | ❌ | ⚠️ openai / ❌ other | ❌ |
| [recap/route.ts:76](app/api/ai/recap/route.ts#L76) | RECAP | openai | POST /api/ai/recap | ❌ | ⚠️ openai / ❌ other | ❌ |
| [parser/email/route.ts:43](app/api/parser/email/route.ts#L43) | PARSE_CARGO | openai | POST /api/parser/email | ❌ | ✅ | ❌ |
| [generate-route-map/route.ts:181](app/api/ai/generate-route-map/route.ts#L181) | imagen-4 | gemini (Imagen, inline) | POST /api/ai/generate-route-map | ❌ (refuted) | ❌ | n/a |
| [plan-first.ts:164](lib/agent/plan-first.ts#L164) | AGENT_PLANNER | gemini/openai | test-only (no route) | ❌ (refuted) | ❌ (refuted) | ⚠️ |
| [compute-matches.ts:34](lib/matching/compute-matches.ts#L34) | MATCH | gemini | fire-and-forget (detached) | ❌ (refuted) | ❌ | ❌ |
| [route-decision.ts:270](lib/economics/route-decision.ts#L270) | route-decision | openai (lib/openai direct) | POST /api/voyage/compare-routes | ❌ | ✅ (4s) | ❌ (tiny) |
| [cii-lookup.ts:57](lib/imo/cii-lookup.ts#L57) | cii | openai (lib/openai direct) | RSC render vessel/[id] | ❌ | ✅ (30s) | ❌ (tiny) |
| [forward-parser.ts:165](lib/whatsapp/forward-parser.ts#L165) | WHATSAPP forward | openai (lib/openai direct) | POST /api/whatsapp/ingest | ❌ | ✅ (30s) | ❌ (small) |
| [image-ocr.ts:99](lib/whatsapp/image-ocr.ts#L99) | WHATSAPP_OCR | gemini vision | POST /api/whatsapp/ingest | ❌ | ❌ | n/a |
| [image-ocr.ts:130](lib/whatsapp/image-ocr.ts#L130) | WHATSAPP_OCR | openai (lib/openai direct) | POST /api/whatsapp/ingest | ❌ | ✅ (20s) | n/a |
| [voice-transcribe.ts:48](lib/whatsapp/voice-transcribe.ts#L48) | WHATSAPP_VOICE | openai (lib/openai direct) | POST /api/whatsapp/ingest | ❌ | ✅ (20s) | n/a |
| [voice-transcribe.ts:81](lib/whatsapp/voice-transcribe.ts#L81) | WHATSAPP_VOICE | gemini audio | POST /api/whatsapp/ingest | ❌ | ❌ | n/a |
| [embeddings/client.ts:67](lib/knowledge/embeddings/client.ts#L67) | vertex embeddings | vertex (gax) | RAG retrieve (4 routes) | ❌ | ⚠️ gax 600s default | n/a |
| **provider layer:** [ai-provider.ts:551](lib/ai-provider.ts#L551) | ALL gemini | gemini | all gemini-routed callers | ❌ | ❌ | ❌ |
| **provider layer:** [ai-provider.ts:650](lib/ai-provider.ts#L650) | ALL bedrock | bedrock | all bedrock-routed callers | ❌ | ❌ | ❌ |
| **provider layer:** [openai.ts:93](lib/openai.ts#L93) | ALL openai | openai | all openai-routed callers | ✅ (if threaded) | ✅ | ❌ (no cache key) |

⚠️ = honored on one provider but dropped on another; or bounded by a coarse fallback only.

## Top 5 by impact

1. **Provider-layer timeout drop for gemini/bedrock — availability risk** — [lib/ai-provider.ts:551](lib/ai-provider.ts#L551) (gemini) and [lib/ai-provider.ts:650](lib/ai-provider.ts#L650) (bedrock). A hung upstream call never rejects; the request hangs until the platform `maxDuration` kill (55–120 s), which on the project's pm2/VPS deploy is **not enforced at all** — meaning a stalled Vertex/Bedrock stream can pin a worker indefinitely. The route `catch (LLMTimeoutError)` per-email-isolation logic (parse-vessel, parse-recap) is dead code on these providers. Affects every gemini/bedrock-routed scope: PARSE_CARGO (default gemini), EXPLAIN_DEAL (default gemini-2.5-pro), and any MATCH/CLASSIFY/PARSE_* with the documented per-scope override. **Impact:** worker exhaustion / hung connections, not token spend. Highest because it is reachable on the *default* config for PARSE_CARGO and EXPLAIN_DEAL.

2. **MATCH static-prefix re-billed uncached** — [lib/matching/compute-matches.ts:36](lib/matching/compute-matches.ts#L36) / [app/api/ai/match/route.ts:90](app/api/ai/match/route.ts#L90). `MATCH_PROMPT` resolves to a byte-identical **~6,956-token** system prefix (freight rules + `SHIPPING_GLOSSARY` + output-format block), re-sent on every matching run with no `cache_control`/`cachedContent`. On bedrock claude-opus-4-7 ($15/1M) that is **~$0.104/req** of prefix that prompt caching would cut ~90% (~$0.0094); on gemini-2.5-flash ($0.075/1M) ~75% implicit. Highest-token caching gap that fires once per match request.

3. **PARSE_CARGO / parser-email static prefix uncached** — [app/api/ai/parse-cargo/route.ts:166](app/api/ai/parse-cargo/route.ts#L166) and [app/api/parser/email/route.ts:43](app/api/parser/email/route.ts#L43). `CARGO_INQUIRY_PARSER_PROMPT` + `PARSE_CARGO_SCHEMA` = **~9,100–10,600-token** static prefix, re-sent per uncached email and fanned out at `PARSE_CARGO_CONCURRENCY=8`. Default provider gemini-2.5-flash → ~75% implicit recovery possible but unguaranteed and uninstrumented; on bedrock override, full re-bill. Largest per-call prefix in the codebase.

4. **PARSE_VESSEL static prefix uncached** — [app/api/ai/parse-vessel/route.ts:70](app/api/ai/parse-vessel/route.ts#L70). `VESSEL_POSITION_PARSER_PROMPT` + glossary + `PARSE_VESSEL_SCHEMA` ≈ **~10,150 tokens**, re-sent per email under `pLimit(3)`. Same caching remedy; same provider-graded savings.

5. **OpenAI shared path sends no `prompt_cache_key` for huge prefixes** — [lib/openai.ts:93](lib/openai.ts#L93). All openai-routed scopes (the *shipped default* for MATCH/CLASSIFY/PARSE_*) push 5k–10k-token static system prompts through `chat.completions.create` with no cache key, so automatic prefix caching is best-effort and unpinned. A `prompt_cache_key` keyed on scope/prompt-hash would maximize the ~50% cached-input discount across every openai caller. Broadest reach (every openai scope).

## (A) AbortController gaps

### lib/ai-provider.ts:551 / :650 — SYSTEMIC: gemini & bedrock branches drop signal (and timeout)
**Current:**
```ts
// gemini (L551)
const response = await ai.models.generateContent({ model, contents, config }); // no abortSignal
// bedrock (L650)
const response = await client.send(cmd);                                       // no { abortSignal }
```
**Problem:** `opts.signal` is never forwarded. For gemini the `config` literal does not even declare an `abortSignal`/`httpOptions.timeout` field ([lib/ai-provider.ts:501-510](lib/ai-provider.ts#L501)); `buildGeminiHttpOptions` only sets `retryOptions.attempts`. For bedrock, the AWS SDK `send(cmd, { abortSignal })` 2nd arg is omitted and the client is built with region+credentials only. **Dropped at the provider layer** — even a perfectly threaded route signal would be ignored. Only `openai` (via `buildAbortController`, [lib/openai.ts:52-61](lib/openai.ts#L52)) honors it. `AiOpts` publicly advertises `signal?: AbortSignal`, so the contract is asymmetric and a latent correctness trap.
**Fix:** gemini — `ai.models.generateContent({ model, contents, config }, { abortSignal: opts?.signal })` (or set `config.abortSignal`), composed with an internal `setTimeout`→abort controller; throw `LLMTimeoutError` on the timeout path so existing route catches work. bedrock — `client.send(cmd, { abortSignal: composed })`. Apply equally to `callGeminiVision` (L592) and the gemini audio branch (L999).
**Orphaned tokens/req:** 0 *additional* today (no route threads `request.signal` yet), but this is the precondition for every per-site abort fix below to take effect on non-openai providers. The realized harm is the timeout drop (see §C).

### app/api/ai/classify/route.ts:36 — CLASSIFY signal not threaded
**Current:** `callAiJson('CLASSIFY', getClassifyPrompt(), user, { timeoutMs: endpointLlmTimeout(120), responseSchema: CLASSIFY_SCHEMA })`
**Problem:** `request.signal` available at the handler but absent from `opts`. Fans out over `CLASSIFY_BATCH_SIZE=20` batches in `Promise.all`; a disconnect orphans all batches. On openai (shipped default) bounded by the 115s internal timeout; on the documented gemini opt-in, also dropped at provider layer.
**Fix:** `classifyBatch(batch, signal)`, call with `request.signal`, pass `{ signal, timeoutMs, responseSchema }`; combine with the provider-layer fix above.
**Orphaned tokens/req:** ~3,500 (post-disconnect output across batches, openai-bounded).

### app/api/ai/explain-deal/route.ts:182 — EXPLAIN_DEAL signal not threaded (provider also drops it)
**Current:** `const llmOpts = { timeoutMs: endpointLlmTimeout(maxDuration), model: modelOverride, temperature: 0.3 };`
**Problem:** No `signal`. Default provider is gemini-2.5-pro, so even if threaded the call is uncancelled and unbilled-back. User-facing "Explain this deal" wow-feature.
**Fix:** add `signal: request.signal`; necessary-but-insufficient until the gemini provider-layer fix lands.
**Orphaned tokens/req:** ~2,800.

### app/api/ai/match/route.ts:90 — MATCH signal not threaded
**Current:** `callAiJson('MATCH', matchSystemPrompt, promptPayload, { timeoutMs: endpointLlmTimeout(120) })`
**Problem:** `aiScorer` does not close over `request.signal`. openai-bounded at 115s; bedrock override drops both signal and timeout.
**Fix:** thread `request.signal`; pair with provider-layer fix for bedrock.
**Orphaned tokens/req:** ~0 incremental (input is sunk; openai timeout bounds output).

### app/api/ai/parse-cargo/route.ts:166 — PARSE_CARGO signal not threaded (default gemini)
**Current:** `callAiJsonShim('PARSE_CARGO', systemPrompt, prompts[i], { timeoutMs: LLM_TIMEOUT_MS, maxTokens: 16000, ..., responseSchema, temperature: 0, seed: 42 })`
**Problem:** No `signal`. The route's `withTimeout(p, 45000)` race resolves `null` but does **not** cancel the underlying gemini promise — the `generateContent` call is orphaned and keeps billing at `PARSE_CARGO_CONCURRENCY=8`. The route comment explicitly intends `timeoutMs` to cancel the upstream stream; that intent silently fails on gemini.
**Fix:** add `signal: request.signal` + provider-layer gemini fix.
**Orphaned tokens/req:** ~9,300 (full static prefix + partial output per orphaned call; sunk-but-billed).

### app/api/ai/parse-recap/route.ts:59 — PARSE_RECAP signal not threaded
**Current:** `callAiText('PARSE_RECAP', FIXTURE_RECAP_PARSER_PROMPT, userPrompt, { timeoutMs: endpointLlmTimeout(120), responseSchema: PARSE_RECAP_SCHEMA })`
**Problem:** No `signal`; `pLimit(3)` fan-out, one shared signal would cancel all in-flight on disconnect. Note: on the openai default path the input prefix is billed up-front, so only post-disconnect *output* (~1k tok) is recoverable — the originally-flagged 5k figure was corrected during verification.
**Fix:** add `signal: request.signal`.
**Orphaned tokens/req:** ~1,000 (output only).

### app/api/ai/parse-vessel/route.ts:70 — PARSE_VESSEL signal not threaded
**Current:** `callAiText('PARSE_VESSEL', VESSEL_POSITION_PARSER_PROMPT, prompt, { timeoutMs: endpointLlmTimeout(60), responseSchema, maxTokens: 16384, maxRetries: 1 })`
**Problem:** No `signal`. openai-bounded at 55s; per-email `pLimit(3)` fan-out continues generating discarded output on disconnect.
**Fix:** add `signal: request.signal`.
**Orphaned tokens/req:** ~1,800.

### app/api/ai/recap/route.ts:76 — RECAP signal not threaded
**Current:** `callAiJson(RECAP_SCOPE, NEGOTIATION_RECAP_SYSTEM_PROMPT, JSON.stringify(threadInput), { timeoutMs: endpointLlmTimeout(60) })`
**Problem:** No `signal`; `Promise.all` over long threads orphans every parallel call on disconnect, each bounded only by the 55s internal timeout (openai).
**Fix:** add `signal: request.signal`.
**Orphaned tokens/req:** ~1,500.

### app/api/ai/draft-quote/route.ts:120 / draft-reply/route.ts:63 & :80 — DRAFT_* signal not threaded
**Current:** `callAiText('DRAFT_QUOTE'|'DRAFT_REPLY', systemPrompt, userPrompt, { timeoutMs: endpointLlmTimeout(30) })`
**Problem:** No `signal`. openai default *would* honor it end-to-end (the wire is connected downstream but unplugged at the route). On disconnect the stream runs to the 25s internal timeout.
**Fix:** `{ timeoutMs: endpointLlmTimeout(30), signal: request.signal }` on all three sites.
**Orphaned tokens/req:** ~450–2,250 (short email/quote output).

### app/api/parser/email/route.ts:43 — PARSE_CARGO (parser endpoint) signal not threaded
**Current:** `callAiJson('PARSE_CARGO', CARGO_INQUIRY_PARSER_PROMPT, text, { timeoutMs: 30_000, responseSchema, temperature: 0 })`
**Problem:** No `signal`; openai default honors it if passed. Bounded at 30s.
**Fix:** add `signal: req.signal`.
**Orphaned tokens/req:** ~300 (output; input sunk).

### lib/economics/route-decision.ts:270 — compare-routes reasoning signal not threaded
**Current:** `callAiText(prompt, systemPrompt, undefined, { timeoutMs: LLM_REASON_TIMEOUT_MS })`
**Problem:** Direct `lib/openai.ts` path (honors signal if passed). `compareRoutes()`/`llmReason()` have no signal param; `req.signal` never forwarded. Bounded tightly at 4s; always has a template fallback.
**Fix:** thread `signal` through `compareRoutes`→`llmReason`→`callAiText`.
**Orphaned tokens/req:** ~115.

### lib/imo/cii-lookup.ts:57 — CII lookup signal not threaded (RSC)
**Current:** `callAiJson(..., 100, { timeoutMs: CII_LLM_TIMEOUT_MS })`
**Problem:** `LookupOpts` has no `signal` field; reached from a Server Component render (no easy `request.signal`). Direct `lib/openai.ts` path honors a signal if supplied. Bounded by 30s + `maxTokens=100`.
**Fix:** add `signal?` to `LookupOpts` and thread it; mainly enables non-page callers to cancel.
**Orphaned tokens/req:** ~100.

### lib/whatsapp/forward-parser.ts:165, image-ocr.ts:99/130, voice-transcribe.ts:48/81 — WhatsApp ingest chain signal not threaded
**Current:** all pass `{ timeoutMs: ... }` only; `parseForwardedMessage(msg, client)` has no `signal` param across `route.ts:52` → `forward-parser` → `extractTextFromImage`/`transcribeAudio`.
**Problem:** `request.signal` exists on the `/api/whatsapp/ingest` POST (awaited inline) but is dropped across 2–3 function boundaries. The openai legacy sub-paths honor a signal if threaded (bounded 20–30s). The **gemini vision** ([image-ocr.ts:99](lib/whatsapp/image-ocr.ts#L99) → callGeminiVision, no opts at all) and **gemini audio** ([voice-transcribe.ts:81](lib/whatsapp/voice-transcribe.ts#L81) → callAiAudio gemini branch) sub-paths drop both signal *and* timeout at the provider layer — uncancellable and unbounded. (The public webhook route is fire-and-forget, so the headline "user disconnect" scenario applies only to the internal-token `/ingest` endpoint.)
**Fix:** add `signal?: AbortSignal` to `parseForwardedMessage`/`extractTextFromImage`/`transcribeAudio`, forward `request.signal` from `route.ts:52`, and apply the provider-layer fix for the gemini vision/audio branches.
**Orphaned tokens/req:** ~90–1,100 (vision/audio image+audio tokens dominate).

### lib/knowledge/embeddings/client.ts:67 — Vertex embeddings signal not threaded
**Current:** `await client.predict({ endpoint, instances, parameters })`
**Problem:** `RetrieveOptions` has no `signal`; none of the four RAG-consuming routes thread `request.signal`. gax unary `predict()` cancels via the call object, not a Web `AbortSignal`, so even a threaded signal would be dropped at the provider layer.
**Fix:** thread a per-request budget down and wrap in `Promise.race` against an abort-rejection (plus the timeout in §C). Reached only when `KNOWLEDGE_RAG_ENABLED=true` (default off), inside graceful try/catch.
**Orphaned tokens/req:** ~120.

### Refuted abort gaps (verification)
- **generate-route-map/route.ts:181 (Imagen 4)** — refuted. The `@google/genai` `GenerateImagesConfig.abortSignal` is documented client-only ("will not cancel the request in the service… you will still be charged"). Threading the signal cannot recover the ~$0.04/image; not an actionable abort gap.
- **plan-first.ts:164 (AGENT_PLANNER)** — refuted. No production caller; reached only from tests. The two agent routes use `buildPlan→detectKinds` (regex, no LLM). Latent footgun, not a live gap.
- **compute-matches.ts:34 (MATCH abort)** — refuted *as an abort gap*. Invoked fire-and-forget (`void`), detached from request lifecycle, and no caller threads a signal. The real defect here is the **timeout** drop (§C), not abort.
- **ai-provider.ts:650 (bedrock abort)** and **gemini abort** are confirmed at the code level but yield 0 incremental orphaned tokens today because no caller threads a signal — reported under the systemic finding above; their *timeout* counterparts are the live harm.

## (B) Caching opportunities

No `cache_control` (Bedrock/Anthropic) or `cachedContent`/`CachedContent` (Gemini) appears anywhere in `lib/` or `app/` (the only `cacheControl` hit is an unrelated HTTP `max-age` header in generate-route-map). Every call re-sends its full static prefix. Sorted by per-request savings.

### lib/ai-provider.ts (all gemini scopes) / parse-cargo & parser-email — CARGO prefix ~10,600 tok
**Static prefix:** `CARGO_INQUIRY_PARSER_PROMPT` (~10,011 tok, sole interpolation `${SHIPPING_GLOSSARY}` is a static const) + serialized `PARSE_CARGO_SCHEMA` (~600 tok). User email is the separate `contents`/`user` arg.
**Est savings:** Gemini ~75% → ~7,950 tok/req saved. At gemini-2.5-flash $0.075/1M: **~$0.000596/req → ~$0.60 / 1,000 req**. On bedrock claude-opus-4-7 $15/1M, ~90% of ~10,600 → ~$0.143/req → **~$143 / 1,000 req**.
**How:** Gemini — explicit `cachedContent` for `systemInstruction`+schema keyed by parserVersion/model (or verify implicit caching with the prefix leading + stable). Bedrock — `system: [{ type:'text', text: system, cache_control:{ type:'ephemeral' } }]`. OpenAI — set a stable `prompt_cache_key`.

### lib/matching/compute-matches.ts:36 / match/route.ts:90 — MATCH prefix ~6,956 tok
**Static prefix:** `MATCH_PROMPT` (freight rules + `SHIPPING_GLOSSARY` + output-format JSON block), one interpolation, fully static. No responseSchema on this site.
**Est savings:** Gemini ~75% → ~5,217 tok/req. At gemini-2.5-flash: **~$0.39 / 1,000 req**. Bedrock claude-opus-4-7 ~90% of ~6,956 → ~$0.094/req → **~$94 / 1,000 req**; on claude-sonnet-4-6 $3/1M → **~$18.8 / 1,000 req**.
**How:** Bedrock `cache_control` breakpoint at the end of the `MATCH_PROMPT` block (works even when RAG `igcContext` is appended after, since prefix caching matches the longest stable head). Gemini explicit `cachedContent`.

### parse-vessel/route.ts:70 — VESSEL prefix ~10,150 tok
**Static prefix:** `VESSEL_POSITION_PARSER_PROMPT` + `SHIPPING_GLOSSARY` (~9,406 tok) + `PARSE_VESSEL_SCHEMA` (~765 tok, gemini/bedrock path).
**Est savings:** Gemini ~75% → ~7,600 tok/req → **~$0.57 / 1,000 req** (flash). Bedrock ~90% of ~10,150 → **~$137 / 1,000 req** (opus) / **~$27 / 1,000 req** (sonnet).
**How:** Bedrock `cache_control` on system block; Gemini `cachedContent`. (OpenAI default already gets best-effort automatic prefix caching — explicit pinning is incremental.)

### parse-recap/route.ts:59 — RECAP-parser prefix ~5,000 tok
**Static prefix:** `FIXTURE_RECAP_PARSER_PROMPT` + `SHIPPING_GLOSSARY` (~4,000 tok) + `PARSE_RECAP_SCHEMA` (~900–1,100 tok). Re-sent once per uncached email under `pLimit(3)`. Note: on the openai default path the schema is **not** serialized into the request (only `{timeoutMs,signal,maxRetries}` are forwarded), so the openai prefix is ~4,000 tok.
**Est savings:** Gemini ~75% of ~5,000 → ~3,750 tok/req → **~$0.28 / 1,000 req** (flash). Bedrock ~90% of ~4,000 → ~3,650 → **~$54 / 1,000 req** (opus).
**How:** Bedrock `cache_control`; Gemini explicit `cachedContent`.

### recap/route.ts:76 — negotiation-recap prefix ~1,737 tok
**Static prefix:** `NEGOTIATION_RECAP_SYSTEM_PROMPT` + `SHIPPING_GLOSSARY` (~1,737 tok, no responseSchema; JSON shape requested in prose). Re-sent per long thread in the `Promise.all` batch.
**Est savings:** Gemini ~75% → ~1,300 tok/req → **~$0.10 / 1,000 req** (flash). Bedrock ~90% → **~$23 / 1,000 req** (opus).
**How:** Bedrock `cache_control` on system block; Gemini implicit/explicit caching.

### classify/route.ts:38 — CLASSIFY prefix ~3,800 tok
**Static prefix:** `CLASSIFICATION_SYSTEM_PROMPT` (or `_R4`) + `SHIPPING_GLOSSARY` (~3,640–3,940 tok) + `CLASSIFY_SCHEMA` (~160 tok; gemini path only — openai branch drops it). Re-sent per `CLASSIFY_BATCH_SIZE=20` batch.
**Est savings:** Gemini ~75% → ~2,850 tok/req-batch. At gemini-2.5-flash: **~$0.21 / 1,000 batches**. Bedrock ~90% → **~$51 / 1,000 batches** (opus).
**How:** Gemini `cachedContent` for the ~3.6k-tok system; Bedrock `cache_control`.

### lib/openai.ts:93 — no `prompt_cache_key` (all openai scopes, ~5k–10k tok prefixes)
**Static prefix:** the leading `role:system` message per scope (MATCH ~7k, PARSE_CARGO ~10k, pair-analyzer ~4.9k tok).
**Est savings:** OpenAI automatic prefix caching gives ~50% on cached input ≥1024 tok but is unpinned without a key. Adding `prompt_cache_key` maximizes hit-rate routing → recovers most of ~2.5k–5k tok/req depending on scope.
**How:** thread a `cacheKey` (scope/system-hash) through `LlmCallOptions`/`AiOpts` and set `prompt_cache_key` on `create()`. Systemic — benefits every openai caller.

### Small/refuted caching findings
- DRAFT_QUOTE (~380 tok), DRAFT_REPLY (~105–118 tok), CII (~35 tok), route-decision (~15 tok), forward-parse (~174 tok), OCR/voice prompts (~24–56 tok) are below or near the ~1,024-tok cacheable floor — not worth caching.
- **EXPLAIN_DEAL caching — refuted.** Prefix is ~776 tok (EN) / ~1,100 tok (AR), both below the gemini-2.5-pro implicit-cache floor of 2,048 tok and too small for explicit `cachedContent`. No recoverable savings on the scope's default model.

## (C) Timeout gaps

All confirmed timeout gaps are the gemini/bedrock provider-layer drop (and the gax embeddings client). On these branches the caller's `timeoutMs` is silently ignored; the only backstop is the platform `maxDuration` kill, which under the project's **pm2/VPS deploy is a no-op**, and which (even on a serverless host) does not cancel the upstream request or surface as the graceful `LLMTimeoutError`→504 the routes expect.

- **lib/ai-provider.ts:551 (gemini, ALL gemini scopes)** — *Behavior on hang:* `generateContent` await never settles; no timer rejects it. Route `catch (LLMTimeoutError)` (e.g. parse-vessel:74, parse-cargo) is dead code. *Fix:* set `httpOptions.timeout` on the `GoogleGenAI` ctor (or compose an `AbortController` from `opts.timeoutMs ?? 85_000` and pass `config.abortSignal`), throwing `LLMTimeoutError` on fire. Live on the **default** config for PARSE_CARGO (gemini-2.5-flash) and EXPLAIN_DEAL (gemini-2.5-pro).

- **lib/ai-provider.ts:650 (bedrock, ALL bedrock scopes)** — *Behavior on hang:* `client.send(cmd)` never resolves; `@smithy/node-http-handler` default `requestTimeout` is 0 (disabled) and no `requestHandler` is configured, so a stalled socket hangs unbounded. `caller-supplied timeoutMs` (e.g. 115,000 for MATCH) is ignored. **Severity high** — this is the documented `MATCH_PROVIDER=bedrock` config path. *Fix:* `const ac = new AbortController(); const t = setTimeout(()=>ac.abort(), opts?.timeoutMs ?? 85_000); client.send(cmd, { abortSignal: anySignal([ac.signal, opts?.signal]) })` in a try/finally clearing `t`.

- **lib/whatsapp/image-ocr.ts:99 → callAiVision (gemini vision)** — *Behavior on hang:* `callAiVision` never reads `opts.timeoutMs`; `callGeminiVision` takes no `opts` at all and `generateContent` gets no abort/timeout. The `/api/whatsapp/ingest` POST hangs; the `LLMTimeoutError` catch in image-ocr is unreachable. *Fix:* compose timeout+signal inside `callAiVision`, add an `opts` param to `callGeminiVision`, pass `config.abortSignal`; mirror for the bedrock vision branch via `client.send(cmd, { abortSignal })`.

- **lib/whatsapp/voice-transcribe.ts:81 → callAiAudio (gemini audio)** — *Behavior on hang:* `callAiAudio` never reads `opts.timeoutMs`; the gemini branch (`generateContent`, [lib/ai-provider.ts:999](lib/ai-provider.ts#L999)) sets no config/abortSignal; the downstream `FORWARD_PARSE_TIMEOUT_MS` does not cover the *transcription* step (separate sequential call). Ingest handler hangs indefinitely on a stalled audio response. *Fix:* set `httpOptions.timeout` on the audio `GoogleGenAI` ctor or compose an `AbortController`; throw `LLMTimeoutError` so `voice-transcribe.ts:87` degrades to empty text.

- **app/api/ai/generate-route-map/route.ts:181 (Imagen 4)** — *Behavior on hang:* inline `GoogleGenAI` ctor sets no `httpOptions.timeout`; the legacy `ApiClient` applies no default deadline when neither `httpOptions.timeout` nor `abortSignal` is set, so `requestInit.signal` stays unset. Only `maxDuration=30` backstops (runtime-dependent). *Fix:* pass `httpOptions: { timeout: 25_000 }` to the ctor or wrap the await in an `AbortController` timeout. (Behind default-off `ROUTE_MAP_ENABLED`.)

- **lib/knowledge/embeddings/client.ts:67 (Vertex gax predict)** — *Behavior on hang:* `predict()` is called with no `CallOptions`, but gax falls back to the bundled `prediction_service_client_config.json` defaults (`total_timeout_millis=600000`, per-RPC `max_rpc_timeout_millis=60000`, empty `non_idempotent` retry set), so a true stall rejects with `DEADLINE_EXCEEDED` within ~600 s — a **bounded** failure, not the infinite hang originally flagged (refuted as "indefinite"). *Fix (hardening, not a true gap):* pass `{ timeout: 30_000, maxRetries: 2 }` as the 2nd arg to align with the 85s convention and thread a per-request budget.

### Refuted/narrowed timeout findings
- **embeddings/client.ts:67 "indefinite hang"** — refuted; gax bundled config bounds it at ~600 s.
- **compute-matches.ts:34 timeout** — confirmed (gemini, `timeoutMs=115000` dropped) but only fires on the `MATCH_PROVIDER=gemini` override; default MATCH is openai which honors the timeout.
- All gemini/bedrock timeout gaps are **config-gated** for scopes whose shipped default is openai (CLASSIFY, MATCH, PARSE_VESSEL, PARSE_RECAP, RECAP) — real and total when the documented per-scope override is set, but dormant on the bare default. PARSE_CARGO and EXPLAIN_DEAL default to gemini, so their timeout drop is live as shipped.

## Counts & estimated monthly token waste

**Call sites audited:** 24 (22 concrete sites + 2 shared provider-layer branches; the openai provider-layer site is the "good" reference layer).

**Gap counts (confirmed / flagged):**
- Abort gaps: **18 confirmed / 22 flagged** — 4 refuted (Imagen Imagen-4 client-only, plan-first test-only, compute-matches detached, and the two provider-layer abort sub-claims yield 0 incremental tokens today).
- Timeout gaps: **6 confirmed / 8 flagged** — embeddings "indefinite hang" narrowed to bounded-600s; one downgraded to config-gated.
- Caching gaps: **8 confirmed / 9 flagged** — EXPLAIN_DEAL refuted (sub-floor prefix).

**Per-request confirmed cacheable prefix re-sends** (static tokens billed full-rate on each call, before any caching):

| Scope | Prefix tok | Notes |
|---|---|---|
| PARSE_CARGO (×2 sites) | ~10,600 | fan-out ×8 |
| PARSE_VESSEL | ~10,150 | fan-out ×3 |
| MATCH | ~6,956 | once/run |
| PARSE_RECAP | ~5,000 | fan-out ×3 |
| CLASSIFY | ~3,800 | ×N/20 batches |
| RECAP | ~1,737 | ×N threads |

A representative single user session that triggers classify + parse-cargo + parse-vessel + match + recap re-sends on the order of **~35,000–40,000 static prefix tokens** that caching would largely eliminate.

**Monthly estimate (volume ASSUMED, not measured — this is a demo app):**
Assume **2,000–20,000 LLM calls/month**, midpoint **11,000 calls/month**, scaling linearly. Assume an average cacheable static prefix of **~6,000 tokens/call** across the heavy scopes (classify/parse/match/recap), re-billed today.

- Re-sent static prefix tokens/month ≈ 11,000 × 6,000 = **~66M tokens/month**.
- Recoverable with caching: ~75% (Gemini implicit) to ~90% (Bedrock) → **~50–59M tokens/month** of avoidable input.
- **USD at gemini-2.5-flash** ($0.075/1M): ~66M × $0.075 = **~$5/month** gross prefix cost; caching saves **~$3.7/month**.
- **USD at openai gpt-5.5 (shipped default, ClipProxy):** not in the supplied cost table — no grounded figure; automatic prefix caching already recovers ~50% best-effort, and a `prompt_cache_key` would pin the rest.
- **USD if MATCH/PARSE_* run on bedrock claude-opus-4-7** ($15/1M): ~66M × $15 = **~$990/month** gross prefix cost; `cache_control` saves **~$890/month**. On claude-sonnet-4-6 ($3/1M): ~$198 gross, ~$178 saved.

The token/dollar waste is therefore **modest on the shipped gemini/openai defaults (single-digit $/month at midpoint volume)** but **scales to ~$0.9k/month if the documented Bedrock-opus override is enabled at the midpoint, and linearly with volume.** The higher-priority finding is non-monetary: the **gemini/bedrock provider-layer timeout drop** is an availability risk (hung workers) that is live on the *default* PARSE_CARGO and EXPLAIN_DEAL paths and not bounded at all under the pm2/VPS deployment.

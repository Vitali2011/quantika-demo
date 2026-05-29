# AI-Provider Abstraction Consistency Audit
Date 2026-05-28 | Branch dw/aiprovider-consistency-2026-05-28 | Scope app/api/** + lib/** | Read-only audit.

The single-switch promise (`AI_PROVIDER` / `<SCOPE>_PROVIDER` flips every LLM call) is **not fully true today** on two axes. First, several live runtime paths bypass the `lib/ai-provider.ts` shim entirely and call `lib/openai.ts` (or a raw SDK/fetch) directly — most notably WhatsApp forwarded-message parsing and Suez-vs-Cape route reasoning — so they are hard-pinned to OpenAI/ClipProxy and write no `ai_audit` row regardless of env. Second, even through the shim the providers are not behaviorally equivalent: `AbortSignal`/`timeoutMs` are silently dropped for both Gemini and Bedrock, and sampling controls (`temperature`, `topP`, `maxTokens`, `responseSchema`) diverge per provider, so the same call behaves differently after a switch. None of these are crashes or auth holes — they are provider-lock, audit-coverage, and capability-parity gaps. Several initially-flagged candidates (type-only `@google/genai` imports, the legitimate `lib/openai.ts` backend, signal-not-threaded at through-shim call sites, and the orphaned `lib/voice/whisper-transcribe.ts`) were verified and cleared.

## Top 5 Findings
| Rank | id | Severity | file:line | One-line impact |
|---|---|---|---|---|
| 1 | A-bypass-forward-parser-callAiJson / B-01 | medium | lib/whatsapp/forward-parser.ts:165 | WhatsApp ingest parsing hard-pinned to OpenAI, no provider switch, no ai_audit |
| 2 | A-2-seed-port-da-openai-fetch | medium | scripts/seed-port-da.ts:102 | Deploy-time seed raw-fetches OpenAI: provider-locked, no audit, no timeout, raw JSON.parse |
| 3 | A-bypass-route-decision-callAiText / B-02 | medium | lib/economics/route-decision.ts:270 | Suez-vs-Cape route reasoning pinned to OpenAI, env flip ignored, no ai_audit |
| 4 | C-001-gemini-signal-dropped / C-002-gemini-timeoutMs-dropped | medium | lib/ai-provider.ts:551 / :516 | Gemini drops opts.signal and timeoutMs — calls can hang past the 85s contract |
| 5 | C-003-bedrock-signal-dropped / C-004-bedrock-timeoutMs-dropped | medium | lib/ai-provider.ts:650 / :628 | Bedrock drops opts.signal and request timeout — uncancellable, can hang indefinitely |

## (A) Shim Bypasses
| file:line | SDK / endpoint | Real runtime call? | Fix |
|---|---|---|---|
| lib/whatsapp/forward-parser.ts:165 | `@/lib/openai` callAiJson (OpenAI/ClipProxy) | Yes (WhatsApp ingest, app/api/whatsapp/ingest/route.ts:52) | Route via `@/lib/ai-provider` callAiJson with scope `FORWARD_PARSE` — restores provider switch + ai_audit |
| lib/economics/route-decision.ts:270 | `@/lib/openai` callAiText (OpenAI/ClipProxy) | Yes (app/api/voyage/compare-routes/route.ts:132 → llmReason) | Import callAiText from `@/lib/ai-provider`, scope `ROUTE_REASON`/`ROUTE_DECISION` |
| lib/whatsapp/image-ocr.ts:79,130 | `@/lib/openai` callAiText (OpenAI vision rollback) | Yes (default `provider==='openai'` branch) | Documented C2 rollback (shim callAiVision openai throws, ai-provider.ts:927); openai-OCR emits no ai_audit |
| lib/whatsapp/voice-transcribe.ts:48 | `@/lib/openai` callAiText (OpenAI default/rollback) | Yes (default when WHATSAPP_VOICE!='gemini') | Documented rollback (shim callAiAudio openai throws, ai-provider.ts:1023); openai-voice emits no ai_audit |
| app/api/ai/generate-route-map/route.ts:171,179 | `@google/genai` GoogleGenAI Imagen 4 (Vertex) | Yes (POST handler, line 314; flag-gated) | Out of shim scope (no image-gen entrypoint). Add callAiImage or document; currently no ai_audit, no provider switch |
| scripts/seed-port-da.ts:102 | raw fetch api.openai.com/v1/chat/completions | Yes (deploy step, deploy-vps.sh:32) | Route via callAiJson scope `SEED_PORT_DA`: provider routing + audit + extractJson; add timeout |
| scripts/progonq/judge-parse-cargo.ts:276 | `@anthropic-ai/sdk` messages.create (api.anthropic.com) | Yes (eval-only fallback, scripts/) | Eval tooling — outside shim contract; keep out of app/ + lib/. Optionally scope `*_JUDGE_PROVIDER`=bedrock |

Notes: forward-parser, route-decision, image-ocr, and voice-transcribe also appear in (B) as inconsistent call sites (same lines). The Imagen path appears as both A-bypass-generate-route-map-imagen and A-4-routemap-imagen-genai-direct (same call). The Anthropic-direct judge is recorded under both none-judge-parse-cargo-anthropic-eval and A-3 — it is an eval script, so it is recorded rather than actioned.

### Cleared (not bypasses)
- lib/schemas/parse-cargo.ts:12 (+ parse-vessel.ts:10, parse-recap.ts:12, classify.ts:9) — `import { Type } from '@google/genai'` is enum/type-only; no client constructed, no generateContent. These build `responseSchema` passed into the shim.
- lib/openai.ts:1 — `import OpenAI from 'openai'` is the shim's legitimate OpenAI backend (delegated to via ai-provider.ts:442-473), not a bypass. Provider routing happens upstream in getProvider.
- lib/voice/whisper-transcribe.ts:40 — direct fetch to api.openai.com Whisper exists but is orphaned: no production importer (only ai-provider.ts doc-comments + a test). Not a live bypass. See (D).

## (B) Inconsistent Call Sites
| Call site (file:line) | Through shim? | Divergence (audit / provider-lock / signal / timeout / retry) | Fix |
|---|---|---|---|
| lib/whatsapp/forward-parser.ts:165 | No (`@/lib/openai`) | provider-lock + missing ai_audit (timeout honored) | callAiJson('FORWARD_PARSE', system, user, { timeoutMs }) from shim |
| lib/economics/route-decision.ts:270 | No (`@/lib/openai`) | provider-lock + missing ai_audit (timeout honored) | callAiText('ROUTE_REASON', system, prompt, { timeoutMs }) from shim |
| lib/imo/cii-lookup.ts:55 | No (dynamic `@/lib/openai`) | provider-lock + missing ai_audit (timeout honored) | `import('@/lib/ai-provider').callAiJson('CII_LOOKUP', …)`; wrap in try/catch for the `{rating:'unknown'}` fallback |
| app/api/ai/generate-route-map/route.ts:171 | No (raw `@google/genai`) | missing ai_audit + hardcoded provider/model + no signal/timeout | Image-gen has no shim entrypoint; add callAiImage or writeAuditRecord-equivalent + document |
| lib/whatsapp/voice-transcribe.ts:48 | No openai branch / Yes gemini (callAiAudio:81) | asymmetric ai_audit between providers of one scope (openai unaudited) | Shim callAiAudio openai throws by design; log openai branch to ai_audit or document as unaudited |
| lib/whatsapp/image-ocr.ts:79 (and :130) | No openai branch / Yes gemini (callAiVision:99) | asymmetric ai_audit (openai default path unaudited) | Implement GPT-4o vision in shim callAiVision or writeAuditRecord on openai-OCR branch |

## (C) Provider Capability Drift
| Capability | openai | gemini | bedrock | claude-cli |
|---|---|---|---|---|
| responseSchema (structured JSON) | ignored (extractJson/fence-strip only) | honored (responseMimeType+responseSchema, L544-547) | ignored (extractJson only, L749) | ignored (extractJson only, L754) |
| thinkingBudget | ignored (never forwarded) | honored (thinkingConfig, L537-542) | ignored (no thinking field, L636) | ignored (no flag) |
| temperature | ignored (hardcoded 0.1/0.3, openai.ts L100/173) | honored (buildGeminiSamplingFields L70) | honored (buildBedrockSamplingFields L86) | ignored (no flag) |
| topP | ignored (not forwarded) | honored (L71) | honored (top_p L87) | ignored (no flag) |
| topK | n/a (chat API) | honored (L72) | ignored — Gemini-only by doc (L82-89) | ignored (no flag) |
| seed | ignored (Gemini-only by doc; API-supported but not forwarded) | honored (L73) | n/a (Anthropic InvokeModel no seed) | ignored (no flag) |
| maxTokens | partial: JSON honored (L454), text ignored (L467) | honored (maxOutputTokens L74) | honored (max_tokens L84); vision/audio hardcoded 4096 (L896/679) | ignored (no flag) |
| AbortSignal (opts.signal) | honored (composed AbortController, openai.ts L102/174) | ignored (not passed to generateContent L551) | ignored (not passed to client.send L650/907/696) | ignored (spawnSync no signal L365) |
| timeoutMs | honored (buildAbortController, openai.ts L42-44) | ignored (only retryOptions, no httpOptions.timeout L516) | ignored (no requestTimeout L628) | honored (spawnSync timeout L368) |
| maxRetries | honored (passed to create, openai.ts L102/174) | honored (httpOptions.retryOptions L96-101) | ignored (no SDK retries, by design L56) | ignored (no flag) |
| system-role | honored (system message, openai.ts L96/168) | honored text (systemInstruction L535); vision none; audio none (L999) | honored text (system L640); vision omits system (L894); audio omits system (L677) | honored (--system-prompt L361) |
| streaming | honored (always streams, openai.ts L99/166) | n/a (non-stream generateContent) | n/a (InvokeModel non-stream) | n/a (spawnSync --print) |
| vision | throws (not implemented, L927) | honored (callGeminiVision L560) but no opts threaded | honored (inline payload L869-912) but no system/sampling/opts | n/a (no vision path) |
| audio | throws (not implemented, L1023) | honored (inline L979-1011) but no opts/config | honored (callBedrockAudio L656) but no opts/system | n/a (no audio path) |

Silent divergences that ACTUALLY change behavior after a provider switch:
- **opts.signal dropped for gemini** — callGeminiText passes no abortSignal to generateContent (lib/ai-provider.ts:551). Caller cancellation has no effect.
- **opts.timeoutMs dropped for gemini** — buildGeminiHttpOptions maps only retryOptions, no httpOptions.timeout (lib/ai-provider.ts:516); the 85s contract is unenforced.
- **opts.signal dropped for bedrock** — client.send(cmd) gets no abortSignal (lib/ai-provider.ts:650). Request cannot be aborted.
- **opts.timeoutMs dropped for bedrock** — BedrockRuntimeClient ctor has no requestHandler/requestTimeout (lib/ai-provider.ts:628); call can hang indefinitely.
- **temperature silently no-op for openai** — hardcoded 0.1 (JSON) / 0.3 (text) at lib/openai.ts:100/173; honored for gemini+bedrock. Same scope produces different sampling after a switch.
- **maxTokens silently no-op for openai TEXT** — callOpenAiText drops it (lib/ai-provider.ts:467); JSON path forwards it. Long text uses model default instead of caller's cap.
- **topP silently no-op for openai** — not forwarded (lib/ai-provider.ts:449); honored for gemini+bedrock.
- **bedrock VISION drops temperature/topP/maxTokens** — payload hardcodes max_tokens:4096 and skips buildBedrockSamplingFields (lib/ai-provider.ts:894-898); reachable via WHATSAPP_OCR_PROVIDER=bedrock (image-ocr.ts:99 passes timeoutMs+signal that are then ignored).
- **bedrock AUDIO drops maxTokens/temperature/topP** — callBedrockAudio takes no opts, hardcodes max_tokens:4096 (lib/ai-provider.ts:677-687).
- **gemini AUDIO drops sampling/maxRetries** — generateContent called with no config (lib/ai-provider.ts:999-1008); reachable via voice-transcribe.ts:81.
- **gemini VISION drops sampling/maxTokens/responseSchema/thinkingBudget** — callGeminiVision receives no opts (lib/ai-provider.ts:864).
- **claude-cli drops all sampling + responseSchema** — args carry only model/output-format/budget/system (lib/ai-provider.ts:360); JSON path always runs extractJson regardless of responseSchema (eval-only path).
- **gemini-audio + claude-cli cost untracked** — `gemini:gemini-2.0-flash` and `claude-cli:claude-opus-4-7` are absent from COST_TABLE, so computeCostUsd returns null on every voice transcription / claude-cli row (lib/ai-provider.ts:144-156); voice-transcribe.ts:10 hardcodes the 2.0-flash model.

Note on the matrix: the original draft labeled vision/audio `system-role` as `vision=''`/empty-string-discarded for gemini — corrected here. callAiVision has no `system` parameter and AiOpts has no system field, so nothing is "discarded"; the real vision/audio drift is dropped *opts* (sampling/timeout), not a lost system prompt (C-014 verdict).

### Cleared (not real drift)
- bedrock topK (C-005), bedrock seed (C-006), bedrock responseSchema (C-007), bedrock thinkingBudget (C-008), openai seed/topK (C-012) — all documented in AiOpts JSDoc as Gemini-only / API-unsupported for that provider; provider-scoped by design, not silent drops.
- claude-cli signal (C-009) — spawnSync is synchronous and blocks the event loop, so even if wired, an external AbortSignal could never fire; no achievable behavior change.
- gemini retry doc-comment 4-retries vs 5-attempts (C-019) — prose-only, factually equivalent (attempts = retries + 1), no runtime effect.

## (D) Dead / Unreachable Provider Branches
| Branch | Trigger condition | Reachable? | Note |
|---|---|---|---|
| lib/voice/whisper-transcribe.ts:40 (direct OpenAI Whisper fetch) | transcribeAudio imported from `@/lib/voice/whisper-transcribe` | No prod importer (only ai-provider doc-comments + a test) | truly-dead (production) — orphaned; live path is lib/whatsapp/voice-transcribe.ts |
| callAiVision `case 'openai'` throw (lib/ai-provider.ts:927) | provider resolves to openai (global default) for a vision scope | Reachable for any unguarded direct caller; prod caller image-ocr.ts pre-guards openai | reachable-and-throws — intentional fail-loud guard |
| callAiAudio `case 'openai'` throw (lib/ai-provider.ts:1023) | provider resolves to openai for an audio scope | Reachable for unguarded direct caller; voice-transcribe.ts routes openai to Whisper first | reachable-and-throws — intentional fail-loud guard |
| claude-cli branch NEXT_RUNTIME throw (lib/ai-provider.ts:348) | process.env.NEXT_RUNTIME set (any Next.js handler) | Dead from request handlers; live only in eval scripts | intentional-guard — by design |
| gemini-audio / claude-cli cost-table keys (lib/ai-provider.ts:144) | gemini:gemini-2.0-flash or claude-cli:* (provider:model) lookup | Pairs are produced at runtime but absent from COST_TABLE | cost-attribution dead spot — computeCostUsd always returns null (not a throw) |

### Cleared (not dead / not a defect)
- D4 — no Vertex AI Search / discoveryengine remnant leaks into ai-provider scope; all `vertexai:true` usages are the legitimate Gemini generateContent path. The rolled-back Search retriever lives in lib/knowledge/embeddings/retriever-vertex.ts (out of scope).
- D5 — COST_TABLE keys (`gemini-2.5-pro-deepthink`, `gemini-2.5-flash-lite`, unprefixed `bedrock:anthropic.claude-opus-4-7`) are reachable via documented config/eval runtime; same `model` string feeds both the SDK call and cost lookup with no transform. Not unselectable.
- D7 — getProvider's silent-but-logged `openai` fallback for unknown provider values is intentional and documented; the dependent vision throw is the intended loud-fail on misconfiguration, not a defect.

## Verdict — Is the one-switch promise true?
**No.** The promise holds only for call sites that actually go through the shim *and* only for the capabilities a given provider implements — neither condition is universally met. Concretely, (1) at least four live runtime paths bypass the env entirely: WhatsApp ingest parsing (forward-parser.ts:165), route reasoning (route-decision.ts:270), CII lookup (cii-lookup.ts:55), and the Imagen route-map (generate-route-map/route.ts:171) are hard-pinned to OpenAI/Vertex and ignore `AI_PROVIDER` / `<SCOPE>_PROVIDER`, plus the deploy-time seed (seed-port-da.ts:102). (2) Even for through-shim calls, flipping the provider changes observable behavior: `opts.signal` and `opts.timeoutMs` are silently dropped for both Gemini and Bedrock (so cancellation/timeout guarantees vanish), `temperature`/`topP`/`maxTokens` differ per provider, and several scopes lose `ai_audit`/cost rows. So a flip moves *most* core text/JSON calls but leaves bypassed paths on OpenAI and silently alters timeout, cancellation, sampling, and audit behavior on the rest — the switch is partial, not equivalent.

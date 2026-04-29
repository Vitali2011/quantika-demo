# HANDOFF — port-master global expansion (Wave 4)

**Status:** Phases 0-4.2 done. Pause mid-4.3 (enrich-all interrupted). Resume from **Phase 4.3** (enrich-all). Build green, 454 tests passing.

**Branch:** `claude/port-master-global` (worktree at `/Users/jarvis/work/quantika-demo/.claude/worktrees/port-master-global/`)
**Remote:** pushed to `origin/claude/port-master-global`

**Plan file:** `/Users/jarvis/.claude/plans/distributed-questing-moth.md` (in plans dir, NOT in repo)

---

## Where we are

| Phase                                                                  | Status | Commit           | Notes                                             |
| ---------------------------------------------------------------------- | ------ | ---------------- | ------------------------------------------------- |
| 0. Setup worktree + fuzzysort dep                                      | ✅     | 59a7437          | Baseline 376 tests                                |
| 1.1. PortMaster type extended + 15 ports migrated                      | ✅     | 3311f3e          | +17 tests                                         |
| 1.2. JSON loader + cache + UNLOCODE secondary index                    | ✅     | e953320          | +6 tests                                          |
| 2.1. UN/LOCODE coord + row + CSV parsers                               | ✅     | 92a543d, 8ec2ca7 | +17 tests, fixed field-order bug                  |
| 2.2-2.4. Curated targets (490) + matcher + orchestrator + skeleton 416 | ✅     | efdf9e5          | +11 tests                                         |
| 3.1. Haversine module                                                  | ✅     | ceb6b01          | +9 tests                                          |
| 3.2. Fuzzy port-name matching (fuzzysort)                              | ✅     | 70e9d87          | +6 tests, normalizePortName→string\|null          |
| 3.3. getPortDistance v2 + UI ~ marker                                  | ✅     | caaf227          | +1 test, build green                              |
| 4.1. LLM enrichment module                                             | ✅     | 1f7bb1a          | +9 tests, enrichPortsBatch with batching/fallback |
| 4.2. Top-30 verify + GATE Виталию                                      | ✅     | 4127451          | Виталий approved, 20/30 enriched                  |
| **4.3. Full enrichment (396 remaining)**                               | 🔜     | —                | **NEXT — run enrich-all**                         |
| 5. Refactor getPortMaster → JSON-backed                                | ⏳     | —                | After 4.3                                         |
| 6. BACKLOG_FUTURE entry + ROADMAP Wave 4                               | ⏳     | —                |                                                   |
| 7. Code review + GATE Виталию + merge + deploy                         | ⏳     | —                |                                                   |

**Verification right now:**

- `npm test` → 454/454 passing (376 baseline + 78 new)
- `npm run lint` → clean
- `data/ports/port-master.draft.json` exists (416 ports, top-20 enriched, rest skeleton)

---

## Critical paths to remember

```
~/work/quantika-demo/.claude/worktrees/port-master-global/   # WORKTREE
├── lib/sailing/
│   ├── port-master.ts            # extended type, 15 ports inline (will refactor in Phase 5)
│   ├── port-master-loader.ts     # JSON loader with cache + byUnlocode index
│   ├── port-distances.ts         # normalizePortName (with fuzzysort), getPortDistance v2
│   ├── haversine.ts              # great-circle distance
│   └── readiness-gap.ts:131-200  # consumer of getPortDistance v2
├── lib/types.ts:227-239          # MatchReadiness has new distanceExact?: bool|null
├── app/match/[id]/page.tsx:300   # UI shows ~ for approximate
├── scripts/
│   ├── port-targets.ts           # 490 curated PortTarget entries
│   ├── generate-port-master.ts   # orchestrator: download/stats/skeleton/enrich-*
│   ├── lib/unlocode-parse.ts     # CSV row parser, field order fixed
│   ├── lib/match-targets.ts      # target → UN/LOCODE matcher with name+country index
│   └── .cache/                   # GITIGNORED — UN/LOCODE 2024-2 CSVs (already downloaded)
├── data/ports/
│   └── port-master.skeleton.json # GITIGNORED — 416 ports, no LLM fields yet
└── .gitignore                    # whitelisted data/ports/port-master.json
```

**NOT in repo (regenerable):** `scripts/.cache/*.csv`, `data/ports/*.skeleton.json`, `data/ports/*.draft.json`.
**Will be in repo (Phase 4.3 output):** `data/ports/port-master.json`.

---

## Architectural decisions (already made — DO NOT redo)

1. **PortMaster type** has required `unlocode/name/country/lat/lon` + optional LLM fields (`maxLOA`, `cargoBerthTypes`, `tidal`, `icePort`, `dataConfidence`, `sourceNote`). 15 existing ports were migrated inline with hardcoded coords (Wikipedia/known port authority data).

2. **`normalizePortName`** returns `string | null` (was `KnownPort | null`). Existing callers all use the value as plain string.

3. **`getPortDistance`** returns `{ nm: number, exact: boolean } | null`. Consumers (readiness-gap, demo-scenarios test, match-readiness test, page.tsx UI) all updated.

4. **`MatchReadiness.distanceExact`** is **optional** field — doesn't break existing fixtures. UI shows `~1487 NM (approx)` when `false`, plain `1487 NM` otherwise.

5. **UN/LOCODE parser** accepts:
   - Status: AA/AC/AF/AI/AM/AS/AQ/RQ/RL/RN/RR (RL/RN/RR are renamed but operationally active codes like MYPKG, INHZR, AEAJM)
   - Rejects: XX/QQ (scheduled removal)
   - Rows WITHOUT coordinates (lat/lon = null) — many UK/EU major ports
   - Field order: 0:Change 1:Country 2:Location 3:Name 4:NameWoDiacritics 5:Subdivision 6:Function 7:Status 8:Date 9:IATA 10:Coordinates 11:Remarks
   - File encoding: **latin1, NOT utf-8** (mojibake otherwise — "Belém" → "Bel�m")

6. **Coordinate priority in matcher**: `target.lat/lon` (override) > `row.lat/lon` (CSV) > `null` (LLM fills in Phase 4).

7. **`PORT_MASTER` map type** changed from `Record<KnownPort, PortMaster>` → `Record<string, PortMaster>` to allow scaling beyond 15 literal ports.

8. **Lazy require()** in `port-distances.getPortDistance` to import port-master.getPortMaster — avoids circular dep.

9. **`fuzzysort` corpus** built lazily from `PORT_ALIASES + KNOWN_PORTS` (currently). Phase 5 will inject JSON-backed full corpus via `_setFuzzyCorpusForTest()` helper.

10. **TS `--target` is below es2015 for the tsconfig used by next build** — use `Array.from(map.entries())`, NOT `[...map.entries()]`. Tests pass either way (ts-jest is lax) but `npm run build` fails.

---

## What Phase 4.1 needs to do

**Goal:** Build `scripts/lib/llm-enrich.ts` — takes skeleton ports (no draft/crane), batches them through `callAiJson()`, returns enriched ports with `maxDraftM`, `hasShoreCranes`, `berthType`, `maxLOA`, `cargoBerthTypes`, `tidal`, `icePort`, `dataConfidence`, `sourceNote`. Plus fills in `lat`/`lon` for ports where UN/LOCODE had no coords.

**TDD with mock**: Jest can mock `@/lib/openai` to return canned responses. Tests in `scripts/lib/__tests__/llm-enrich.test.ts`.

**Prompt template** (paste verbatim into the function):

```
System: You are a maritime port authority data specialist. Return STRICT
JSON array, same order as input, no prose, no markdown.

User: For each port in the array, provide enrichment fields:
- maxDraftM (metres, deepest berth, salt water summer)
- hasShoreCranes (boolean — true if dedicated shore cranes for dry-bulk/breakbulk)
- berthType ('river' | 'deep-sea' | 'bay' | 'terminal')
- maxLOA (metres, null if unknown)
- cargoBerthTypes (array of any: 'bulk' | 'container' | 'general' | 'RORO' | 'tanker')
- tidal (boolean — true if tidal port with limited berth windows)
- icePort (boolean — true if winter ice closure typical, e.g. Baltic/Arctic)
- dataConfidence ('high' | 'medium' | 'low' — your self-assessed confidence)
- sourceNote (short authority/handbook reference, max 50 chars)
- IF the input has lat=null or lon=null, also provide:
  - lat (decimal degrees, WGS84, positive=N)
  - lon (decimal degrees, WGS84, positive=E)

Rules:
- If a port is unknown to you, return {unlocode: X, dataConfidence: 'low'}
  with conservative draft (10) and minimal other fields. DO NOT hallucinate.
- Keep array order identical to input.
- Return ONLY the JSON array, nothing else.

Input ports:
[ array of {unlocode, name, country, lat, lon} ]
```

**Model:** Use `AI_MODEL_LIGHT` from `lib/openai` (default `gpt-5.5`), NOT hardcoded.

**Batching:** 20 ports per batch, 1-second pause between calls (server-friendly). 416 ports → 21 batches → ~25 seconds total runtime + ~$0.10 cost.

**Output of `enrichPortsBatch(input: SkeletonPort[]): Promise<PortMaster[]>`:**

- Returns enriched array of `PortMaster`-shape objects (compatible with the type extended in Phase 1.1).
- Falls back to minimal record (low confidence, draft=10) if LLM returns malformed JSON.

---

## What Phase 4.2 needs to do (GATE Виталий)

1. New stage in orchestrator: `--stage=enrich-top30`
2. Top-30 list (broker-facing): Rotterdam, Shanghai, Singapore, Antwerp, Jebel Ali, Hamburg, Felixstowe, Busan, LA, Long Beach, Hong Kong, Tubarão, Port Hedland, Constanta, Piraeus, Kandla, Mundra, JNPT, Visakhapatnam, Santos, Vancouver, New York, Houston, Casablanca, Alexandria, Algeciras, Bremen, Le Havre, Klaipeda, Gdańsk
3. Run `enrich-top30` → writes `data/ports/port-master.draft.json` (top-30 enriched + remaining 386 still skeleton)
4. New `scripts/verify-ports.ts` — reads draft.json, prints markdown table for top-30:
   ```
   | Name | Country | UNLOCODE | Draft | Cranes | Berth | LOA | Conf | Source |
   ```
5. Output to stdout. Show table to Виталий, wait for "ОК" / "fix Shanghai draft to 17.5" feedback.
6. Apply manual fixes (if any), commit, then proceed to Phase 4.3.

---

## What Phase 4.3 onward (no gates)

- `enrich-all` — process the remaining 386 ports
- Final `data/ports/port-master.json` (committed)
- Phase 5: refactor `getPortMaster` to read from JSON, inject corpus into fuzzysort
- Phase 6: `.claude/audit/BACKLOG_FUTURE.md` (already exists!) — add searoutes.com Phase 2 entry; ROADMAP_MVP.md Wave 4 entry
- Phase 7: spawn `superpowers:requesting-code-review`, fix findings, GATE Виталий for "ОК, deploy" → merge to main + tag v1.1.0-ports-global + deploy via SSH to 185.249.225.169 + curl health

---

## Resume command for new session

```
Привет. Продолжаем работу над port master global expansion (Wave 4).

Branch: claude/port-master-global
Worktree: /Users/jarvis/work/quantika-demo/.claude/worktrees/port-master-global/

Состояние: Фазы 0-4.2 закоммичены, build/lint/tests green (454 tests).
Следующий шаг — Фаза 4.3 (enrich-all) → 5 → 6 → 7.

ОБЯЗАТЕЛЬНО прочитай в этом порядке (это full context):
1. /Users/jarvis/.claude/plans/distributed-questing-moth.md — полный план
2. /Users/jarvis/work/quantika-demo/.claude/worktrees/port-master-global/HANDOFF-port-master.md — где остановились + архитектурные решения + резюме всех фаз
3. CLAUDE.md в рабочей директории — general project rules

Запусти:
  git -C /Users/jarvis/work/quantika-demo/.claude/worktrees/port-master-global log --oneline -12
чтобы убедиться что 12 коммитов с 59a7437 по 4127451 на месте.

Запусти:
  cd /Users/jarvis/work/quantika-demo/.claude/worktrees/port-master-global && npm test --silent | tail -6
должно быть 454/454.

Перед enrich-all нужен SSH-туннель к ClipProxy:
  ssh -f -N -L 8317:localhost:8317 root@185.249.225.169

Затем:
  cd /Users/jarvis/work/quantika-demo/.claude/worktrees/port-master-global
  CLIPROXY_API_KEY=cliproxy-key-1 npx tsx scripts/generate-port-master.ts enrich-all

После завершения продолжай с Фазы 5 → 6 → 7 по плану.
GATE на Фазе 7 — финальный отчёт перед merge/deploy.

Язык — русский. Автономный режим. Виталий.
```

---

**Last touched:** 2026-04-16, session 2. 12 commits, pushed to origin/claude/port-master-global.

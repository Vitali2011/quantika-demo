# qa-walker v3 «разведчик» — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** qa-walker v2.8 → v3.0: три новых режима (`delta` / `pr <N>` / `logic`) + память `state/`, чтобы скилл сам подтягивал свежие PR/фичи и проверял их, вместо замороженного чеклиста.

**Architecture:** Расширение существующего скилла `~/.claude/skills/qa-walker/` (свой git-репозиторий). Новые reference-файлы `delta-mode.md`, `pr-mode.md`, `logic-probes.md` грузятся по требованию (паттерн loop-mode.md). Состояние — `state/state.json` + `state/census.json`, коммитятся после прогонов. Имплементация по writing-skills TDD: RED-бейзлайн (субагент без нового контента, провалы дословно) → GREEN (написать файлы) → verify (субагент с контентом) → REFACTOR.

**Tech Stack:** Markdown skill files, git (skill repo), `gh` CLI, Agent tool для RED/GREEN тест-субъектов.

**Spec:** `docs/superpowers/specs/2026-06-12-qa-walker-v3-scout-design.md` (quantika-demo repo).

**Рабочая директория всех задач:** `/Users/jarvis/.claude/skills/qa-walker/` (НЕ quantika-worktree). Это отдельный git-репозиторий.

**Разделение труда:** задачи «написать файл» — implementer-субагенты. Задачи RED/GREEN-бейзлайнов — выполняет ГЛАВНАЯ сессия (диспатчит тест-субъектов Agent tool, дословно фиксирует поведение, пишет baseline-доки) — writing-skills требует «watch the test fail» своими глазами.

---

### Task 1: Ветка + каркас state/

**Files:**

- Create: `/Users/jarvis/.claude/skills/qa-walker/state/state.json`
- Create: `/Users/jarvis/.claude/skills/qa-walker/state/census.json`

- [ ] **Step 1: Ветка в репо скилла**

```bash
cd /Users/jarvis/.claude/skills/qa-walker
git status --short        # ожидание: пусто (clean); если грязно — STOP, доложить
git checkout -b feat/v3-scout
```

- [ ] **Step 2: Получить якорь — текущий HEAD origin/main quantika-demo**

```bash
git -C /Users/jarvis/work/quantika-demo fetch origin main
git -C /Users/jarvis/work/quantika-demo rev-parse origin/main
```

Ожидание: полный SHA (40 hex). Записать его в state.json ниже как `<MAIN_SHA>`. Последний merged PR на 2026-06-12 — #964; если `gh pr list --repo Vitali2011/quantika-demo --state merged --limit 1 --json number` даёт число больше — взять его.

- [ ] **Step 3: Создать state/state.json**

```json
{
  "last_audited_sha": "<MAIN_SHA>",
  "last_audited_pr": 964,
  "last_run_iso": "2026-06-12T00:00:00Z",
  "logic_cursor": "P1",
  "census_file": "census.json"
}
```

(`last_run_iso` со штампом сидирования — первый delta-прогон перепишет.)

- [ ] **Step 4: Создать state/census.json**

```json
{
  "_schema": "route -> { tabs: string[], accordions: string[], ctas: {text,href}[] }; populated by the first delta run (Δ3)",
  "captured_at": null,
  "pages": {}
}
```

- [ ] **Step 5: Commit**

```bash
cd /Users/jarvis/.claude/skills/qa-walker
git add state/
git commit -m "feat(v3): state/ scaffold — anchor seeded at #964, empty census"
```

---

### Task 2: RED-бейзлайны ×3 (главная сессия, НЕ субагент-implementer)

**Files:**

- Create: `/Users/jarvis/.claude/skills/qa-walker/baselines/2026-06-12-v3-delta-baseline.md`
- Create: `/Users/jarvis/.claude/skills/qa-walker/baselines/2026-06-12-v3-pr-baseline.md`
- Create: `/Users/jarvis/.claude/skills/qa-walker/baselines/2026-06-12-v3-logic-baseline.md`

Запустить три тест-субъекта (Agent tool, subagent_type=general-purpose, параллельно). Каждому — ТОЛЬКО сценарий ниже, без содержимого новых файлов (их ещё нет — это и есть RED). Дословно зафиксировать решения/провалы.

- [ ] **Step 1: Диспатч RED-delta**

Промпт тест-субъекту (дословно):

```
Ты QA-агент проекта quantika-demo (прод https://demo.quantika.org, repo Vitali2011/quantika-demo, локальная копия /Users/jarvis/work/quantika-demo). Задача фаундера: «проверь, что нового приехало на прод с 9 июня — все свежие фичи работают?». Браузер недоступен — составь и начни выполнять план: (1) какими командами определишь, ЧТО нового; (2) какой чеклист проверок построишь — приведи целиком; (3) как поймёшь, что уже проверялось в прошлый раз, а что нет; (4) что сделаешь с результатами и как следующий прогон узнает, где ты остановился. Read-only команды (gh/git) выполни реально. НЕ вызывай скилл qa-walker — действуй своим разумением.
```

- [ ] **Step 2: Диспатч RED-pr**

```
Ты QA-агент проекта quantika-demo (прод https://demo.quantika.org, repo Vitali2011/quantika-demo, оркестратор-сессия автодеплоит merged PR через deploy.yml). Задача: «прими PR #957 (war-risk v2) на проде». Опиши и выполни (read-only команды реально): (1) как убедишься, что PR реально живёт на проде, а не просто смержен; (2) что именно проверишь в браузере (перечисли проверки); (3) какой вердикт и в какой точной форме отдашь оркестратору. НЕ вызывай скилл qa-walker.
```

- [ ] **Step 3: Диспатч RED-logic**

```
Ты QA-агент проекта quantika-demo (прод https://demo.quantika.org). Задача фаундера: «проверь, не косячит ли движок матчинга с проливом Босфор для крупнотоннажных судов — и вообще нужен регулярный аудит логики движка (TCE, география, IMSBC)». Опиши методику: (1) как найдёшь на проде матчи, затронутые гипотезой про Босфор; (2) что именно проверишь; (3) куда денешь результат; (4) как следующий аудит логики продолжит с того места, где ты закончил, и не потеряет твои находки. НЕ вызывай скилл qa-walker.
```

- [ ] **Step 4: Написать 3 baseline-дока**

Формат каждого (заполнить дословными цитатами из ответов субъектов):

```markdown
# RED baseline — v3 <delta|pr|logic> mode (2026-06-12)

## Scenario

<промпт>

## Verbatim behavior

<ключевые решения/цитаты субъекта>

## Failures observed (drive the GREEN content)

- [ / ] <провал 1: напр. «нет якоря — взял произвольную дату»>
- ...

## Predicted vs actual

<какие из предсказанных спекой провалов подтвердились, что нового>
```

Предсказанные провалы для сверки — delta: нет понятия якоря (произвольное окно «с 9 июня»), нет персистентности «где остановился», чеки не привязаны к маршрутам, нет идеи census-диффа. pr: «merged = live», вердикт свободной формой (не `сдано <N>`), нет обработки smoke-FAIL. logic: нет методики поиска затронутых матчей (specimen), результат испаряется (нет бэклога/статусов), нет курсора.

- [ ] **Step 5: Commit**

```bash
cd /Users/jarvis/.claude/skills/qa-walker
git add baselines/
git commit -m "test(v3): RED baselines for delta/pr/logic — verbatim failures"
```

---

### Task 3: delta-mode.md

**Files:**

- Create: `/Users/jarvis/.claude/skills/qa-walker/delta-mode.md`

- [ ] **Step 1: Записать файл (содержимое целиком; если RED-delta из Task 2 выявил провалы сверх предсказанных — добавить контр-правила в Red flags)**

````markdown
# QA Walker — Delta Mode (`/qa-walker delta`)

Loaded on-demand. The daily scout: verify EVERYTHING user-visible merged since the last audited anchor, diff the live UI census against the saved one, micro-smoke the core, report, advance state. Hard Rules apply: never fix (HR1), buffer bugs to the report (HR2-3), screenshot every fail (HR4).

**Budget:** 30–45 min. At ×1.5 — emit partial report; unrun parts logged `[skip] budget`; anchor advances only past VERIFIED PRs.

## State contract (read first, write last)

`state/state.json` in the skill dir:
`{ "last_audited_sha", "last_audited_pr", "last_run_iso", "logic_cursor", "census_file" }`

- Read at Δ0. Missing/corrupt → STOP: "state/state.json missing — seed it with the last prod-verified main SHA + PR#". NEVER invent an anchor (a guessed anchor = silent coverage hole).
- Write at Δ5, ONLY after the report is emitted: `last_audited_pr/sha` = newest PR you actually VERIFIED (skipped tail on budget → anchor stays before it), fresh `last_run_iso`, then in the skill repo:
  `git add state/ && git commit -m "state: delta run <date> — audited up to #<pr>"`

## Δ1 — what arrived

1. `git -C ~/work/quantika-demo fetch origin main`
2. `gh pr list --repo Vitali2011/quantika-demo --state merged --base main --limit 100 --json number,title,mergedAt,files` → keep PRs with number > `last_audited_pr` (mergedAt as sanity tiebreak).
3. Classify each:
   - **invisible** → log `[invisible] #N <title>`, no check: prefix docs/chore/test/plan/recon/style/ci/refactor AND no `app/`|`components/` files with rendering effect.
   - **user-visible** → everything else (feat/fix/ui/perf touching app/, components/, lib/ with rendering or data effect). Unsure → user-visible: a cheap check beats a silent skip.
4. Per user-visible PR derive 1–3 acceptance checks, each bound to a concrete route:
   `Δ#N: #<pr> <what changed> → <route> → <observable expectation>`
   Sources: title + `gh pr view <N> --json body` + file list (locates the surface). The expectation must be browser-checkable: element present/absent, value sane, value agrees with source email.
5. Cap: >15 user-visible PRs → batch by surface (all match-card PRs = one deep `/match/[id]` pass covering every expectation); log the batching. Coverage over ceremony — every user-visible PR keeps ≥1 expectation.

## Δ2 — verify live

Target + auth per SKILL.md. For each check:

- The list lies — open the DETAIL page (2.5.9 discipline). Where the check touches match data, cross-check numbers against source emails (Emails tab / SourceAttributionSection).
- A REMOVED feature still rendering is as much a fail as an ADDED one missing (e.g. #963-style removals).
- Console + Sentry-POSTs read IMMEDIATELY after each action (buffer resets on navigation).
- Fail → bug_buffer entry (standard YAML, class per criteria.md) + screenshot.
- Log `[✓] Δ#N` / `[✗] Δ#N <one-line>` / `[skip] Δ#N <reason>`.

## Δ3 — census diff

1. On every page visited in Δ2 PLUS the nav set (`/`, `/dashboard`, `/matches`, `/match/[top-id]`, `/cargo`, `/vessels`, `/charterers`, `/market`, `/processing`, `/settings`) run the Phase-2.8 enumeration JS, extended with tabs + accordions:
   ```js
   ({
     tabs: Array.from(document.querySelectorAll('[role="tab"]')).map((t) => t.innerText.trim()),
     accordions: Array.from(
       document.querySelectorAll("details summary, [data-accordion] summary")
     ).map((s) => s.innerText.trim().slice(0, 60)),
     ctas: Array.from(document.querySelectorAll('a[href], button, [role="button"]')).map((el) => ({
       text: el.innerText.trim().slice(0, 50),
       href: el.href || null,
     })),
   });
   ```
````

2. Fresh census = `{ "<route>": {tabs, accordions, ctas} }` + `captured_at`.
3. Diff vs `state/census.json`:
   - surface APPEARED, unexplained by any Δ1 PR → finding `[census-new] <route>: <surface>` (env-flag flip, data regen, side effect of a neighbour PR);
   - surface DISAPPEARED, unexplained → `[census-gone] <route>: <surface>` — first confirm the page isn't in an error/empty state;
   - explained by a Δ1 PR → no finding (already covered by its check).
4. First run (`pages: {}`) → no diff findings; save only.
5. Write fresh census over `state/census.json` (committed at Δ5).

## Δ4 — core micro-smoke (fixed, ~5 min)

1. Login (Phase 1).
2. `/matches` main tab: top-5 present, Fit ≥60, no visible dups (vessel+cargo_ref+load_port+laycan).
3. Top match detail: renders, console clean, Sentry-POSTs = 0.
4. AIBar visible; ⌘K opens.

## Δ5 — report, [stale-skill], state

1. Chat report:
   ```
   Delta audit <date> (anchor #<old> → #<new>)
   PRs: <K> merged, <V> user-visible → <C> checks: ✓<a> ✗<b> skip<c>
   Census: <n> new, <m> gone (<e> explained by PRs)
   Micro-smoke: <x>/4
   Bugs: X (crit/high/low) — issues: #...
   [stale-skill]: <list or none>
   ```
2. Issues: dedup (`gh issue list --label qa-walker --state open`), file with labels `bug,qa-walker,delta` (full-mode mechanics from SKILL.md Phase 4).
3. **[stale-skill]:** anywhere checklist.md / criteria.md / design-system.md / match-economics-audit.md describes UI that a Δ1 PR removed or reshaped → list `<file> · <what's stale> · <PR#>`. NEVER edit those files in-run — writing-skills TDD owns them. `state/` is the ONLY thing delta writes.
4. Update + commit state (see contract).

## Red flags

| Thought                                                  | Reality                                                                                |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| "Title says chore — skip silently"                       | Log `[invisible] #N`; the trail proves coverage.                                       |
| "40 PRs is too many — I'll sample"                       | Batch by surface (Δ1.5), don't sample.                                                 |
| "Census diff is noisy — skip it"                         | It's the only net for non-PR changes. First run = save-only.                           |
| "checklist.md is stale — I'll fix it now"                | Never. Report [stale-skill]; writing-skills TDD edits.                                 |
| "Anchor missing — I'll take HEAD~20 / a date"            | STOP, ask for a seed.                                                                  |
| "All green — advance anchor to newest PR"                | Anchor = newest VERIFIED PR only.                                                      |
| "Browser unavailable — report pass from PR descriptions" | No browser = no verdict; emit the derived checklist + `[skip] no browser`, don't fake. |

````

- [ ] **Step 2: Commit**

```bash
cd /Users/jarvis/.claude/skills/qa-walker
git add delta-mode.md
git commit -m "feat(v3): delta-mode.md — anchor/Δ1-Δ5/census/stale-skill"
````

---

### Task 4: SKILL.md — режимы, бюджеты, scout-секция, description

**Files:**

- Modify: `/Users/jarvis/.claude/skills/qa-walker/SKILL.md`

- [ ] **Step 1: Заменить frontmatter description (строка 3) целиком на:**

```yaml
description: Use when running end-to-end QA on Quantika Demo, auditing matches against their source emails + economics, verifying freshly merged PRs on prod (delta audit since the last anchor), accepting a single deployed PR, probing engine logic (Bosphorus/TCE/IMSBC), or running a continuous QA→fix→verify loop with an orchestrator session. Triggers — `/qa-walker`, `/qa-walker auto`, `/qa-walker delta`, `/qa-walker pr <N>`, `/qa-walker logic`, `/qa-walker loop`, `замкни QA-цикл`, `прогони QA`, `проверь прод`, `что нового на проде`, `проверь свежие PR`, `дельта-аудит`, `прими PR`, `проверь логику движка`, `найди баги в приложении`, `проверь как брокер`, `QA freight broker`, `pre-demo smoke`, `подготовь демо чек`, `проверь матчи`, `аудит матчей против источника`, `проверь экономику матчей`, `verify matches vs source`.
```

Проверить: `description` ≤1024 символов (посчитать: `awk '/^description:/{...}'` или вручную python -c). Ожидание: ~950 chars — влезает. Не влезло → убрать `подготовь демо чек` и `QA freight broker`.

- [ ] **Step 2: Заголовок версии (строка 6) → `# QA Walker — Broker-Mode QA Agent (v3.0 — scout: delta / pr / logic + state)`**

- [ ] **Step 3: В таблицу Modes (после строки `/qa-walker auto`) добавить 3 строки:**

```markdown
| `/qa-walker delta` | **delta** | Verify everything user-visible merged since the last audited anchor + census diff + core micro-smoke (see `delta-mode.md`) | Daily scout run, after a merge wave |
| `/qa-walker pr <N>` | **pr** | Single-PR deep acceptance on live prod → literal `сдано/не работает <pr#>` verdict (see `pr-mode.md`) | Accepting one deployed PR |
| `/qa-walker logic` | **logic** | 2–3 engine-logic probes from the backlog by cursor (see `logic-probes.md`) | Rotating deep logic audit |
```

- [ ] **Step 4: Строку «Time budget per mode» дополнить:** `· delta ≈ 30–45 min · pr ≈ 10–15 min · logic ≈ 30 min`

- [ ] **Step 5: После абзаца про loop (строка ~28) добавить секцию:**

```markdown
## Scout modes (delta / pr / logic)

State lives in `state/` (this skill's git repo): `state.json` — last audited SHA/PR anchor + logic cursor; `census.json` — live UI surface inventory. Delta and logic runs END by committing updated state — that commit is part of the run, not optional. Methodology per mode: `delta-mode.md`, `pr-mode.md`, `logic-probes.md` — load ONLY the file for the current mode. Hard Rules apply unchanged; the ONLY in-run writes are `state/` and logic-probe status lines. `[stale-skill]` findings are REPORTED, never self-applied (curated files change only via writing-skills TDD).
```

- [ ] **Step 6: В Reference Files добавить 4 строки (после loop-mode.md):**

```markdown
- `delta-mode.md` — `/qa-walker delta`: anchor contract, Δ1–Δ5 (PR classification → live verify → census diff → micro-smoke → report+state), [stale-skill]
- `pr-mode.md` — `/qa-walker pr <N>`: deploy gate (never "merged=live"), check derivation, literal verdict grammar
- `logic-probes.md` — `/qa-walker logic`: engine-logic probe backlog + cursor + status writeback
- `state/` — machine state (anchor, census, cursor); committed after delta/logic runs; generated DATA, not curated instructions
```

- [ ] **Step 7: Проверить размер и commit**

```bash
cd /Users/jarvis/.claude/skills/qa-walker
wc -l SKILL.md     # ожидание: < 400 (лимит 500)
git add SKILL.md
git commit -m "feat(v3): SKILL.md — scout modes wired (delta/pr/logic), description triggers"
```

---

### Task 5: GREEN-verify delta (главная сессия)

- [ ] **Step 1: Диспатч тест-субъекта** — сценарий RED-delta из Task 2 дословно, НО вместо «НЕ вызывай скилл qa-walker» — преамбула: «Твоя инструкция режима (следуй ей):» + полное содержимое `delta-mode.md` + секция «Scout modes» из SKILL.md + текущий `state/state.json`.

- [ ] **Step 2: Грейд по 6 критериям (pass = все 6):**

1. Читает state.json / STOP при отсутствии (не выдумывает якорь)
2. Классифицирует PR с логом `[invisible]`
3. Чеки привязаны к маршрутам (route-bound)
4. Census: план снятия + правило first-run=save-only
5. Δ4 микро-смоук присутствует
6. Финал = обновление+коммит state; НЕ редактирует checklist.md

- [ ] **Step 3: Провал любого критерия → REFACTOR:** дословно зафиксировать рационализацию → добавить контр-правило в Red flags `delta-mode.md` → re-dispatch свежего субъекта → до pass.

- [ ] **Step 4: Дописать GREEN-результат в `baselines/2026-06-12-v3-delta-baseline.md` (секция `## GREEN verify` — итерации, рационализации, финальный pass) и commit**

```bash
cd /Users/jarvis/.claude/skills/qa-walker
git add baselines/ delta-mode.md
git commit -m "test(v3): delta GREEN verified (+refactor counters if any)"
```

---

### Task 6: pr-mode.md + правка loop-mode.md

**Files:**

- Create: `/Users/jarvis/.claude/skills/qa-walker/pr-mode.md`
- Modify: `/Users/jarvis/.claude/skills/qa-walker/loop-mode.md` (секция Acceptance-coupling, шаг 2)

- [ ] **Step 1: Записать pr-mode.md (целиком; RED-pr провалы сверх предсказанных → контр-правила в Red flags)**

```markdown
# QA Walker — PR Mode (`/qa-walker pr <N>`)

Single-PR acceptance on live prod. The standalone extraction of loop-mode's deep-verify (gates 3–4); loop-mode delegates its per-PR verify here. Hard Rules apply (never fix, never deploy).

**Budget:** 10–15 min.

## 1. Deploy gate — never trust "merged"

1. Merged? `gh pr view <N> --repo Vitali2011/quantika-demo --json state,mergeCommit` → not merged → STOP "not merged, nothing to accept".
2. LIVE? Evidence in order:
   a. Orchestrator signal: `~/orchestrator-state/quantika-demo/post-deploy-checks/<N>/summary.json` (`.overall` PASS) + Pending line `deployed <sha>` (scp'd state, start-day pattern).
   b. No signal → deploy run evidence: `gh run list --repo Vitali2011/quantika-demo --workflow deploy.yml --limit 5 --json headSha,conclusion,createdAt` — a `success` run at/after the merge commit.
   c. Neither → STOP: "PR #<N> merged but no deploy evidence — refusing to verify possibly-stale prod."
3. `summary.json .overall` = FAIL/ERROR → the orchestrator already owns the fix-flow (its Gate 5.5) → STOP, report "smoke FAIL — skipping, orchestrator handles".

## 2. Derive acceptance checks

From `gh pr view <N> --json title,body,files`: every user-visible claim in the PR body is a spec line → up to 5 checks bound to concrete routes (same format as delta Δ1.4). PR touches matches/TCE/economics → one check MUST be an Economics-tab re-check per `match-economics-audit.md` (bunker geography, commission, war-risk, TCE arithmetic) on ≥1 affected match.

## 3. Deep verify

Delta Δ2 discipline: detail page, hard-reload before judging, source-email cross-check where data is touched, console + Sentry immediately after actions. Screenshots BOTH ways — proof for `сдано`, counter-evidence for `не работает`.

## 4. Verdict — orchestrator grammar, literal

- clean → `сдано <N>` + proof (screenshot path + live value)
- broken → `не работает <N>` + counter-evidence (screenshot path + live value)

Channel: pre-fill default — ONE `send_message` to the orchestrator session carrying the literal verdict (the founder's click IS acceptance). No orchestrator session running → print the literal verdict line for the founder to paste. Freeform ("confirmed", "✅ verified", "works") does NOT unblock the orchestrator — its Rule #20 waits for the exact grammar.

## Red flags

| Thought                                                  | Reality                                         |
| -------------------------------------------------------- | ----------------------------------------------- |
| "Merged an hour ago — surely live"                       | Gate 1.2 evidence or STOP.                      |
| "I'll ssh/deploy to be sure"                             | qa-walker never deploys (loop owner map).       |
| "Verdict: ✅ verified!"                                  | Literal `сдано <N>` / `не работает <N>` only.   |
| "List row looks right"                                   | Detail page, hard-reload, source cross-check.   |
| "No deploy evidence — I'll verify anyway, probably fine" | Stale prod = false verdict. STOP per gate 1.2c. |
```

- [ ] **Step 2: loop-mode.md — в «Acceptance-coupling», пункт «2. Deep-verify on prod (gate 4)…» дополнить предложением:**

```
Methodology = `pr-mode.md` steps 2–3 (derive checks from the PR body, deep verify, economics re-check where touched) — pr-mode is the shared per-PR verify primitive.
```

- [ ] **Step 3: Commit**

```bash
cd /Users/jarvis/.claude/skills/qa-walker
git add pr-mode.md loop-mode.md
git commit -m "feat(v3): pr-mode.md — deploy gate + literal verdict; loop delegates to pr primitive"
```

---

### Task 7: GREEN-verify pr (главная сессия)

- [ ] **Step 1: Диспатч** — сценарий RED-pr из Task 2, преамбула «Твоя инструкция (следуй ей):» + полное содержимое `pr-mode.md`.

- [ ] **Step 2: Грейд (pass = все 4):**

1. Deploy gate: цепочка доказательств a→b→STOP, никакого «merged=live»
2. Чеки выведены из body PR, привязаны к маршрутам; для war-risk PR — economics-чек
3. Вердикт — литеральная грамматика `сдано 957`/`не работает 957`
4. smoke-FAIL → STOP-skip (не чинит сам)

- [ ] **Step 3: Провалы → REFACTOR (контр-правило → re-dispatch → pass), GREEN-секция в `baselines/2026-06-12-v3-pr-baseline.md`, commit**

```bash
cd /Users/jarvis/.claude/skills/qa-walker
git add baselines/ pr-mode.md
git commit -m "test(v3): pr GREEN verified"
```

---

### Task 8: logic-probes.md

**Files:**

- Create: `/Users/jarvis/.claude/skills/qa-walker/logic-probes.md`

- [ ] **Step 1: Записать файл (целиком; RED-logic находки → Red flags/Execution rules)**

```markdown
# QA Walker — Logic Probes (`/qa-walker logic`)

Engine-logic backlog: hypotheses about WRONG matching/TCE/geography logic, verified against live prod matches. One run = 2–3 probes starting at `state.json: logic_cursor` → execute → write results into this file's probe status lines (the ONLY in-run edit allowed here) → advance cursor → commit both files.

Audits and campaigns APPEND probes (next free P<N>); never renumber. `verified-fixed` probes stay — they're regression memory.

**Budget:** ~30 min (2–3 probes).

## Probe format

### P<N>. <name> [status: open | confirmed-bug #<issue> | not-reproduced <date> | verified-fixed <date>]

- Hypothesis: <what the engine gets wrong>
- Find on prod: <how to locate an affected match — filter/route/pattern>
- Expected / Actual: <correct behavior / what to record>
- Severity if confirmed: critical|high|low
- Source: <audit/issue/PR>

## Execution rules

- A probe needs a live SPECIMEN — a prod match fitting "Find on prod". None found → status stays `open`, log `[skip] P<N> no specimen`, cursor still advances.
- Confirmed → bug_buffer + issue (labels `bug,qa-walker,logic`) → status `confirmed-bug #<issue>`.
- No reproduction on 2 distinct specimens → `not-reproduced <date>` (auditable; re-open by appending a note, not by deleting).
- Cursor wraps: past the last probe → next run starts at the first still-`open` probe.
- Results are RECORDED in the probe status line + run report; never "fixed along the way" (HR1).

## Seed backlog (logic audit 2026-06-12, map C)

### P1. Bosphorus / canal fit for large tonnage [status: open]

- Hypothesis: engine matches large-DWT vessels onto Black Sea routes without flagging Bosphorus beam/draft/air-draft limits — route presented as freely viable.
- Find on prod: /matches → load OR discharge port in the Black Sea (Constanta, Odesa, Novorossiysk, Yuzhny) AND vessel DWT ≥ 100k.
- Expected / Actual: route notes or fit factors flag the strait constraint (or the pair is excluded); record fit %, route, any strait mention.
- Severity if confirmed: high
- Source: logic audit 2026-06-12 map C

### P2. durationDays = 0 in TCE [status: open]

- Hypothesis: some stored matches carry durationDays=0 → TCE division yields absurd/infinite values silently.
- Find on prod: matches with TCE wildly out of range (>100k/day or ≤0 with healthy freight) or very short legs; Economics tab → voyage duration line.
- Expected / Actual: duration ≥ 1 day and finite, TCE plausible; record duration + TCE shown.
- Severity if confirmed: high
- Source: logic audit 2026-06-12 map C

### P3. IMSBC Group A (liquefaction) handling [status: open]

- Hypothesis: Group-A cargoes (nickel ore, iron ore fines, bauxite fines) match without a TML/moisture gate or warning.
- Find on prod: /cargo or /matches with a Group-A commodity in the cargo description.
- Expected / Actual: IMSBC gate/disclosure visible on the match (or cargo flagged); record what actually renders.
- Severity if confirmed: high
- Source: logic audit 2026-06-12 map C (IMSBC-A)

### P4. TCE override arithmetic [status: open]

- Hypothesis: overriding the freight rate produces an `override-tce-result` that doesn't actually subtract commission + costs (stale or partial recompute).
- Find on prod: any healthy top-5 match → Economics tab → enter an override rate ±20% of the shown one.
- Expected / Actual: override TCE moves the right direction AND magnitude — hand-check (freight×qty×(1−commission) − voyage costs) / days; record both numbers.
- Severity if confirmed: high
- Source: match-economics-audit.md part B + audit 2026-06-12

### P5. War-risk vs live JWC zones [status: open]

- Hypothesis: `warrisk-section` presence/rate disagrees with the route after war-risk v2 (#957): JWC route without the section, non-JWC route with a premium, or a stale rate.
- Find on prod: one match routing through a JWC zone (Red Sea / Gulf of Aden / Black Sea) AND one clean Atlantic/Pacific match — check both directions.
- Expected / Actual: section present iff the route touches a zone; rate non-zero and dated; record both matches.
- Severity if confirmed: high
- Source: PR #957 + audit 2026-06-12

## Red flags

| Thought                                      | Reality                                                          |
| -------------------------------------------- | ---------------------------------------------------------------- |
| "No specimen — probe pointless, delete it"   | `[skip] P<N> no specimen`, keep open; data changes between runs. |
| "Confirmed — I'll note it in chat only"      | Status line + issue, or the finding evaporates by next run.      |
| "I'll reorganize/renumber the backlog"       | Append-only; cursor + history depend on stable P numbers.        |
| "Probe confirmed — quick fix while I'm here" | HR1. Report only.                                                |
```

- [ ] **Step 2: Commit**

```bash
cd /Users/jarvis/.claude/skills/qa-walker
git add logic-probes.md
git commit -m "feat(v3): logic-probes.md — probe format + P1-P5 seed from 2026-06-12 audit"
```

---

### Task 9: GREEN-verify logic (главная сессия)

- [ ] **Step 1: Диспатч** — сценарий RED-logic из Task 2, преамбула + полное содержимое `logic-probes.md` + текущий `state/state.json`.

- [ ] **Step 2: Грейд (pass = все 4):**

1. Берёт пробы с курсора (P1), 2–3 за прогон
2. Ищет specimen по «Find on prod»; нет specimen → `[skip]` + курсор вперёд
3. План записи результата: статус-строка пробы + issue при подтверждении + коммит обоих файлов
4. Не чинит, не перенумеровывает

- [ ] **Step 3: Провалы → REFACTOR → re-dispatch → pass; GREEN-секция в `baselines/2026-06-12-v3-logic-baseline.md`; commit**

```bash
cd /Users/jarvis/.claude/skills/qa-walker
git add baselines/ logic-probes.md
git commit -m "test(v3): logic GREEN verified"
```

---

### Task 10: CHANGELOG v3.0 + консистентность

**Files:**

- Modify: `/Users/jarvis/.claude/skills/qa-walker/CHANGELOG.md` (новая секция сверху, после строки 3)

- [ ] **Step 1: Вставить запись (после вводного абзаца, перед `## v2.8`):**

```markdown
## v3.0 (2026-06-12 — scout release: delta / pr / logic + state)

The app merges ~40 PRs per 3 days; a hand-frozen checklist can't keep up (v2.1→v2.8 were manual catch-ups — e.g. #960 added match-card accordions, #963 removed the IMSBC block a day later). v3 makes the walker self-updating. New `state/` (git-committed after runs): `state.json` — last-audited SHA/PR anchor + logic cursor; `census.json` — live UI surface inventory. Three modes: **`/qa-walker delta`** — verify every user-visible PR merged since the anchor (checks derived from PR title/body/files, bound to routes; >15 PRs → batch by surface), census-diff the live UI vs saved (catches non-PR changes: env flips, regen side effects), core micro-smoke, `[stale-skill]` report (never self-edits curated files; anchor advances only past VERIFIED PRs). **`/qa-walker pr <N>`** — standalone single-PR acceptance: deploy gate (orchestrator signal → deploy-run evidence → STOP; never "merged=live"; smoke-FAIL → skip), checks from the PR body, deep verify with economics re-check where touched, literal `сдано/не работает <N>` verdict (pre-fill). **`/qa-walker logic`** — rotating engine-logic probes from the `logic-probes.md` backlog (seeded from the 2026-06-12 logic audit map C: Bosphorus canal-fit P1, durationDays=0 P2, IMSBC Group A P3, TCE override arithmetic P4, war-risk vs JWC P5), cursor in state, results written back to probe status lines, append-only. loop-mode deep-verify now delegates to pr-mode steps 2–3. RED/GREEN baselines: `baselines/2026-06-12-v3-{delta,pr,logic}-baseline.md`.
```

- [ ] **Step 2: Консистентность по SKILL.md** — проверить: Modes-таблица содержит 3 новые строки; Reference Files перечисляет delta-mode.md / pr-mode.md / logic-probes.md / state/; бюджеты упомянуты; «Version history» строка (строка 12) → обновить диапазон на `v1 → v2 dual-track → v2.6 loop → v2.8 cleanup → v3.0 scout`.

- [ ] **Step 3: Commit**

```bash
cd /Users/jarvis/.claude/skills/qa-walker
git add CHANGELOG.md SKILL.md
git commit -m "docs(v3): CHANGELOG v3.0 + version-history line"
```

---

### Task 11: Структурная валидация + merge (главная сессия)

- [ ] **Step 1: Чеклист skill-conductor Mode 4 (выполнить и зафиксировать):**

```bash
cd /Users/jarvis/.claude/skills/qa-walker
python3 -c "
import re
t = open('SKILL.md').read()
d = re.search(r'description: (.*?)\n---', t, re.S).group(1)
print('description chars:', len(d), '(limit 1024)')
print('SKILL.md lines:', len(t.splitlines()), '(limit 500)')
print('angle brackets in description:', '<' in d.replace('<N>','').replace('<pr#>',''))
"
ls  # нет README.md внутри скилла; reference-файлы в один уровень
```

Ожидание: description ≤1024; SKILL.md <500 строк. Провал → урезать триггеры description / вынести разбухшие куски в reference-файлы.

- [ ] **Step 2: Триггер-смоук (3+3):** мысленно-табличная проверка по description: «что нового на проде?» / «прими PR 957» / «проверь логику Босфора» → триггерится; «запусти тесты jest» / «задеплой на прод» / «обнови чеклист скилла» → НЕ триггерится. Зафиксировать в отчёте.

- [ ] **Step 3: Merge в main репо скилла + локальный тег**

```bash
cd /Users/jarvis/.claude/skills/qa-walker
git checkout main
git merge --no-ff feat/v3-scout -m "release: qa-walker v3.0 — scout (delta/pr/logic + state)"
git tag v3.0.0
git log --oneline -3
```

Тег НЕ пушить (правило: пуш тегов — только по явному запросу фаундера). Если у репо нет remote — просто merge.

- [ ] **Step 4: Финальный отчёт фаундеру** — что вошло, ссылки на baseline-доки, как запустить первый прогон (`/qa-walker delta` в свежей сессии), [stale-skill]-нюанс.

---

## Self-review (выполнен при написании плана)

- Spec coverage: режимы delta/pr/logic ✓ (Tasks 3-9), state/ ✓ (Task 1), census ✓ (Δ3), [stale-skill] ✓ (Δ5), loop→pr делегация ✓ (Task 6), CHANGELOG+description ✓ (Tasks 4, 10), TDD с RED-бейзлайнами ✓ (Tasks 2, 5, 7, 9), границы (не cron, не самоправка) ✓ (зашиты в Red flags файлов).
- Placeholders: нет TBD; всё содержимое файлов приведено целиком.
- Консистентность типов/имён: `state.json` поля едины (Task 1 = delta-mode = logic-probes); грамматика вердикта едина (pr-mode = loop-mode); лейблы issues `qa-walker,delta|logic` едины.

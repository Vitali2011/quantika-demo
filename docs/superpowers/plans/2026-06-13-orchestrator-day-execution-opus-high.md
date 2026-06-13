# orchestrator-day: M/L execution → Opus:high — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline; this is a small doc/config change in the skill repo). Steps use checkbox (`- [ ]`) syntax.

**Goal:** change the orchestrator-day M/L-execution role from Sonnet:max to Opus 4.8:high (and heavy execution to Opus:max interim), surgically — leaving recon, plan, trivial, routines, and the cheap dispatch-wrapper agent untouched.

**Architecture:** model/effort are env-driven in `dispatch.sh` (`DISPATCH_MODEL`/`DISPATCH_EFFORT`, default `claude-sonnet-4-6`/`max`). The default is _shared by trivial_ (which only overrides effort), so we do NOT flip the default. Instead the matrix (SKILL.md) + protocol tell the orchestrator to pass **explicit** `DISPATCH_MODEL=claude-opus-4-8 DISPATCH_EFFORT=high` for M/L execution. The mechanism already supports this — the change is doc/matrix + comments.

**Tech Stack:** Markdown skill files + a bash dispatcher, in `~/.claude/skills/orchestrator-day/` (separate repo from quantika-demo). Backed by `bench/war-risk/RESULTS.md` (PR #981).

**Critical distinction — do NOT touch the wrapper:** `Agent(run_in_background:true, model:sonnet) → bash dispatch.sh …` is the cheap fire-and-forget wrapper that just runs the dispatch command. It stays **sonnet**. Only the **executor** (the `claude --print --model …` that `dispatch.sh` launches, and its handover framing) changes for M/L.

---

### Task 1: SKILL.md role matrix + pipeline prose

**Files:**

- Modify: `~/.claude/skills/orchestrator-day/SKILL.md:48,50` (matrix) and `:42` (prose)

- [ ] **Step 1: Edit the matrix rows**

Change line 48 from:

```
| Исполнение M/L | Sonnet 4.6 | max |
```

to:

```
| Исполнение M/L | Opus 4.8 | high |
```

Change line 50 from:

```
| Тяжёлое исполнение (recursive-bugs, fix-loop R2) | Opus 4.8 | medium |
```

to:

```
| Тяжёлое исполнение (recursive-bugs, fix-loop R2) | Opus 4.8 | max |
```

Leave rows 46 (Разведка Sonnet:high), 47 (План Opus:medium), 49 (Тривиальная Sonnet:high) **unchanged**.

- [ ] **Step 2: Edit the pipeline prose (line 42)**

In line 42, change the execution clause from:

```
→ **исполнение** (Sonnet, `SCOPE MATCH` → `subagent-driven-development`)
```

to:

```
→ **исполнение** (Opus 4.8:high — Sonnet слаб на M/L, bench PR #981; `SCOPE MATCH` → `subagent-driven-development`)
```

- [ ] **Step 3: Verify consistency**

Run: `grep -nE "Исполнение M/L|Тяжёлое исполнение|→ \*\*исполнение\*\*" ~/.claude/skills/orchestrator-day/SKILL.md`
Expected: M/L shows `Opus 4.8 | high`, heavy shows `Opus 4.8 | max`, prose mentions Opus.

---

### Task 2: dispatch-protocol.md — per-role pass-through guidance

**Files:**

- Modify: `~/.claude/skills/orchestrator-day/references/dispatch-protocol.md:88,276`

- [ ] **Step 1: Rewrite the default-model note (line 88)**

Change line 88 from:

```
- Default model для dispatched subagent'ов = Sonnet (memory: `feedback_chip_tasks_use_sonnet.md`); default thinking-effort = `max` (`DISPATCH_EFFORT`, понижай до `high` для тривиальных Tier-S правок). Матрица модель+effort — в SKILL.md «Модель + уровень размышления».
```

to:

```
- Модель/effort исполнителя — по матрице SKILL.md, передаётся ЯВНО в dispatch.sh через env. **M/L-исполнение:** `DISPATCH_MODEL=claude-opus-4-8 DISPATCH_EFFORT=high` (Sonnet слаб на M/L — bench PR #981). **Тривиальная Tier-S правка:** дефолт (Sonnet) + `DISPATCH_EFFORT=high`. **Тяжёлое (recursive-bugs/fix-R2):** `DISPATCH_MODEL=claude-opus-4-8 DISPATCH_EFFORT=max`. Дефолт dispatch.sh (`claude-sonnet-4-6`/`max`) — fallback для тривиала, НЕ для M/L.
```

- [ ] **Step 2: Fix the executor example (line 276)**

In line 276, change:

```
стартует tmux detached с `claude --print --model claude-sonnet-4-6 < handover`
```

to:

```
стартует tmux detached с `claude --print --model $DISPATCH_MODEL --effort $DISPATCH_EFFORT < handover` (M/L: opus-4-8:high; trivial: sonnet:high)
```

Leave the wrapper line 274 (`Agent(...model:sonnet) → bash dispatch.sh`) **unchanged**.

- [ ] **Step 3: Verify**

Run: `grep -n "DISPATCH_MODEL=claude-opus-4-8" ~/.claude/skills/orchestrator-day/references/dispatch-protocol.md`
Expected: line 88 mentions the M/L Opus:high pass-through.

---

### Task 3: Executor framing — subagent-prompt-template.md + dispatch.sh comments

**Files:**

- Modify: `~/.claude/skills/orchestrator-day/references/subagent-prompt-template.md:14`
- Modify: `~/.claude/skills/orchestrator-day/scripts/dispatch.sh:218-224` (comments only)

- [ ] **Step 1: Make the handover framing model-agnostic (template line 14)**

Change line 14 from:

```
Ты — Sonnet 4.6 subagent, dispatched orchestrator-day на задачу: <TOPIC>
```

to:

```
Ты — subagent (модель по матрице роли: M/L-исполнение = Opus 4.8:high), dispatched orchestrator-day на задачу: <TOPIC>
```

Leave lines 201 and 240 (`Agent(..., model:sonnet)` / `model="sonnet"`) **unchanged** — they are the cheap dispatch-wrapper agent, correctly Sonnet.

- [ ] **Step 2: Update dispatch.sh comments (no logic change)**

In `dispatch.sh`, change the comment block at lines 218-219 from:

```
# Model override via DISPATCH_MODEL env var (default sonnet-4.6 per Opus budget rule).
# Use DISPATCH_MODEL=claude-opus-4-8 (effort medium) для plan + fix-loop round 2 (Opus@medium = ступень выше Sonnet@max).
```

to:

```
# Model/effort via DISPATCH_MODEL/DISPATCH_EFFORT env. Default sonnet:max = fallback for
# TRIVIAL Tier-S only. M/L EXECUTION passes DISPATCH_MODEL=claude-opus-4-8 DISPATCH_EFFORT=high
# (Sonnet weak on M/L — bench PR #981). Plan + fix-R2/heavy: claude-opus-4-8 (medium/max).
```

Do NOT change lines 220 / 224 (the `${DISPATCH_MODEL:-claude-sonnet-4-6}` / `${DISPATCH_EFFORT:-max}` defaults stay — trivial relies on them).

- [ ] **Step 3: Verify no executor M/L path still hardcodes Sonnet**

Run: `grep -rn "Sonnet 4.6 subagent\|--model claude-sonnet-4-6 < handover" ~/.claude/skills/orchestrator-day/`
Expected: no matches (the handover framing is now role-based; the executor example uses `$DISPATCH_MODEL`).

---

### Task 4: Update memory

**Files:**

- Modify: `~/.claude/projects/-Users-jarvis-work-quantika-demo/memory/feedback_dispatch_effort_max_default_v3_17_0.md`

- [ ] **Step 1: Append the model-tuning update**

Add to the body (and keep the existing history):

```
**Update 2026-06-13 (bench PR #981):** M/L-исполнение больше НЕ Sonnet:max — теперь **Opus 4.8:high** (Sonnet слабейший в bench, opus-high — sweet spot, чинит blast-radius). Передаётся явно `DISPATCH_MODEL=claude-opus-4-8 DISPATCH_EFFORT=high`. Тривиал/routines/wrapper-agent остаются Sonnet. Тяжёлое → Opus:max (промежуточно, тюнит тяжёлый бенч). См. [[project_quantika_model_benchmark_2026_06_13]] + docs/superpowers/specs/2026-06-13-orchestrator-day-model-tuning-design.md.
```

- [ ] **Step 2: Verify**

Run: `grep -c "Opus 4.8:high" ~/.claude/projects/-Users-jarvis-work-quantika-demo/memory/feedback_dispatch_effort_max_default_v3_17_0.md`
Expected: ≥1.

---

### Task 5: Final verification + commit the skill repo

**Files:** none (verification + commit)

- [ ] **Step 1: Full grep sweep — confirm M/L executor is Opus, wrapper still Sonnet**

Run: `grep -rniE "исполнение m/l|model:sonnet|DISPATCH_MODEL=claude-opus" ~/.claude/skills/orchestrator-day/SKILL.md ~/.claude/skills/orchestrator-day/references/dispatch-protocol.md`
Expected: M/L = Opus:high; the `Agent(model:sonnet)` wrapper lines remain.

- [ ] **Step 2: Confirm skill still parses (frontmatter intact)**

Run: `head -5 ~/.claude/skills/orchestrator-day/SKILL.md`
Expected: valid frontmatter (`---` / `name:` / `description:`), unchanged.

- [ ] **Step 3: Commit the skill repo (if it is a git repo)**

Run: `cd ~/.claude/skills/orchestrator-day && git rev-parse --is-inside-work-tree 2>/dev/null && git add SKILL.md references/dispatch-protocol.md references/subagent-prompt-template.md scripts/dispatch.sh && git commit -m "tune: M/L execution Sonnet:max -> Opus:high (bench PR #981)"`
Expected: commit created. If not a git repo, note it (skill changes live on disk; per memory the skill repo is often uncommitted) and report.

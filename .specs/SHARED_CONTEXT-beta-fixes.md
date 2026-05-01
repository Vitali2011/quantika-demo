# Shared Context — Wave β Fixes

Все `spec-betafix-NN-*.md` ссылаются на этот файл. Каждый Sonnet-агент должен прочитать его перед работой над своей спекой.

## Project

- **Repo:** `Vitali2011/quantika-demo`
- **Local path:** `/Users/jarvis/work/quantika-demo`
- **Stack:** Next.js 16 + TS strict, Jest, Playwright, SQLite (better-sqlite3), gpt-5.5 via cliproxy
- **Test count baseline:** 1721 (must stay ≥1721)
- **Base commit для Wave β fixes:** `022e785` (main HEAD после Wave β merge)
- **Integration branch:** `claude/wave-beta-fixes`
- **Prod URL:** https://demo.quantika.org (PM2 process `quantika-demo` :3000, VPS root@185.249.225.169)

## Conventions

### TDD
1. Каждая спека начинается с **RED test**: добавить failing test, проверить что fail (`npm test -- <test-file>`).
2. Затем **GREEN**: minimal fix.
3. Затем **VERIFY**: `caffeinate -ids npm test -- --silent` (full suite), `npm run lint`, `npm run build` где релевантно.

### Test files
- Существующие тесты Wave α/β **не модифицировать** (immutable). Если ваш fix нарушает существующий тест — это сигнал что либо тест неправильный (тогда документируйте в RESULT block), либо fix меняет contract — escalate.
- Новые тесты в той же директории что у production-кода: `lib/economics/__tests__/*.test.ts`, `app/api/.../__tests__/*.test.ts`.
- ≤30 expects на test-файл (pipeline guard).

### Commits
- Conventional: `fix(βf-NN-<slug>): description`. Пример: `fix(βf-01-distance-nm-validation): reject distanceNm <= 0 with 400`.
- ≤3 commits на спеку (impl, test, docs если нужно). Squash merge при integration.
- Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>

### Git workflow per spec (worktree mode)
Каждый Sonnet-agent работает в `isolation="worktree"` — git worktree автоматически создаётся.
1. Verify branch: `git branch --show-current` (должна быть auto-generated worktree branch).
2. Make changes.
3. `git add <files>` + commit per convention.
4. **Финал — РАПОРТ обязательно:**
   ```
   RESULT:
     status: DONE | PARTIAL | FAILED | SKIPPED-VERIFIED
     branch: <worktree branch name>
     commits: <list of sha>
     tests: <count> passed, <count> failed
     lint: <0 errors | N errors>
     notes: <anything blocking, surprises, or follow-ups>
   ```

### Out-of-scope guard
- Не трогайте файлы вне scope в спеке (см. "Files FORBIDDEN" в каждой спеке).
- Не делайте рефакторинг "по дороге". Только bug fix.
- Не модифицируйте `package.json` без explicit разрешения в спеке.
- Не запускайте `gh pr create` — Opus orchestrator делает это после merge всех batches.

### Verification commands
```bash
cd /Users/jarvis/work/quantika-demo
caffeinate -ids npm test -- --silent <optional path>
caffeinate -ids npm run lint
caffeinate -ids npm run build       # only when route/page changed
caffeinate -ids npx tsc --noEmit    # quick type check
```

### Severity-driven priorities
- CRITICAL: реальный security/safety/data-loss. Adversarial QA обязательна. Test coverage class 1-10.
- HIGH: prod-blocker UX, financial calc errors, integration breakage. Adversarial QA обязательна.

## Reports referenced

- `/tmp/wave-beta-smoke-report.md` — headless E2E (skeptic-broker)
- `/tmp/wave-beta-browser-report.md` — Chrome MCP UI test
- `.test-review/wave-beta-findings.md` — adversarial QA cold-start

## Decisions (от user'а 2026-05-01)

- **L5C unknown pair** = fail-closed: `compatible:false, requires_manual_review:true`.
- **war_risk** = per-voyage % vessel value (JWC 2024-26: 0.05% Gulf of Guinea, 0.075% Red Sea/Bab al-Mandeb, 0.04% Indian Ocean Somali corridor, 0.10% Black Sea Russia/Ukraine). Не annual÷365.
- **MPP enum** — minimum: добавить `'mpp'` + `'general'` уже есть; остальные (`heavy_lift`, `ro_ro`) defer to wave-γ.
- **Auto-deploy** — manual gate, не автомат.

# R6 — A11y + Perf + Polish (Design Spec)

**Дата:** 2026-05-24
**Parent:** §3 closing items + post-R5
**Depends:** R1-R5 merged

## 1. Цель

Финальный polish после миграции всех страниц:
1. **A11y** — global audit, contrast fixes, ARIA, focus management, screen-reader
2. **Perf** — Lighthouse, bundle analysis, code-split, image opt
3. **Motion** — `prefers-reduced-motion`, transition tuning
4. **Dark mode prep** — token-layer готовность (full impl optional later)
5. **Living docs** — update README + ROADMAP

## 2. A11y audit

### Tool stack
- axe-core/playwright на КАЖДОЙ странице (новые baseline)
- Manual: VoiceOver/NVDA smoke check 5 ключевых pages
- Lighthouse a11y score ≥95 per page

### Areas
- Color contrast (Maritime Deep: amber-100 + amber-800 = 10.9:1 ✓; verify все combinations)
- Focus order — keyboard tab through palette/dialog/sheet/forms
- Focus trap в overlays
- ARIA labels на icon-only buttons (BottomNav, HelpFAB)
- Live regions для toasts + LiveStrip
- Skip-to-content link в AppShell
- Form labels связаны (htmlFor)
- Heading hierarchy без skipped levels

### Output
- `tests/a11y/pages/<page>.spec.ts` per migrated page
- `docs/a11y-audit-r6.md` — найденное + fixes

## 3. Perf audit

### Tool stack
- `@next/bundle-analyzer` — bundle composition
- Lighthouse CI на 5 главных pages (CI gate)
- `npm run build` analysis

### Targets
- Lighthouse perf ≥85 desktop / ≥75 mobile per page
- Bundle: first-load JS ≤200kb на главных pages
- LCP ≤2.5s, CLS ≤0.1, INP ≤200ms

### Likely fixes
- Image sizing: next/image для all `<img>`
- Code-split: dynamic import for Dialog/Sheet contents
- Defer non-critical scripts
- Preconnect к external APIs (если есть)
- Font preload

### Output
- `lighthouse-r6.json` baseline
- `docs/perf-audit-r6.md`

## 4. Motion polish

- All transitions используют `--ds-motion-*` tokens
- `@media (prefers-reduced-motion: reduce)` zeroes durations (уже в R1 tokens)
- Audit для harsh transitions (no >400ms на UI elements)

## 5. Dark mode prep

- Add `data-theme="dark"` token overrides в `design-system/tokens/colors.css`
- НЕ активировать toggle (опционально в future R6.5)
- Document в README

## 6. Living docs update

- `docs/ROADMAP-CURRENT-STATE.md` — section "Full redesign R1-R6 completed"
- `docs/design-system.md` — обновлённая card "system as of <date>"
- `docs/superpowers/README.md` — link на spec/plans tree

## 7. Files

NEW:
- `tests/a11y/pages/*.spec.ts` (per migrated page, ~20 files)
- `tests/perf/lighthouse.config.json`
- `docs/a11y-audit-r6.md`
- `docs/perf-audit-r6.md`

MODIFIED:
- ROADMAP, READMEs
- design-system/tokens/colors.css (dark mode tokens)
- next.config.js (bundle analyzer, optimization flags)

## 8. Risks

| Risk | Mitigation |
|---|---|
| Lighthouse score depends on prod server load | Run locally + record baseline; CI gate as floor not ceiling |
| Dark mode tokens conflict | Scope under `[data-theme="dark"]` selector |
| A11y fix breaks visual baseline | Update visual baseline + add explicit a11y test for the fix |

## 9. Out of scope

- Full dark mode UI (only token prep)
- i18n
- Animations rewrite (token tuning only)

## 10. Success criteria

- axe 0 violations on all migrated pages
- Lighthouse a11y ≥95 / perf ≥85
- Bundle first-load JS ≤200kb on Dashboard, Matches
- prefers-reduced-motion respected
- Dark mode tokens drafted (not active)
- Living docs reflect R1-R6 complete

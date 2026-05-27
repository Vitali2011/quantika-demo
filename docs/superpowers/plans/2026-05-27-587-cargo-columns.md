# Issue #587 — /cargo table renders only CARGO column (CSS regression)

**Source:** /qa-walker baseline 2026-05-27. /cargo показывает 1 колонку из 7. DOM содержит все `<th>` (querySelectorAll('th').length === 7), но cols 2-7 не рендерятся.

**Tier:** S-M (1-3 files, CSS) · creative=no · unknown-root-cause → hypothesis-tree

## Hypothesis tree

- **H1: grid-template-columns truncated.** Если table использует CSS Grid, `grid-template-columns` мог стать `1fr` вместо `repeat(7, 1fr)` или `1fr 1fr ...`. Cols 2-7 рендерятся в zero-width track.
- **H2: overflow + width on container.** Wrapper `overflow-x: hidden` + `width: <CARGO column>` обрезает остальные cols (они в DOM, но clipped).
- **H3: table-layout fixed + width=0 на cols 2-7.** `table-layout: fixed` с `<col width="0">` или `display:none` на 6 колонках.
- **H4: Recent commit specific to /cargo introduced bug.** git log --oneline app/cargo/ за последние 7-14 дней — найти commit который ломает.
- **H5: Shared table component props.** `/cargo` передаёт другой prop `<DataTable cols=...>` чем `/vessels` (который рендерит ОК).

## Investigation steps

1. `git log --oneline app/cargo/ components/` за last 14 days → suspect commits
2. Compare `app/cargo/page.tsx` vs `app/vessels/page.tsx` для shared table component usage (which props)
3. Browser DevTools: `getBoundingClientRect()` для каждого th — width=0 = H1/H2/H3 confirmed
4. Find и поправить CSS / component prop

## Fix scope

- Скорее всего 1 файл: `app/cargo/page.tsx` ИЛИ shared `components/<Table>.tsx`
- Behavioral test: render \</cargo\>, assert 7 columns visible (getBoundingClientRect().width > 0 для каждой)
- Visual regression test (опционально): playwright width comparison /cargo vs /vessels

## Out of scope
- Любые другие routes (#588 dashboard match/0 / #589 AI hallucination — отдельно)
- Refactoring table component
- Sorting/filtering логики

## QA gate
- jest --findRelatedTests на app/cargo/page.tsx green
- Manual playwright smoke: bounding box /cargo th ≈ /vessels th widths ±5%

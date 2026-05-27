# Issue #595 — /cargo/[id] Full Detail consistency with side panel

**Tier:** S-M (~1-3 files) · creative=no (mechanical match style) · inline plan

## Goal

Привести `/cargo/[id]/page.tsx` к визуальному стилю side panel (правая колонка на /cargo):
- Same header: icon tag + name + subtype label
- Same cards: ORIGIN/DESTINATION/QUANTITY/LAYCAN/STATUS/SOURCE — same layout, spacing, typography
- Email content в clean expandable section (не raw block)

## Reference (на side panel)

```
[BK icon] Barite in big bags
BREAK_BULK
─────────────
ORIGIN       Antalya
DESTINATION  Georgetown
QUANTITY     3k
LAYCAN       Cargo ready
STATUS       ● OPEN
SOURCE       [Email] ETMS - Management

[Open full detail →]
```

## Implementation

1. Read `app/cargo/[id]/page.tsx` (current full-detail layout — старая страница с warning badges)
2. Read side panel component (likely `components/cargo/CargoSidePanel.tsx` или подобное)
3. Refactor full-detail используя те же primitives что side panel
4. Email content — expandable Section компонент (collapsed by default)
5. 'Back to Cargo' link стиль соответствует side panel close button stylistic

## Out of scope
- Backend changes
- /cargo list redesign (#594)
- Email annotation features (если there were)
- Status workflow / Needs Action badges (можно сохранить если уже в side panel)

## QA gate

- jest --findRelatedTests на app/cargo/[id]/page.tsx green
- Manual visual: playwright login + screenshot /cargo/[id] → сравнить визуально с side panel
- Acceptance: shared header + cards layout, email collapsed, no raw warnings outside design system

## PI3
- Не переписывать existing tests за пределами visual update
- Если backend `/api/cargo/[id]` возвращает данные — использовать

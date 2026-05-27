# Issue #594 — /cargo redesign: multi-column table per design intent

**User chose approach B (2026-05-27):** design intent через existing shadcn/Tailwind компоненты (consistent с design system, mobile responsive). НЕ pixel-perfect копия стандалона.

**Tier:** L (~4-7 файлов, cross-cutting UI) · creative=YES · brainstorm=inline-in-plan

## Brainstorm — inline hypothesis-tree

**Interpretations of "redesign":**
- I1: Pixel-perfect standalone HTML (rejected — breaks design system)
- **I2 chosen:** Adopt design intent (multi-column + filters + AI parse + search) через existing shadcn primitives
- I3: Hybrid taблица + side panel (rejected — over-scope, можно добавить если нужно)

**Approaches for I2:**
- A1: Rewrite app/cargo/page.tsx + новые компоненты с нуля
- A2: Restore prior multi-column из git history (likely doesn't exist matching new design)
- **A3 chosen:** Build new components, reuse patterns from /matches или /vessels (там уже filters + multi-col), импорт shadcn `Table/Input/Select`
- A4: Extend single-column с multi-column toggle (rejected — over-engineering)

## Components to build/extend (estimate)

1. `app/cargo/CargoClient.tsx` — главный layout (заменить single-column на multi-column table)
2. `app/cargo/components/CargoFiltersBar.tsx` (new) — Search + status + commodity + laycan filters + sort label
3. `app/cargo/components/CargoAIParseBox.tsx` (new or extend existing) — purple icon + textarea + Parse CTA
4. `app/cargo/components/CargoTable.tsx` (new) — columns CARGO (icon tag + name + subtype) / QTY / ROUTE / LAYCAN / STATUS / SOURCE
5. `app/cargo/components/CargoTypeTag.tsx` (new) — HSS/GR/CL/CK/BK color-coded icon badges
6. `__tests__/cargo-client.test.tsx` — extend with new column visibility tests, filter interactions

## Filters / sort behavior

- Search: name/route/charterer substring match
- status: All | Open | Match | Stale | Closed (existing enum)
- commodity: All | <unique commodities from data>
- laycan: Any | This week | This month | Custom range
- Sort: laycan (default) | created_date desc

## AI Parse box

Reuse existing `/api/cargo/parse` endpoint (или подобный). Same UX как /matches AI parse bar.

## Type tags color mapping (per standalone HTML)

- HSS Hot rolled steel → amber/yellow
- GR Grain → green
- CL Coal → dark gray
- CK Clinker → blue-gray
- BK Break bulk → light gray
- (fallback) → neutral

## Out of scope
- Backend API changes (используем existing endpoints)
- /cargo/[id] full detail (отдельный #595)
- Vessels или Matches redesign
- Mobile responsive tweaks за пределами `overflow-x-auto` + standard breakpoints
- Sort logic в backend (filtering на client-side OK для текущего объёма)

## QA gate

- jest --findRelatedTests на CargoClient.tsx green
- /test-skill cold QA (UI risk-override)
- Visual: playwright login + seed sample data + screenshot /cargo → должен видеть все 6 cols + filters bar + AI parse box

## Mobile / responsive

- Desktop >= 1024px: все 6 cols
- Tablet 768-1023: collapse SOURCE column (показывать в side panel)
- Mobile < 768px: horizontal scroll OR card layout

aspect: code-quality
findings_count: 9
findings:
  - file: app/api/ai/parse-cargo/route.ts
    line: 11
    severity: high
    finding: "toConfidence<T>() helper function duplicated verbatim across parse-cargo/route.ts (line 11), parse-vessel/route.ts (line 19), and parse-recap/route.ts (line 13) — 11+ identical lines each"
    recommendation: Extract toConfidence into lib/openai.ts or a new lib/ai-utils.ts and import from there
    roadmap_candidate: yes

  - file: app/api/ai/parse-vessel/route.ts
    line: 11
    severity: high
    finding: "extractNum() helper duplicated in parse-vessel/route.ts (line 11) and parse-recap/route.ts (line 12) — near-identical implementations; parse-recap version is minified onto one line"
    recommendation: Extract extractNum into shared lib/ai-utils.ts alongside toConfidence
    roadmap_candidate: yes

  - file: app/api/ai/parse-recap/route.ts
    line: 102
    severity: high
    finding: "Debug console.log statements left in production code at line 102 — two console.log calls on a single unindented line outside function scope, logging commissionPercent and freightRate values from parsed recaps"
    recommendation: Remove debug console.log lines; use structured logging if observability is needed
    roadmap_candidate: yes

  - file: app/cargo/[id]/page.tsx
    line: 16
    severity: medium
    finding: "safeRender(), getConf(), and ConfIcon component duplicated across 4 detail pages: cargo/[id]/page.tsx, vessel/[id]/page.tsx, fixture/[id]/page.tsx, match/[id]/page.tsx — each copy has slight variations making them drift"
    recommendation: Extract into shared components/confidence-field.tsx or lib/render-utils.ts
    roadmap_candidate: yes

  - file: app/dashboard/page.tsx
    line: 1
    severity: medium
    finding: "God component — 571 lines, mixes data-fetching (session reads, map building, filtering), derived-state computation (topContacts, commission totals, match filtering), and rendering (5+ collapsible sections). Exceeds 500 LOC threshold."
    recommendation: Split into smaller components (ActionBlocks, InboxBreakdown, NetworkSection) and extract data-prep into getDashboardData() helper
    roadmap_candidate: yes

  - file: app/dashboard/page.tsx
    line: 1
    severity: low
    finding: "eslint-disable at top suppresses @typescript-eslint/no-unused-vars for entire file; STATUS_ORDER constant (line 10) and imported Email type appear unused at module scope"
    recommendation: Remove unused imports/constants and drop blanket eslint-disable; fix per-line if actually needed
    roadmap_candidate: no

  - file: app/cargo/[id]/page.tsx
    line: 1
    severity: low
    finding: "Blanket eslint-disable suppresses both no-unused-vars and no-explicit-any across 4 detail page files (cargo, vessel, fixture, match) — hides real typing issues"
    recommendation: Replace with targeted per-line suppressions or proper ConfidenceField typings
    roadmap_candidate: no

  - file: lib/
    line: 0
    severity: high
    finding: "Missing test coverage — only lib/currency.ts is tested (lib/__tests__/currency.test.ts). All other lib modules (session.ts, commission.ts, counterparty.ts, freshness.ts, openai.ts, utils.ts, prompts.ts) and all app/api routes have zero test coverage."
    recommendation: Prioritize unit tests for commission.ts, freshness.ts, counterparty.ts (pure logic); add integration tests for AI route handlers
    roadmap_candidate: yes

  - file: app/api/ai/parse-recap/route.ts
    line: 12
    severity: low
    finding: "extractNum function body minified onto a single line (all logic concatenated without line breaks), inconsistent with codebase style"
    recommendation: Expand to multiline format consistent with parse-vessel/route.ts version
    roadmap_candidate: no

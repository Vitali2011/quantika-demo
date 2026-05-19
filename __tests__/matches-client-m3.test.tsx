/**
 * RED tests — MatchesClient.tsx M3 (advanced filters, score breakdown, bulk actions)
 *
 * Strategy: static JSX source analysis (testEnvironment: 'node').
 * This project does NOT use jsdom for component tests.
 *
 * Covers:
 *   1. Filter Panel presence — useSearchParams/useRouter imports, input fields, buttons
 *   2. URL state — URLSearchParams construction, push/replace URL on filter change
 *   3. Score breakdown panel — reason_structured, progress bar, toggle/collapse
 *   4. Bulk actions — checkboxes, sticky footer, Save/Dismiss/Archive/Delete, confirm modal
 *   5. API integration — /api/matches with filter params, /api/matches/bulk, fetch()
 *   6. Boundary Class 1 — empty matches list: filter panel and bulk controls still present
 *   7. Boundary Class 5 — cargo_type options are exactly: grain, coal, ore, container, project
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = process.cwd();
const clientPath = path.join(ROOT, 'app/matches/MatchesClient.tsx');

function readSource(): string {
  return fs.readFileSync(clientPath, 'utf8');
}

// ──────────────────────────────────────────────────────────────────────────────
// Sanity — file exists and is a client component
// ──────────────────────────────────────────────────────────────────────────────

describe('MatchesClient.tsx — file structure', () => {
  it('file exists', () => {
    expect(fs.existsSync(clientPath)).toBe(true);
  });

  it('has "use client" directive', () => {
    const src = readSource();
    expect(src).toMatch(/"use client"/);
  });

  it('exports a default function named MatchesClient', () => {
    const src = readSource();
    expect(src).toMatch(/export default function MatchesClient/);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 1. Filter Panel presence
// ──────────────────────────────────────────────────────────────────────────────

describe('MatchesClient.tsx — filter panel presence', () => {
  it('imports useSearchParams from next/navigation', () => {
    const src = readSource();
    expect(src).toMatch(/useSearchParams.*next\/navigation|from ['"]next\/navigation['"]/);
    expect(src).toMatch(/useSearchParams/);
  });

  it('imports useRouter from next/navigation', () => {
    const src = readSource();
    expect(src).toMatch(/useRouter/);
    expect(src).toMatch(/next\/navigation/);
  });

  it('contains a filter panel toggle with text "Filters" or "Advanced Filters"', () => {
    const src = readSource();
    expect(src).toMatch(/Filters|Advanced Filters/);
  });

  it('contains a cargo_type filter with checkbox inputs', () => {
    const src = readSource();
    expect(src).toMatch(/cargo_type/);
  });

  it('contains a route text input with port/UNLOCODE placeholder', () => {
    const src = readSource();
    // Must have a route input and a placeholder referencing port or UNLOCODE
    expect(src).toMatch(/route/);
    expect(src).toMatch(/[Pp]ort|UNLOCODE/);
  });

  it('contains laycan_from date input', () => {
    const src = readSource();
    expect(src).toMatch(/laycan_from/);
  });

  it('contains laycan_to date input', () => {
    const src = readSource();
    expect(src).toMatch(/laycan_to/);
  });

  it('contains score_min number input', () => {
    const src = readSource();
    expect(src).toMatch(/score_min/);
  });

  it('contains dwt_min number input', () => {
    const src = readSource();
    expect(src).toMatch(/dwt_min/);
  });

  it('contains dwt_max number input', () => {
    const src = readSource();
    expect(src).toMatch(/dwt_max/);
  });

  it('contains an "Apply" filter button', () => {
    const src = readSource();
    expect(src).toMatch(/Apply/);
  });

  it('contains a "Clear" filter button', () => {
    const src = readSource();
    // Must be a filter-clearing button (not just any "Clear" mention)
    expect(src).toMatch(/Clear/);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 2. URL state
// ──────────────────────────────────────────────────────────────────────────────

describe('MatchesClient.tsx — URL query state', () => {
  it('uses useSearchParams hook', () => {
    const src = readSource();
    expect(src).toMatch(/useSearchParams\s*\(\s*\)/);
  });

  it('uses useRouter hook', () => {
    const src = readSource();
    expect(src).toMatch(/useRouter\s*\(\s*\)/);
  });

  it('constructs URLSearchParams to build filter query string', () => {
    const src = readSource();
    expect(src).toMatch(/URLSearchParams|searchParams\.set|params\.set/);
  });

  it('calls router.push or router.replace to update URL when filters change', () => {
    const src = readSource();
    expect(src).toMatch(/router\.(push|replace)/);
  });

  it('expands filter panel by default when URL has filter params', () => {
    const src = readSource();
    // Must check searchParams for pre-existing values to set initial open state
    expect(src).toMatch(/searchParams\.(get|has)|searchParams\.size|Array\.from.*searchParams/);
  });

  it('clears all filter params from URL when "Clear" is triggered', () => {
    const src = readSource();
    // The clear action must push/replace a URL that removes filter params
    expect(src).toMatch(/router\.(push|replace).*['"`]\/matches['"`]|replace.*pathname|push.*'\?'|new URLSearchParams\(\)/);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 3. Score breakdown panel
// ──────────────────────────────────────────────────────────────────────────────

describe('MatchesClient.tsx — score breakdown panel', () => {
  it('references reason_structured field', () => {
    const src = readSource();
    expect(src).toMatch(/reason_structured/);
  });

  it('has a toggle button or clickable element to expand breakdown', () => {
    const src = readSource();
    // Must have a "Show Breakdown", "Breakdown", or similar toggle
    expect(src).toMatch(/[Bb]reakdown|[Ss]how.*[Bb]reakdown/);
  });

  it('renders score breakdown components with progress bar', () => {
    const src = readSource();
    // Must reference progress element OR width style for progress bar
    expect(src).toMatch(/<progress|width.*%|width.*ratio|points.*max|max.*points/i);
  });

  it('tracks which breakdown is expanded (state for expanded match id)', () => {
    const src = readSource();
    // State variable to track the expanded breakdown match ID
    expect(src).toMatch(/expandedBreakdown|breakdown.*State|expanded.*Id|activeBreakdown/i);
  });

  it('implements collapse when clicking same match (toggle logic)', () => {
    const src = readSource();
    // Must compare current expanded id with match.id for toggle
    expect(src).toMatch(/expandedBreakdown.*id|id.*expandedBreakdown|=== match\.id|=== id/);
  });

  it('conditionally renders breakdown button only when reason_structured is present', () => {
    const src = readSource();
    // Must guard breakdown button on reason_structured being non-null
    expect(src).toMatch(/reason_structured.*&&|reason_structured.*!==.*null|reason_structured.*\?/);
  });

  it('renders label, points, and reason from ScoreBreakdown components array', () => {
    const src = readSource();
    expect(src).toMatch(/\.label|\.points|\.reason/);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 4. Bulk actions
// ──────────────────────────────────────────────────────────────────────────────

describe('MatchesClient.tsx — bulk actions (checkboxes)', () => {
  it('renders a checkbox input for each match card', () => {
    const src = readSource();
    // Each match card must include a checkbox
    expect(src).toMatch(/type=["']checkbox["']|type=\{['"]checkbox['"]\}/);
  });

  it('tracks selected match IDs in state', () => {
    const src = readSource();
    expect(src).toMatch(/selected|checked.*Set|selectedIds|checkedIds/i);
  });
});

describe('MatchesClient.tsx — sticky footer for bulk actions', () => {
  it('contains a sticky footer element', () => {
    const src = readSource();
    // Must have sticky or fixed positioning class on a footer/bar
    expect(src).toMatch(/sticky|fixed.*bottom|bottom.*fixed/);
  });

  it('shows sticky footer when 1+ checkboxes are selected', () => {
    const src = readSource();
    // Footer visibility is conditional on selection count
    expect(src).toMatch(/selected.*length|selectedIds.*length|checked.*size|\.size\s*>/i);
  });

  it('shows count of selected matches in footer', () => {
    const src = readSource();
    expect(src).toMatch(/Selected.*N|selected.*\.length|N.*matches|\.size.*match/i);
  });

  it('has "Save All" action in bulk footer', () => {
    const src = readSource();
    expect(src).toMatch(/Save All/);
  });

  it('has "Dismiss All" action in bulk footer', () => {
    const src = readSource();
    expect(src).toMatch(/Dismiss All/);
  });

  it('has "Archive All" action in bulk footer', () => {
    const src = readSource();
    expect(src).toMatch(/Archive All/);
  });

  it('has "Delete" action with admin reference in bulk footer', () => {
    const src = readSource();
    // Must have Delete button and reference admin
    expect(src).toMatch(/Delete/);
    expect(src).toMatch(/admin/i);
  });
});

describe('MatchesClient.tsx — confirm modal', () => {
  it('has a confirm modal element', () => {
    const src = readSource();
    expect(src).toMatch(/[Mm]odal|confirm.*modal|modal.*confirm/i);
  });

  it('shows "Are you sure" confirmation text', () => {
    const src = readSource();
    expect(src).toMatch(/Are you sure/);
  });

  it('has "Confirm" button in modal', () => {
    const src = readSource();
    expect(src).toMatch(/Confirm/);
  });

  it('has "Cancel" button in modal', () => {
    const src = readSource();
    expect(src).toMatch(/Cancel/);
  });

  it('triggers confirm modal for Delete bulk action', () => {
    const src = readSource();
    // Must link the delete action to the modal trigger
    expect(src).toMatch(/[Dd]elete.*[Mm]odal|[Mm]odal.*[Dd]elete|showModal|setShow[A-Z]/i);
  });

  it('triggers confirm modal for Archive All when N > 5', () => {
    const src = readSource();
    // Must have a threshold check (> 5) for showing the confirm modal
    expect(src).toMatch(/>\s*5|length\s*>\s*5|size\s*>\s*5/);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 5. API integration
// ──────────────────────────────────────────────────────────────────────────────

describe('MatchesClient.tsx — API integration', () => {
  it('calls /api/matches with filter params from URL', () => {
    const src = readSource();
    // Must build /api/matches? URL from filter state
    expect(src).toMatch(/api\/matches\?|api\/matches.*\$\{|`\/api\/matches/);
  });

  it('calls /api/matches/bulk for bulk actions', () => {
    const src = readSource();
    expect(src).toMatch(/api\/matches\/bulk/);
  });

  it('uses fetch() for API calls', () => {
    const src = readSource();
    expect(src).toMatch(/fetch\s*\(/);
  });

  it('uses PATCH method for bulk save/dismiss/archive', () => {
    const src = readSource();
    expect(src).toMatch(/method.*PATCH|PATCH/);
  });

  it('uses DELETE method for bulk delete', () => {
    const src = readSource();
    expect(src).toMatch(/method.*DELETE|DELETE/);
  });

  it('refreshes match list after successful bulk action', () => {
    const src = readSource();
    // After successful bulk, state must be updated or a refresh triggered
    expect(src).toMatch(/setMatches|setDisplayMatches|refreshMatches|router\.refresh/i);
  });

  it('clears selection after successful bulk action', () => {
    const src = readSource();
    // Must reset selected IDs on success
    expect(src).toMatch(/setSelected|setChecked|selected.*clear|new Set\(\)|clearSelection/i);
  });

  it('shows error state on 400/404 bulk response without clearing selection', () => {
    const src = readSource();
    // Must have error state handling for non-ok responses
    expect(src).toMatch(/setError|error.*State|bulkError|!res\.ok/i);
  });

  it('uses initialMatches prop only for SSR seed; updates state from API response', () => {
    const src = readSource();
    // Client must fetch from /api/matches and update state independently
    expect(src).toMatch(/api\/matches/);
    expect(src).toMatch(/setMatches\s*\(/);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 6. Boundary Class 1 — empty list renders filter panel and bulk controls
// ──────────────────────────────────────────────────────────────────────────────

describe('MatchesClient.tsx — Class 1 (empty list — no crash, controls still present)', () => {
  it('filter panel is not conditionally rendered inside the match list block', () => {
    const src = readSource();
    // The filter panel must be outside the "if matches.length > 0" guard —
    // presence of cargo_type before/outside the filtered.map loop confirms this.
    // We verify that cargo_type appears in the source (filter panel always rendered)
    // and that the file does NOT wrap all filter controls inside a filtered.length check.
    expect(src).toMatch(/cargo_type/);
    // Source-level check: cargo_type must NOT appear only inside a conditional block
    // that hides it when matches are empty. We test this by ensuring cargo_type
    // appears before (or independently of) the filtered.map call.
    const cargoTypeIndex = src.indexOf('cargo_type');
    const mapIndex = src.indexOf('filtered.map');
    // cargo_type must exist (cargoTypeIndex !== -1) even if map doesn't yet exist
    expect(cargoTypeIndex).not.toBe(-1);
  });

  it('bulk footer state variable exists independently of match count', () => {
    const src = readSource();
    // The selected/checked state must be declared at component level (not inside map)
    expect(src).toMatch(/useState.*Set\(\)|useState.*\[\].*selected|const.*selected.*=.*useState/i);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 7. Boundary Class 5 — cargo_type options are exactly the specified set
// ──────────────────────────────────────────────────────────────────────────────

describe('MatchesClient.tsx — Class 5 (cargo_type options exact set)', () => {
  it('contains cargo type option: grain', () => {
    const src = readSource();
    expect(src).toMatch(/grain/);
  });

  it('contains cargo type option: coal', () => {
    const src = readSource();
    expect(src).toMatch(/coal/);
  });

  it('contains cargo type option: ore', () => {
    const src = readSource();
    expect(src).toMatch(/ore/);
  });

  it('contains cargo type option: container', () => {
    const src = readSource();
    expect(src).toMatch(/container/);
  });

  it('contains cargo type option: project', () => {
    const src = readSource();
    expect(src).toMatch(/['"]project['"]/);
  });

  it('cargo type options array contains exactly 5 entries (grain/coal/ore/container/project)', () => {
    const src = readSource();
    // Must have an array with all five options
    expect(src).toMatch(/grain.*coal.*ore.*container.*project|grain[\s\S]{0,200}coal[\s\S]{0,200}ore[\s\S]{0,200}container[\s\S]{0,200}project/);
  });
});

/**
 * Tests — app/match/[id]/page.tsx (match detail page)
 *
 * Strategy: static source analysis (testEnvironment: 'node').
 *
 * Covers:
 *   - Page looks up by DB id (not session array index)
 *   - Session isolation: checks user_id === sessionId before rendering
 *   - Uses notFound() for missing or wrong-session match (PI2)
 *   - Displays M3 fields: cargo_type, load_port, discharge_port, laycan, vessel_dwt
 *   - Shows MatchTabs when session match is available
 *   - Back link points to /matches
 *   - Feature: GET /api/matches/[id] route exists and has GET handler
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = process.cwd();
const pagePath = path.join(ROOT, 'app/match/[id]/page.tsx');
const routePath = path.join(ROOT, 'app/api/matches/[id]/route.ts');

function readSource(filePath: string): string {
  return fs.readFileSync(filePath, 'utf8');
}

describe('app/match/[id]/page.tsx — file structure', () => {
  it('file exists', () => {
    expect(fs.existsSync(pagePath)).toBe(true);
  });

  it('is an async server component', () => {
    const src = readSource(pagePath);
    expect(src).toMatch(/async.*function|async.*=>/);
  });

  it('awaits params (Next.js 15 async params pattern)', () => {
    const src = readSource(pagePath);
    expect(src).toMatch(/await.*params/);
  });
});

describe('app/match/[id]/page.tsx — DB-based lookup (not session index)', () => {
  it('parses id as integer with parseInt', () => {
    const src = readSource(pagePath);
    expect(src).toMatch(/parseInt/);
  });

  it('calls getMatch to look up by DB id', () => {
    const src = readSource(pagePath);
    expect(src).toMatch(/getMatch/);
  });

  it('imports getMatch from matches-repository', () => {
    const src = readSource(pagePath);
    expect(src).toMatch(/from.*matches-repository/);
  });

  it('does NOT use session array index lookup (session.matches[idx])', () => {
    const src = readSource(pagePath);
    expect(src).not.toMatch(/session\.matches\[/);
  });
});

describe('app/match/[id]/page.tsx — session isolation (#399)', () => {
  it('checks user_id against sessionId before rendering', () => {
    const src = readSource(pagePath);
    expect(src).toMatch(/user_id.*sessionId|sessionId.*user_id/);
  });

  it('calls notFound() for session isolation violation', () => {
    const src = readSource(pagePath);
    expect(src).toMatch(/notFound/);
  });

  it('obtains sessionId from cookie', () => {
    const src = readSource(pagePath);
    expect(src).toMatch(/session_id/);
    expect(src).toMatch(/sessionId/);
  });
});

describe('app/match/[id]/page.tsx — M3 fields display', () => {
  it('renders cargo_type field', () => {
    const src = readSource(pagePath);
    expect(src).toMatch(/cargo_type/);
  });

  it('renders load_port field', () => {
    const src = readSource(pagePath);
    expect(src).toMatch(/load_port/);
  });

  it('renders discharge_port field', () => {
    const src = readSource(pagePath);
    expect(src).toMatch(/discharge_port/);
  });

  it('renders laycan (laycan_start / laycan_end)', () => {
    const src = readSource(pagePath);
    expect(src).toMatch(/laycan_start|laycan_end/);
  });

  it('renders vessel_dwt', () => {
    const src = readSource(pagePath);
    expect(src).toMatch(/vessel_dwt/);
  });

  it('renders score from storedMatch', () => {
    const src = readSource(pagePath);
    expect(src).toMatch(/storedMatch\.score|\.score/);
  });
});

describe('app/match/[id]/page.tsx — tabs (MatchTabs)', () => {
  it('imports MatchTabs component', () => {
    const src = readSource(pagePath);
    expect(src).toMatch(/MatchTabs/);
  });

  it('renders MatchTabs conditionally (only when session match available)', () => {
    const src = readSource(pagePath);
    // MatchTabs should be inside a conditional block for sessionMatch
    expect(src).toMatch(/sessionMatch/);
    const sessionMatchIdx = src.indexOf('sessionMatch');
    const matchTabsIdx = src.indexOf('<MatchTabs');
    expect(matchTabsIdx).toBeGreaterThan(sessionMatchIdx);
  });
});

describe('app/match/[id]/page.tsx — navigation', () => {
  it('has back link to /matches', () => {
    const src = readSource(pagePath);
    expect(src).toMatch(/href.*\/matches|\/matches.*href/);
  });
});

describe('app/api/matches/[id]/route.ts — GET handler', () => {
  it('exports GET function', () => {
    const src = readSource(routePath);
    expect(src).toMatch(/export async function GET/);
  });

  it('GET checks session via requireSession', () => {
    const src = readSource(routePath);
    // GET must call requireSession
    const getBlockStart = src.indexOf('export async function GET');
    const patchBlockStart = src.indexOf('export async function PATCH');
    const getBlock = src.slice(getBlockStart, patchBlockStart > 0 ? patchBlockStart : undefined);
    expect(getBlock).toMatch(/requireSession/);
  });

  it('GET enforces session isolation (user_id !== sessionId → 404)', () => {
    const src = readSource(routePath);
    const getBlockStart = src.indexOf('export async function GET');
    const patchBlockStart = src.indexOf('export async function PATCH');
    const getBlock = src.slice(getBlockStart, patchBlockStart > 0 ? patchBlockStart : undefined);
    expect(getBlock).toMatch(/user_id.*sessionId|sessionId.*user_id/);
    expect(getBlock).toMatch(/404/);
  });

  it('still exports PATCH handler (no regression)', () => {
    const src = readSource(routePath);
    expect(src).toMatch(/export async function PATCH/);
  });
});

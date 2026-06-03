/**
 * @jest-environment jsdom
 *
 * Behavioral regression tests for:
 *   #516 — UNLOCODE route display: parenthetical "(Ukraine)" produces "(" in code
 *   #518 — Dashboard shows empty state (not redirect to /) when session_id absent
 *   #522 — AIBar placeholder contains Russian text "про груз"/"про судно"
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = process.cwd();
function readSrc(rel: string) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

jest.mock('next/navigation', () => ({
  usePathname: jest.fn().mockReturnValue('/dashboard'),
  useRouter: jest.fn().mockReturnValue({ push: jest.fn() }),
  useSearchParams: jest.fn().mockReturnValue(new URLSearchParams()),
}));

jest.mock('next/link', () => {
  const MockLink = ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) =>
    React.createElement('a', { href, ...rest }, children);
  MockLink.displayName = 'Link';
  return MockLink;
});

// ─── #522: AIBar i18n — no Russian text ──────────────────────────────────────

import { ModeProvider } from '@/design-system/patterns/ModeProvider';
import { PaletteProvider } from '@/design-system/patterns/usePalette';
import { AIBar } from '@/design-system/patterns/AIBar';

describe('#522 — AIBar placeholder has no Russian text', () => {
  function renderAIBar(mode: 'charterer' | 'owner') {
    return render(
      <ModeProvider initial={mode}>
        <PaletteProvider>
          <AIBar />
        </PaletteProvider>
      </ModeProvider>,
    );
  }

  it('charterer mode: placeholder does not contain "про груз"', () => {
    renderAIBar('charterer');
    const bar = screen.getByRole('button', { name: /open ai assistant/i });
    expect(bar.textContent).not.toContain('про груз');
    expect(bar.textContent).toContain('about cargo');
  });

  it('owner mode: placeholder does not contain "про судно"', () => {
    renderAIBar('owner');
    const bar = screen.getByRole('button', { name: /open ai assistant/i });
    expect(bar.textContent).not.toContain('про судно');
    expect(bar.textContent).toContain('about vessels');
  });

  it('useMode COPY has no Cyrillic characters in aibar.placeholder', () => {
    const src = readSrc('design-system/patterns/useMode.ts');
    // Extract aibar.placeholder lines
    const matches = src.match(/'aibar\.placeholder':[^\n]+/g) ?? [];
    expect(matches.length).toBeGreaterThan(0);
    for (const line of matches) {
      expect(line).not.toMatch(/[Ѐ-ӿ]/); // no Cyrillic
    }
  });
});

// ─── #518: Dashboard no-session shows empty state, not redirect ───────────────

describe('#518 — Dashboard page: no session_id shows empty state, not redirect("/")', () => {
  it('dashboard/page.tsx does not call redirect("/") on absent session', () => {
    const src = readSrc('app/dashboard/page.tsx');
    // The old pattern was: if (!sessionId) redirect('/')
    // After fix: should not exist
    expect(src).not.toMatch(/if\s*\(!sessionId\)\s*redirect\s*\(\s*['"]\/['"]\s*\)/);
    expect(src).not.toMatch(/if\s*\(!session\)\s*redirect\s*\(\s*['"]\/['"]\s*\)/);
  });

  it('dashboard/page.tsx shows "No emails yet" when session is null', () => {
    const src = readSrc('app/dashboard/page.tsx');
    // The empty state should be rendered inside the component body for null session
    expect(src).toMatch(/No emails yet/);
    // Should have a conditional return path for !session
    expect(src).toMatch(/if\s*\(!session\)/);
  });
});

// ─── #516: abbrPort strips parenthetical qualifiers ──────────────────────────

import { abbrPort } from '@/lib/utils/abbr-port';

describe('#516 — abbrPort: no "(" in output for common port names with country qualifiers', () => {
  const cases: [string, string][] = [
    ['Odessa (Ukraine)', 'ODES'],
    ['Iskenderun (Turkey)', 'ISKE'],
    ['Novorossiysk (Russia)', 'NOVO'],
    ['Hamburg (Germany)', 'HAMB'],
  ];

  test.each(cases)('abbrPort("%s") = "%s" with no "("', (input, expected) => {
    const result = abbrPort(input);
    expect(result).toBe(expected);
    expect(result).not.toContain('(');
  });

  it('MatchesClient.tsx renders full port names in the route cell (#785)', () => {
    const src = readSrc('app/matches/MatchesClient.tsx');
    // #785: full names rendered directly — no abbreviation function in route cell
    expect(src).not.toMatch(/abbrPort\(match\.(load|discharge)_port\)/);
    // Should NOT have raw .slice(0,4).toUpperCase() on load_port/discharge_port
    expect(src).not.toMatch(/load_port\.slice\(0,\s*4\)\.toUpperCase/);
    expect(src).not.toMatch(/discharge_port\.slice\(0,\s*4\)\.toUpperCase/);
  });

  it('CargoClient.tsx uses abbrPort', () => {
    const src = readSrc('app/cargo/CargoClient.tsx');
    expect(src).toMatch(/import.*abbrPort.*abbr-port/);
  });

  it('VesselsClient.tsx uses abbrPort', () => {
    const src = readSrc('app/vessels/VesselsClient.tsx');
    expect(src).toMatch(/import.*abbrPort.*abbr-port/);
  });
});

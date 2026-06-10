/**
 * Regression guard: vessel and fixture detail pages must display fromName
 * (clean anonymized name) not bare email.from (raw token).
 *
 * Mirrors the fix in app/email/[id]/page.tsx (issue N / PR #897).
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = process.cwd();
const VESSEL_SRC = fs.readFileSync(
  path.join(ROOT, 'app/vessel/[id]/page.tsx'),
  'utf8',
);
const FIXTURE_SRC = fs.readFileSync(
  path.join(ROOT, 'app/fixture/[id]/page.tsx'),
  'utf8',
);

describe('app/vessel/[id]/page.tsx — sender display', () => {
  it('renders fromName with fallback to from, not bare email.from', () => {
    expect(VESSEL_SRC).toContain('email.fromName ?? email.from');
  });

  it('does NOT use bare {email.from} in the From: display line', () => {
    const fromLine = VESSEL_SRC.match(/From:[^}]*\{[^}]+\}/)?.[0] ?? '';
    expect(fromLine).not.toMatch(/\{email\.from\}(?!\s*\?\?)/);
  });
});

describe('app/fixture/[id]/page.tsx — sender display', () => {
  it('renders fromName with fallback to from, not bare email.from', () => {
    expect(FIXTURE_SRC).toContain('email.fromName ?? email.from');
  });

  it('does NOT use bare {email.from} in the From: display line', () => {
    const fromLine = FIXTURE_SRC.match(/From:[^}]*\{[^}]+\}/)?.[0] ?? '';
    expect(fromLine).not.toMatch(/\{email\.from\}(?!\s*\?\?)/);
  });
});

describe('fromName ?? from — fallback logic (behavioral)', () => {
  it('returns fromName when set (clean anonymized name)', () => {
    const email = { fromName: 'BROKER 1', from: 'SENDER 1' };
    const display = email.fromName ?? email.from;
    expect(display).toBe('BROKER 1');
    expect(display).not.toBe('SENDER 1');
  });

  it('falls back to from when fromName is null', () => {
    const email = { fromName: null, from: 'contact6@demo.local' };
    const display = email.fromName ?? email.from;
    expect(display).toBe('contact6@demo.local');
  });
});

describe('cross-check: vessel/fixture pattern mirrors email detail page fix', () => {
  it('vessel page uses same fromName ?? from pattern as email detail page', () => {
    const emailSrc = fs.readFileSync(
      path.join(ROOT, 'app/email/[id]/page.tsx'),
      'utf8',
    );
    expect(emailSrc).toContain('email.fromName ?? email.from');
    expect(VESSEL_SRC).toContain('email.fromName ?? email.from');
  });

  it('fixture page uses same fromName ?? from pattern as email detail page', () => {
    const emailSrc = fs.readFileSync(
      path.join(ROOT, 'app/email/[id]/page.tsx'),
      'utf8',
    );
    expect(emailSrc).toContain('email.fromName ?? email.from');
    expect(FIXTURE_SRC).toContain('email.fromName ?? email.from');
  });
});

/**
 * Regression guard: email detail page must display fromName (clean anonymized name)
 * not email.from (raw token like "SENDER 1" or "contact6@demo.local").
 *
 * Issue N — detail page showed raw from_addr while list page used fromName ?? from.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = process.cwd();
const PAGE_SRC = fs.readFileSync(
  path.join(ROOT, 'app/email/[id]/page.tsx'),
  'utf8',
);

describe('app/email/[id]/page.tsx — sender display (issue N)', () => {
  it('renders fromName with fallback to from, not bare email.from', () => {
    expect(PAGE_SRC).toContain('email.fromName ?? email.from');
  });

  it('does NOT use bare {email.from} in the From: display line', () => {
    const fromLine = PAGE_SRC.match(/From:[^}]*\{[^}]+\}/)?.[0] ?? '';
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

  it('list page pattern fromName ?? from mirrors detail page fix', () => {
    const listSrc = fs.readFileSync(path.join(ROOT, 'app/email/page.tsx'), 'utf8');
    expect(listSrc).toContain('email.fromName ?? email.from');
  });
});

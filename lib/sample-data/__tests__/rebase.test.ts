import { rebaseDates } from '../rebase';
import type { SampleEmailRaw } from '../types';

const TODAY = new Date('2026-05-10T00:00:00.000Z');

const FIXTURE: SampleEmailRaw[] = [
  {
    id: 'test-01', threadId: 't-01', from: 'a@b.com', fromName: 'A', fromEmail: 'a@b.com',
    to: 'demo@quantika.org', subject: 'Test cargo',
    date: '{{EMAIL_DATE}}',
    body: 'Laycan: {{LAYCAN_START}}-{{LAYCAN_END}} {{LAYCAN_MONTH}}\nFull range: {{LAYCAN_RANGE}}',
    snippet: 'test', labelIds: [],
    _meta: { emailDateOffsetDays: -5, laycanStartOffsetDays: 10, laycanEndOffsetDays: 20 },
  },
  {
    id: 'test-02', threadId: 't-02', from: 'b@c.com', fromName: 'B', fromEmail: 'b@c.com',
    to: 'demo@quantika.org', subject: 'Test vessel',
    date: '{{EMAIL_DATE}}',
    body: 'Open: {{OPEN_DATE}}',
    snippet: 'test', labelIds: [],
    _meta: { emailDateOffsetDays: -3, openDateOffsetDays: 15 },
  },
  {
    id: 'test-03', threadId: 't-03', from: 'c@d.com', fromName: 'C', fromEmail: 'c@d.com',
    to: 'demo@quantika.org', subject: 'Adversarial',
    date: '2025-01-15T00:00:00.000Z',
    body: 'Laycan: 10-15 Jan 2025',
    snippet: 'expired', labelIds: [],
    _meta: { skipRebase: true, emailDateOffsetDays: 0 },
  },
];

test('rebase cargo email date', () => {
  const [out] = rebaseDates(FIXTURE, TODAY);
  expect(out.date).toBe('2026-05-05T00:00:00.000Z'); // today - 5
});

test('rebase laycan markers in body', () => {
  const [out] = rebaseDates(FIXTURE, TODAY);
  // today +10 = May 20; today +20 = May 30
  expect(out.body).toContain('20-30 May 2026');         // LAYCAN_RANGE
  expect(out.body).toContain('Laycan: 20-30 May 2026');
});

test('rebase open date marker', () => {
  const [, out] = rebaseDates(FIXTURE, TODAY);
  expect(out.body).toContain('25 May'); // today +15 = May 25
});

test('skipRebase passes email unchanged', () => {
  const [,, out] = rebaseDates(FIXTURE, TODAY);
  expect(out.date).toBe('2025-01-15T00:00:00.000Z');
  expect(out.body).toContain('10-15 Jan 2025');
});

test('no residual markers in output', () => {
  const results = rebaseDates(FIXTURE, TODAY);
  for (const email of results) {
    expect(email.body).not.toMatch(/\{\{[A-Z_]+\}\}/);
    expect(email.date).not.toContain('{{');
  }
});

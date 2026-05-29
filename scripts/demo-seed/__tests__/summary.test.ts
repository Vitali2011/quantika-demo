import { formatSummary, type SummaryInput } from '../summary';

describe('formatSummary', () => {
  it('renders counts, conflicts and anonymization preview', () => {
    const input: SummaryInput = {
      counts: { cargo: 80, vessel: 60, recap: 13, classify: 153 },
      matchCount: 142,
      anonymization: { vessels: { 'M/V SPRING WIND': 'M/V SEAGULL 1' }, charterers: {}, brokers: {}, sender_emails: {} },
      conflicts: ['e7: two vessels named SERKAN'],
    };
    const out = formatSummary(input);
    expect(out).toContain('cargo=80');
    expect(out).toContain('matches=142');
    expect(out).toContain('M/V SPRING WIND → M/V SEAGULL 1');
    expect(out).toContain('two vessels named SERKAN');
  });
});

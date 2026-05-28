import { MorningHeader } from '../MorningHeader';

describe('MorningHeader', () => {
  it('renders without crashing', () => {
    const el = MorningHeader({ userName: 'Alex', alertCount: 3 });
    expect(el).not.toBeNull();
  });

  it('includes the user name in output', () => {
    const el = MorningHeader({ userName: 'Alex', alertCount: 0 });
    const text = JSON.stringify(el);
    expect(text).toContain('Alex');
  });

  it('includes alert count when > 0', () => {
    const el = MorningHeader({ userName: 'Alex', alertCount: 5 });
    const text = JSON.stringify(el);
    expect(text).toContain('5');
  });

  it('uses Intl.DateTimeFormat for date display (contains year)', () => {
    const el = MorningHeader({ userName: 'Alex', alertCount: 0 });
    const text = JSON.stringify(el);
    // The formatted date should include the current year
    expect(text).toContain(new Date().getFullYear().toString());
  });

  it('shows Good morning greeting', () => {
    const el = MorningHeader({ userName: 'Alex', alertCount: 0 });
    const text = JSON.stringify(el);
    expect(text).toMatch(/[Gg]ood morning/);
  });

  it('shows "Good morning!" without name when userName is omitted — no "There" fallback (#627)', () => {
    const el = MorningHeader({ alertCount: 0 });
    const text = JSON.stringify(el);
    expect(text).toMatch(/Good morning!/);
    expect(text).not.toContain('There');
    expect(text).not.toMatch(/Good morning, 👋/);
  });

  it('shows "Good morning!" without name when userName is empty string — no "There" fallback (#627)', () => {
    const el = MorningHeader({ userName: '', alertCount: 0 });
    const text = JSON.stringify(el);
    expect(text).toMatch(/Good morning!/);
    expect(text).not.toContain('There');
  });
});

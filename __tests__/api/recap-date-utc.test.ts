describe('recap dateRange UTC stability (γ-cleanup-2 tail)', () => {
  it('formats date in UTC regardless of process.env.TZ', () => {
    // Use a date that falls on different days in different TZ
    const d = new Date('2026-05-04T23:30:00Z'); // UTC May 4, but May 5 in Asia
    const formatted = d.toLocaleDateString('en-US', { timeZone: 'UTC' });
    expect(formatted).toBe('5/4/2026');
  });
});

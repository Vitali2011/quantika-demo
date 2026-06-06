// Unit test for --window flag parsing logic used in seed-all.ts
describe('seed-all --window flag parsing', () => {
  const makeGet = (argv: string[]) => (k: string) => {
    const i = argv.indexOf(k);
    return i === -1 ? undefined : argv[i + 1];
  };

  it('defaults to 14 when --window absent', () => {
    const get = makeGet([]);
    const demoWindowDays = parseInt(get('--window') ?? '14', 10);
    expect(demoWindowDays).toBe(14);
  });

  it('parses --window 7', () => {
    const get = makeGet(['--window', '7']);
    const demoWindowDays = parseInt(get('--window') ?? '14', 10);
    expect(demoWindowDays).toBe(7);
  });

  it('parses --window when mixed with other flags', () => {
    const get = makeGet(['--frozen-date', '2026-01-01', '--window', '30', '--model', 'claude-opus-4-8']);
    const demoWindowDays = parseInt(get('--window') ?? '14', 10);
    expect(demoWindowDays).toBe(30);
  });
});

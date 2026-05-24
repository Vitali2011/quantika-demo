/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen, act } from '@testing-library/react';
import { ModeProvider } from '../ModeProvider';
import { useMode } from '../useMode';

function Probe() {
  const { mode, isCharterer, isOwner, t, setMode } = useMode();
  return (
    <>
      <span data-testid="mode">{mode}</span>
      <span data-testid="iss">{String(isCharterer)}/{String(isOwner)}</span>
      <span data-testid="copy">{t('aibar.placeholder')}</span>
      <button onClick={() => setMode(mode === 'charterer' ? 'owner' : 'charterer')}>swap</button>
    </>
  );
}

describe('useMode (design-system)', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/');
    global.fetch = jest.fn().mockResolvedValue({ ok: true }) as typeof global.fetch;
  });

  it('returns initial mode charterer + correct flags', () => {
    render(<ModeProvider initial="charterer"><Probe /></ModeProvider>);
    expect(screen.getByTestId('mode')).toHaveTextContent('charterer');
    expect(screen.getByTestId('iss')).toHaveTextContent('true/false');
  });

  it('returns initial mode owner + correct flags', () => {
    render(<ModeProvider initial="owner"><Probe /></ModeProvider>);
    expect(screen.getByTestId('mode')).toHaveTextContent('owner');
    expect(screen.getByTestId('iss')).toHaveTextContent('false/true');
  });

  it('t() returns mode-aware copy for charterer', () => {
    render(<ModeProvider initial="charterer"><Probe /></ModeProvider>);
    expect(screen.getByTestId('copy').textContent).toMatch(/груз/i);
  });

  it('t() returns mode-aware copy for owner', () => {
    render(<ModeProvider initial="owner"><Probe /></ModeProvider>);
    expect(screen.getByTestId('copy').textContent).toMatch(/судно/i);
  });

  it('setMode updates context', () => {
    render(<ModeProvider initial="charterer"><Probe /></ModeProvider>);
    act(() => { screen.getByText('swap').click(); });
    expect(screen.getByTestId('mode')).toHaveTextContent('owner');
  });

  it('URL ?mode=owner overrides initial charterer', () => {
    window.history.pushState({}, '', '?mode=owner');
    render(<ModeProvider initial="charterer"><Probe /></ModeProvider>);
    expect(screen.getByTestId('mode')).toHaveTextContent('owner');
  });

  it('URL ?mode=charterer overrides initial owner', () => {
    window.history.pushState({}, '', '?mode=charterer');
    render(<ModeProvider initial="owner"><Probe /></ModeProvider>);
    expect(screen.getByTestId('mode')).toHaveTextContent('charterer');
  });
});

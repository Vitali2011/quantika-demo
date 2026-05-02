/**
 * βf-13: SubsCountdown must produce deterministic SSR output.
 *
 * Before fix: `useState(() => new Date())` ran during SSR + hydration with
 * different timestamps → React #418. After fix: pre-mount renders a fixed
 * "--:--:--" placeholder, deferring `new Date()` to useEffect.
 */
import { renderToString } from 'react-dom/server';
import { SubsCountdown } from '../SubsCountdown';

describe('SubsCountdown SSR determinism (βf-13)', () => {
  it('renders identical HTML across two SSR passes', () => {
    const props = {
      deadlineAt: '2026-12-31T12:00:00Z',
      dealId: 'd1',
      counterparty: 'ACME',
    };

    const a = renderToString(<SubsCountdown {...props} />);
    // Sleep a tick — if the component used `new Date()` in render, the
    // millisecond-precision string would differ between calls.
    const b = renderToString(<SubsCountdown {...props} />);
    expect(a).toBe(b);
  });

  it('does NOT include a live remaining-time string in pre-mount HTML', () => {
    const html = renderToString(
      <SubsCountdown
        deadlineAt="2026-12-31T12:00:00Z"
        dealId="d1"
        counterparty="ACME"
      />,
    );
    // Live countdown would look like "12:34:56 to subs". Placeholder is "--:--:--".
    expect(html).toContain('--:--:--');
    expect(html).not.toMatch(/\d\d:\d\d:\d\d to subs/);
  });
});

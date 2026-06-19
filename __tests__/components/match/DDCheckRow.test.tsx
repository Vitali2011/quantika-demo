/**
 * @jest-environment jsdom
 *
 * DDCheckRow — thin 'use client' disclosure leaf for the Due-Diligence panel.
 * Behavioral: «Подробнее» toggles the server-built detail + source badge; rows
 * without a detail render no toggle (honesty gap rows stay flat).
 */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DDCheckRow } from '@/components/match/DDCheckRow';

describe('DDCheckRow', () => {
  it('renders label + evidence always; detail hidden until «Подробнее» clicked', async () => {
    const user = userEvent.setup();
    render(
      <DDCheckRow
        label="TCE vs breakeven"
        state="pass"
        evidence="TCE $9,600/day — $1,400/day above breakeven"
        detail={'TCE — daily voyage return.\nCalc: TCE $9,600/day − breakeven $8,200/day = +$1,400/day → above breakeven.\nWar-risk shown separately in the breakdown.'}
        source="TCE calculation"
      />,
    );

    // label + evidence visible immediately
    expect(screen.getByText('TCE vs breakeven')).toBeInTheDocument();
    expect(screen.getByText(/above breakeven/)).toBeInTheDocument();
    // detail body NOT in DOM before toggle
    expect(screen.queryByTestId('dd-check-detail')).not.toBeInTheDocument();

    // click «Подробнее» → detail + source badge appear
    await user.click(screen.getByTestId('dd-check-toggle'));
    const body = screen.getByTestId('dd-check-detail');
    expect(body).toBeInTheDocument();
    expect(body).toHaveTextContent('Calc: TCE $9,600/day');
    expect(body).toHaveTextContent('Source: TCE calculation');

    // toggle label flips and collapses
    await user.click(screen.getByTestId('dd-check-toggle'));
    expect(screen.queryByTestId('dd-check-detail')).not.toBeInTheDocument();
  });

  it('no detail → no toggle button (gap rows stay flat, never fake-disclose)', () => {
    render(
      <DDCheckRow label="RightShip score" state="inactive" evidence="not connected" detail={null} source={null} />,
    );
    expect(screen.getByText('RightShip score')).toBeInTheDocument();
    expect(screen.queryByTestId('dd-check-toggle')).not.toBeInTheDocument();
    expect(screen.queryByTestId('dd-check-detail')).not.toBeInTheDocument();
  });

  it('draft derivation: full formula steps render under «Подробнее» (DWT, formula, laden, margin)', async () => {
    const user = userEvent.setup();
    render(
      <DDCheckRow
        label="Laden draft — load port"
        state="pass"
        evidence="Laden draft ~9.2m vs berth draft limit 10.5m"
        detail="base explanation"
        source="Circular + port-master.json"
        derivation={{ dwt: 35000, cargoTons: 30000, laden: 9.2, portLimit: 10.5, pass: true }}
      />,
    );
    await user.click(screen.getByTestId('dd-check-toggle'));
    const der = screen.getByTestId('dd-draft-derivation');
    expect(der).toHaveTextContent('DWT 35,000 mt');
    expect(der).toHaveTextContent('load factor 86%'); // 30000/35000
    expect(der).toHaveTextContent('0.4991 × 35,000^0.2991');
    expect(der).toHaveTextContent('round up = 9.2 m');
    expect(der).toHaveTextContent(/margin .*1\.3 m/); // 10.5 − 9.2
  });

  it('draft derivation: null portLimit → registry-gap line, no margin', async () => {
    const user = userEvent.setup();
    render(
      <DDCheckRow
        label="Laden draft — discharge port"
        state="pass"
        evidence="e"
        detail="d"
        source={null}
        derivation={{ dwt: 35000, cargoTons: 30000, laden: 10.9, portLimit: null, pass: true }}
      />,
    );
    await user.click(screen.getByTestId('dd-check-toggle'));
    expect(screen.getByTestId('dd-draft-derivation')).toHaveTextContent('not in port directory');
  });

  it('no derivation → no steps block; plain detail still toggles', async () => {
    const user = userEvent.setup();
    render(<DDCheckRow label="X" state="pass" evidence="e" detail="plain" source={null} />);
    await user.click(screen.getByTestId('dd-check-toggle'));
    expect(screen.queryByTestId('dd-draft-derivation')).not.toBeInTheDocument();
    expect(screen.getByTestId('dd-check-detail')).toHaveTextContent('plain');
  });

  it('detail present but source null → detail shows, no «Источник» badge', async () => {
    const user = userEvent.setup();
    render(
      <DDCheckRow label="X" state="info" evidence="ev" detail="just an explanation" source={null} />,
    );
    await user.click(screen.getByTestId('dd-check-toggle'));
    expect(screen.getByTestId('dd-check-detail')).toHaveTextContent('just an explanation');
    expect(screen.queryByText(/Source:/)).not.toBeInTheDocument();
  });
});

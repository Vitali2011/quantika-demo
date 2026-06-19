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
        evidence="TCE $9,600/day — $1,400/day выше breakeven"
        detail={'TCE — дневная доходность.\nРасчёт: TCE $9,600/сут − breakeven $8,200/сут = +$1,400/сут → выше breakeven.\nWar-risk показан в breakdown отдельно.'}
        source="Расчёт TCE"
      />,
    );

    // label + evidence visible immediately
    expect(screen.getByText('TCE vs breakeven')).toBeInTheDocument();
    expect(screen.getByText(/выше breakeven/)).toBeInTheDocument();
    // detail body NOT in DOM before toggle
    expect(screen.queryByTestId('dd-check-detail')).not.toBeInTheDocument();

    // click «Подробнее» → detail + source badge appear
    await user.click(screen.getByTestId('dd-check-toggle'));
    const body = screen.getByTestId('dd-check-detail');
    expect(body).toBeInTheDocument();
    expect(body).toHaveTextContent('Расчёт: TCE $9,600/сут');
    expect(body).toHaveTextContent('Источник: Расчёт TCE');

    // toggle label flips and collapses
    await user.click(screen.getByTestId('dd-check-toggle'));
    expect(screen.queryByTestId('dd-check-detail')).not.toBeInTheDocument();
  });

  it('no detail → no toggle button (gap rows stay flat, never fake-disclose)', () => {
    render(
      <DDCheckRow label="RightShip score" state="inactive" evidence="не подключено" detail={null} source={null} />,
    );
    expect(screen.getByText('RightShip score')).toBeInTheDocument();
    expect(screen.queryByTestId('dd-check-toggle')).not.toBeInTheDocument();
    expect(screen.queryByTestId('dd-check-detail')).not.toBeInTheDocument();
  });

  it('detail present but source null → detail shows, no «Источник» badge', async () => {
    const user = userEvent.setup();
    render(
      <DDCheckRow label="X" state="info" evidence="ev" detail="just an explanation" source={null} />,
    );
    await user.click(screen.getByTestId('dd-check-toggle'));
    expect(screen.getByTestId('dd-check-detail')).toHaveTextContent('just an explanation');
    expect(screen.queryByText(/Источник:/)).not.toBeInTheDocument();
  });
});

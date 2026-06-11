/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { DraftCalcBreakdown } from '../DraftCalcBreakdown';
import type { HardFilterCheck } from '@/lib/types';

const DRAFT_PASS: HardFilterCheck = {
  pass: true,
  estimatedLadenDraftM: 11.2,
  portLimitM: 13.0,
};

const DEST_DRAFT_PASS: HardFilterCheck = {
  pass: true,
  estimatedLadenDraftM: 11.2,
  portLimitM: 12.5,
};

const DEST_DRAFT_FAIL: HardFilterCheck = {
  pass: false,
  reason: 'estimated laden draft 11.2m exceeds port max 10.5m (approximate)',
  estimatedLadenDraftM: 11.2,
  portLimitM: 10.5,
};

const DRAFT_NO_ESTIMATE: HardFilterCheck = {
  pass: true,
};

function setup(props: React.ComponentProps<typeof DraftCalcBreakdown>) {
  render(<DraftCalcBreakdown {...props} />);
  const toggle = screen.getByTestId('draft-calc-toggle');
  return { toggle };
}

describe('DraftCalcBreakdown', () => {
  it('renders collapsed by default', () => {
    const { toggle } = setup({
      loadPort: 'Odesa',
      dischargePort: 'Burgas',
      draftCheck: DRAFT_PASS,
      destDraftCheck: DEST_DRAFT_PASS,
      dwtSummer: 58000,
      weightMt: 52000,
      statedMaxDraftM: 14.0,
    });
    expect(screen.queryByTestId('draft-calc-body')).toBeNull();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('expands on click and shows content', () => {
    const { toggle } = setup({
      loadPort: 'Odesa',
      dischargePort: 'Burgas',
      draftCheck: DRAFT_PASS,
      destDraftCheck: DEST_DRAFT_PASS,
      dwtSummer: 58000,
      weightMt: 52000,
      statedMaxDraftM: 14.0,
    });
    fireEvent.click(toggle);
    expect(screen.getByTestId('draft-calc-body')).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  it('both-ports-pass: shows ✓ for both ports and "Clears both" verdict', () => {
    setup({
      loadPort: 'Odesa',
      dischargePort: 'Burgas',
      draftCheck: DRAFT_PASS,
      destDraftCheck: DEST_DRAFT_PASS,
      dwtSummer: 58000,
      weightMt: 52000,
      statedMaxDraftM: 14.0,
    });
    fireEvent.click(screen.getByTestId('draft-calc-toggle'));
    const body = screen.getByTestId('draft-calc-body');
    expect(body.textContent).toContain('Load port Odesa');
    expect(body.textContent).toContain('13.0 m');
    expect(body.textContent).toContain('clears');
    expect(body.textContent).toContain('Discharge port Burgas');
    expect(body.textContent).toContain('12.5 m');
    expect(body.textContent).toContain('Clears both ports');
  });

  it('one-fail worst-of-two: discharge fails → verdict shows fails', () => {
    setup({
      loadPort: 'Rotterdam',
      dischargePort: 'Mykolaiv',
      draftCheck: DRAFT_PASS,
      destDraftCheck: DEST_DRAFT_FAIL,
      dwtSummer: 75000,
      weightMt: 68000,
      statedMaxDraftM: 15.0,
    });
    fireEvent.click(screen.getByTestId('draft-calc-toggle'));
    const body = screen.getByTestId('draft-calc-body');
    expect(body.textContent).toContain('Load port Rotterdam');
    expect(body.textContent).toContain('clears');
    expect(body.textContent).toContain('Discharge port Mykolaiv');
    expect(body.textContent).toContain('10.5 m');
    expect(body.textContent).toContain('exceeds');
    expect(body.textContent).toContain('Fails one or more ports');
  });

  it('fallback-unknown: no estimate → static check message shown for both ports', () => {
    const destNoEst: HardFilterCheck = { pass: true };
    setup({
      loadPort: 'Hamburg',
      dischargePort: 'Santos',
      draftCheck: DRAFT_NO_ESTIMATE,
      destDraftCheck: destNoEst,
      statedMaxDraftM: 14.5,
    });
    fireEvent.click(screen.getByTestId('draft-calc-toggle'));
    const body = screen.getByTestId('draft-calc-body');
    expect(body.textContent).toContain('static check vs stated max draft');
    expect(body.textContent).toContain('14.5 m');
    expect(body.textContent).toContain('Load port Hamburg');
    expect(body.textContent).toContain('Discharge port Santos');
  });

  it('port-no-limit: portLimitM null with estimate → "limit unknown → pass"', () => {
    const noLimit: HardFilterCheck = { pass: true, estimatedLadenDraftM: 11.2 };
    setup({
      loadPort: 'Tanjung Pelepas',
      dischargePort: null,
      draftCheck: noLimit,
      destDraftCheck: { pass: true, estimatedLadenDraftM: 11.2 },
      dwtSummer: 58000,
      weightMt: 52000,
    });
    fireEvent.click(screen.getByTestId('draft-calc-toggle'));
    const body = screen.getByTestId('draft-calc-body');
    expect(body.textContent).toContain('limit unknown → pass (no data)');
  });

  it('shows formula steps when dwt + weight available', () => {
    setup({
      loadPort: 'Odesa',
      dischargePort: 'Istanbul',
      draftCheck: DRAFT_PASS,
      destDraftCheck: DEST_DRAFT_PASS,
      dwtSummer: 58000,
      weightMt: 52000,
      statedMaxDraftM: 14.0,
    });
    fireEvent.click(screen.getByTestId('draft-calc-toggle'));
    const body = screen.getByTestId('draft-calc-body');
    expect(body.textContent).toMatch(/Full-load.*0\.4991.*58.*0\.2991/);
    expect(body.textContent).toMatch(/Cargo-adjust.*52.*58.*0\.3/);
    expect(body.textContent).toContain('approximate, conservative');
  });

  it('no destDraftCheck → shows neutral "limit unknown → pass (no data)" for discharge port', () => {
    setup({
      loadPort: 'Gdańsk',
      dischargePort: 'Cape Town',
      draftCheck: DRAFT_PASS,
      statedMaxDraftM: 13.5,
    });
    fireEvent.click(screen.getByTestId('draft-calc-toggle'));
    const body = screen.getByTestId('draft-calc-body');
    expect(body.textContent).toContain('Discharge port Cape Town');
    expect(body.textContent).toContain('limit unknown → pass (no data)');
  });

  it('no destDraftCheck + load passes → verdict is neutral, NOT green "Clears both ports"', () => {
    setup({
      loadPort: 'Gdańsk',
      dischargePort: 'Liverpool',
      draftCheck: DRAFT_PASS,
      dwtSummer: 3178,
      weightMt: 2720,
      statedMaxDraftM: 5.51,
    });
    fireEvent.click(screen.getByTestId('draft-calc-toggle'));
    const body = screen.getByTestId('draft-calc-body');
    expect(body.textContent).not.toContain('Clears both ports');
    expect(body.textContent).toContain('discharge: no data');
  });

  it('stored gate without estimatedLadenDraftM, DWT+cargo available → formula renders with numbers', () => {
    setup({
      loadPort: 'Szczecin',
      dischargePort: 'Liverpool',
      draftCheck: DRAFT_NO_ESTIMATE,   // { pass: true } — no estimatedLadenDraftM stored
      dwtSummer: 3178,
      weightMt: 2720,
      statedMaxDraftM: 5.51,
    });
    fireEvent.click(screen.getByTestId('draft-calc-toggle'));
    const body = screen.getByTestId('draft-calc-body');
    // Formula must render with real DWT/cargo numbers, not fallback "unknown" message
    expect(body.textContent).not.toContain('cargo weight / DWT unknown');
    expect(body.textContent).toContain('3,178');
    expect(body.textContent).toContain('2,720');
    expect(body.textContent).toContain('approximate, conservative');
  });
});

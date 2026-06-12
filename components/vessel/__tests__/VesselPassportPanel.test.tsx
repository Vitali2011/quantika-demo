/**
 * @jest-environment jsdom
 */
// audit D — VesselPassportPanel: renders only rows with real data, hides card when empty.
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { VesselPassportPanel } from '../VesselPassportPanel';
import type { VesselPassport } from '@/lib/counterparty';

describe('VesselPassportPanel (audit D)', () => {
  it('renders full passport rows', () => {
    const passport: VesselPassport = {
      imo: '8887296',
      flag: { country: 'Malta', parisMou: 'white' },
      class: { society: 'DNV', isIacs: true },
      pi: { club: 'Gard', isIg: true },
      age: 18,
      psc: { detentions3y: 2 },
    };
    render(<VesselPassportPanel passport={passport} />);

    expect(screen.getByText('Vessel passport')).toBeInTheDocument();
    expect(screen.getByText('Malta')).toBeInTheDocument();
    expect(screen.getByText(/white/i)).toBeInTheDocument();
    expect(screen.getByText(/DNV/)).toBeInTheDocument();
    expect(screen.getByText(/IACS/)).toBeInTheDocument();
    expect(screen.getByText(/Gard/)).toBeInTheDocument();
    expect(screen.getByText(/IG Club/)).toBeInTheDocument();
    expect(screen.getByText(/18/)).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('omits rows without data — no fake defaults', () => {
    const passport: VesselPassport = {
      imo: '8887296',
      flag: { country: 'Atlantis' }, // no parisMou
    };
    render(<VesselPassportPanel passport={passport} />);

    expect(screen.getByText('Atlantis')).toBeInTheDocument();
    expect(screen.queryByText(/Paris MoU/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Class/)).not.toBeInTheDocument();
    expect(screen.queryByText(/P&I/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Age/)).not.toBeInTheDocument();
    expect(screen.queryByText(/detention/i)).not.toBeInTheDocument();
  });

  it('renders nothing when passport is entirely empty', () => {
    const { container } = render(<VesselPassportPanel passport={{}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders grey MoU chip for grey-list flag', () => {
    render(
      <VesselPassportPanel passport={{ flag: { country: 'India', parisMou: 'grey' } }} />,
    );
    expect(screen.getByText(/grey/i)).toBeInTheDocument();
  });

  it('shows non-IG club without the IG chip', () => {
    render(<VesselPassportPanel passport={{ pi: { club: 'Some Local Club', isIg: false } }} />);
    expect(screen.getByText(/Some Local Club/)).toBeInTheDocument();
    expect(screen.queryByText(/IG Club/)).not.toBeInTheDocument();
  });
});

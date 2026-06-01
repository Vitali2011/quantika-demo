/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import { EmailBodyViewer, Highlight } from '../../components/email-body-viewer';

describe('EmailBodyViewer — plus-separator sanitization', () => {
  it('strips +++ separator from rendered body', () => {
    const body = 'Section A\n+++\nSection B';
    const { container } = render(<EmailBodyViewer body={body} highlights={[]} />);
    expect(container.textContent).not.toContain('+++');
  });

  it('both highlights resolve after +++ separator is removed', () => {
    const body = 'Vessel: MV Kilo\n++++++\nCargo: iron ore';
    const highlights: Highlight[] = [
      { text: 'MV Kilo', color: 'bg-blue-200', label: 'vessel' },
      { text: 'iron ore', color: 'bg-green-200', label: 'cargo' },
    ];
    const { container } = render(
      <EmailBodyViewer body={body} highlights={highlights} />
    );
    const marks = container.querySelectorAll('mark');
    expect(marks.length).toBe(2);
    const titles = Array.from(marks).map(m => m.getAttribute('title'));
    expect(titles).toContain('vessel');
    expect(titles).toContain('cargo');
  });

  it('preserves "do not recirculate" text', () => {
    const body = 'do not recirculate\n+++\nsome info';
    const { container } = render(<EmailBodyViewer body={body} highlights={[]} />);
    expect(container.textContent).toContain('do not recirculate');
  });

  it('preserves inline C++ in body', () => {
    const body = 'Built with C++ framework\n+++\nEnd';
    const { container } = render(<EmailBodyViewer body={body} highlights={[]} />);
    expect(container.textContent).toContain('C++');
  });
});

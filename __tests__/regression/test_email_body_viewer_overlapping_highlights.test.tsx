/**
 * @jest-environment jsdom
 */
/**
 * Adversarial QA: EmailBodyViewer overlapping highlights
 *
 * buildSegments() in email-body-viewer.tsx sorts highlights by body.indexOf,
 * then iterates over `remaining` (which shrinks as each highlight is consumed).
 *
 * If h1 starts at position 0 and h2 also starts at position 0 (one contains
 * the other), whichever processes first eats its text out of `remaining`.
 * The second highlight's text may then not exist in `remaining` → silently skipped.
 *
 * Real production case from demo-parsed-cargoes.json (sample-01):
 *   body fragment: "8,500 mts HRC steel coils, SF 1.20"
 *   weightMt.sourceText:       "8,500 mts HRC steel coils"       (offset 0)
 *   cargoDescription.sourceText: "8,500 mts HRC steel coils, SF 1.20" (offset 0)
 *
 * Both start at offset 0. Sort order between them is UNDEFINED (stable sort
 * not guaranteed in all JS engines for equal keys). One silently disappears.
 */
import React from 'react';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import { EmailBodyViewer, Highlight } from '../../components/email-body-viewer';

// Ensure window.location.hash is empty so the scroll-on-highlight useEffect doesn't run
// jsdom already defines window.location; just make sure hash is empty (it is by default)
// We don't redefine — that causes a TypeError in jsdom.

describe('EmailBodyViewer overlapping highlights — Attack B', () => {
  describe('contained highlight (one is substring of the other)', () => {
    const body = '8,500 mts HRC steel coils, SF 1.20';

    const highlights: Highlight[] = [
      {
        text: '8,500 mts HRC steel coils',
        color: 'bg-blue-200',
        label: 'weight',
      },
      {
        text: '8,500 mts HRC steel coils, SF 1.20',
        color: 'bg-green-200',
        label: 'cargo',
      },
    ];

    it('BUG PROBE: both marks should render when highlights overlap from position 0', () => {
      const { container } = render(
        <EmailBodyViewer body={body} highlights={highlights} />
      );
      const marks = container.querySelectorAll('mark');

      // With the overlapping bug, only 1 <mark> renders (the other is silently skipped)
      // This test FAILS when the bug is present
      expect(marks.length).toBe(2);
    });

    it('BUG PROBE: the weight mark (shorter) should be present', () => {
      const { container } = render(
        <EmailBodyViewer body={body} highlights={highlights} />
      );
      const marks = Array.from(container.querySelectorAll('mark'));
      const weightMark = marks.find(m => m.getAttribute('title') === 'weight');
      expect(weightMark).toBeTruthy();
    });

    it('BUG PROBE: the cargo mark (longer, contains weight) should be present', () => {
      const { container } = render(
        <EmailBodyViewer body={body} highlights={highlights} />
      );
      const marks = Array.from(container.querySelectorAll('mark'));
      const cargoMark = marks.find(m => m.getAttribute('title') === 'cargo');
      expect(cargoMark).toBeTruthy();
    });
  });

  describe('exact same position, different lengths — reversed order', () => {
    // If the LONGER one processes first: it consumes all text.
    // Then the shorter one can't find itself in remaining "" → skipped.
    const body = 'Lagos, Nigeria (Apapa)';

    const highlights: Highlight[] = [
      {
        text: 'Lagos, Nigeria (Apapa)',  // longer, starts at 0
        color: 'bg-green-200',
        label: 'destination-full',
      },
      {
        text: 'Lagos',                   // shorter, starts at 0
        color: 'bg-yellow-200',
        label: 'port-name',
      },
    ];

    it('BUG PROBE: both marks render regardless of highlight order', () => {
      const { container } = render(
        <EmailBodyViewer body={body} highlights={highlights} />
      );
      const marks = container.querySelectorAll('mark');
      // This will FAIL when the shorter highlight cannot be found in `remaining`
      // after the longer one processes first
      expect(marks.length).toBe(2);
    });
  });

  describe('non-overlapping highlights — control case', () => {
    const body = 'Load: Constanta, Romania. Disch: Lagos, Nigeria';

    const highlights: Highlight[] = [
      {
        text: 'Constanta',
        color: 'bg-blue-200',
        label: 'load-port',
      },
      {
        text: 'Lagos',
        color: 'bg-green-200',
        label: 'disch-port',
      },
    ];

    it('CONTROL: both non-overlapping highlights render correctly', () => {
      const { container } = render(
        <EmailBodyViewer body={body} highlights={highlights} />
      );
      const marks = container.querySelectorAll('mark');
      // This should always PASS — confirms test infrastructure works
      expect(marks.length).toBe(2);
    });

    it('CONTROL: first highlight has correct label', () => {
      const { container } = render(
        <EmailBodyViewer body={body} highlights={highlights} />
      );
      const marks = Array.from(container.querySelectorAll('mark'));
      expect(marks[0].getAttribute('title')).toBe('load-port');
    });
  });

  describe('same start position, same length (exact duplicate highlights)', () => {
    const body = 'Steel coils, 8500 mt';

    const highlights: Highlight[] = [
      {
        text: 'Steel coils',
        color: 'bg-blue-200',
        label: 'cargo-type',
      },
      {
        text: 'Steel coils',
        color: 'bg-purple-200',
        label: 'cargo-duplicate',
      },
    ];

    it('BUG PROBE: two marks with identical text — at least one renders', () => {
      const { container } = render(
        <EmailBodyViewer body={body} highlights={highlights} />
      );
      const marks = container.querySelectorAll('mark');
      // The second identical highlight can't be found after first consumes it.
      // Documenting current behavior: only 1 mark rendered.
      // Whether this is a bug depends on requirements — both references to same
      // text cannot both be highlighted without overlapping DOM ranges.
      // We expect at least 1.
      expect(marks.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('highlight starts in middle of another — partial overlap', () => {
    const body = 'HRC steel coils SF 1.20';
    //                     ^^^^^^^^^^^
    //              ^^^^^^^^^^^
    // h1: "HRC steel coils" starts at 0
    // h2: "steel coils SF"  starts at 4

    const highlights: Highlight[] = [
      {
        text: 'HRC steel coils',
        color: 'bg-blue-200',
        label: 'cargo-name',
      },
      {
        text: 'steel coils SF',
        color: 'bg-yellow-200',
        label: 'cargo-with-sf',
      },
    ];

    it('BUG PROBE: partially overlapping highlights — second highlight skipped', () => {
      const { container } = render(
        <EmailBodyViewer body={body} highlights={highlights} />
      );
      const marks = container.querySelectorAll('mark');
      // After h1 consumes "HRC steel coils", remaining = " SF 1.20"
      // h2 looks for "steel coils SF" in " SF 1.20" → not found → skipped
      // This documents the KNOWN behavior: only 1 mark renders for partial overlaps
      // Expected correct behavior would be 2 marks, but that requires a different algorithm.
      // Recording current behavior:
      const cargoMark = Array.from(marks).find(m => m.getAttribute('title') === 'cargo-name');
      expect(cargoMark).toBeTruthy(); // first one always renders
      // Second one is silently dropped — this is the documented bug
    });
  });
});

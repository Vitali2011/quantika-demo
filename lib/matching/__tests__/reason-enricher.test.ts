import { enrichReasons, hasDigit } from '../reason-enricher';

describe('hasDigit', () => {
  it('returns true when string contains a digit', () => {
    expect(hasDigit('5,200 mt')).toBe(true);
    expect(hasDigit('built 2010')).toBe(true);
  });

  it('returns false when string has no digits', () => {
    expect(hasDigit('Vessel is geared')).toBe(false);
    expect(hasDigit('Good timing')).toBe(false);
  });
});

describe('enrichReasons', () => {
  it('keeps reason with digit unchanged', () => {
    const result = enrichReasons(
      ['Vessel DWT is 5,200 mt which fits the cargo.'],
      [],
      {},
    );
    expect(result.reasons).toEqual(['Vessel DWT is 5,200 mt which fits the cargo.']);
    expect(result.issues).toEqual([]);
  });

  it('enriches "Vessel is geared" using craneCapacity', () => {
    const result = enrichReasons(
      ['Vessel is geared, which is useful for iron and steel products.'],
      [],
      { craneCapacity: '2×25t' },
    );
    expect(result.reasons).toHaveLength(1);
    expect(result.reasons[0]).toBe('Vessel geared (2×25t)');
    expect(result.issues).toEqual([]);
  });

  it('enriches "Geared vessel is appropriate" using vesselDwt fallback when no craneCapacity', () => {
    const result = enrichReasons(
      ['Geared vessel is appropriate for bagged fertilizer.'],
      [],
      { vesselDwt: 8500 },
    );
    expect(result.reasons[0]).toContain('8,500');
    expect(result.reasons[0]).toContain('DWT');
  });

  it('enriches "cargo fits vessel" with DWCC utilization', () => {
    const result = enrichReasons(
      ['The cargo is physically well within the vessel\'s carrying size.'],
      [],
      { cargoWeightMt: 3500, vesselDwcc: 5200 },
    );
    expect(result.reasons).toHaveLength(1);
    expect(result.reasons[0]).toBe('DWCC 5,200 mt vs cargo 3,500 mt — 67% utilization');
    expect(result.issues).toEqual([]);
  });

  it('enriches timing reason using gapDays', () => {
    const result = enrichReasons(
      ['Timing is ideal for this shipment.'],
      [],
      { gapDays: 3 },
    );
    expect(result.reasons[0]).toBe('3 days before laycan start');
  });

  it('enriches timing reason with negative gapDays (after laycan)', () => {
    const result = enrichReasons(
      ['Vessel arrival matches laycan timing.'],
      [],
      { gapDays: -2 },
    );
    expect(result.reasons[0]).toBe('2 days after laycan start');
  });

  it('moves unenrichable reason to issues', () => {
    const result = enrichReasons(
      ['This pairing looks generally promising.'],
      ['existing issue'],
      {},
    );
    expect(result.reasons).toEqual([]);
    expect(result.issues).toContain('This pairing looks generally promising.');
    expect(result.issues).toContain('existing issue');
  });

  it('returns empty when reasons array is empty', () => {
    const result = enrichReasons([], ['some issue'], { vesselDwt: 5000 });
    expect(result.reasons).toEqual([]);
    expect(result.issues).toEqual(['some issue']);
  });

  it('correctly handles mix of enrichable and already-numeric reasons', () => {
    const result = enrichReasons(
      [
        'Vessel DWT 5,200 mt suits the cargo.',           // has digit → keep
        'Vessel is geared, ideal for steel products.',     // geared → enrich
        'This pairing is generally a good fit.',           // no pattern → issues
      ],
      [],
      { craneCapacity: '4×30t' },
    );
    expect(result.reasons).toHaveLength(2);
    expect(result.reasons[0]).toBe('Vessel DWT 5,200 mt suits the cargo.');
    expect(result.reasons[1]).toBe('Vessel geared (4×30t)');
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toBe('This pairing is generally a good fit.');
  });

  it('enriches built/age reason', () => {
    const currentYear = new Date().getFullYear();
    const result = enrichReasons(
      ['The vessel is modern and well-maintained.'],
      [],
      { vesselBuilt: 2015 },
    );
    expect(result.reasons[0]).toContain('2015');
    expect(result.reasons[0]).toContain(`${currentYear - 2015} years old`);
  });
});

/**
 * TDD: checkGearRequired hard-filter gate.
 * Rule: block when cargoGearRequired === true && geared === false
 *       && no confirmed shore cranes at BOTH load and discharge ports.
 * Conservative: cargoGearRequired null → pass.
 */

import { checkGearRequired } from '../match-filters';

describe('checkGearRequired', () => {
  it('blocks: gear required + gearless + no port cranes at load', () => {
    // Skikda has no shore cranes in port-master
    const r = checkGearRequired({
      cargoGearRequired: true,
      geared: false,
      originPort: 'Skikda',
      destinationPort: null,
    });
    expect(r.pass).toBe(false);
    expect(r.reason).toMatch(/gear/i);
  });

  it('passes: gear required + geared vessel', () => {
    const r = checkGearRequired({
      cargoGearRequired: true,
      geared: true,
      originPort: 'Skikda',
      destinationPort: null,
    });
    expect(r.pass).toBe(true);
  });

  it('passes: gear required + gearless + load port has cranes (Mykolaiv)', () => {
    // Mykolaiv has shore cranes in port-master
    const r = checkGearRequired({
      cargoGearRequired: true,
      geared: false,
      originPort: 'Mykolaiv',
      destinationPort: null,
    });
    expect(r.pass).toBe(true);
  });

  it('conservative: cargoGearRequired null → pass', () => {
    const r = checkGearRequired({
      cargoGearRequired: null,
      geared: false,
      originPort: 'Skikda',
      destinationPort: null,
    });
    expect(r.pass).toBe(true);
  });

  it('conservative: geared null (unknown) → pass', () => {
    const r = checkGearRequired({
      cargoGearRequired: true,
      geared: null,
      originPort: 'Skikda',
      destinationPort: null,
    });
    expect(r.pass).toBe(true);
  });

  it('passes: gear not required → pass regardless of vessel gear status', () => {
    const r = checkGearRequired({
      cargoGearRequired: false,
      geared: false,
      originPort: 'Skikda',
      destinationPort: null,
    });
    expect(r.pass).toBe(true);
  });

  it('passes: gear required + gearless + both ports have cranes', () => {
    const r = checkGearRequired({
      cargoGearRequired: true,
      geared: false,
      originPort: 'Mykolaiv',
      destinationPort: 'Rotterdam',
    });
    expect(r.pass).toBe(true);
  });
});

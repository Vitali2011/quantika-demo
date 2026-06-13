import { attachPortLimits } from '@/lib/matching/attach-port-limits';
import { getPortMaster } from '@/lib/sailing/port-master';

function row(worksheet_json: string | null) {
  return { id: 1, worksheet_json };
}

function ws(loadPort: unknown, dischargePort: unknown): string {
  return JSON.stringify({ cargo: { loadPort, dischargePort } });
}

describe('attachPortLimits', () => {
  it('resolves both limits from worksheet ports, identical to getPortMaster', () => {
    const [r] = attachPortLimits([row(ws('Rotterdam', 'Constanta'))]);
    expect(r.load_port_limit_m).toBe(getPortMaster('Rotterdam')?.maxDraftM ?? null);
    expect(r.discharge_port_limit_m).toBe(getPortMaster('Constanta')?.maxDraftM ?? null);
    // sanity: these are real ports, so the limits are concrete numbers
    expect(typeof r.load_port_limit_m).toBe('number');
    expect(typeof r.discharge_port_limit_m).toBe('number');
  });

  it('preserves the original row fields (spread)', () => {
    const [r] = attachPortLimits([row(ws('Rotterdam', 'Rotterdam'))]);
    expect(r.id).toBe(1);
  });

  it('unknown port → null (display-only fallback, not an error)', () => {
    const [r] = attachPortLimits([row(ws('Atlantis', 'Rotterdam'))]);
    expect(r.load_port_limit_m).toBeNull();
    expect(r.discharge_port_limit_m).toBe(getPortMaster('Rotterdam')?.maxDraftM ?? null);
  });

  it('missing / null worksheet → both null', () => {
    expect(attachPortLimits([row(null)])[0]).toMatchObject({
      load_port_limit_m: null,
      discharge_port_limit_m: null,
    });
  });

  it('malformed worksheet JSON → both null, does not throw', () => {
    const [r] = attachPortLimits([row('{not json')]);
    expect(r.load_port_limit_m).toBeNull();
    expect(r.discharge_port_limit_m).toBeNull();
  });

  it('worksheet without cargo.loadPort → null for that side only', () => {
    const [r] = attachPortLimits([row(ws(null, 'Rotterdam'))]);
    expect(r.load_port_limit_m).toBeNull();
    expect(r.discharge_port_limit_m).toBe(getPortMaster('Rotterdam')?.maxDraftM ?? null);
  });
});

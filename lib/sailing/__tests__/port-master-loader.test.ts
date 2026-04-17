import type { PortMaster } from '../port-master';
import { loadPortMasterFromJson, clearPortMasterCache } from '../port-master-loader';

const FIXTURE: PortMaster[] = [
  {
    unlocode: 'NLRTM', name: 'Rotterdam', country: 'NL', lat: 51.95, lon: 4.14,
    maxDraftM: 24, hasShoreCranes: true, berthType: 'deep-sea',
  },
  {
    unlocode: 'TRIST', name: 'Istanbul', country: 'TR', lat: 41.02, lon: 28.97,
    maxDraftM: 13, hasShoreCranes: true, berthType: 'deep-sea',
  },
];

describe('loadPortMasterFromJson', () => {
  beforeEach(() => clearPortMasterCache());

  it('returns a Map keyed by lowercased canonical name', () => {
    const map = loadPortMasterFromJson(FIXTURE);
    expect(map.get('rotterdam')?.unlocode).toBe('NLRTM');
    expect(map.get('istanbul')?.country).toBe('TR');
    expect(map.size).toBe(2);
  });

  it('caches and returns same Map instance on repeat call with same source', () => {
    const a = loadPortMasterFromJson(FIXTURE);
    const b = loadPortMasterFromJson(FIXTURE);
    expect(a).toBe(b);
  });

  it('clearPortMasterCache forces reload', () => {
    const a = loadPortMasterFromJson(FIXTURE);
    clearPortMasterCache();
    const b = loadPortMasterFromJson(FIXTURE);
    expect(a).not.toBe(b);
    expect(b.get('rotterdam')?.unlocode).toBe('NLRTM');
  });

  it('rejects duplicate UNLOCODEs with a clear error', () => {
    const dup = [...FIXTURE, { ...FIXTURE[0], name: 'RotterdamDup' }];
    expect(() => loadPortMasterFromJson(dup)).toThrow(/duplicate.+NLRTM/i);
  });

  it('rejects malformed entries missing required fields', () => {
    const bad = [{ name: 'Oops' } as unknown as PortMaster];
    expect(() => loadPortMasterFromJson(bad)).toThrow(/missing.+(unlocode|coord)/i);
  });

  it('provides a by-UNLOCODE secondary index', () => {
    const map = loadPortMasterFromJson(FIXTURE);
    expect(map.byUnlocode('NLRTM')?.name).toBe('Rotterdam');
    expect(map.byUnlocode('XXXXX')).toBeNull();
  });
});

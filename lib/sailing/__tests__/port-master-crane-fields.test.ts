import { loadPortMasterFromJson, clearPortMasterCache } from '@/lib/sailing/port-master-loader';
import { getPortMaster } from '@/lib/sailing/port-master';
import type { PortMaster } from '@/lib/sailing/port-master';

// Stage 3 behavioral spot-checks: curated ports in real port-master.json
describe('Stage 3 — curated terminalOperator in production port-master', () => {
  it('Singapore has PSA International as terminalOperator', () => {
    const entry = getPortMaster('Singapore');
    expect(entry).toBeTruthy();
    expect(entry!.terminalOperator).toBe('PSA International');
    expect(entry!.craneDataAsOf).toBe('2025-Q4');
  });

  it('Rotterdam has terminalOperator set', () => {
    const entry = getPortMaster('Rotterdam');
    expect(entry).toBeTruthy();
    expect(entry!.terminalOperator).toBeTruthy();
    expect(entry!.craneDataAsOf).toBe('2025-Q4');
  });

  it('Constanta has DP World Constanta as terminalOperator', () => {
    const entry = getPortMaster('Constanta');
    expect(entry).toBeTruthy();
    expect(entry!.terminalOperator).toBe('DP World Constanta');
  });
});

const BASE_ENTRY: PortMaster = {
  unlocode: 'ROCND',
  name: 'Constanta',
  country: 'RO',
  lat: 44.183,
  lon: 28.65,
  maxDraftM: 14.5,
  hasShoreCranes: true,
  berthType: 'deep-sea',
};

const ENRICHED_ENTRY: PortMaster = {
  ...BASE_ENTRY,
  craneSWL: 80,
  craneType: 'gantry',
  terminalOperator: 'CSCT Constanta',
  craneDataAsOf: '2025-Q4',
};

const PLAIN_ENTRY: PortMaster = {
  unlocode: 'DEHAM',
  name: 'Hamburg',
  country: 'DE',
  lat: 53.517,
  lon: 9.933,
  maxDraftM: 15,
  hasShoreCranes: true,
  berthType: 'river',
};

describe('PortMaster crane fields — schema + loader passthrough', () => {
  it('loads enriched entry with craneSWL/craneType/terminalOperator/craneDataAsOf intact', () => {
    const index = loadPortMasterFromJson([ENRICHED_ENTRY, PLAIN_ENTRY]);
    const entry = index.get('constanta');
    expect(entry).toBeTruthy();
    expect(entry!.craneSWL).toBe(80);
    expect(entry!.craneType).toBe('gantry');
    expect(entry!.terminalOperator).toBe('CSCT Constanta');
    expect(entry!.craneDataAsOf).toBe('2025-Q4');
  });

  it('entry without crane fields still loads (back-compat)', () => {
    const index = loadPortMasterFromJson([ENRICHED_ENTRY, PLAIN_ENTRY]);
    const entry = index.get('hamburg');
    expect(entry).toBeTruthy();
    expect(entry!.craneSWL).toBeUndefined();
    expect(entry!.terminalOperator).toBeUndefined();
  });

  it('clearPortMasterCache + reload preserves enriched crane fields', () => {
    clearPortMasterCache();
    const index = loadPortMasterFromJson([ENRICHED_ENTRY, PLAIN_ENTRY]);
    const entry = index.get('constanta');
    expect(entry!.craneSWL).toBe(80);
    expect(entry!.terminalOperator).toBe('CSCT Constanta');
    // re-load with same reference — cache hit
    const index2 = loadPortMasterFromJson([ENRICHED_ENTRY, PLAIN_ENTRY]);
    expect(index2.get('constanta')!.craneSWL).toBe(80);
  });

  it('craneType accepts all union members', () => {
    const types: PortMaster['craneType'][] = ['mobile', 'gantry', 'floating', 'STS'];
    for (const t of types) {
      const entry: PortMaster = { ...BASE_ENTRY, craneType: t };
      const index = loadPortMasterFromJson([entry]);
      expect(index.get('constanta')!.craneType).toBe(t);
    }
  });
});

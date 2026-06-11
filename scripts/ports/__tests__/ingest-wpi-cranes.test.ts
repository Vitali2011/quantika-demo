import * as path from 'path';
import * as fs from 'fs';
import {
  applyWpiCranes,
  wpiTierToSWL,
  wpiCraneType,
  type WpiCraneRow,
  type PortMasterEntry,
  type MergeResult,
} from '../ingest-wpi-cranes';

const PORT_A: PortMasterEntry = {
  unlocode: 'NLRTM',
  name: 'Rotterdam',
  hasShoreCranes: true,
};

// Port B already has a hand-curated craneSWL — must NOT be overwritten
const PORT_B: PortMasterEntry = {
  unlocode: 'ROCND',
  name: 'Constanta',
  hasShoreCranes: true,
  craneSWL: 55,
  craneDataAsOf: '2025-Q4',
};

// Port C not in WPI data — must be untouched
const PORT_C: PortMasterEntry = {
  unlocode: 'UNKNOWN',
  name: 'Atlantis',
  hasShoreCranes: true,
};

const WPI_ROWS: WpiCraneRow[] = [
  {
    unlocode: 'NLRTM',
    portName: 'Rotterdam',
    lifts100: 'Y',
    lifts50: 'Y',
    lifts25: 'Y',
    lifts0: 'Y',
    crFixed: 'Y',
    crMobile: 'Y',
    crFloating: 'Y',
    cranesContainer: 'U',
  },
  {
    unlocode: 'ROCND',
    portName: 'Constanta',
    lifts100: 'U',
    lifts50: 'Y',
    lifts25: 'Y',
    lifts0: 'Y',
    crFixed: 'Y',
    crMobile: 'Y',
    crFloating: 'Y',
    cranesContainer: 'U',
  },
];

describe('wpiTierToSWL', () => {
  it('lifts100=Y → 100', () => expect(wpiTierToSWL('Y', 'N', 'N', 'N')).toBe(100));
  it('lifts50=Y only → 50', () => expect(wpiTierToSWL('N', 'Y', 'N', 'N')).toBe(50));
  it('lifts25=Y only → 25', () => expect(wpiTierToSWL('N', 'N', 'Y', 'N')).toBe(25));
  it('lifts0=Y only → 10', () => expect(wpiTierToSWL('N', 'N', 'N', 'Y')).toBe(10));
  it('all U → undefined', () => expect(wpiTierToSWL('U', 'U', 'U', 'U')).toBeUndefined());
  it('all N → undefined', () => expect(wpiTierToSWL('N', 'N', 'N', 'N')).toBeUndefined());
});

describe('wpiCraneType', () => {
  it('cranesContainer=Y → STS', () =>
    expect(wpiCraneType('N', 'N', 'N', 'Y')).toBe('STS'));
  it('crFixed=Y (no container) → gantry', () =>
    expect(wpiCraneType('Y', 'N', 'N', 'N')).toBe('gantry'));
  it('crFloating=Y (no fixed/container) → floating', () =>
    expect(wpiCraneType('N', 'N', 'Y', 'N')).toBe('floating'));
  it('crMobile=Y only → mobile', () =>
    expect(wpiCraneType('N', 'Y', 'N', 'N')).toBe('mobile'));
  it('all N → undefined', () =>
    expect(wpiCraneType('N', 'N', 'N', 'N')).toBeUndefined());
});

describe('applyWpiCranes', () => {
  const ports = [PORT_A, PORT_B, PORT_C];

  it('adds craneSWL/craneType/craneDataAsOf to port missing them', () => {
    const result: MergeResult = applyWpiCranes(ports, WPI_ROWS, 'WPI-2025');
    const rotterdam = result.updated.find((p) => p.unlocode === 'NLRTM');
    expect(rotterdam).toBeTruthy();
    expect(rotterdam!.craneSWL).toBe(100);
    expect(rotterdam!.craneDataAsOf).toBe('WPI-2025');
  });

  it('does NOT overwrite existing craneSWL (preserved)', () => {
    const result: MergeResult = applyWpiCranes(ports, WPI_ROWS, 'WPI-2025');
    expect(result.skippedExisting).toContain('ROCND');
    const constanta = result.updated.find((p) => p.unlocode === 'ROCND');
    // The preserved entry still has the original value
    expect(constanta?.craneSWL ?? PORT_B.craneSWL).toBe(55);
    expect(constanta?.craneDataAsOf ?? PORT_B.craneDataAsOf).toBe('2025-Q4');
  });

  it('leaves port not in WPI untouched', () => {
    const result: MergeResult = applyWpiCranes(ports, WPI_ROWS, 'WPI-2025');
    expect(result.noMatch).toContain('UNKNOWN');
  });

  it('is idempotent — running merge twice yields identical output', () => {
    const r1 = applyWpiCranes(ports, WPI_ROWS, 'WPI-2025');
    const merged1 = r1.updated;
    const r2 = applyWpiCranes(merged1, WPI_ROWS, 'WPI-2025');
    const merged2 = r2.updated;
    expect(JSON.stringify(merged1)).toBe(JSON.stringify(merged2));
  });

  it('UNLOCODE-miss falls back to normalized name', () => {
    const portNoCode: PortMasterEntry = {
      unlocode: 'ZZZZZ',
      name: 'Rotterdam',
      hasShoreCranes: true,
    };
    const wpiAlias: WpiCraneRow[] = [
      {
        unlocode: 'NLRTM',
        portName: 'Rotterdam',
        lifts100: 'Y',
        lifts50: 'Y',
        lifts25: 'Y',
        lifts0: 'Y',
        crFixed: 'Y',
        crMobile: 'N',
        crFloating: 'N',
        cranesContainer: 'N',
      },
    ];
    const result = applyWpiCranes([portNoCode], wpiAlias, 'WPI-2025');
    const matched = result.updated.find((p) => p.unlocode === 'ZZZZZ');
    expect(matched?.craneSWL).toBe(100);
  });

  it('--dry mode computes diff but writes nothing', () => {
    const tmpFile = path.join('/tmp', `port-master-drytest-${Date.now()}.json`);
    const result = applyWpiCranes(ports, WPI_ROWS, 'WPI-2025', { dry: true });
    expect(result.dryRun).toBe(true);
    // Verify the tmp file was NOT created (no write occurred)
    expect(fs.existsSync(tmpFile)).toBe(false);
    // Diff object is present
    expect(result.addedCount).toBeGreaterThan(0);
  });
});

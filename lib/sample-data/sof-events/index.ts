import fs from 'fs';
import path from 'path';

export type SofEventType =
  | 'ARRIVAL'
  | 'NOR_TENDERED'
  | 'NOR_ACCEPTED'
  | 'NOR_DISPUTED'
  | 'NOR_RETENDERED'
  | 'BERTHED'
  | 'COMMENCE'
  | 'SUSPEND'
  | 'RESUME'
  | 'COMPLETE'
  | 'UNBERTHED'
  | 'DEPART';

export type SofSuspendReason =
  | 'weather'
  | 'holiday'
  | 'weekend'
  | 'breakdown'
  | 'shifting'
  | 'psc_inspection'
  | 'berth_congestion'
  | 'other';

export interface SofEvent {
  timestamp: string;
  type: SofEventType;
  reason?: SofSuspendReason;
  description: string;
}

export interface SofExpected {
  vesselName: string;
  port: string;
  operation: 'loading' | 'discharging';
  laytimeTerms: string;
  allowedLaytimeHours: number;
  events: SofEvent[];
  laytimeUsedHours: number;
  demurrageHours: number;
  despatchHours: number;
  notes: string;
}

export interface SofFixture {
  id: string;
  rawText: string;
  expected: SofExpected;
}

const SOF_IDS = ['sof-01', 'sof-02', 'sof-03'] as const;

export function loadSofFixtures(): SofFixture[] {
  return SOF_IDS.map((id) => ({
    id,
    rawText: fs.readFileSync(path.join(__dirname, `${id}.txt`), 'utf-8'),
    expected: JSON.parse(
      fs.readFileSync(path.join(__dirname, `${id}.expected.json`), 'utf-8'),
    ) as SofExpected,
  }));
}

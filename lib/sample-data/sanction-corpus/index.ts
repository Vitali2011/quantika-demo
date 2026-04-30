import fs from 'fs';
import path from 'path';

export type SanctionEntityType = 'vessel' | 'company' | 'ubo' | 'port';
export type SanctionConfidence = 'high' | 'medium' | 'low';
export type SanctionAction = 'block' | 'warn' | 'review' | 'clear';

export interface SanctionFlaggedEntity {
  name: string;
  type: SanctionEntityType;
  imo?: string;
  matchReason: string;
  confidence: SanctionConfidence;
}

export interface SanctionFalsePositive {
  name: string;
  type: string;
  imo?: string;
  reason: string;
}

export interface SanctionExpected {
  shouldFlag: boolean;
  flaggedEntities: SanctionFlaggedEntity[];
  falsePositives: SanctionFalsePositive[];
  expectedAction: SanctionAction;
  notes: string;
}

export interface SanctionEmail {
  id: string;
  threadId: string;
  from: string;
  fromName: string;
  fromEmail: string;
  to: string;
  subject: string;
  date: string;
  body: string;
  snippet: string;
  labelIds: string[];
}

export interface SanctionFixture {
  id: string;
  email: SanctionEmail;
  expected: SanctionExpected;
}

const SANCTION_IDS = [
  'sanction-01',
  'sanction-02',
  'sanction-03',
] as const;

export function loadSanctionFixtures(): SanctionFixture[] {
  return SANCTION_IDS.map((id) => ({
    id,
    email: JSON.parse(
      fs.readFileSync(path.join(__dirname, `${id}.eml.json`), 'utf-8'),
    ) as SanctionEmail,
    expected: JSON.parse(
      fs.readFileSync(path.join(__dirname, `${id}.expected.json`), 'utf-8'),
    ) as SanctionExpected,
  }));
}

export interface VesselData {
  flagChanges12m: number;
  classSocietyChanges24m: number;
  ownerJurisdiction: string;
  flag: string;
  piClub: string | null;
  isPiIgClub: boolean;
  aisBlackoutDays: number;
  vesselAge: number;
  classSociety: string;
  isIacsClass: boolean;
  namesLast24m: number;
}

export interface ShadowFleetAssessment {
  riskLevel: 'none' | 'low' | 'medium' | 'high';
  flags: string[];
}

const HIGH_RISK_OWNER_JURISDICTIONS = ['Marshall Islands'];
const HIGH_RISK_FLAGS = ['Comoros', 'São Tomé and Príncipe', 'Cook Islands'];

export function assessShadowFleetRisk(vessel: VesselData): ShadowFleetAssessment {
  const flags: string[] = [];

  if (vessel.flagChanges12m >= 3) {
    flags.push('FLAG_CHANGES_EXCESSIVE');
  }

  if (vessel.classSocietyChanges24m >= 2) {
    flags.push('CLASS_CHANGES_EXCESSIVE');
  }

  if (
    HIGH_RISK_OWNER_JURISDICTIONS.some(j => vessel.ownerJurisdiction.toLowerCase() === j.toLowerCase()) &&
    HIGH_RISK_FLAGS.some(f => vessel.flag.toLowerCase() === f.toLowerCase())
  ) {
    flags.push('HIGH_RISK_OWNERSHIP_COMBO');
  }

  if (!vessel.isPiIgClub) {
    flags.push('NON_IG_PI_COVER');
  }

  if (vessel.aisBlackoutDays > 30) {
    flags.push('AIS_DARK_PERIOD');
  }

  if (vessel.vesselAge > 20 && !vessel.isIacsClass) {
    flags.push('OLD_NON_IACS');
  }

  if (vessel.namesLast24m >= 2) {
    flags.push('RECENT_RENAMING');
  }

  let riskLevel: ShadowFleetAssessment['riskLevel'];
  if (flags.length === 0) {
    riskLevel = 'none';
  } else if (flags.length >= 3) {
    riskLevel = 'high';
  } else {
    riskLevel = 'medium';
  }

  return { riskLevel, flags };
}

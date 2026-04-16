// ── Confidence ──

export type ConfidenceLevel = 'confirmed' | 'interpreted' | 'uncertain';

export interface ConfidenceField<T> {
  value: T;
  confidence: ConfidenceLevel;
  sourceText?: string;
}

// Helper to extract value from ConfidenceField
export function cfValue<T>(field: ConfidenceField<T> | null | undefined): T | null {
  return field?.value ?? null;
}

// Union type for values that can be rendered as strings (plain values or ConfidenceField objects)
export type Renderable = ConfidenceField<string | number | boolean> | string | number | boolean | null | undefined;

// ── Email Lifecycle ──

export type EmailCategory = 'CARGO_INQUIRY' | 'VESSEL_POSITION' | 'FIXTURE_RECAP' | 'CLIENT_REPLY' | 'DOCUMENT' | 'OTHER';
export type EmailStatus = 'NEEDS_ACTION' | 'PENDING' | 'RESPONDED' | 'INFO_ONLY';
export type Urgency = 'high' | 'medium' | 'low';
export type CargoType = 'FCL' | 'LCL' | 'BREAK_BULK' | 'BULK' | 'PROJECT' | 'AIR' | 'RORO' | 'OTHER';
export type NegotiationStatus = 'AGREED' | 'PENDING' | 'DISAGREED';
export type MatchLevel = 'good' | 'possible' | 'weak';

export interface Email {
  id: string;
  threadId: string;
  from: string;
  fromName: string | null;
  fromEmail: string | null;
  to: string;
  subject: string;
  date: string;
  body: string;
  snippet: string;
  labelIds: string[];
}

export interface Classification {
  emailId: string;
  category: EmailCategory;
  isUnanswered: boolean;
  urgency: Urgency;
  daysWithoutReply: number | null;
  confidence: number;
  originalSender: string | null;
  originalSenderCompany: string | null;
}

export interface ProcessedEmail {
  emailId: string;
  type: EmailCategory;
  status: EmailStatus;
  isUnanswered: boolean;
  urgency: Urgency;
  daysWithoutReply: number | null;
  confidence: number;
  originalSender: string;
  originalSenderCompany: string | null;
  freshness: 'active' | 'stale';
  expiryDate: string | null;
  expirySource: string | null;
}

// ── Parsed Cargo ──

export interface ParsedCargo {
  emailId: string;
  itemIndex: number;
  originPort: ConfidenceField<string> | null;
  originCountry: string | null;
  destinationPort: ConfidenceField<string> | null;
  destinationCountry: string | null;
  cargoDescription: ConfidenceField<string> | null;
  weightMt: ConfidenceField<number> | null;
  volumeCbm: number | null;
  dimensions: string | null;
  cargoType: CargoType;
  containerType: string | null;
  quantity: number | null;
  incoterms: string | null;
  preferredDates: ConfidenceField<string> | null;
  laycan: string | null;
  loadingRate: string | null;
  dischargeRate: string | null;
  commissionPercent: number | null;
  commissionTerms: string | null;
  specialRequirements: string | null;
  stowageFactor: string | null;
  missingInfo: string[];
}

// ── Parsed Vessel ──

export interface ParsedVessel {
  emailId: string;
  itemIndex: number;
  vesselName: ConfidenceField<string> | null;
  imo: string | null;
  flag: string | null;
  built: number | null;
  classSociety: string | null;
  pandi: string | null;
  dwtSummer: ConfidenceField<number> | null;
  dwcc: ConfidenceField<number> | null;
  draftMax: ConfidenceField<number> | null;
  loa: number | null;
  beam: number | null;
  grt: number | null;
  nrt: number | null;
  holdsCount: number | null;
  hatchesCount: number | null;
  grainCapacity: number | null;
  grainCapacityUnit: 'cbm' | 'cbft' | null;
  baleCapacity: number | null;
  holdDimensions: string | null;
  hatchDimensions: string | null;
  tankTopStrength: string | null;
  geared: boolean | null;
  craneCapacity: string | null;
  hatchType: string | null;
  vesselType: string | null;
  openPosition: ConfidenceField<string> | null;
  openDate: ConfidenceField<string> | null;
  direction: string | null;
  restrictions: string[];
  lastCargoes: string | null;
  speedLaden: string | null;
  speedBallast: string | null;
  consumption: string | null;
  deckCapacity: string | null;
  specialFeatures: string[];
}

// ── Parsed Fixture Recap ──

export interface ParsedFixtureRecap {
  emailId: string;
  vesselName: ConfidenceField<string> | null;
  // Parties
  owners: ConfidenceField<string> | null;
  charterers: ConfidenceField<string> | null;
  account: ConfidenceField<string> | null;
  broker: string | null;
  // Route
  loadPort: ConfidenceField<string> | null;
  dischPort: ConfidenceField<string> | null;
  // Cargo
  cargoDescription: ConfidenceField<string> | null;
  cargoQuantityMin: number | null;
  cargoQuantityMax: number | null;
  cargoPackaging: string | null;
  // Dates
  laycan: ConfidenceField<string> | null;
  transitTime: string | null;
  // Rates
  freightRate: ConfidenceField<string> | null;
  freightBasis: string | null;
  freightPayment: string | null;
  // Laytime — SPLIT
  loadingRate: ConfidenceField<string> | null;
  loadingTerms: ConfidenceField<string> | null;
  loadingWorkingHours: string | null;
  dischargingRate: ConfidenceField<string> | null;
  dischargingTerms: ConfidenceField<string> | null;
  dischargingWorkingHours: string | null;
  // Demurrage
  demurrageRate: ConfidenceField<string> | null;
  demurragePayment: string | null;
  // Agents
  loadPortAgent: string | null;
  dischPortAgent: string | null;
  // Vessel details
  vesselDwt: number | null;
  vesselDraft: number | null;
  vesselGeared: boolean | null;
  // Legal
  cpForm: string | null;
  arbitration: string | null;
  law: string | null;
  // Commercial — Commission
  commission: string | null;
  commissionPercent: number | null;
  commissionBase: string | null;
  commissionAmount: number | null;
  commissionCurrency: string | null;
  // Subs
  subs: string[];
  confidentiality: boolean;
  // Raw
  additionalTerms: string[];
  unknownTerms: { term: string; note: string }[];
}

// ── Commission ──

export interface CommissionResult {
  recapEmailId: string;
  vesselName: string;
  route: string;
  commissionPercent: number;
  freightAmount: number;
  freightCurrency: string;
  commissionAmount: number;
  commissionCurrency: string;
  splitDetails?: { recipient: string; percent: number; amount: number }[];
}

export interface CommissionSummary {
  totalByCurrency: { currency: string; amount: number }[];
  details: CommissionResult[];
}

// ── Match ──

export interface Match {
  cargoEmailId: string;
  cargoItemIndex: number;
  vesselEmailId: string;
  vesselItemIndex: number;
  score: number;
  matchLevel: MatchLevel;
  matchReasons: string[];
  issues: string[];
}

// ── Negotiation Recap ──

export interface RecapHistoryEntry {
  date: string;
  value: string;
  by: string;
}

export interface RecapPoint {
  topic: string;
  status: NegotiationStatus;
  currentValue: string;
  proposedBy: string;
  sourceEmailNumber: number;
  sourceEmailDate: string;
  sourceQuote: string;
  history: RecapHistoryEntry[];
}

export interface Recap {
  threadId: string;
  subject: string;
  participants: string[];
  emailCount: number;
  dateRange: string;
  points: RecapPoint[];
  summary: string;
}

// ── Counterparty ──

export interface Counterparty {
  name: string;
  emailDomain: string;
  emailCount: number;
  emailTypes: { type: EmailCategory; count: number }[];
  emails: string[];
}

// ── Session ──

export interface SessionData {
  id: string;
  accessToken: string;
  createdAt: Date;
  emails: Email[];
  classifications: Classification[];
  processedEmails: ProcessedEmail[];
  parsedCargos: ParsedCargo[];
  parsedVessels: ParsedVessel[];
  parsedFixtureRecaps: ParsedFixtureRecap[];
  matches: Match[];
  recaps: Recap[];
  commissionSummary: CommissionSummary | null;
  counterparties: Counterparty[];
  isSampleData?: boolean;
}

// ── TZ-008: Subs Tracking ──

export interface SubjectItem {
  text: string;
  status: "pending" | "lifted" | "expired" | "failed";
  party?: string;
  deadline?: {
    hours: number;
    workingHours: boolean;
    calculatedExpiry?: string;
  };
}

// ── TZ-014: Rate Intelligence ──

export interface FreightRateRecord {
  route: string;
  loadRegion: string;
  dischargeRegion: string;
  rateValue: number;
  rateBasis: "LUMPSUM" | "PER_MT" | "PER_DAY";
  currency: string;
  vesselClass?: string;
  date: string;
  source: "parsed_recap" | "manual";
}

export interface RateIntelligence {
  currentRate?: number;
  historicalRecords: FreightRateRecord[];
  trend: "rising" | "falling" | "stable" | "insufficient_data";
  suggestion: string;
}

// ── TZ-015: Voyage Calculator ──

export interface VoyageEstimation {
  grossFreight: number;
  commission: number;
  netFreight: number;
  totalDays: number;
  seaDays: number;
  portDays: number;
  canalDays: number;
  bunkerCost: number;
  portCosts: number;
  canalTolls: number;
  euEts?: number;
  tce: number;
  verdict: "profitable" | "marginal" | "loss";
  currency: string;
}

// ── TZ-016: Multi-Currency ──

export interface CurrencyConversion {
  originalAmount: number;
  originalCurrency: string;
  targetAmount: number;
  targetCurrency: string;
  exchangeRate: number;
  rateDate: string;
  source: "ecb" | "exchangerate_api" | "manual";
}

// ── TZ-010: FCL/LCL ──

export interface ContainerSpec {
  type: string;
  quantity: number;
  weight?: number;
  cbm?: number;
  payload?: number;
}

// ── TZ-011: Time Charter ──

export interface ParsedTimeCharterRecap {
  vessel: string;
  owners: string;
  charterers: string;
  deliveryPort: string;
  redeliveryPort: string;
  duration: { min: number; max: number; unit: string };
  hireRate: { value: number; currency: string; unit: string };
  cargoExclusions?: string[];
  commission: string;
}

// ── Range ──

export interface Range<T> {
  min: T;
  max: T;
  unit?: string;
}

export function isRange<T>(v: unknown): v is Range<T> {
  return typeof v === 'object' && v !== null && 'min' in v && 'max' in v;
}

// ── Confidence ──

/**
 * 4-color trust UX. `uncertain` blocks Send Quote action.
 * Used by the confidence engine (spec-02), match detail UI (spec-06), audit trail (spec-03).
 */
export type ConfidenceLevel = 'verified' | 'inferred' | 'uncertain' | 'missing';

/** @internal Parse-level confidence produced by the LLM parsing pipeline. */
type ParseConfidence = 'confirmed' | 'interpreted' | 'uncertain';

export interface ConfidenceField<T> {
  value: T;
  confidence: ParseConfidence;
  sourceText?: string;
}

// ── Audit Trail ──

/** Single event in the audit trail. */
export interface AuditEntry {
  id: string;                          // UUID
  timestamp: string;                   // ISO 8601
  sessionId: string;                   // matches session
  inquiryId?: string;                  // optional, ties to a parsed cargo inquiry
  actor: 'ai' | 'user' | 'system';
  action: 'parsed' | 'confirmed' | 'overridden' | 'reverted' | 'sent';
  field?: string;                      // dot-path: "cargo.weight_mt"
  beforeValue?: unknown;
  afterValue?: unknown;
  reason?: string;                     // user-provided rationale on override
}

// ── Economics Engine ──

export interface EconomicsInput {
  route: {
    fromPort: string;
    toPort: string;
    viaCanal?: string;
    intermediatePorts?: string[];
  };
  vesselValueUsd: number;
  daysInHra: number;
  distanceNm: number;
  euLegPercent: number; // 0.0–1.0
  vlsfoBurnMt: number;
  consumptionMtPerDay: number;
}

export interface EconomicsBreakdown {
  bunkerCost: number;                  // USD
  bunkerPort: string;                  // recommended bunkering hub
  splitBunkerSavings?: number;         // USD, if split bunkering applicable
  euEtsAmount: number;                 // EUR (0 if non-EU route)
  euEtsApplicable: boolean;
  warRiskPremium: number;              // USD, hull only (0 if no HRA crossing)
  warRiskZones: string[];              // e.g. ['Gulf of Guinea HRA']
  /** Hull + crew war bonus + P&I surcharge. Undefined when warRiskPremium is 0. */
  warRiskTotal?: number;
  /** Full per-voyage war risk breakdown (issue #178). Laden-only alias of warRiskBreakdownLaden. */
  warRiskBreakdown?: import('./economics/war-risk').WarRiskBreakdown;
  /** Laden voyage war-risk (load → discharge). Same as warRiskBreakdown — explicit name. */
  warRiskBreakdownLaden?: import('./economics/war-risk').WarRiskBreakdown;
  /** Ballast leg war-risk (open position → load). Undefined when openPosition is non-HRA or absent. */
  warRiskBreakdownBallast?: import('./economics/war-risk').WarRiskBreakdown;
  /** JWC zones touched by the ballast leg. */
  warRiskZonesBallast?: string[];
  /** Laden + ballast totalPremiumUsd. Reflected in EconomicsResult.totalUsd. */
  warRiskTotalCombined?: number;
  /** Canal dues (Suez + Bosporus combined, USD). Zero if no canal transit. */
  canal_usd?: number;
  /** EU ETS cost in USD (converted from EUR). Zero if non-EU route. */
  ets_usd?: number;
}

export interface EconomicsResult {
  breakdown: EconomicsBreakdown;
  totalUsd: number;                    // sum of all costs in USD-equivalent
  calculatedAt: string;                // ISO 8601
  dataFreshness: {
    bunker: string;                    // ISO 8601 of bunker price scrape
    eua: string;                       // ISO 8601 of EUA price scrape
  };
  /**
   * Headline Time-Charter-Equivalent ($/day). Additive (spec L2 #5): present when
   * economics is computed in the matching pipeline (buildMatchEconomics).
   *
   * NOTE: pre-war-risk. Mirrors the persisted `tce_usd_per_day` column, which the
   * TCE engine computes with blanked route ports → the JWC premium is NOT folded
   * into this daily figure. The premium is surfaced separately in
   * `breakdown.warRiskPremium` / `warRiskBreakdown`. Don't read this alone as a
   * war-risk-inclusive daily P&L on HRA routes.
   */
  tceUsdPerDay?: number;
  /** Freight rate (USD/mt) used to compute tceUsdPerDay. Persisted to matches table so detail page shows the same rate. */
  freightRateUsdPerMt?: number;
  /** Source tier that resolved the freight rate (manual/parsed/baltic/estimated). */
  freightRateSource?: string;
  /** Set when vessel consumption was absent/zero and class-aware fallback fired. */
  consumptionEstimated?: boolean;
  /** Set when cargo quantity was absent/zero and DWT×0.65 fallback fired. */
  qtyEstimated?: boolean;
  /** Data-quality channel — per-field provenance (W5). Map key = field name. */
  dataQuality?: Record<string, import('./data-quality/types').DataQuality>;
}

// ── FuelEU Maritime (Spec γ-11) ──

export interface FuelEuResult {
  ghgIntensityActual: number;    // g CO2eq/MJ actual
  ghgIntensityTarget: number;    // g CO2eq/MJ target for year
  complianceGapPct: number;      // positive = non-compliant, negative = over-compliant
  penaltyEur: number;            // €0 if compliant
  penaltyUsd: number;            // converted at ~1.08 rate (or from currency.ts fallback)
  totalEnergyMj: number;
  isCompliant: boolean;
}

// ── Market Benchmark ──

export type MarketIndicator = 'TOEPFER_TMI' | 'DREWRY_BREAKBULK' | 'BHSI' | 'BUNKER_ROTTERDAM' | 'EUA';

export interface MarketBenchmark {
  indicator: MarketIndicator;
  value: number;                       // current value (USD/day for TMI, index for others)
  unit: string;                        // 'USD/day' | 'index'
  period: string;                      // 'Apr 2026' | 'W17 2026'
  sourceUrl: string;                   // canonical URL where it was scraped
  fetchedAt: string;                   // ISO 8601
  stale?: boolean;                     // true if index_date is >7 days old
}

// Helper to extract value from ConfidenceField
export function cfValue<T>(field: ConfidenceField<T> | null | undefined): T | null {
  return field?.value ?? null;
}

// Union type for values that can be rendered as strings (plain values or ConfidenceField objects)
export type Renderable = ConfidenceField<string | number | boolean> | string | number | boolean | null | undefined;

// ── Email Lifecycle ──

export type EmailCategory = 'CARGO_INQUIRY' | 'VESSEL_POSITION' | 'FIXTURE_RECAP' | 'CLIENT_REPLY' | 'DOCUMENT' | 'TCT_REQUEST' | 'VESSEL_CERTIFICATE' | 'OTHER';
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
  weightMtMin: number | null;
  weightMtMax: number | null;
  volumeCbm: number | null;
  dimensions: string | null;
  cargoType: CargoType;
  containerType: string | null;
  quantity: Range<number> | number | null;
  incoterms: string | null;
  preferredDates: ConfidenceField<string> | null;
  laycan: string | null;
  loadingRate: string | null;
  dischargeRate: string | null;
  commissionPercent: number | null;
  commissionTerms: string | null;
  freightRateUsd?: number | null;
  specialRequirements: string | null;
  stowageFactor: string | null;
  missingInfo: string[];
  originPortAlternatives?: string[] | null;
  originPortRotation?: string[] | null;
  destinationPortAlternatives?: string[] | null;
  destinationPortRotation?: string[] | null;
  weightPerPort?: number[] | null;
  maxVesselAgeYrs?: number | null;
  gearRequired?: boolean | null;
  maxLoaM?: number | null;
  maxBeamM?: number | null;
  flagRequired?: string | null;
  classRequired?: string | null;
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
  /**
   * IMO CII rating (Carbon Intensity Indicator) — A-E grade.
   * Often appears only in subject line ("CII Grade D"), so parser
   * post-processes subject as a backup when LLM omits the field.
   */
  ciiRating?: 'A' | 'B' | 'C' | 'D' | 'E' | null;
  /** Source of the CII rating — set when lookup was performed. */
  ciiSource?: 'imo-public' | 'llm-fallback' | null;
  /**
   * Human-readable warning about external-registry verification — e.g.
   * "Name mismatch: Equasis says X, email says Y" or "IMO not found in Equasis registry".
   * Null when verification passed or was not attempted.
   */
  verificationWarning?: string | null;
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
  vesselDraft: string | null;  // PR #231: compound string preserving design/max/etc
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
  commissionAddressPct: number | null;     // PR #231
  commissionAddressAmount: number | null;  // PR #231
  commissionBrokerPct: number | null;      // PR #231
  commissionBrokerAmount: number | null;   // PR #231
  // Operations
  despatchRate: string | null;             // PR #231 (FD/HD interpreted text)
  acknowledgementDeadline: string | null;  // PR #231 (broker response deadline)
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

export type ReadinessVerdict = 'ideal' | 'tight' | 'idle' | 'late' | 'unknown';

export interface MatchReadiness {
  openDate: string | null;      // ISO yyyy-mm-dd
  laycanStart: string | null;
  laycanEnd: string | null;
  distanceNm: number | null;
  /** True = exact (sea-route matrix); false = approximate (great-circle / haversine). */
  distanceExact?: boolean | null;
  speedKn: number | null;
  sailingDays: number | null;
  arrivalDate: string | null;
  gapDays: number | null;
  verdict: ReadinessVerdict;
  explanation: string;
  /** True when the laycan window has already passed (end < today). */
  laycanExpired?: boolean;
}

/** Result of a single hard-filter check (see lib/sailing/match-filters.ts). */
export interface HardFilterCheck {
  pass: boolean;
  reason?: string;
  /** Layer C: soft warning — pass=true but requires user confirmation (e.g. gearless+breakbulk+unverified cranes). */
  warning?: boolean;
}

export interface MatchHardFilters {
  draft: HardFilterCheck;
  crane: HardFilterCheck;
  volume: HardFilterCheck;
  cargoVessel: HardFilterCheck;
  destDraft: HardFilterCheck;
  destCrane: HardFilterCheck;
  cargoWeight: HardFilterCheck;
  imsbc?: HardFilterCheck;
  // Layer B gates
  vesselAge?: HardFilterCheck;
  dimensions?: HardFilterCheck;
  gearRequired?: HardFilterCheck;
  voyage?: HardFilterCheck;
  flagClass?: HardFilterCheck;
  warPositionVoyage?: HardFilterCheck;
}

/** Sanctions screening (see lib/validation/sanctions.ts). */
export interface MatchSanctions {
  risk: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  reason?: string;
  blocking: boolean;
}

export interface WorksheetReadiness extends MatchReadiness {
  openPosition: string | null;
}

export interface MatchWorksheet {
  readiness: WorksheetReadiness;
  vessel: {
    draftMax: number | null;
    grainCapacity: number | null;
    grainCapacityUnit: 'cbm' | 'cbft' | null;
    geared: boolean | null;
    vesselType: string | null;
    flag: string | null;
    built: number | null;
    pandi: string | null;
    classSociety: string | null;
    lastCargoes: string | null;
    dwtSummer: number | null;
    dwcc: number | null;
  };
  cargo: {
    weightMt: number | null;
    weightMtEffective?: number | null;  // worst-case (resolveCargoWeight) for util% gating
    cargoType: string | null;
    loadPort: string | null;
    dischargePort: string | null;
  };
  hardFilters: {
    draft: HardFilterCheck;
    crane: HardFilterCheck;
    volume: HardFilterCheck;
  };
}

export interface Match {
  cargoEmailId: string;
  cargoItemIndex: number;
  vesselEmailId: string;
  vesselItemIndex: number;
  score: number;
  matchLevel: MatchLevel;
  matchReasons: string[];
  issues: string[];
  readiness?: MatchReadiness;
  hardFilters?: MatchHardFilters;
  dateIssues?: string[];
  sanctions?: MatchSanctions;
  scoreBreakdown?: ScoreBreakdown;
  /** Broker-facing transparent fit-% with per-factor breakdown (fit-loop 2026-05-31). */
  fitPercent?: number;
  fitBreakdown?: FitBreakdown;
  /** Detailed vessel×cargo summary persisted alongside the match (worksheet feature). */
  worksheet?: MatchWorksheet;
  /** Confidence summary computed by the confidence engine (spec α-02). Optional for backward compat. */
  confidence?: import('./confidence').MatchConfidence;
  /** Economics enrichment computed by the economics engine (spec α-08). Optional — absent when data unavailable. */
  economics?: EconomicsResult;
}

/**
 * A cargo × vessel pair that was deterministically blocked before the LLM stage.
 * Stored in session alongside `matches` so brokers can see why a pair was dropped.
 */
export interface BlockedMatch {
  cargoEmailId: string;
  cargoItemIndex: number;
  vesselEmailId: string;
  vesselItemIndex: number;
  /** Primary reason for blocking (hard filter, date, readiness, or sanctions). */
  filterReason: string;
  /** Populated when the block is due to sanctions screening. */
  sanctions?: MatchSanctions;
  /** Populated when the block is due to hard filters. */
  hardFilters?: MatchHardFilters;
}

/** Structured score breakdown (see lib/sailing/match-scoring.ts). */
export interface ScoreBreakdownComponent {
  label: string;
  points: number;
  max: number;
  reason?: string;
  /** Confidence multiplier applied to this component (1.0 = no degradation). */
  confidenceMultiplier?: number;
}

export interface ScoreBreakdown {
  components: ScoreBreakdownComponent[];
  basePhysical: number;
  readinessAdjustment: number;
  sanctionsAdjustment: number;
  finalScore: number;
  /** Penalty applied when vessel position or cargo origin is a vague geographic region (e.g. 'East Coast Greece'). */
  vagueRegionAdjustment?: number;
  /** Sum of confidence-weighted component points (may be lower than basePhysical). */
  confidenceAdjustedScore?: number;
}

/** Per-factor labelled sub-score in the broker-facing fit-% (fit-loop 2026-05-31). */
export type FitFactor =
  | 'utilisation'
  | 'timing'
  | 'ballast'
  | 'classFit'
  | 'cargoType'
  | 'cranes'
  | 'volume'
  | 'draft'
  | 'vetting'
  | 'economics';

export interface FitBreakdownComponent {
  factor: FitFactor;
  label: string;
  /** Maximum points this factor can contribute (the weight). */
  weight: number;
  /** Earned points, 0..weight. */
  score: number;
  /** Human-readable why the score is what it is — visible to the broker. */
  rationale: string;
  /** Short structured numbers shown in grey brackets next to the % (Task G).
   *  Read-only display of values the scorer already computed. Optional →
   *  backward-compatible with stored fit_breakdown JSON (no migration). */
  bracketData?: string;
}

export interface FitBreakdown {
  components: FitBreakdownComponent[];
  /** Sum of component weights; usually 100. */
  totalWeight: number;
  /** Final transparent fit-%, 0..100. Sum of component scores minus sanctions penalty, clamped. */
  fitPercent: number;
  /** True when cargo description matches part-cargo phrasing (changes utilisation curve). */
  partCargo: boolean;
  /** Vessel class derived from DWT (used for ballast radius). */
  vesselClass: string;
  /** Pts deducted for MEDIUM sanctions risk (HIGH/blocking is filtered upstream). */
  sanctionsPenalty: number;
  /** Pts deducted for weak charterer credit tier (counterparty-side penalty). */
  chartererPenalty?: number;
  /** Killing-factor cap that lowered the headline fitPercent below the linear sum
   *  (e.g. 'late' verdict → cap 38). Null when no cap applied. */
  appliedCap: { reason: string; ceiling: number } | null;
  /** Raw inputs the breakdown was computed from — for transparency / debugging. */
  inputs: {
    distanceNm: number | null;
    gapDays: number | null;
    verdict: string;
    utilisation: number | null;
    vesselDwt: number | null;
    cargoWtMax: number | null;
  };
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
  /** Pairs blocked deterministically (sanctions, hard filters, dates) before the LLM stage. */
  blockedMatches?: BlockedMatch[];
  /** "Manual review" bucket — weak score OR idle with a large date gap. Kept out of
   *  the main `matches` list but preserved so brokers can still inspect them (levers 1+2). */
  lowConfidenceMatches?: Match[];
  /** "Not enough data" bucket — pairs with an `unknown` readiness verdict (no distance/
   *  dates), excluded from the main list but preserved (lever 5). */
  insufficientData?: Match[];
  recaps: Recap[];
  commissionSummary: CommissionSummary | null;
  counterparties: Counterparty[];
  isSampleData?: boolean;
  /** Gmail account email — stable multi-tenant owner key for persisted data. */
  accountId?: string;
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
  source: "frankfurter" | "manual";
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

// ── Laytime Engine (Spec γ-05) ──

export type LaytimeMode = 'SHEX' | 'SHINC' | 'FHEX' | 'FHINC';

export interface LaytimeInput {
  allowedLaytimeDays: number;
  mode: LaytimeMode;
  commencedAt: string;
  completedAt: string;
  portHolidays?: string[];
  weatherDelayHours?: number;
}

export interface LaytimeResult {
  allowedLaytimeHours: number;
  usedLaytimeHours: number;
  demurrageOrDespatch: 'demurrage' | 'despatch' | 'balanced';
  netHours: number;
  breakdown: LaytimeBreakdownEntry[];
}

export interface LaytimeBreakdownEntry {
  date: string;
  hours: number;
  excluded: boolean;
  reason?: string;
}

// ── Demurrage & Despatch (Spec γ-07) ──

export interface DemurrageDespatchInput {
  laytimeResult: LaytimeResult;      // from γ-05 calculateLaytime
  demurrageRateUsdPerDay: number;    // e.g. 8000
  despatchRateUsdPerDay?: number;    // optional, default = demurrageRate / 2
}

export interface DemurrageDespatchResult {
  status: "demurrage" | "despatch" | "balanced";
  netHours: number;
  demurrageAmount: number;           // USD, 0 if despatch
  despatchAmount: number;            // USD, 0 if demurrage
  netAmount: number;                 // positive = you pay, negative = you earn
  breakdown: {
    demurrageRate: number;
    despatchRate: number;
    demurrageHours: number;
    despatchHours: number;
  };
}

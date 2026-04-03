export interface Email {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  body: string;
  snippet: string;
}

export type EmailCategory = 'RATE_REQUEST' | 'CLIENT_REPLY' | 'DOCUMENT' | 'CARRIER_UPDATE' | 'OTHER';
export type Urgency = 'high' | 'medium' | 'low';
export type CargoType = 'FCL' | 'LCL' | 'BREAK_BULK' | 'AIR' | 'RORO' | 'OTHER';
export type NegotiationStatus = 'AGREED' | 'PENDING' | 'DISAGREED';

export interface Classification {
  emailId: string;
  category: EmailCategory;
  isUnanswered: boolean;
  urgency: Urgency;
  daysWithoutReply: number | null;
  confidence: number;
}

export interface ParsedRequest {
  emailId: string;
  originPort: string | null;
  originCountry: string | null;
  destinationPort: string | null;
  destinationCountry: string | null;
  cargoDescription: string | null;
  weightMt: number | null;
  volumeCbm: number | null;
  dimensions: string | null;
  cargoType: CargoType;
  containerType: string | null;
  quantity: number | null;
  incoterms: string | null;
  preferredDates: string | null;
  specialRequirements: string | null;
  missingInfo: string[];
}

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

export interface SessionData {
  id: string;
  accessToken: string;
  createdAt: Date;
  emails: Email[];
  classifications: Classification[];
  parsedRequests: ParsedRequest[];
  recaps: Recap[];
}

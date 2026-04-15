category: shared-types
status: FOUND
findings:
  - question: "What is the full shape of SessionData used in decomp-07 session tests? The type is referenced but not documented in any decomp."
    answer: |
      SessionData is defined in lib/types.ts:268-283:
      ```ts
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
      ```
      lib/session.ts:createSession initializes all array fields as [] and commissionSummary as null.
      isSampleData is optional and not set in createSession.
    source: lib/types.ts:268-283, lib/session.ts:9-23

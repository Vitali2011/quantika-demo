category: api-contracts
status: FOUND
findings:
  - question: "What is the contract of GET /api/sample?"
    answer: |
      Method: GET (no body)
      Auth: none required
      Response: 302 redirect to /processing
      Side effects: creates session, sets session_id cookie (httpOnly, secure in prod, sameSite=lax, maxAge=3600)
      Loads 19 hardcoded SAMPLE_EMAILS into session with isSampleData=true
    source: app/api/sample/route.ts:275-294

  - question: "What is the contract of DELETE /api/session?"
    answer: |
      Method: DELETE
      Auth: session_id cookie (optional)
      Response: { message: 'Session deleted' } + clears session_id cookie
      Side effects: calls deleteSession(sessionId) if cookie present
    source: app/api/session/route.ts:5-15

  - question: "What is the contract of GET /api/auth/google?"
    answer: |
      Method: GET
      Query params: code (OAuth code) | error (OAuth error)
      No code, no error: redirect to Google OAuth URL
      error present: redirect to /?error=access_denied
      code present: exchange for accessToken, createSession, set session_id cookie, redirect to /processing
      Error fallback: redirect to /?error=auth_failed
    source: app/api/auth/google/route.ts:6-41

  - question: "What is the contract of POST /api/emails/fetch?"
    answer: |
      Method: POST (no body)
      Auth: session_id cookie (required)
      Success: { count: number, message: string }
      Errors: 401 {error: 'No session'|'Session expired'}, 500 {error: 'Failed to fetch emails'}
      isSampleData shortcut: returns { count: N, message: 'Sample data: N emails' } immediately
    source: app/api/emails/fetch/route.ts:10-47

  - question: "What is the contract of POST /api/ai/classify?"
    answer: |
      Method: POST (no body)
      Auth: session_id cookie (required)
      Success: { count: number }
      Errors: 401, 400 {error: 'No emails to classify'}
      Updates session: { classifications: Classification[], processedEmails: ProcessedEmail[] }
      Classification: { emailId, category: EmailCategory, isUnanswered, urgency: Urgency, daysWithoutReply, confidence, originalSender, originalSenderCompany }
      ProcessedEmail: { emailId, type, status: EmailStatus, isUnanswered, urgency, daysWithoutReply, confidence, originalSender, originalSenderCompany, freshness: 'stale'|'active', expiryDate, expirySource }
    source: app/api/ai/classify/route.ts:14-106

  - question: "What is the contract of POST /api/ai/parse-cargo?"
    answer: |
      Method: POST (no body)
      Auth: session_id cookie (required)
      Success: { count: number }
      Errors: 401
      Updates session: { parsedCargos: ParsedCargo[] }
      ParsedCargo: { emailId, itemIndex, originPort, originCountry, destinationPort, destinationCountry, cargoDescription, weightMt, volumeCbm, dimensions, cargoType, containerType, quantity, incoterms, preferredDates, laycan, loadingRate, dischargeRate, commissionPercent, commissionTerms, specialRequirements, stowageFactor, missingInfo }
      ConfidenceField<T>: { value: T, confidence: string, sourceText?: string }
    source: app/api/ai/parse-cargo/route.ts:23-88

  - question: "What is the contract of POST /api/ai/parse-vessel?"
    answer: |
      Method: POST (no body)
      Auth: session_id cookie (required)
      Success: { count: number }
      Errors: 401
      Updates session: { parsedVessels: ParsedVessel[] }
      ParsedVessel: { emailId, itemIndex, vesselName, imo, flag, built, classSociety, pandi, dwtSummer, dwcc, draftMax, loa, beam, grt, nrt, holdsCount, hatchesCount, grainCapacity, grainCapacityUnit, baleCapacity, holdDimensions, hatchDimensions, tankTopStrength, geared, craneCapacity, hatchType, vesselType, openPosition, openDate, direction, restrictions, lastCargoes, speedLaden, speedBallast, consumption, deckCapacity, specialFeatures }
    source: app/api/ai/parse-vessel/route.ts:31-119

  - question: "What is the contract of POST /api/ai/parse-recap?"
    answer: |
      Method: POST (no body)
      Auth: session_id cookie (required)
      Success: { count: number }
      Errors: 401
      Updates session: { parsedFixtureRecaps: ParsedFixtureRecap[], commissionSummary }
      ParsedFixtureRecap: { emailId, vesselName, owners, charterers, account, broker, loadPort, dischPort, cargoDescription, cargoQuantityMin, cargoQuantityMax, cargoPackaging, laycan, transitTime, freightRate, freightBasis, freightPayment, loadingRate, loadingTerms, loadingWorkingHours, dischargingRate, dischargingTerms, dischargingWorkingHours, demurrageRate, demurragePayment, loadPortAgent, dischPortAgent, vesselDwt, vesselDraft, vesselGeared, cpForm, arbitration, law, commission, commissionPercent, commissionBase, commissionAmount, commissionCurrency, subs, confidentiality, additionalTerms, unknownTerms }
      Note: debug console.log at line 102 leaks commissionPercent+freightRate to stdout
    source: app/api/ai/parse-recap/route.ts:25-107

  - question: "What is the contract of POST /api/ai/match?"
    answer: |
      Method: POST (no body)
      Auth: session_id cookie (required)
      Success: { count: number }
      Errors: 401
      Short-circuit: parsedCargos===0 or parsedVessels===0 => { count: 0 }
      Updates session: { matches: Match[] }
      Match: { cargoEmailId, cargoItemIndex, vesselEmailId, vesselItemIndex, score: 0-100, matchLevel: 'good'|'possible'|'weak', matchReasons: string[], issues: string[] }
      Results sorted by score descending
    source: app/api/ai/match/route.ts:12-86

  - question: "What is the contract of POST /api/ai/counterparty?"
    answer: |
      Method: POST (no body)
      Auth: session_id cookie (required)
      Success: { count: number }
      Errors: 401
      Updates session: { counterparties }
      No AI call - pure computation via groupByCounterparty()
    source: app/api/ai/counterparty/route.ts:7-18

  - question: "What is the contract of POST /api/ai/recap?"
    answer: |
      Method: POST (no body)
      Auth: session_id cookie (required)
      Success: { count: number }
      Errors: 401
      Only processes threads with >= MIN_THREAD_LENGTH_FOR_RECAP emails
      Updates session: { recaps: Recap[] }
      Recap: { threadId, subject, participants: string[], emailCount, dateRange, points: RecapPoint[], summary }
      RecapPoint: { topic, status: NegotiationStatus, currentValue, proposedBy, sourceEmailNumber, sourceEmailDate, sourceQuote, history }
    source: app/api/ai/recap/route.ts:11-86

  - question: "What is the contract of POST /api/ai/draft-quote?"
    answer: |
      Method: POST
      Auth: session_id cookie (required)
      Request body: { emailId: string }
      Success: { draft: string }
      Errors: 401, 404 {error: 'Parsed request not found'}
      Requires parsedCargo for emailId in session (parse-cargo must run first)
      No session update
    source: app/api/ai/draft-quote/route.ts:9-44

  - question: "What is the contract of POST /api/ai/draft-reply?"
    answer: |
      Method: POST
      Auth: session_id cookie (required)
      Request body: { emailId?: string } | { pendingItems?: any }
      Success: { draft: string }
      Errors: 401, 400 {error: 'Missing emailId or pendingItems'}
      Mode 1 (emailId): missing-info follow-up using parsedCargo.missingInfo
      Mode 2 (pendingItems): negotiation follow-up for pending items
      No session update
    source: app/api/ai/draft-reply/route.ts:19-66

  - question: "What auth pattern is used and are there CSRF protections?"
    answer: |
      All routes auth via session_id cookie (httpOnly).
      Pattern: cookies.get('session_id')?.value -> getSession() -> 401 if missing/expired.
      No CSRF tokens on any POST route (critical gap - ROADMAP item 3).
      GET /api/sample creates session via GET (REST violation + CSRF vector per ROADMAP:29).
      No rate limiting. No request body validation beyond existence checks.
    source: INFERRED: consistent pattern all route files; ROADMAP.md:26-30 confirms CSRF gap

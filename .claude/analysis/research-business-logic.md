category: business-logic
status: FOUND
findings:
  - question: "Are there business-logic gap questions in gaps.md?"
    answer: "NOT_FOUND — no business-logic category in gaps.md. Categories present: testing, codebase-currency, shared-types, optional-settings-guards."
    source: ".claude/analysis/gaps.md:1-22"

  - question: "What business logic is embedded in app/api/ai/classify/route.ts (lines 37-102)?"
    answer: |
      Thread grouping: builds Map<string, Email[]> keyed by email.threadId (lines 38-43).
      Reply detection:
        isIncoming = email.labelIds.includes(INBOX) and not SENT label
        hasReply = any thread email with SENT label and date > current email date
        isUnanswered = isIncoming and not hasReply
        daysWithoutReply = isUnanswered ? floor((now - emailDate) / 86400000) : null
      Status derivation (lines 67-83):
        REQUIRES_REPLY categories: [CARGO_INQUIRY, CLIENT_REPLY]
        !requiresReply => INFO_ONLY
        !isUnanswered  => RESPONDED
        hoursWithout >= UNANSWERED_THRESHOLD_HOURS (48h) => NEEDS_ACTION
        else           => PENDING
      Freshness: calls calculateExpiry and isStale from lib/freshness.ts
      Output: writes classifications and processedEmails to session.
    source: app/api/ai/classify/route.ts:37-104

  - question: "What are the lib/session.ts exported function signatures?"
    answer: |
      createSession(accessToken: string): string
        generates randomUUID, stores SessionData with all arrays [], commissionSummary null
        registers dangling setTimeout(() => sessions.delete(id), SESSION_TTL_MS) - no clearTimeout ref stored
      getSession(id: string): SessionData | null
        returns null if missing or age > SESSION_TTL_MS
      updateSession(id: string, updates: Partial<SessionData>): boolean
        Object.assign on existing session; returns false if not found
      deleteSession(id: string): void
      getSessionCount(): number
      SESSION_TTL_MS = 3600000 (1 hour), from lib/constants.ts:6
    source: lib/session.ts:7-59, lib/constants.ts:6

  - question: "What are the freshness rules in lib/freshness.ts?"
    answer: |
      calculateExpiry(emailDate, category, parsedCargo?, parsedVessel?): { expiryDate, expirySource }
        VESSEL_POSITION: use parsedVessel.openDate.value if present, else emailDate + 5 days
        CARGO_INQUIRY: use parsedCargo.laycan if present, else emailDate + 5 days
        FIXTURE_RECAP: expiryDate=null, expirySource=permanent
        DOCUMENT: emailDate + 30 days
        CLIENT_REPLY: emailDate + 3 days
        default: null/null
      isStale(expiryDate): boolean - true if now > expiryDate, false if null/invalid
    source: lib/freshness.ts:24-78, lib/constants.ts:19-22

  - question: "What domain constants govern business rules?"
    answer: |
      UNANSWERED_THRESHOLD_HOURS = 48
      SESSION_TTL_MS = 3600000 (1 hour)
      EMAIL_FETCH_COUNT = 50
      MIN_THREAD_LENGTH_FOR_RECAP = 5
      MAX_EMAIL_BODY_CHARS = 3000
      REVENUE_PER_UNANSWERED = 3000, REVENUE_PER_UNANSWERED_HIGH = 6000
    source: lib/constants.ts:6-16

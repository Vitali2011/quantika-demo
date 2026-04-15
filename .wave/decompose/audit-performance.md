aspect: performance
findings_count: 5
findings:
  - file: lib/google.ts
    line: 51
    severity: high
    finding: N+1 Gmail API calls — fetchGmailEmails fetches the message list then issues one individual gmail.users.messages.get call per message via Promise.all. With EMAIL_FETCH_COUNT=50 this produces 51 HTTP requests; parallel execution helps latency but not quota consumption or connection overhead.
    recommendation: Use Gmail batch requests or users.messages.batchGet to fetch multiple messages in a single HTTP call, or use the fields parameter to get more data from the list call itself.
    roadmap_candidate: yes

  - file: lib/session.ts
    line: 5
    severity: high
    finding: Unbounded in-memory sessions Map — the Map grows without any size cap. Under concurrent users each session stores full email bodies plus all parsed data. Also, deleteSession (line 53) removes from the Map but never cancels the setTimeout created in createSession (line 26), leaving a dangling timer reference per explicitly-deleted session.
    recommendation: (1) Add a MAX_SESSIONS guard that evicts the oldest session when the limit is reached. (2) Store the timer handle in SessionData and call clearTimeout in deleteSession.
    roadmap_candidate: yes

  - file: app/api/ai/classify/route.ts
    line: 46
    severity: medium
    finding: O(n*m) linear searches inside .map() — session.emails.find() is called once per classification at line 46 and again at line 69. With 50 emails and 50 classifications this produces 2500 comparisons total. The threadMap is already built as a proper Map (good), but emailId lookups still use Array.find instead of a pre-built Map.
    recommendation: Build a Map<id, Email> before the .map() calls and replace both find() calls with O(1) Map lookups.
    roadmap_candidate: no

  - file: app/api/ai/parse-cargo/route.ts
    line: 43
    severity: medium
    finding: Unbounded concurrent AI calls — Promise.all fires one OpenAI API call per cargo email simultaneously with no concurrency cap. With many cargo emails this can saturate the OpenAI rate limit causing 429 errors for the whole batch. Same pattern exists in parse-vessel/route.ts and parse-recap/route.ts.
    recommendation: Use a concurrency-limited queue (e.g. p-limit) to cap simultaneous OpenAI calls to 3-5 at a time, with retry logic for 429 responses.
    roadmap_candidate: yes

  - file: app/api/ai/parse-cargo/route.ts
    line: 34
    severity: low
    finding: Array.includes() used for ID set membership — cargoInquiryIds is an Array, so session.emails.filter(e => cargoInquiryIds.includes(e.id)) is O(n*m). Same pattern likely in parse-vessel and parse-recap routes.
    recommendation: Convert cargoInquiryIds to a Set before the filter and use Set.has() for O(1) lookups.
    roadmap_candidate: no

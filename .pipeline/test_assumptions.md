## Assumptions made by test-author

1. I assume that /api/whatsapp/webhook needs bypass for both GET (Meta verification challenge)
   and POST (Meta webhook events) — the middleware checks pathname only, not HTTP method,
   so a single path bypass covers both methods.

2. I assume that /api/integrations/pipedrive/webhook needs bypass for POST events —
   Pipedrive calls this server-to-server without any user session cookie.

3. I assume that the existing parameterized test structure (bypassPaths loop) is the correct
   place to add these — adding paths to bypassPaths is the test contract, adding to
   AUTH_BYPASS_PATHS is the impl contract.

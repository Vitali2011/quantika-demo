# Email Persistence — Design

**Date:** 2026-05-14
**Status:** Approved (brainstorming complete)
**Topic:** Persist fetched emails + LLM parse results so they are not re-parsed on every session.

## Problem

Today emails are ephemeral. A web user connects Gmail → emails land in the session
JSON blob (`sessions.db`) → parsed on demand via LLM (`parse-cargo` / `parse-vessel` /
`parse-recap`) → session expires by TTL and everything is gone. Every return visit
re-parses the same emails: repeated LLM cost, latency, and lost user work.

**Drivers (all four confirmed):** LLM cost, speed/UX, data loss on session expiry,
foundation for history/search features.

**Prod model:** multi-tenant SaaS — each user connects their own Gmail, sees only
their own emails. Persistence must be per-user with data isolation.

**Privacy stance:** store everything (raw + parsed); legal wording deferred. Technical
retention hooks are still included in the design.

## Approach

Approach A — minimal persistence layer now, before Wave δ. A focused
`dev-pipeline-deep` task (~7–10 files). History UI, search, analytics, and privacy
policy text are explicitly out of scope — they build on top of this layer later.

## Architecture & Data Model

### Prerequisite: account identity

Today there is no stable user identity — a session is created from just an
`accessToken` and expires in 1h. At the OAuth callback, add one Gmail API
`users.getProfile` call → `emailAddress`. This becomes the stable owner key
(`account_id`), stored in the session and used as the multi-tenant partition key.

### Tables (`data/quantika.db`, migration `031-email-cache.ts`)

Migration format follows the existing 30 migrations (`version`, `name`, `up`, `down`).

**`emails`** — raw email, written once on fetch:

- PK: `(account_id, gmail_message_id)` — Gmail message-id is stable across fetches,
  so it is the natural cache key
- columns: `thread_id`, `from_addr`, `from_name`, `from_email`, `to_addr`,
  `subject`, `date`, `body`, `snippet`, `label_ids` (JSON), `fetched_at`

**`parsed_results`** — LLM parse output:

- PK: `(account_id, gmail_message_id, parse_type, parser_version)`
- `parse_type` — `cargo` / `vessel` / `recap` (only these 3 endpoints call the LLM;
  classification is cheap regex markers — not cached)
- `parser_version` — hash of prompt + model; a prompt change naturally invalidates
  stale cache (key no longer matches → re-parse)
- `result_json` — the parsed JSON; `parsed_at`

**Rationale:** Gmail message-id is a free, stable key. Splitting `emails` /
`parsed_results` allows re-parsing without losing raw data. `parser_version` guards
against "cached garbage from an old prompt".

## Read Path — cache check in parse endpoints

Current behavior: each of `parse-cargo` / `parse-vessel` / `parse-recap` runs **every**
category email through the LLM, then `updateSession` overwrites the parsed array.

Change to split-and-merge, inside each route's `POST` after category filtering,
before the `Promise.all` loop:

1. Filter category emails (as today).
2. One query into `parsed_results` for all those emails by
   `(account_id, gmail_message_id, parse_type, parser_version)`.
3. Split into `cached` (in DB) and `toParse` (not in DB).
4. Run the LLM **only for `toParse`** — existing `pLimit` / `withRetry429` /
   `withTimeout` logic unchanged.
5. Write fresh results into `parsed_results`.
6. Merge `cached` + fresh → `updateSession` (as today).

Parsing internals (`parseCargoAIResponse`, fallbacks) are untouched. Shared SQL lives
in a new `lib/email-cache.ts` (`getCachedParses()` / `saveParsedResults()`) so the
three routes do not duplicate it.

**Effect:** a second visit to the same emails = zero LLM calls, instant response. New
emails get parsed; old ones come from cache.

## Write Path — raw email persistence & retention

- `/api/emails/fetch`: after fetching from Gmail, `upsert` into `emails`
  (`INSERT ... ON CONFLICT(account_id, gmail_message_id) DO UPDATE`, refreshing `body`
  and `fetched_at`).
- `import-gmail-emails.ts`: may also write into `emails` — optional, decided at
  planning time to avoid scope creep.
- Retention hooks (technical, no legal text): `fetched_at` / `parsed_at` already
  present for future cleanup; a single `deleteAccountData(account_id)` function that
  removes rows from `emails` + `parsed_results`. Not wired to UI now — exists so a
  "delete my data" button is a one-liner later.
- `sessions.db` and the session JSON blob are unchanged — the session stays the
  working "RAM", the DB is the persistent layer beneath it.

## Edge Cases

- **Prompt/model changed** → `parser_version` mismatch → re-parse; old row stays
  (cleanable later). No stale garbage.
- **Email edited in Gmail** — Gmail typically issues a new message-id on edit, so the
  key catches it naturally; `emails` upsert also refreshes `body` / `fetched_at`.
- **demo / sample-data sessions** — `isSampleData` branch stays first, before any
  cache. Demo does not write to `emails` / `parsed_results` (no real `account_id`).
- **LLM returned empty / timed out** — empty result is **not** cached, so a retry is
  still possible on the next visit.
- **Race** (two tabs parsing at once) — `INSERT ... ON CONFLICT DO UPDATE`, like the
  existing migration runner. Last write wins; data is identical.
- **No `account_id`** (legacy session without the profile field) — fallback to
  today's behavior: parse, do not cache. No crashes.

## Testing

- **Unit** (`lib/email-cache.ts`): `getCachedParses` (hit / miss / partial),
  `saveParsedResults`, `parser_version` mismatch, empty result not written.
- **Integration**: migration 031 applies cleanly; `parse-cargo` route with a
  pre-populated cache → 0 LLM calls (mock provider, assert call count);
  split-and-merge over a mix of cached + new.
- **Cache key**: two different `account_id`s cannot see each other's emails
  (multi-tenant isolation).
- **Regression**: existing parse-cargo/vessel/recap tests stay green — route
  signatures unchanged.

## Scope & Tasking

- Implementation skill: `dev-pipeline-deep` (~7–10 files: migration, `lib/email-cache.ts`,
  3 parse routes, fetch route, auth route, types + tests). 9-class boundary QA covers
  input edge cases.
- Sequencing: **before Wave δ** — E2E testing in Wave δ and any future history feature
  depend on this layer; doing it after δ means re-testing everything.

## Out of Scope (later, on top of this layer)

History UI, email search, deal-over-time analytics, retention cron / TTL, "delete my
data" UI, privacy policy / landing copy update.

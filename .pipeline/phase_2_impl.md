## Changed Files
- `app/api/health/route.ts` — new GET handler returning `{ status, sessions, uptime, version }`
- `app/api/health/__tests__/health.test.ts` — 5 unit tests covering all required fields
- `jest.config.mjs` — minimal Next.js jest config (required to run TS tests; spec-07 will expand)

## Test Results
✅ 5/5 tests passed
- returns HTTP 200
- returns status: ok
- returns sessions equal to mocked getSessionCount()
- returns uptime as a positive number
- returns version: 0.1.0

## TDD Log
- RED: wrote health.test.ts → failed with "Cannot find module '../route'"
- GREEN: created route.ts with GET handler → 5/5 pass
- REFACTOR: clean, no changes needed

## Self-Check
✅ No auth check — GET handler has no session cookie requirement
✅ getSessionCount() imported from @/lib/session
✅ process.uptime() rounded to 2 decimal places
✅ VERSION = '0.1.0' hardcoded (no JSON import to avoid bundler issues)
✅ NextResponse.json({ status, sessions, uptime, version }, { status: 200 })
✅ ≥4 test cases (5 total)
✅ jest.mock('@/lib/session') used to control getSessionCount()
✅ No TODO, hardcode, placeholder, console.log

## Known Limitations
- jest.config.mjs created as minimal bootstrap; spec-07 will provide the full configuration

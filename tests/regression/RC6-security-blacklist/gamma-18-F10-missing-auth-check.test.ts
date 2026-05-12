// Regression Lock: QA adversarial 2026-05-12 (fixed 2026-05-12)
// Class: G (Auth/Security) | Severity: CRITICAL -> RESOLVED
// Finding: F-10 — No authentication check on ROI API endpoint
// Fix: Added requireSession() check -> returns 401 for unauthenticated requests
// Spec: spec/gamma-18-roi-guarantee-workflow
// DO NOT DELETE — see references/regression_lock_workflow.md

import Database from "better-sqlite3";
import { NextRequest } from "next/server";
import { runMigrations } from "@/lib/migrations/runner";
import { allMigrations } from "@/lib/migrations/index";
import { GET } from "@/app/api/analytics/roi/route";

let testDb: Database.Database;

// Mock session store
jest.mock("@/lib/session-store", () => ({
  getStore: jest.fn(() => ({
    getDatabase: () => testDb,
  })),
}));

// Mock requireSession to simulate unauthenticated (no session cookie)
jest.mock("@/lib/session", () => ({
  requireSession: jest.fn((req: import("next/server").NextRequest) => {
    const sessionId = req.cookies.get("session_id")?.value;
    if (!sessionId) {
      const { NextResponse } = require("next/server");
      return NextResponse.json({ error: "No session" }, { status: 401 });
    }
    return { session: { userId: "test-user" }, sessionId };
  }),
}));

describe("regression gamma-18-F10: authentication requirement", () => {
  beforeEach(() => {
    testDb = new Database(":memory:");
    runMigrations(testDb, allMigrations);
    process.env.ROI_GUARANTEE_ENABLED = "true";
  });

  afterEach(() => {
    testDb.close();
    delete process.env.ROI_GUARANTEE_ENABLED;
  });

  it("returns 401 for unauthenticated request (no session cookie)", async () => {
    // Arrange — unauthenticated request (no session, no auth header)
    const req = new NextRequest("http://localhost:3000/api/analytics/roi?days=90");
    // No session_id cookie

    // Act
    const res = await GET(req);

    // Assert — auth check must return 401, not 200
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 200 for authenticated request", async () => {
    // Arrange — authenticated request with session cookie
    const req = new NextRequest("http://localhost:3000/api/analytics/roi?days=90", {
      headers: { Cookie: "session_id=valid-session-token" },
    });

    // Act
    const res = await GET(req);

    // Assert — authenticated user gets data
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("totalVoyages");
  });
});

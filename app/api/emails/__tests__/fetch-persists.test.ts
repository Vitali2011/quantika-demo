import { POST } from "../fetch/route";
import * as session from "@/lib/session";
import * as google from "@/lib/google";
import * as cache from "@/lib/email-cache";
import { NextRequest } from "next/server";

jest.mock("@/lib/google");
jest.mock("@/lib/email-cache");
jest.mock("@/lib/session", () => ({
  getSession: jest.fn(),
  updateSession: jest.fn().mockReturnValue(true),
}));

function req(sessionId = "s1"): NextRequest {
  return new NextRequest("http://x/api/emails/fetch", {
    method: "POST",
    headers: { cookie: `session_id=${sessionId}` },
  });
}

// PI2 — stale-state guard + relogin regression tests (closes #376)
describe("emails/fetch stale-state guard", () => {
  beforeEach(() => jest.clearAllMocks());

  // PI2 (a): first fetch returns 200
  it("(a) first fetch returns 200 with valid session", async () => {
    (session.getSession as jest.Mock).mockReturnValue({
      id: "s1",
      isSampleData: false,
      accessToken: "tok",
      emails: [],
    });
    jest.spyOn(google, "fetchGmailEmails").mockResolvedValue([]);
    const res = await POST(req());
    expect(res.status).toBe(200);
  });

  // PI2 (b): after logout (session deleted) + re-login (new session), fetch returns 200
  it("(b) fetch succeeds with fresh session after old session is deleted", async () => {
    // Old session (pre-logout): deleted → returns null
    // New session (post-relogin): returns valid data
    (session.getSession as jest.Mock).mockImplementation((id: string) => {
      if (id === "s2") return { id: "s2", isSampleData: false, accessToken: "new-tok", emails: [] };
      return null; // s1 was deleted on logout
    });
    jest.spyOn(google, "fetchGmailEmails").mockResolvedValue([]);
    const res = await POST(req("s2"));
    expect(res.status).toBe(200);
  });

  // PI2 stale-state guard: Google 401 → route returns 401 (not 500)
  it("returns 401 when Gmail API returns 401 (expired token)", async () => {
    (session.getSession as jest.Mock).mockReturnValue({
      id: "s1",
      isSampleData: false,
      accessToken: "expired",
      emails: [],
    });
    const authErr = Object.assign(new Error("401 Unauthorized"), {
      response: { status: 401 },
    });
    jest.spyOn(google, "fetchGmailEmails").mockRejectedValue(authErr);
    const res = await POST(req());
    expect(res.status).toBe(401);
  });

  // PI2 stale-state guard: Google 403 → route returns 401 (not 500)
  it("returns 401 when Gmail API returns 403 (revoked token)", async () => {
    (session.getSession as jest.Mock).mockReturnValue({
      id: "s1",
      isSampleData: false,
      accessToken: "revoked",
      emails: [],
    });
    const authErr = Object.assign(new Error("403 Forbidden"), {
      response: { status: 403 },
    });
    jest.spyOn(google, "fetchGmailEmails").mockRejectedValue(authErr);
    const res = await POST(req());
    expect(res.status).toBe(401);
  });

  // PI2 (c): non-auth errors still return 500
  it("returns 500 for non-auth Gmail errors", async () => {
    (session.getSession as jest.Mock).mockReturnValue({
      id: "s1",
      isSampleData: false,
      accessToken: "tok",
      emails: [],
    });
    jest.spyOn(google, "fetchGmailEmails").mockRejectedValue(new Error("network error"));
    const res = await POST(req());
    expect(res.status).toBe(500);
  });
});

describe("emails/fetch persists raw emails", () => {
  beforeEach(() => jest.clearAllMocks());

  it("upserts fetched emails under the session accountId", async () => {
    (session.getSession as jest.Mock).mockReturnValue({
      id: "s1",
      accountId: "broker@etm.net",
      emails: [],
      isSampleData: false,
      accessToken: "tok",
    });
    jest
      .spyOn(google, "fetchGmailEmails")
      .mockResolvedValue([
        {
          id: "m1",
          threadId: "t",
          from: "a",
          fromName: null,
          fromEmail: null,
          to: "b",
          subject: "s",
          date: "d",
          body: "B",
          snippet: "sn",
          labelIds: [],
        },
      ]);
    const upsertSpy = jest.spyOn(cache, "upsertEmails").mockReturnValue();

    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(upsertSpy).toHaveBeenCalledWith(
      "broker@etm.net",
      expect.arrayContaining([expect.objectContaining({ id: "m1" })])
    );
  });

  it("does not upsert when session has no accountId (legacy fallback)", async () => {
    (session.getSession as jest.Mock).mockReturnValue({
      id: "s1",
      emails: [],
      isSampleData: false,
      accessToken: "tok",
    });
    jest.spyOn(google, "fetchGmailEmails").mockResolvedValue([]);
    const upsertSpy = jest.spyOn(cache, "upsertEmails").mockReturnValue();

    await POST(req());
    expect(upsertSpy).not.toHaveBeenCalled();
  });
});

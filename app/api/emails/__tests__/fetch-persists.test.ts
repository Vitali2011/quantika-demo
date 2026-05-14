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

function req(): NextRequest {
  return new NextRequest("http://x/api/emails/fetch", {
    method: "POST",
    headers: { cookie: "session_id=s1" },
  });
}

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

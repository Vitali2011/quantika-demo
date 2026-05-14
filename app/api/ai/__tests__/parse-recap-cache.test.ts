import { POST } from "../parse-recap/route";
import * as session from "@/lib/session";
import * as cache from "@/lib/email-cache";
import * as ai from "@/lib/ai-provider";
import { NextRequest } from "next/server";

jest.mock("@/lib/csrf", () => ({ validateCsrf: () => true }));
jest.mock("@/lib/email-cache");
jest.mock("@/lib/ai-provider");
jest.mock("@/lib/session", () => ({
  requireSession: jest.fn(),
  updateSession: jest.fn().mockReturnValue(true),
}));

const mkEmail = (id: string) => ({
  id,
  threadId: "t",
  from: "a",
  fromName: null,
  fromEmail: null,
  to: "b",
  subject: "FIXTURE RECAP",
  date: "d",
  body: "fixture recap body",
  snippet: "",
  labelIds: [],
});

const mkSession = (ids: string[]) => ({
  id: "s1",
  accountId: "acc@x",
  emails: ids.map(mkEmail),
  classifications: ids.map((id) => ({ emailId: id, category: "FIXTURE_RECAP" })),
  parsedCargos: [],
  parsedVessels: [],
  parsedFixtureRecaps: [],
  processedEmails: [],
  classifications2: [],
});

function req() {
  return new NextRequest("http://x/api/ai/parse-recap", {
    method: "POST",
    headers: { cookie: "session_id=s1" },
  });
}

describe("parse-recap cache", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (cache.hashParserVersion as jest.Mock).mockReturnValue("vX");
    (cache.saveParsedResults as jest.Mock).mockReturnValue(undefined);
  });

  it("skips the LLM for emails already in the cache", async () => {
    (session.requireSession as jest.Mock).mockReturnValue({
      session: mkSession(["m1", "m2"]),
      sessionId: "s1",
    });
    // m1 cached, m2 not
    (cache.getCachedParses as jest.Mock).mockReturnValue(
      new Map([["m1", [{ emailId: "m1", vesselName: null }]]])
    );
    const aiSpy = jest.spyOn(ai, "callAiText").mockResolvedValue("{}");

    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(aiSpy).toHaveBeenCalledTimes(1); // only m2
  });

  it("zero LLM calls when every email is cached", async () => {
    (session.requireSession as jest.Mock).mockReturnValue({
      session: mkSession(["m1", "m2"]),
      sessionId: "s1",
    });
    (cache.getCachedParses as jest.Mock).mockReturnValue(
      new Map([
        ["m1", [{ emailId: "m1", vesselName: null }]],
        ["m2", [{ emailId: "m2", vesselName: null }]],
      ])
    );
    const aiSpy = jest.spyOn(ai, "callAiText").mockResolvedValue("{}");

    const res = await POST(req());
    const body = await res.json();
    expect(aiSpy).not.toHaveBeenCalled();
    expect(body.count).toBe(2); // merged from cache
  });

  it("persists freshly parsed results", async () => {
    (session.requireSession as jest.Mock).mockReturnValue({
      session: mkSession(["m1"]),
      sessionId: "s1",
    });
    (cache.getCachedParses as jest.Mock).mockReturnValue(new Map());
    jest.spyOn(ai, "callAiText").mockResolvedValue('{"emailId":"m1","vessel_name":"STAR"}');
    const saveSpy = cache.saveParsedResults as jest.Mock;

    await POST(req());
    expect(saveSpy).toHaveBeenCalledWith(
      "acc@x",
      "recap",
      "vX",
      expect.arrayContaining([expect.objectContaining({ gmailMessageId: "m1" })])
    );
  });

  it("falls back to parsing everything when accountId is absent", async () => {
    const s = mkSession(["m1"]);
    delete (s as { accountId?: string }).accountId;
    (session.requireSession as jest.Mock).mockReturnValue({ session: s, sessionId: "s1" });
    const getSpy = cache.getCachedParses as jest.Mock;
    const aiSpy = jest.spyOn(ai, "callAiText").mockResolvedValue("{}");

    await POST(req());
    expect(getSpy).not.toHaveBeenCalled();
    expect(aiSpy).toHaveBeenCalledTimes(1);
  });

  it("merge correctness: one cached + one fresh = count 2", async () => {
    (session.requireSession as jest.Mock).mockReturnValue({
      session: mkSession(["m1", "m2"]),
      sessionId: "s1",
    });
    // m1 cached, m2 uncached
    (cache.getCachedParses as jest.Mock).mockReturnValue(
      new Map([["m1", [{ emailId: "m1", vesselName: null }]]])
    );
    jest.spyOn(ai, "callAiText").mockResolvedValue('{"emailId":"m2","vessel_name":"MOON"}');

    const res = await POST(req());
    const body = await res.json();
    expect(body.count).toBe(2);
  });
});

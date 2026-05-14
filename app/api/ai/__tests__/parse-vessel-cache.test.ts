import { POST } from "../parse-vessel/route";
import * as session from "@/lib/session";
import * as cache from "@/lib/email-cache";
import * as ai from "@/lib/ai-provider";
import * as equasis from "@/lib/validation/equasis-client";
import { NextRequest } from "next/server";

jest.mock("@/lib/csrf", () => ({ validateCsrf: () => true }));
jest.mock("@/lib/email-cache");
jest.mock("@/lib/ai-provider");
jest.mock("@/lib/session", () => ({
  requireSession: jest.fn(),
  updateSession: jest.fn().mockReturnValue(true),
}));
// Mock Equasis so vessel verification doesn't hit external services
jest.mock("@/lib/validation/equasis-client", () => ({
  lookupVesselByImo: jest.fn().mockResolvedValue(null),
  compareVesselRecord: jest.fn().mockReturnValue(null),
}));

const mkEmail = (id: string) => ({
  id,
  threadId: "t",
  from: "a",
  fromName: null,
  fromEmail: null,
  to: "b",
  subject: "MV CARGO",
  date: "d",
  body: "vessel position body",
  snippet: "",
  labelIds: [],
});

const mkSession = (ids: string[]) => ({
  id: "s1",
  accountId: "acc@x",
  emails: ids.map(mkEmail),
  classifications: ids.map((id) => ({ emailId: id, category: "VESSEL_POSITION" })),
  parsedCargos: [],
  parsedVessels: [],
  processedEmails: [],
  classifications2: [],
});

function req() {
  return new NextRequest("http://x/api/ai/parse-vessel", {
    method: "POST",
    headers: { cookie: "session_id=s1" },
  });
}

describe("parse-vessel cache", () => {
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
      new Map([["m1", [{ emailId: "m1", vesselName: { value: "STAR" } }]]])
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
        ["m1", [{ emailId: "m1", vesselName: { value: "STAR" } }]],
        ["m2", [{ emailId: "m2", vesselName: { value: "MOON" } }]],
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
    jest.spyOn(ai, "callAiText").mockResolvedValue('{"vessels":[{"vessel_name":"STAR"}]}');
    const saveSpy = cache.saveParsedResults as jest.Mock;

    await POST(req());
    expect(saveSpy).toHaveBeenCalledWith(
      "acc@x",
      "vessel",
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

  // FINDING-1 (MEDIUM): Equasis verificationWarning must not go stale in cache.
  describe("Equasis verification over cached vessels (FINDING-1)", () => {
    const EQUASIS_RECORD = {
      vesselName: "MV Star",
      flag: "MH",
      type: "Bulk Carrier",
      dwt: 63695,
      built: 2010,
    };

    it("re-runs Equasis verification over cached vessels — stale warning is cleared", async () => {
      (session.requireSession as jest.Mock).mockReturnValue({
        session: mkSession(["m1"]),
        sessionId: "s1",
      });
      // Cached vessel carries a stale warning from a day when Equasis was down.
      (cache.getCachedParses as jest.Mock).mockReturnValue(
        new Map([
          [
            "m1",
            [
              {
                emailId: "m1",
                imo: "9811000",
                vesselName: { value: "STAR" },
                verificationWarning: "IMO not found in Equasis registry",
              },
            ],
          ],
        ])
      );
      // Equasis is back up and the IMO resolves cleanly now.
      (equasis.lookupVesselByImo as jest.Mock).mockResolvedValue(EQUASIS_RECORD);
      (equasis.compareVesselRecord as jest.Mock).mockReturnValue(null);
      jest.spyOn(ai, "callAiText").mockResolvedValue("{}");

      await POST(req());

      const lastUpdate = (session.updateSession as jest.Mock).mock.calls.at(-1)!;
      const vessels = lastUpdate[1].parsedVessels as { emailId: string; verificationWarning?: string | null }[];
      const m1 = vessels.find((v) => v.emailId === "m1")!;
      expect(m1.verificationWarning).toBeFalsy();
    });

    it("recomputes a fresh warning for cached vessels when Equasis still rejects the IMO", async () => {
      (session.requireSession as jest.Mock).mockReturnValue({
        session: mkSession(["m1"]),
        sessionId: "s1",
      });
      (cache.getCachedParses as jest.Mock).mockReturnValue(
        new Map([
          ["m1", [{ emailId: "m1", imo: "9811000", vesselName: { value: "STAR" } }]],
        ])
      );
      (equasis.lookupVesselByImo as jest.Mock).mockResolvedValue(null);
      jest.spyOn(ai, "callAiText").mockResolvedValue("{}");

      await POST(req());

      const lastUpdate = (session.updateSession as jest.Mock).mock.calls.at(-1)!;
      const vessels = lastUpdate[1].parsedVessels as { emailId: string; verificationWarning?: string | null }[];
      const m1 = vessels.find((v) => v.emailId === "m1")!;
      expect(m1.verificationWarning).toBe("IMO not found in Equasis registry");
    });

    it("does not bake verificationWarning into the persisted cache row", async () => {
      (session.requireSession as jest.Mock).mockReturnValue({
        session: mkSession(["m1"]),
        sessionId: "s1",
      });
      (cache.getCachedParses as jest.Mock).mockReturnValue(new Map());
      jest
        .spyOn(ai, "callAiText")
        .mockResolvedValue('{"items":[{"vessel_name":"STAR","imo":"9811000"}]}');
      // Equasis rejects → without the fix this warning gets persisted into the cache row.
      (equasis.lookupVesselByImo as jest.Mock).mockResolvedValue(null);
      // Snapshot the items at the moment saveParsedResults is invoked — production
      // serialises here synchronously, so a later mutation must not be reflected.
      let snapshot: { items: { verificationWarning?: string | null }[] }[] = [];
      (cache.saveParsedResults as jest.Mock).mockImplementation(
        (_acc, _type, _ver, results) => {
          snapshot = JSON.parse(JSON.stringify(results));
        }
      );

      await POST(req());

      const savedItems = snapshot.flatMap((r) => r.items);
      expect(savedItems.length).toBeGreaterThan(0);
      for (const item of savedItems) {
        expect(item.verificationWarning).toBeFalsy();
      }
    });
  });
});

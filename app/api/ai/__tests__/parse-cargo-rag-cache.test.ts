/**
 * FINDING-3 (LOW): IMSBC RAG keyword query must be built from the full cargo
 * batch, not just the uncached `toParse` subset — and RAG retrieval should be
 * skipped entirely when there is nothing to parse.
 */
import { POST } from "../parse-cargo/route";
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

const mockRetrieve = jest.fn().mockResolvedValue([]);
jest.mock("@/lib/knowledge/embeddings/retriever", () => ({
  retrieve: (...args: unknown[]) => mockRetrieve(...args),
}));

const mockIsRagEnabled = jest.fn().mockReturnValue(true);
jest.mock("@/lib/knowledge/flags", () => ({
  isRagEnabled: () => mockIsRagEnabled(),
}));

jest.mock("@/lib/db", () => ({ getDb: jest.fn().mockReturnValue({}) }));

const mkEmail = (id: string, body: string) => ({
  id,
  threadId: "t",
  from: "a",
  fromName: null,
  fromEmail: null,
  to: "b",
  subject: "s",
  date: "d",
  body,
  snippet: "",
  labelIds: [],
});

const mkSession = (emails: { id: string; body: string }[]) => ({
  id: "s1",
  accountId: "acc@x",
  emails: emails.map((e) => mkEmail(e.id, e.body)),
  classifications: emails.map((e) => ({ emailId: e.id, category: "CARGO_INQUIRY" })),
  parsedCargos: [],
  parsedVessels: [],
  processedEmails: [],
  classifications2: [],
});

function req() {
  return new NextRequest("http://x/api/ai/parse-cargo", {
    method: "POST",
    headers: { cookie: "session_id=s1" },
  });
}

describe("parse-cargo IMSBC RAG x cache (FINDING-3)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsRagEnabled.mockReturnValue(true);
    (cache.hashParserVersion as jest.Mock).mockReturnValue("vX");
    (cache.saveParsedResults as jest.Mock).mockReturnValue(undefined);
    jest.spyOn(ai, "callAiJson").mockResolvedValue({ items: [] } as never);
  });

  it("skips IMSBC RAG retrieval entirely when every cargo email is cached", async () => {
    (session.requireSession as jest.Mock).mockReturnValue({
      session: mkSession([
        { id: "m1", body: "ammonium nitrate hazmat shipment" },
        { id: "m2", body: "thermal coal bulk inquiry" },
      ]),
      sessionId: "s1",
    });
    (cache.getCachedParses as jest.Mock).mockReturnValue(
      new Map([
        ["m1", [{ emailId: "m1", itemIndex: 0 }]],
        ["m2", [{ emailId: "m2", itemIndex: 0 }]],
      ])
    );

    const res = await POST(req());
    expect(res.status).toBe(200);
    // toParse is empty → no LLM calls → imsbcSystemContext has no consumer.
    expect(mockRetrieve).not.toHaveBeenCalled();
  });

  it("builds the IMSBC query from the full cargo batch, not just uncached emails", async () => {
    (session.requireSession as jest.Mock).mockReturnValue({
      session: mkSession([
        { id: "m1", body: "ammoniumnitrate hazmat dangerous cargo" },
        { id: "m2", body: "generalsteel coils ordinary" },
      ]),
      sessionId: "s1",
    });
    // m1 cached, m2 not — the cached email carries the hazmat keywords.
    (cache.getCachedParses as jest.Mock).mockReturnValue(
      new Map([["m1", [{ emailId: "m1", itemIndex: 0 }]]])
    );

    await POST(req());

    expect(mockRetrieve).toHaveBeenCalled();
    const query = mockRetrieve.mock.calls[0][0] as string;
    // The cached email's distinctive token must still steer the IMSBC context.
    expect(query).toContain("ammoniumnitrate");
    expect(query).toContain("generalsteel");
  });
});

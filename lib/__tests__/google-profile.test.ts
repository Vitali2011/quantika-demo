import { fetchGmailProfile } from "../google";

jest.mock("googleapis", () => ({
  google: {
    auth: { OAuth2: jest.fn().mockImplementation(() => ({ setCredentials: jest.fn() })) },
    gmail: jest.fn().mockReturnValue({
      users: {
        getProfile: jest.fn().mockResolvedValue({ data: { emailAddress: "broker@etm.net" } }),
      },
    }),
  },
}));

describe("fetchGmailProfile", () => {
  it("returns the account email address", async () => {
    await expect(fetchGmailProfile("token")).resolves.toBe("broker@etm.net");
  });

  it("returns null when Gmail returns no emailAddress", async () => {
    const { google } = jest.requireMock("googleapis");
    google.gmail.mockReturnValueOnce({
      users: { getProfile: jest.fn().mockResolvedValue({ data: {} }) },
    });
    await expect(fetchGmailProfile("token")).resolves.toBeNull();
  });
});

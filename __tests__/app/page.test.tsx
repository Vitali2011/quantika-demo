jest.mock('next/headers', () => ({
  cookies: jest.fn(),
}));

jest.mock('../../lib/session', () => ({
  getSession: jest.fn(),
}));

import { cookies } from 'next/headers';
import { getSession } from '../../lib/session';
import LandingPage from '../../app/page';
import { EmailUploadCTA } from '../../components/onboarding/EmailUploadCTA';
import { LandingPageClient } from '../../components/LandingPageClient';

const mockCookies = cookies as jest.Mock;
const mockGetSession = getSession as jest.Mock;

describe('LandingPage — session gate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders EmailUploadCTA when session_id cookie is absent', async () => {
    mockCookies.mockResolvedValue({ get: (_: string) => undefined });
    const element = await LandingPage();
    expect(element.type).toBe(EmailUploadCTA);
  });

  it('renders LandingPageClient when session_id cookie is present and session is valid', async () => {
    mockCookies.mockResolvedValue({
      get: (name: string) => (name === 'session_id' ? { value: 'sess-123' } : undefined),
    });
    mockGetSession.mockReturnValue({ emails: [] });
    const element = await LandingPage();
    expect(element.type).toBe(LandingPageClient);
  });

  it('renders EmailUploadCTA when session_id is present but session is invalid or expired', async () => {
    mockCookies.mockResolvedValue({
      get: (name: string) => (name === 'session_id' ? { value: 'expired-sess' } : undefined),
    });
    mockGetSession.mockReturnValue(null);
    const element = await LandingPage();
    expect(element.type).toBe(EmailUploadCTA);
  });
});

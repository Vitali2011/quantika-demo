jest.mock('next/headers', () => ({
  cookies: jest.fn(),
}));

jest.mock('../../lib/session', () => ({
  getSession: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  redirect: jest.fn(),
}));

// PublicLanding imports LiveStrip which imports KpiCard (client component with fetch)
jest.mock('../../components/market/LiveStrip', () => ({
  LiveStrip: () => null,
}));

import { cookies } from 'next/headers';
import { getSession } from '../../lib/session';
import { redirect } from 'next/navigation';
import LandingPage from '../../app/page';
import { PublicLanding } from '../../components/PublicLanding';

const mockCookies = cookies as jest.Mock;
const mockGetSession = getSession as jest.Mock;
const mockRedirect = redirect as jest.Mock;

describe('LandingPage — routing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders PublicLanding when session_id cookie is absent', async () => {
    mockCookies.mockResolvedValue({ get: (_: string) => undefined });
    const element = await LandingPage();
    expect(element.type).toBe(PublicLanding);
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('redirects to /dashboard when session_id is present and valid', async () => {
    mockCookies.mockResolvedValue({
      get: (name: string) => (name === 'session_id' ? { value: 'sess-123' } : undefined),
    });
    mockGetSession.mockReturnValue({ emails: [] });
    await LandingPage();
    expect(mockRedirect).toHaveBeenCalledWith('/dashboard');
  });

  it('renders PublicLanding when session_id is present but session is invalid or expired', async () => {
    mockCookies.mockResolvedValue({
      get: (name: string) => (name === 'session_id' ? { value: 'expired-sess' } : undefined),
    });
    mockGetSession.mockReturnValue(null);
    const element = await LandingPage();
    expect(element.type).toBe(PublicLanding);
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});

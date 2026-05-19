jest.mock('next/headers', () => ({
  cookies: jest.fn(),
}));

import { cookies } from 'next/headers';
import LandingPage from '../../app/page';
import { EmailUploadCTA } from '../../components/onboarding/EmailUploadCTA';
import { LandingPageClient } from '../../components/LandingPageClient';

const mockCookies = cookies as jest.Mock;

describe('LandingPage — session gate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders EmailUploadCTA when session_id cookie is absent', async () => {
    mockCookies.mockResolvedValue({ get: (_: string) => undefined });
    const element = await LandingPage();
    expect(element.type).toBe(EmailUploadCTA);
  });

  it('renders LandingPageClient when session_id cookie is present', async () => {
    mockCookies.mockResolvedValue({
      get: (name: string) => (name === 'session_id' ? { value: 'sess-123' } : undefined),
    });
    const element = await LandingPage();
    expect(element.type).toBe(LandingPageClient);
  });
});

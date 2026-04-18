/**
 * Performance test: Gmail N+1 fix.
 * Verifies that fetchGmailEmails uses p-limit(10) concurrency cap and
 * calls messages.get exactly N times for N messages.
 */

// Override the p-limit mock so we can capture the concurrency argument.
const capturedConcurrency: number[] = [];
jest.mock('p-limit', () => {
  return (concurrency: number) => {
    capturedConcurrency.push(concurrency);
    return (fn: () => unknown) => Promise.resolve((fn as () => unknown)());
  };
});

// Define mock fns inside the factory to avoid jest hoisting issues.
// Access them via jest.requireMock inside tests.
jest.mock('googleapis', () => {
  const listFn = jest.fn();
  const getFn = jest.fn();
  return {
    __esModule: true,
    google: {
      auth: {
        OAuth2: jest.fn().mockImplementation(() => ({
          setCredentials: jest.fn(),
          generateAuthUrl: jest.fn(),
          getToken: jest.fn(),
        })),
      },
      gmail: jest.fn().mockReturnValue({
        users: {
          messages: {
            list: listFn,
            get: getFn,
          },
        },
      }),
    },
    // Expose for test access without hoisting issues
    _testHandles: { listFn, getFn },
  };
});

import { fetchGmailEmails } from '../google';

function getHandles() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (jest.requireMock('googleapis') as any)._testHandles as {
    listFn: jest.Mock;
    getFn: jest.Mock;
  };
}

function fakeMessageData(id: string) {
  return {
    data: {
      id,
      threadId: `thread-${id}`,
      payload: { headers: [], parts: [] },
      snippet: '',
      labelIds: [],
    },
  };
}

beforeEach(() => {
  capturedConcurrency.length = 0;
  const { listFn, getFn } = getHandles();
  listFn.mockReset();
  getFn.mockReset();
});

describe('fetchGmailEmails — concurrency cap', () => {
  it('calls pLimit with concurrency 10', async () => {
    const N = 15;
    const { listFn, getFn } = getHandles();
    listFn.mockResolvedValue({
      data: { messages: Array.from({ length: N }, (_, i) => ({ id: `msg-${i}` })) },
    });
    getFn.mockResolvedValue(fakeMessageData('msg-0'));

    await fetchGmailEmails('fake-token', N);

    expect(capturedConcurrency).toContain(10);
  });

  it('calls messages.get exactly N times for N messages', async () => {
    const N = 12;
    const { listFn, getFn } = getHandles();
    listFn.mockResolvedValue({
      data: { messages: Array.from({ length: N }, (_, i) => ({ id: `msg-${i}` })) },
    });
    getFn.mockResolvedValue(fakeMessageData('msg-0'));

    await fetchGmailEmails('fake-token', N);

    expect(getFn).toHaveBeenCalledTimes(N);
  });

  it('returns empty array when list returns no messages', async () => {
    const { listFn, getFn } = getHandles();
    listFn.mockResolvedValue({ data: { messages: [] } });

    const result = await fetchGmailEmails('fake-token', 10);

    expect(result).toEqual([]);
    expect(getFn).not.toHaveBeenCalled();
  });

  it('skips failed individual message fetches gracefully', async () => {
    const N = 3;
    const { listFn, getFn } = getHandles();
    listFn.mockResolvedValue({
      data: { messages: Array.from({ length: N }, (_, i) => ({ id: `msg-${i}` })) },
    });
    getFn
      .mockResolvedValueOnce(fakeMessageData('msg-0'))
      .mockRejectedValueOnce(new Error('API error'))
      .mockResolvedValueOnce(fakeMessageData('msg-2'));

    const result = await fetchGmailEmails('fake-token', N);

    // 2 out of 3 succeed (one rejected)
    expect(result).toHaveLength(2);
  });
});

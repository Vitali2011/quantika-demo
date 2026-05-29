// Mock posthog-js before imports
jest.mock('posthog-js', () => ({
  init: jest.fn(),
  capture: jest.fn(),
}))

describe('analytics', () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.resetModules()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('track', () => {
    it('does nothing when NEXT_PUBLIC_POSTHOG_KEY is not set', async () => {
      delete process.env.NEXT_PUBLIC_POSTHOG_KEY
      const { track } = await import('../analytics')
      const { default: posthog } = await import('posthog-js')
      track('test_event')
      await Promise.resolve()
      expect(posthog.capture).not.toHaveBeenCalled()
    })

    it('does nothing when window is undefined (SSR)', async () => {
      process.env.NEXT_PUBLIC_POSTHOG_KEY = 'test-key'
      const windowSpy = jest.spyOn(global, 'window', 'get')
      windowSpy.mockReturnValue(undefined as unknown as Window & typeof globalThis)
      const { track } = await import('../analytics')
      const { default: posthog } = await import('posthog-js')
      track('test_event')
      await Promise.resolve()
      expect(posthog.capture).not.toHaveBeenCalled()
      windowSpy.mockRestore()
    })

    it('calls posthog.capture with event and properties when key is set', async () => {
      process.env.NEXT_PUBLIC_POSTHOG_KEY = 'test-key'
      const { track } = await import('../analytics')
      const { default: posthog } = await import('posthog-js')
      await track('test_event', { foo: 'bar' })
      expect(posthog.capture).toHaveBeenCalledWith('test_event', { foo: 'bar' })
    })

    it('calls posthog.capture without properties', async () => {
      process.env.NEXT_PUBLIC_POSTHOG_KEY = 'test-key'
      const { track } = await import('../analytics')
      const { default: posthog } = await import('posthog-js')
      await track('test_event')
      expect(posthog.capture).toHaveBeenCalledWith('test_event', undefined)
    })
  })

  describe('initAnalytics', () => {
    it('does nothing when NEXT_PUBLIC_POSTHOG_KEY is not set', async () => {
      delete process.env.NEXT_PUBLIC_POSTHOG_KEY
      const { initAnalytics } = await import('../analytics')
      const { default: posthog } = await import('posthog-js')
      initAnalytics()
      expect(posthog.init).not.toHaveBeenCalled()
    })

    it('does nothing when window is undefined (SSR)', async () => {
      process.env.NEXT_PUBLIC_POSTHOG_KEY = 'test-key'
      const windowSpy = jest.spyOn(global, 'window', 'get')
      windowSpy.mockReturnValue(undefined as unknown as Window & typeof globalThis)
      const { initAnalytics } = await import('../analytics')
      const { default: posthog } = await import('posthog-js')
      initAnalytics()
      expect(posthog.init).not.toHaveBeenCalled()
      windowSpy.mockRestore()
    })

    it('calls posthog.init with key and config when key is set', async () => {
      process.env.NEXT_PUBLIC_POSTHOG_KEY = 'test-key'
      const { initAnalytics } = await import('../analytics')
      const { default: posthog } = await import('posthog-js')
      await initAnalytics()
      expect(posthog.init).toHaveBeenCalledWith('test-key', expect.objectContaining({
        api_host: 'https://app.posthog.com',
      }))
    })
  })
})

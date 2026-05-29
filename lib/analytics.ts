const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY

let initialized = false

export async function initAnalytics() {
  if (typeof window === 'undefined' || !POSTHOG_KEY || initialized) return
  initialized = true
  // posthog is best-effort, lazily imported to keep it out of the main bundle.
  // Several callers fire this un-awaited, so a failed dynamic import/init must be
  // swallowed here — otherwise it floats an unhandled promise rejection.
  try {
    const posthog = (await import('posthog-js')).default
    posthog.init(POSTHOG_KEY, {
      api_host: 'https://app.posthog.com',
    })
  } catch (err) {
    console.debug('[analytics] initAnalytics failed (ignored):', err)
  }
}

export async function track(event: string, properties?: Record<string, unknown>) {
  if (!POSTHOG_KEY || typeof window === 'undefined') return
  // Same contract as initAnalytics: callers fire-and-forget, so a load/capture
  // failure is swallowed rather than rejected into an un-awaited caller.
  try {
    const posthog = (await import('posthog-js')).default
    posthog.capture(event, properties)
  } catch (err) {
    console.debug('[analytics] track failed (ignored):', err)
  }
}

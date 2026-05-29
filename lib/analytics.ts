const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY

let initialized = false

export async function initAnalytics() {
  if (typeof window === 'undefined' || !POSTHOG_KEY || initialized) return
  initialized = true
  const posthog = (await import('posthog-js')).default
  posthog.init(POSTHOG_KEY, {
    api_host: 'https://app.posthog.com',
  })
}

export async function track(event: string, properties?: Record<string, unknown>) {
  if (!POSTHOG_KEY || typeof window === 'undefined') return
  const posthog = (await import('posthog-js')).default
  posthog.capture(event, properties)
}

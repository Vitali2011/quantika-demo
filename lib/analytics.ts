import posthog from 'posthog-js'

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY

let initialized = false

export function initAnalytics() {
  if (typeof window === 'undefined' || !POSTHOG_KEY || initialized) return
  initialized = true
  posthog.init(POSTHOG_KEY, {
    api_host: 'https://app.posthog.com',
  })
}

export function track(event: string, properties?: Record<string, unknown>) {
  if (!POSTHOG_KEY || typeof window === 'undefined') return
  posthog.capture(event, properties)
}

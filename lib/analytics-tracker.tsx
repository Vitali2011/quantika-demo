'use client'

import { useEffect } from 'react'
import { initAnalytics, track } from './analytics'

interface Props {
  event: string
  properties?: Record<string, unknown>
}

export function AnalyticsTracker({ event, properties }: Props) {
  useEffect(() => {
    initAnalytics()
    track(event, properties)
  }, [event, properties])

  return null
}

'use client'

export function trackEvent(eventName: string, params: Record<string, string | number | boolean | null> = {}) {
  if (typeof window === 'undefined') return
  const gtagFn = (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag
  if (typeof gtagFn !== 'function') return
  gtagFn('event', eventName, params)
}

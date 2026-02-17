'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useRef } from 'react'

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || 'G-HJ8GEPD9NE'

function sendPageView(path: string) {
  if (typeof window === 'undefined') return
  const gtagFn = (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag
  if (typeof gtagFn !== 'function') return

  gtagFn('event', 'page_view', {
    page_path: path,
    page_location: window.location.href,
    page_title: document.title,
    send_to: GA_MEASUREMENT_ID,
  })
}

export default function AnalyticsTracker() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const lastTrackedPathRef = useRef<string>('')

  useEffect(() => {
    if (!pathname) return
    const query = searchParams?.toString() || ''
    const fullPath = query ? `${pathname}?${query}` : pathname

    if (lastTrackedPathRef.current === fullPath) return
    lastTrackedPathRef.current = fullPath

    sendPageView(fullPath)

    if (pathname.startsWith('/chat/')) {
      const conversationId = pathname.split('/')[2] || ''
      if (conversationId) {
        const gtagFn = (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag
        if (typeof gtagFn === 'function') {
          gtagFn('event', 'chat_view', {
            conversation_id: conversationId,
            page_path: fullPath,
          })
        }
      }
    }
  }, [pathname, searchParams])

  return null
}

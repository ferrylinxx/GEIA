'use client'

import { useEffect, useRef } from 'react'

export type ActivityStatus = 'online' | 'idle' | 'offline'

const IDLE_AFTER_MS = 2 * 60 * 1000
const HEARTBEAT_MS = 30 * 1000
const CHECK_INTERVAL_MS = 15 * 1000
const MIN_PING_GAP_MS = 8 * 1000
const SESSION_STORAGE_KEY = 'geia-activity-session-id'

function getCurrentPage(): string {
  if (typeof window === 'undefined') return ''
  return `${window.location.pathname}${window.location.search}`
}

function createSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `sess-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function getOrCreateSessionId(): string {
  if (typeof window === 'undefined') return 'server'

  const existing = window.sessionStorage.getItem(SESSION_STORAGE_KEY)
  if (existing) return existing

  const sessionId = createSessionId()
  window.sessionStorage.setItem(SESSION_STORAGE_KEY, sessionId)
  return sessionId
}

export function useUserActivity() {
  const statusRef = useRef<ActivityStatus>('online')
  const lastInteractionRef = useRef<number>(0)
  const lastPingRef = useRef<number>(0)
  const sessionIdRef = useRef<string>('server')

  useEffect(() => {
    if (typeof window === 'undefined') return
    lastInteractionRef.current = Date.now()
    sessionIdRef.current = getOrCreateSessionId()

    const sendPing = (status: ActivityStatus, force = false, useBeacon = false) => {
      const now = Date.now()
      if (!force && now - lastPingRef.current < MIN_PING_GAP_MS) return

      statusRef.current = status
      lastPingRef.current = now

      const payload = {
        status,
        last_page: getCurrentPage(),
        session_id: sessionIdRef.current,
      }

      if (useBeacon && typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' })
        navigator.sendBeacon('/api/activity/ping', blob)
        return
      }

      fetch('/api/activity/ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: status === 'offline',
      }).catch(() => {})
    }

    const markInteraction = () => {
      lastInteractionRef.current = Date.now()
      if (statusRef.current !== 'online') {
        sendPing('online', true)
      }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        lastInteractionRef.current = Date.now()
        sendPing('online', true)
      } else {
        sendPing('idle', true)
      }
    }

    const handleFocus = () => {
      lastInteractionRef.current = Date.now()
      sendPing('online', true)
    }

    const handleBlur = () => {
      sendPing('idle', true)
    }

    const handlePageHide = () => {
      sendPing('offline', true, true)

      // Close session to prevent zombie sessions accumulation
      const sessionId = sessionIdRef.current
      if (sessionId && sessionId !== 'server') {
        const blob = new Blob([JSON.stringify({ session_id: sessionId })], { type: 'application/json' })
        if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
          navigator.sendBeacon('/api/activity/session/close', blob)
        }
      }
    }

    sendPing('online', true)

    window.addEventListener('mousemove', markInteraction, { passive: true })
    window.addEventListener('keydown', markInteraction)
    window.addEventListener('click', markInteraction, { passive: true })
    window.addEventListener('scroll', markInteraction, { passive: true })
    window.addEventListener('touchstart', markInteraction, { passive: true })
    window.addEventListener('focus', handleFocus)
    window.addEventListener('blur', handleBlur)
    window.addEventListener('beforeunload', handlePageHide)
    window.addEventListener('pagehide', handlePageHide)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    const interval = window.setInterval(() => {
      const now = Date.now()
      const inactiveMs = now - lastInteractionRef.current

      if (document.visibilityState === 'visible' && inactiveMs < IDLE_AFTER_MS) {
        if (statusRef.current !== 'online') {
          sendPing('online', true)
          return
        }
        if (now - lastPingRef.current >= HEARTBEAT_MS) {
          sendPing('online', true)
        }
        return
      }

      if (statusRef.current !== 'idle') {
        sendPing('idle', true)
        return
      }
      if (now - lastPingRef.current >= HEARTBEAT_MS) {
        sendPing('idle', true)
      }
    }, CHECK_INTERVAL_MS)

    return () => {
      window.clearInterval(interval)
      window.removeEventListener('mousemove', markInteraction)
      window.removeEventListener('keydown', markInteraction)
      window.removeEventListener('click', markInteraction)
      window.removeEventListener('scroll', markInteraction)
      window.removeEventListener('touchstart', markInteraction)
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('blur', handleBlur)
      window.removeEventListener('beforeunload', handlePageHide)
      window.removeEventListener('pagehide', handlePageHide)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      sendPing('offline', true, true)
    }
  }, [])
}

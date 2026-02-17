'use client'

import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'

export type ActivityStatus = 'online' | 'idle' | 'offline'

interface ActivityData {
  status: ActivityStatus
  last_seen_at: string | null
}

interface ActivityContextValue {
  statuses: Map<string, ActivityData>
  getStatus: (userId: string) => ActivityData
  refreshStatus: (userIds?: string[]) => Promise<void>
  isLoading: boolean
}

const ActivityContext = createContext<ActivityContextValue | null>(null)

const DEFAULT_STATUS: ActivityData = {
  status: 'offline',
  last_seen_at: null,
}

export function ActivityProvider({ children }: { children: ReactNode }) {
  const [statuses, setStatuses] = useState<Map<string, ActivityData>>(new Map())
  const [isLoading, setIsLoading] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null)
  const lastFetchRef = useRef<number>(0)
  const FETCH_COOLDOWN_MS = 5000 // Minimum 5s between fetches

  // Get current user
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setCurrentUserId(data.user.id)
      }
    })
  }, [])

  const refreshStatus = useCallback(async (userIds?: string[]) => {
    const now = Date.now()
    if (now - lastFetchRef.current < FETCH_COOLDOWN_MS) {
      console.log('[ActivityContext] Skipping fetch (cooldown)')
      return
    }
    lastFetchRef.current = now

    setIsLoading(true)
    try {
      const params = userIds && userIds.length > 0 ? `?user_ids=${userIds.join(',')}` : ''
      const res = await fetch(`/api/activity/status${params}`, { cache: 'no-store' })
      
      if (!res.ok) {
        console.error('[ActivityContext] Failed to fetch status:', res.status)
        return
      }

      const data = await res.json()
      const newStatuses = new Map<string, ActivityData>()

      if (data.statuses && typeof data.statuses === 'object') {
        for (const [userId, statusData] of Object.entries(data.statuses)) {
          const typedData = statusData as { status?: string; last_seen_at?: string | null }
          const status = typedData.status === 'online' || typedData.status === 'idle' || typedData.status === 'offline'
            ? typedData.status
            : 'offline'
          
          newStatuses.set(userId, {
            status,
            last_seen_at: typedData.last_seen_at || null,
          })
        }
      }

      setStatuses(newStatuses)
    } catch (error) {
      console.error('[ActivityContext] Error fetching status:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const getStatus = useCallback((userId: string): ActivityData => {
    return statuses.get(userId) || DEFAULT_STATUS
  }, [statuses])

  // Subscribe to realtime updates for current user
  useEffect(() => {
    if (!currentUserId) return

    const supabase = createClient()
    let mounted = true

    // Initial fetch
    refreshStatus([currentUserId])

    // Subscribe to activity events
    const channel = supabase
      .channel(`activity-context-${currentUserId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'user_activity_events',
        filter: `user_id=eq.${currentUserId}`,
      }, () => {
        if (!mounted) return
        console.log('[ActivityContext] Realtime update received')
        refreshStatus([currentUserId])
      })
      .subscribe()

    channelRef.current = channel

    // Fallback polling (reduced to 5 minutes)
    const fallbackInterval = window.setInterval(() => {
      if (!mounted) return
      console.log('[ActivityContext] Fallback polling')
      refreshStatus([currentUserId])
    }, 5 * 60 * 1000) // 5 minutes instead of 90 seconds

    return () => {
      mounted = false
      window.clearInterval(fallbackInterval)
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [currentUserId, refreshStatus])

  const value: ActivityContextValue = {
    statuses,
    getStatus,
    refreshStatus,
    isLoading,
  }

  return (
    <ActivityContext.Provider value={value}>
      {children}
    </ActivityContext.Provider>
  )
}

export function useActivity() {
  const context = useContext(ActivityContext)
  if (!context) {
    throw new Error('useActivity must be used within ActivityProvider')
  }
  return context
}


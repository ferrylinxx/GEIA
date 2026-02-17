'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useChatStore } from '@/store/chat-store'

const projectNameCache = new Map<string, string>()

export function useProjectContext() {
  // Use primitive selectors to keep server/client snapshots stable (React 19 + useSyncExternalStore).
  const activeConversationId = useChatStore((s) => s.activeConversationId)
  const conversations = useChatStore((s) => s.conversations)
  const projectContextId = useChatStore((s) => s.projectContextId)

  const effectiveProjectId = useMemo(() => {
    const activeConv = activeConversationId
      ? conversations.find((conv) => conv.id === activeConversationId) || null
      : null
    return activeConv?.project_id || projectContextId || null
  }, [activeConversationId, conversations, projectContextId])

  const [projectName, setProjectName] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    if (!effectiveProjectId) {
      setProjectName((prev) => (prev === null ? prev : null))
      return
    }

    const cached = projectNameCache.get(effectiveProjectId)
    if (cached) {
      setProjectName((prev) => (prev === cached ? prev : cached))
      return
    }

    const supabase = createClient()
    void (async () => {
      try {
        const { data } = await supabase
          .from('projects')
          .select('name')
          .eq('id', effectiveProjectId)
          .single()
        if (cancelled) return
        const resolvedName = (data?.name || '').trim()
        if (!resolvedName) {
          setProjectName((prev) => (prev === null ? prev : null))
          return
        }
        projectNameCache.set(effectiveProjectId, resolvedName)
        setProjectName((prev) => (prev === resolvedName ? prev : resolvedName))
      } catch {
        if (!cancelled) setProjectName((prev) => (prev === null ? prev : null))
      }
    })()

    return () => {
      cancelled = true
    }
  }, [effectiveProjectId])

  return { projectId: effectiveProjectId, projectName }
}

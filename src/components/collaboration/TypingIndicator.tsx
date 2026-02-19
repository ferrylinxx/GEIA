'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

interface TypingUser {
  id: string
  user_id: string
  user?: {
    name: string
  }
}

interface TypingIndicatorProps {
  conversationId: string
  currentUserId?: string
}

export default function TypingIndicator({ conversationId, currentUserId }: TypingIndicatorProps) {
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([])
  const supabase = createClient()

  useEffect(() => {
    loadTypingUsers()

    // Subscribe to real-time changes
    const channel = supabase
      .channel(`typing:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversation_typing',
          filter: `conversation_id=eq.${conversationId}`
        },
        () => {
          loadTypingUsers()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [conversationId])

  const loadTypingUsers = async () => {
    const { data, error } = await supabase
      .from('conversation_typing')
      .select('*, user:profiles(name)')
      .eq('conversation_id', conversationId)
      .gt('expires_at', new Date().toISOString())

    if (data && !error) {
      // Filter out current user
      setTypingUsers(data.filter(t => t.user_id !== currentUserId))
    }
  }

  if (typingUsers.length === 0) return null

  const names = typingUsers.map(t => t.user?.name || 'Usuario').join(', ')

  return (
    <div className="flex items-center gap-2 px-4 py-2 text-sm text-white/60">
      <div className="flex gap-1">
        <span className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
      <span>
        {typingUsers.length === 1 
          ? `${names} está escribiendo...`
          : `${names} están escribiendo...`
        }
      </span>
    </div>
  )
}


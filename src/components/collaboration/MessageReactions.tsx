'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Smile } from 'lucide-react'

interface Reaction {
  id: string
  emoji: string
  user_id: string
  user?: {
    id: string
    name: string
    avatar_url?: string
  }
}

interface MessageReactionsProps {
  messageId: string
  currentUserId?: string
}

const QUICK_EMOJIS = ['👍', '❤️', '😂', '🎉', '🤔', '👏', '🔥', '✨']

export default function MessageReactions({ messageId, currentUserId }: MessageReactionsProps) {
  const [reactions, setReactions] = useState<Reaction[]>([])
  const [showPicker, setShowPicker] = useState(false)
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    loadReactions()

    // Subscribe to real-time changes
    const channel = supabase
      .channel(`reactions:${messageId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'message_reactions',
          filter: `message_id=eq.${messageId}`
        },
        () => {
          loadReactions()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [messageId])

  const loadReactions = async () => {
    const { data } = await fetch(`/api/messages/${messageId}/reactions`).then(r => r.json())
    if (data) {
      setReactions(data)
    }
  }

  const toggleReaction = async (emoji: string) => {
    if (loading) return
    setLoading(true)

    try {
      await fetch(`/api/messages/${messageId}/reactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emoji })
      })
      setShowPicker(false)
    } catch (error) {
      console.error('Error toggling reaction:', error)
    } finally {
      setLoading(false)
    }
  }

  // Group reactions by emoji
  const groupedReactions = reactions.reduce((acc, reaction) => {
    if (!acc[reaction.emoji]) {
      acc[reaction.emoji] = []
    }
    acc[reaction.emoji].push(reaction)
    return acc
  }, {} as Record<string, Reaction[]>)

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {/* Existing reactions */}
      {Object.entries(groupedReactions).map(([emoji, reactionList]) => {
        const hasReacted = reactionList.some(r => r.user_id === currentUserId)
        return (
          <button
            key={emoji}
            onClick={() => toggleReaction(emoji)}
            className={`
              flex items-center gap-1 px-2 py-1 rounded-full text-sm
              transition-all hover:scale-110
              ${hasReacted 
                ? 'bg-purple-500/20 border border-purple-500/50 text-purple-300' 
                : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10'
              }
            `}
            title={reactionList.map(r => r.user?.name || 'Usuario').join(', ')}
          >
            <span>{emoji}</span>
            <span className="text-xs">{reactionList.length}</span>
          </button>
        )
      })}

      {/* Add reaction button */}
      <div className="relative">
        <button
          onClick={() => setShowPicker(!showPicker)}
          className="p-1.5 rounded-full bg-white/5 border border-white/10 text-white/50 hover:text-white/80 hover:bg-white/10 transition-all"
          title="Añadir reacción"
        >
          <Smile className="w-4 h-4" />
        </button>

        {/* Emoji picker */}
        {showPicker && (
          <div className="absolute bottom-full left-0 mb-2 p-2 bg-gray-900 border border-white/10 rounded-lg shadow-xl z-50">
            <div className="flex gap-1">
              {QUICK_EMOJIS.map(emoji => (
                <button
                  key={emoji}
                  onClick={() => toggleReaction(emoji)}
                  className="p-2 hover:bg-white/10 rounded transition-colors text-xl"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}


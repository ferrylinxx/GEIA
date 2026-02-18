'use client'

import { useEffect, useState } from 'react'
import { Sparkles, Loader2 } from 'lucide-react'
import { useChatStore } from '@/store/chat-store'

interface FollowUpSuggestionsProps {
  onSelectSuggestion: (text: string) => void
}

export default function FollowUpSuggestions({ onSelectSuggestion }: FollowUpSuggestionsProps) {
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [allSuggestions, setAllSuggestions] = useState<string[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const [visible, setVisible] = useState(false)
  const { isStreaming, streamingContent, messages, activeConversationId } = useChatStore()

  useEffect(() => {
    // When streaming just finished, generate suggestions
    const generateSuggestions = async () => {
      if (isStreaming || !activeConversationId) {
        setVisible(false)
        return
      }

      // Get last 4 messages for context
      const recentMessages = messages.slice(-4)
      if (recentMessages.length < 2) {
        setVisible(false)
        return
      }

      const lastUserMessage = recentMessages.filter(m => m.role === 'user').slice(-1)[0]
      const lastAssistantMessage = recentMessages.filter(m => m.role === 'assistant').slice(-1)[0]

      if (!lastUserMessage || !lastAssistantMessage) {
        setVisible(false)
        return
      }

      setLoading(true)
      setVisible(true)

      try {
        const response = await fetch('/api/suggestions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversation_id: activeConversationId,
            user_message: lastUserMessage.content,
            assistant_message: lastAssistantMessage.content,
            context: recentMessages.slice(0, -2).map(m => ({
              role: m.role,
              content: m.content.substring(0, 500)
            }))
          })
        })

        if (response.ok) {
          const data = await response.json()
          const allSuggs = data.suggestions || []
          setAllSuggestions(allSuggs)
          setSuggestions(allSuggs.slice(0, 3))
          setCurrentIndex(0)
        }
      } catch (error) {
        console.error('Failed to generate suggestions:', error)
      } finally {
        setLoading(false)
      }
    }

    // Debounce to avoid generating on every message change
    const timer = setTimeout(generateSuggestions, 500)
    return () => clearTimeout(timer)
  }, [isStreaming, messages, activeConversationId])

  // Rotate suggestions every 5 seconds
  useEffect(() => {
    if (!visible || loading || allSuggestions.length <= 3) return

    const interval = setInterval(() => {
      setCurrentIndex((prev) => {
        const next = prev + 3
        if (next >= allSuggestions.length) return 0
        return next
      })
    }, 5000)

    return () => clearInterval(interval)
  }, [visible, loading, allSuggestions.length])

  // Update displayed suggestions when index changes
  useEffect(() => {
    if (allSuggestions.length > 0) {
      const displayed = allSuggestions.slice(currentIndex, currentIndex + 3)
      if (displayed.length < 3 && allSuggestions.length >= 3) {
        // Wrap around
        const remaining = 3 - displayed.length
        setSuggestions([...displayed, ...allSuggestions.slice(0, remaining)])
      } else {
        setSuggestions(displayed)
      }
    }
  }, [currentIndex, allSuggestions])

  if (!visible || (!loading && suggestions.length === 0)) {
    return null
  }

  return (
    <div className="mb-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="relative p-2.5 rounded-2xl bg-white/40 backdrop-blur-xl border border-white/60 shadow-lg overflow-hidden">
        {/* Liquid glass effect */}
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-100/30 via-purple-50/20 to-pink-50/30 pointer-events-none" />

        <div className="relative flex items-start gap-2">
          <Sparkles size={14} className="text-indigo-500 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            {loading ? (
              <div className="flex items-center gap-2 text-[11px] text-indigo-600">
                <Loader2 size={12} className="animate-spin" />
                <span>Pensando...</span>
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((suggestion, index) => (
                  <button
                    key={index}
                    onClick={() => {
                      onSelectSuggestion(suggestion)
                      setVisible(false)
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/70 backdrop-blur-sm border border-indigo-200/50 text-[11px] text-indigo-700 hover:bg-white hover:border-indigo-300 hover:shadow-md transition-all text-left font-medium"
                  >
                    <span>{suggestion}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={() => setVisible(false)}
            className="p-0.5 rounded-full text-indigo-400 hover:text-indigo-600 hover:bg-white/50 transition-colors shrink-0"
            aria-label="Cerrar sugerencias"
          >
            <Sparkles size={12} />
          </button>
        </div>
      </div>
    </div>
  )
}


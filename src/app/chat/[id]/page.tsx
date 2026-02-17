'use client'

import { useEffect } from 'react'
import { useParams } from 'next/navigation'
import { useChatStore } from '@/store/chat-store'
import ChatArea from '@/components/chat/ChatArea'
import { Loader2 } from 'lucide-react'

export default function ChatIdPage() {
  const params = useParams()
  const conversationId = params.id as string
  const activeConversationId = useChatStore((s) => s.activeConversationId)
  const setActiveConversation = useChatStore((s) => s.setActiveConversation)

  // Sync URL param with store on mount / param change
  useEffect(() => {
    if (conversationId && conversationId !== activeConversationId) {
      setActiveConversation(conversationId)
    }
  }, [conversationId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!activeConversationId) {
    return (
      <div className="h-full w-full flex items-center justify-center text-zinc-500">
        <span className="inline-flex items-center gap-2 text-sm">
          <Loader2 size={16} className="animate-spin" />
          Cargando chat...
        </span>
      </div>
    )
  }

  return <ChatArea />
}

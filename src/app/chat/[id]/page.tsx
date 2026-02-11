'use client'

import { useEffect } from 'react'
import { useParams } from 'next/navigation'
import { useChatStore } from '@/store/chat-store'
import ChatArea from '@/components/chat/ChatArea'
import WelcomeScreen from '@/components/chat/WelcomeScreen'

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
    return <WelcomeScreen />
  }

  return <ChatArea />
}


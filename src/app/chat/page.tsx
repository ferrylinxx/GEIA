'use client'

import { useChatStore } from '@/store/chat-store'
import ChatArea from '@/components/chat/ChatArea'
import WelcomeScreen from '@/components/chat/WelcomeScreen'

export default function ChatPage() {
  const activeConversationId = useChatStore((s) => s.activeConversationId)

  if (!activeConversationId) {
    return <WelcomeScreen />
  }

  return <ChatArea />
}


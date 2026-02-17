'use client'

import { useChatStore } from '@/store/chat-store'
import ChatArea from '@/components/chat/ChatArea'
import WelcomeScreen from '@/components/chat/WelcomeScreen'
import ProjectWelcomeScreen from '@/components/projects/ProjectWelcomeScreen'

export default function ChatPage() {
  const activeConversationId = useChatStore((s) => s.activeConversationId)
  const projectContextId = useChatStore((s) => s.projectContextId)

  if (!activeConversationId) {
    if (projectContextId) return <ProjectWelcomeScreen />
    return <WelcomeScreen />
  }

  return <ChatArea />
}
